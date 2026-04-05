import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SearchProjectEntity } from "../database/entities/search-project.entity";
import { PropertyEntity } from "../database/entities/property.entity";
import { ResidentialComplexEntity } from "../database/entities/residential-complex.entity";
import { AIService } from "../ai/ai.service";
import { ScoringService } from "../scoring/scoring.service";
import { KrishaParserService, KrishaPropertyDetail } from "./krisha-parser.service";
import { ALMATY_DEVELOPERS, findShutovRating, findNearestFault } from "@dreamapt/shared";

const MAX_RESULTS = parseInt(process.env.PARSER_MAX_RESULTS || "100");

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @InjectRepository(SearchProjectEntity)
    private projectsRepo: Repository<SearchProjectEntity>,
    @InjectRepository(PropertyEntity)
    private propertiesRepo: Repository<PropertyEntity>,
    @InjectRepository(ResidentialComplexEntity)
    private complexesRepo: Repository<ResidentialComplexEntity>,
    private aiService: AIService,
    private scoringService: ScoringService,
    private krishaParser: KrishaParserService,
  ) {}

  async startSearch(projectId: string): Promise<{ jobId: string; status: string }> {
    const project = await this.projectsRepo.findOne({ where: { id: projectId } });
    if (!project || !project.interviewAnswers) {
      throw new Error("Project not found or interview not complete");
    }

    // Update status
    await this.projectsRepo.update(projectId, { status: "searching" });

    // AI expand search params
    let searchParams = project.interviewAnswers;
    let aiSuggestions = "";
    try {
      const expanded = await this.aiService.expandSearchParams(project.interviewAnswers);
      searchParams = expanded.expandedParams as Record<string, unknown>;
      aiSuggestions = expanded.explanation;
      await this.projectsRepo.update(projectId, {
        searchParams: searchParams as any,
        aiSuggestions,
      });
    } catch (err) {
      this.logger.error("AI expansion failed:", err);
    }

    // Run the pipeline in the background
    this.runSearchPipeline(projectId, project.interviewAnswers).catch((err) =>
      this.logger.error("Search pipeline failed:", err),
    );

    return { jobId: projectId, status: "searching" };
  }

  /**
   * Filter properties by developer include/exclude preferences.
   * Matches complexName against known developer ЖК patterns + custom patterns.
   */
  private filterByDeveloper(
    properties: KrishaPropertyDetail[],
    interviewAnswers: Record<string, unknown>,
  ): KrishaPropertyDetail[] {
    const devFilter = interviewAnswers.developerFilter as
      | { mode: string; developers: string[]; customPatterns: string[] }
      | undefined;

    if (!devFilter) return properties;
    const { mode, developers, customPatterns } = devFilter;
    if ((!developers || developers.length === 0) && (!customPatterns || customPatterns.length === 0)) {
      return properties;
    }

    // Build list of all patterns to match (case-insensitive)
    const allPatterns: string[] = [];

    // Add patterns from selected developers
    for (const devKey of developers || []) {
      const dev = ALMATY_DEVELOPERS.find((d) => d.value === devKey);
      if (dev) {
        allPatterns.push(...dev.patterns);
      }
    }

    // Add custom patterns from user
    if (customPatterns?.length) {
      allPatterns.push(...customPatterns);
    }

    if (allPatterns.length === 0) return properties;

    const patternsLower = allPatterns.map((p) => p.toLowerCase());

    const matchesDeveloper = (prop: KrishaPropertyDetail): boolean => {
      const name = (prop.complexName || "").toLowerCase();
      const title = (prop.title || "").toLowerCase();
      const desc = (prop.description || "").toLowerCase();
      return patternsLower.some(
        (pat) => name.includes(pat) || title.includes(pat) || desc.includes(pat),
      );
    };

    const before = properties.length;
    const filtered =
      mode === "include"
        ? properties.filter((p) => matchesDeveloper(p))
        : properties.filter((p) => !matchesDeveloper(p));

    this.logger.log(
      `Developer filter (${mode}): ${before} → ${filtered.length} properties (patterns: ${allPatterns.join(", ")})`,
    );

    return filtered;
  }

  /**
   * Filter properties by proximity to user-specified locations.
   * Each location has a radiusKm — property must be within that radius of at least ONE location.
   */
  private filterByProximity(
    properties: KrishaPropertyDetail[],
    interviewAnswers: Record<string, unknown>,
  ): KrishaPropertyDetail[] {
    const proximityLocations = interviewAnswers.proximityLocations as
      | Array<{ name: string; lat: number; lng: number; radiusKm: number }>
      | undefined;

    if (!proximityLocations || proximityLocations.length === 0) {
      return properties;
    }

    const before = properties.length;
    const filtered = properties.filter((prop) => {
      if (!prop.lat || !prop.lng) return false;

      // Property must be within radius of at least one proximity location
      return proximityLocations.some((loc) => {
        const dist = this.haversineKm(prop.lat!, prop.lng!, loc.lat, loc.lng);
        return dist <= loc.radiusKm;
      });
    });

    this.logger.log(
      `Proximity filter: ${before} → ${filtered.length} properties (locations: ${proximityLocations.map((l) => `${l.name} ${l.radiusKm}km`).join(", ")})`,
    );

    return filtered;
  }

  /** Haversine distance in km */
  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private async runSearchPipeline(
    projectId: string,
    interviewAnswers: Record<string, unknown>,
  ): Promise<void> {
    try {
      // Phase 1: Parse real listings from Krisha.kz
      this.logger.log(`Starting Krisha.kz parsing for project ${projectId}`);
      let parsedProperties = await this.krishaParser.parseFromKrisha(interviewAnswers);
      this.logger.log(`Parsed ${parsedProperties.length} properties from Krisha.kz`);

      // Phase 1.5: Apply developer filter
      parsedProperties = this.filterByDeveloper(parsedProperties, interviewAnswers);

      // Phase 1.6: Apply proximity filter
      parsedProperties = this.filterByProximity(parsedProperties, interviewAnswers);

      if (parsedProperties.length === 0) {
        this.logger.warn("No properties found after filtering, setting status back");
        await this.projectsRepo.update(projectId, {
          status: "scored",
          propertyCount: 0,
        });
        return;
      }

      // Phase 2: Save properties
      for (const prop of parsedProperties.slice(0, MAX_RESULTS)) {
        await this.saveProperty(projectId, prop);
      }

      // Phase 3: Grouping — group properties into residential complexes
      const savedCount = Math.min(parsedProperties.length, MAX_RESULTS);
      await this.projectsRepo.update(projectId, {
        status: "grouping",
        propertyCount: savedCount,
      });
      this.logger.log(`Saved ${savedCount} properties, starting grouping`);

      await this.groupPropertiesIntoComplexes(projectId);

      // Phase 4: Score all properties
      await this.projectsRepo.update(projectId, { status: "scoring" });
      await this.scoringService.scoreProperties(projectId, interviewAnswers);

      // Phase 4b: Score complexes (aggregate from properties + seismic)
      await this.scoreComplexes(projectId, interviewAnswers);

      // Phase 5: Done
      await this.projectsRepo.update(projectId, { status: "scored" });
      this.logger.log(`Search pipeline complete for project ${projectId}`);
    } catch (err) {
      this.logger.error("Search pipeline error:", err);
      await this.projectsRepo.update(projectId, { status: "interview_complete" });
    }
  }

  /** Normalize complex name for grouping (reuses pattern from shutov-ratings) */
  private normalizeComplexName(name: string): string {
    return name
      .toLowerCase()
      .replace(/["'«»""]/g, "")
      .replace(/\bжк\b/gi, "")
      .replace(/\bж\.к\.\b/gi, "")
      .replace(/\bрезиденс\b/gi, "residence")
      .replace(/[^a-zа-яёғқңүұһі0-9\s]/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Levenshtein distance for fuzzy matching */
  private levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }

  /** Group properties into residential complexes */
  async groupPropertiesIntoComplexes(projectId: string): Promise<void> {
    const properties = await this.propertiesRepo.find({ where: { projectId } });

    // Partition by has name vs no name
    const hasName = properties.filter((p) => p.complexName && p.complexName.trim().length > 1);
    const noName = properties.filter((p) => !p.complexName || p.complexName.trim().length <= 1);

    // Step 1: Group by normalized name (exact match)
    const nameGroups = new Map<string, PropertyEntity[]>();
    const ungrouped: PropertyEntity[] = [];

    for (const prop of hasName) {
      const norm = this.normalizeComplexName(prop.complexName);
      if (!norm) { ungrouped.push(prop); continue; }

      let matched = false;
      for (const [key, group] of nameGroups) {
        if (key === norm || this.levenshtein(key, norm) <= 2) {
          group.push(prop);
          matched = true;
          break;
        }
      }
      if (!matched) {
        nameGroups.set(norm, [prop]);
      }
    }

    // Step 2: Create ResidentialComplex for each name group
    const complexes: ResidentialComplexEntity[] = [];

    for (const [normName, group] of nameGroups) {
      const complex = await this.createComplexFromGroup(projectId, group, "name_match");
      complexes.push(complex);
    }

    // Step 3: Handle unnamed properties — try to absorb into existing complexes by proximity
    const remaining: PropertyEntity[] = [...ungrouped, ...noName];
    const unmatched: PropertyEntity[] = [];

    for (const prop of remaining) {
      if (!prop.lat || !prop.lng) { unmatched.push(prop); continue; }

      let absorbed = false;
      for (const complex of complexes) {
        if (!complex.lat || !complex.lng) continue;
        const dist = this.haversineKm(prop.lat, prop.lng, complex.lat, complex.lng);
        if (dist <= 0.15) { // 150m
          prop.complexId = complex.id;
          await this.propertiesRepo.save(prop);
          complex.listingsCount++;
          absorbed = true;
          break;
        }
      }
      if (!absorbed) unmatched.push(prop);
    }

    // Step 4: Cluster remaining by proximity (150m)
    const coordProps = unmatched.filter((p) => p.lat && p.lng);
    const noCoordProps = unmatched.filter((p) => !p.lat || !p.lng);
    const used = new Set<string>();

    for (const seed of coordProps) {
      if (used.has(seed.id)) continue;
      const cluster = [seed];
      used.add(seed.id);

      for (const other of coordProps) {
        if (used.has(other.id)) continue;
        const dist = this.haversineKm(seed.lat!, seed.lng!, other.lat!, other.lng!);
        if (dist <= 0.15) {
          cluster.push(other);
          used.add(other.id);
        }
      }

      const complex = await this.createComplexFromGroup(projectId, cluster, "coordinate_cluster");
      complexes.push(complex);
    }

    // Step 5: Catch-all for no-coordinate properties
    if (noCoordProps.length > 0) {
      const complex = await this.createComplexFromGroup(projectId, noCoordProps, "ungrouped");
      complexes.push(complex);
    }

    // Update aggregate counts for complexes that absorbed extra properties
    for (const complex of complexes) {
      const count = await this.propertiesRepo.count({ where: { complexId: complex.id } });
      if (count !== complex.listingsCount) {
        complex.listingsCount = count;
        // Recalculate price aggregates
        const props = await this.propertiesRepo.find({ where: { complexId: complex.id } });
        const prices = props.filter((p) => p.price > 0).map((p) => Number(p.price));
        if (prices.length > 0) {
          complex.priceMin = Math.min(...prices);
          complex.priceMax = Math.max(...prices);
          complex.priceAvg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
        }
        await this.complexesRepo.save(complex);
      }
    }

    this.logger.log(`Created ${complexes.length} residential complexes for project ${projectId}`);
  }

  /** Create a ResidentialComplex from a group of properties */
  private async createComplexFromGroup(
    projectId: string,
    group: PropertyEntity[],
    method: string,
  ): Promise<ResidentialComplexEntity> {
    // Determine name — most common complexName or address fallback
    const names = group.map((p) => p.complexName).filter(Boolean);
    const displayName = names.length > 0
      ? this.mostCommon(names)
      : group[0]?.address || "Без названия";
    const normalizedName = this.normalizeComplexName(displayName) || displayName.toLowerCase();

    // Compute centroid
    const withCoords = group.filter((p) => p.lat && p.lng);
    const lat = withCoords.length > 0
      ? withCoords.reduce((s, p) => s + Number(p.lat), 0) / withCoords.length
      : null;
    const lng = withCoords.length > 0
      ? withCoords.reduce((s, p) => s + Number(p.lng), 0) / withCoords.length
      : null;

    // Price aggregates
    const prices = group.filter((p) => p.price > 0).map((p) => Number(p.price));
    const priceMin = prices.length > 0 ? Math.min(...prices) : null;
    const priceMax = prices.length > 0 ? Math.max(...prices) : null;
    const priceAvg = prices.length > 0
      ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
      : null;

    // District — most common
    const districts = group.map((p) => p.district).filter(Boolean);
    const district = districts.length > 0 ? this.mostCommon(districts) : null;

    // Best photo
    const photoUrl = group.find((p) => p.photos?.length > 0)?.photos[0] || null;

    // Seismic & Shutov (pre-cache)
    let seismicRiskLevel: string | null = null;
    let seismicDistanceMeters: number | null = null;
    let shutovCategory: number | null = null;

    if (lat && lng) {
      const seismic = findNearestFault(lat, lng);
      seismicRiskLevel = seismic.riskLevel;
      seismicDistanceMeters = Math.round(seismic.distanceMeters);
    }

    const shutov = findShutovRating(displayName);
    if (shutov) {
      shutovCategory = shutov.category;
    }

    // Save complex
    const complexEntity = this.complexesRepo.create({
      projectId,
      name: normalizedName,
      displayName,
      lat: lat as any,
      lng: lng as any,
      district: district as any,
      address: group[0]?.address || undefined,
      priceMin: priceMin as any,
      priceMax: priceMax as any,
      priceAvg: priceAvg as any,
      listingsCount: group.length,
      groupingMethod: method,
      photoUrl: photoUrl as any,
      seismicRiskLevel: seismicRiskLevel as any,
      seismicDistanceMeters: seismicDistanceMeters as any,
      shutovCategory: shutovCategory as any,
    });
    const complex = await this.complexesRepo.save(complexEntity);

    // Update all properties to point to this complex
    const bestProp = group.reduce((best, p) =>
      (Number(p.scoreTotal) || 0) > (Number(best.scoreTotal) || 0) ? p : best,
      group[0],
    );

    for (const prop of group) {
      prop.complexId = complex.id;
      prop.isPrimary = prop.id === bestProp.id;
      await this.propertiesRepo.save(prop);
    }

    return complex;
  }

  /** Score all complexes in a project */
  async scoreComplexes(
    projectId: string,
    interviewAnswers: Record<string, unknown>,
  ): Promise<void> {
    const complexes = await this.complexesRepo.find({ where: { projectId } });

    for (const complex of complexes) {
      // Aggregate scores from properties
      const properties = await this.propertiesRepo.find({ where: { complexId: complex.id } });
      const scored = properties.filter((p) => p.scoreTotal > 0);

      if (scored.length === 0) continue;

      // Average property scores
      const avgCommute = scored.reduce((s, p) => s + Number(p.scoreCommute || 0), 0) / scored.length;
      const avgInfra = scored.reduce((s, p) => s + Number(p.scoreInfrastructure || 0), 0) / scored.length;
      const avgLifestyle = scored.reduce((s, p) => s + Number(p.scoreLifestyle || 0), 0) / scored.length;

      // Seismic score from cached risk level
      let seismicScore = 100;
      if (complex.seismicRiskLevel) {
        const seismicScores: Record<string, number> = {
          safe: 100, low: 85, moderate: 65, high: 35, critical: 10,
        };
        seismicScore = seismicScores[complex.seismicRiskLevel] ?? 75;
      }

      // Complex total with new weights: infra 30%, lifestyle 25%, commute 25%, seismic 20%
      let total = avgInfra * 0.30 + avgLifestyle * 0.25 + avgCommute * 0.25 + seismicScore * 0.20;

      // Shutov adjustment
      if (complex.shutovCategory !== null && complex.shutovCategory !== undefined) {
        const adjustments: Record<number, number> = { 0: 5, 1: 3, 2: 1, 3: 0, 4: -3, 5: -7 };
        total += adjustments[complex.shutovCategory] ?? 0;
      }

      total = Math.max(0, Math.min(100, total));

      // Best property's commute time
      const bestCommuteProp = scored.reduce((best, p) =>
        (Number(p.commuteMinutes) || 999) < (Number(best.commuteMinutes) || 999) ? p : best,
        scored[0],
      );

      complex.scoreTotal = total;
      complex.scoreInfrastructure = avgInfra;
      complex.scoreLifestyle = avgLifestyle;
      complex.scoreCommute = avgCommute;
      complex.scoreSeismic = seismicScore;
      complex.commuteMinutes = bestCommuteProp.commuteMinutes;
      complex.commuteTrafficDirection = bestCommuteProp.commuteTrafficDirection;

      await this.complexesRepo.save(complex);
    }

    this.logger.log(`Scored ${complexes.length} complexes for project ${projectId}`);
  }

  /** Return the most common string in an array */
  private mostCommon(arr: string[]): string {
    const counts = new Map<string, number>();
    for (const s of arr) counts.set(s, (counts.get(s) || 0) + 1);
    let best = arr[0], bestCount = 0;
    for (const [s, c] of counts) { if (c > bestCount) { best = s; bestCount = c; } }
    return best;
  }

  private async saveProperty(projectId: string, prop: KrishaPropertyDetail): Promise<void> {
    // Check for duplicate by krishaId in this project
    const existing = await this.propertiesRepo.findOne({
      where: { projectId, krishaId: prop.krishaId },
    });
    if (existing) {
      this.logger.log(`Skipping duplicate: ${prop.krishaId}`);
      return;
    }

    await this.propertiesRepo.save({
      projectId,
      krishaId: prop.krishaId,
      krishaUrl: prop.krishaUrl,
      title: prop.title,
      price: prop.price,
      rooms: prop.rooms,
      areaTotal: prop.areaTotal,
      areaLiving: prop.areaLiving || undefined,
      areaKitchen: prop.areaKitchen || undefined,
      floor: prop.floor,
      floorTotal: prop.floorTotal,
      buildingType: prop.buildingType || undefined,
      yearBuilt: prop.yearBuilt ?? undefined,
      condition: prop.condition || undefined,
      district: prop.district,
      address: prop.address,
      complexName: prop.complexName,
      lat: prop.lat ?? undefined,
      lng: prop.lng ?? undefined,
      phone: prop.phone || undefined,
      sellerType: prop.sellerType || undefined,
      photos: prop.photos,
      description: prop.description || undefined,
      isPrimary: true,
    });
  }
}
