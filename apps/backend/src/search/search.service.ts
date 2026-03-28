import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SearchProjectEntity } from "../database/entities/search-project.entity";
import { PropertyEntity } from "../database/entities/property.entity";
import { PropertyGroupEntity } from "../database/entities/property-group.entity";
import { AIService } from "../ai/ai.service";
import { ScoringService } from "../scoring/scoring.service";
import { KrishaParserService, KrishaPropertyDetail } from "./krisha-parser.service";
import { ALMATY_DEVELOPERS } from "@dreamapt/shared";

const MAX_RESULTS = parseInt(process.env.PARSER_MAX_RESULTS || "100");

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @InjectRepository(SearchProjectEntity)
    private projectsRepo: Repository<SearchProjectEntity>,
    @InjectRepository(PropertyEntity)
    private propertiesRepo: Repository<PropertyEntity>,
    @InjectRepository(PropertyGroupEntity)
    private groupsRepo: Repository<PropertyGroupEntity>,
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

      // Phase 3: Update status & count
      const savedCount = Math.min(parsedProperties.length, MAX_RESULTS);
      await this.projectsRepo.update(projectId, {
        status: "scoring",
        propertyCount: savedCount,
      });
      this.logger.log(`Saved ${savedCount} properties, starting scoring`);

      // Phase 4: Score all properties
      await this.scoringService.scoreProperties(projectId, interviewAnswers);

      // Phase 5: Done
      await this.projectsRepo.update(projectId, { status: "scored" });
      this.logger.log(`Search pipeline complete for project ${projectId}`);
    } catch (err) {
      this.logger.error("Search pipeline error:", err);
      await this.projectsRepo.update(projectId, { status: "interview_complete" });
    }
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
