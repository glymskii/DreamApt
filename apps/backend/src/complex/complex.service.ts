import { Injectable, NotFoundException, Inject, forwardRef } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ResidentialComplexEntity } from "../database/entities/residential-complex.entity";
import { PropertyEntity } from "../database/entities/property.entity";
import { SearchProjectEntity } from "../database/entities/search-project.entity";
import { AirKazService } from "../air-quality/airkaz.service";
import { TwoGisReviewsService } from "../properties/twogis-reviews.service";
import { findShutovRating, findNearestFault, SHUTOV_CATEGORY_COLORS, SHUTOV_CATEGORY_LABELS } from "@dreamapt/shared";

// In-memory cache for the public map-data response. Built every request before
// caching: ~500 row scan + dedup + AirKaz fetch + O(N×M) station backfill +
// JSON serialization (~430 KB). Single warm-up costs ~200ms; cached hits are
// near-zero. TTL 60s — fresh enough for "live air quality" feel, slow enough
// to absorb a viral spike.
const MAP_DATA_TTL_MS = 60_000;
const GLOBAL_LIST_TTL_MS = 60_000;

@Injectable()
export class ComplexService {
  // Single-process caches. Render runs one Node instance, so this is fine.
  // If we ever scale horizontally, swap for Redis with the same TTLs.
  private mapDataCache: { value: any; expiresAt: number } | null = null;
  private globalListCache = new Map<string, { value: any; expiresAt: number }>();

  constructor(
    @InjectRepository(ResidentialComplexEntity)
    private complexesRepo: Repository<ResidentialComplexEntity>,
    @InjectRepository(PropertyEntity)
    private propertiesRepo: Repository<PropertyEntity>,
    @InjectRepository(SearchProjectEntity)
    private projectsRepo: Repository<SearchProjectEntity>,
    private airKaz: AirKazService,
    @Inject(forwardRef(() => TwoGisReviewsService))
    private twoGisReviews: TwoGisReviewsService,
  ) {}

  /** Get all complexes globally, deduplicated by normalized name (best score wins) */
  async findAllForMap() {
    // Cache hit — by far the hottest endpoint on the site.
    const now = Date.now();
    if (this.mapDataCache && this.mapDataCache.expiresAt > now) {
      return this.mapDataCache.value;
    }
    const value = await this.buildMapData();
    this.mapDataCache = { value, expiresAt: now + MAP_DATA_TTL_MS };
    return value;
  }

  private async buildMapData() {
    const all = await this.complexesRepo.find({
      select: [
        "id", "name", "displayName", "lat", "lng", "scoreTotal", "priceAvg",
        "listingsCount", "seismicRiskLevel", "seismicDistanceMeters",
        "seismicConfirmedM", "seismicStudiedM", "seismicDisputedM",
        "commuteMinutes", "photoUrl", "district", "priceMin", "priceMax",
        "shutovCategory", "scoreInfrastructure", "scoreLifestyle",
        "scoreCommute", "scoreSeismic", "floorsMax", "floorSegment",
        "yearBuilt",
        "airQualityPm25", "airQualityLevel", "airQualityStation",
        "twogisRating", "twogisReviewCount",
      ],
    });

    // Deduplicate by normalized name — keep the one with highest score
    // Also filter to Almaty bounds only
    const dedupMap = new Map<string, ResidentialComplexEntity>();
    for (const c of all) {
      if (!c.lat || !c.lng) continue;
      const lat = Number(c.lat), lng = Number(c.lng);
      if (lat < 43.0 || lat > 43.5 || lng < 76.4 || lng > 77.5) continue;
      const key = c.name.toLowerCase().trim();
      const existing = dedupMap.get(key);
      if (!existing || (Number(c.scoreTotal) || 0) > (Number(existing.scoreTotal) || 0)) {
        dedupMap.set(key, c);
      }
    }

    const { FAULT_LINES, FAULT_ZONES, ALMATY_BOUNDARY, ALMATY_URBAN_PLANS, ALMATY_URBAN_PLAN_GEOMETRY } =
      await import("@dreamapt/shared");

    // Fetch live air quality stations (cached for 15 min in service)
    let airStations: any[] = [];
    try {
      const stations = await this.airKaz.getStations();
      airStations = stations
        .filter((s) => s.pm25 !== null)
        .map((s) => {
          const cls = this.airKaz.classifyPm25(s.pm25!);
          return {
            id: s.id,
            name: s.name,
            lat: s.lat,
            lng: s.lng,
            pm25: s.pm25,
            origin: s.origin,
            district: s.district,
            level: cls.level,
            levelLabel: cls.label,
            color: cls.color,
            updatedAt: s.date,
          };
        });
    } catch {
      // graceful degradation: return empty stations array if AirKaz fails
    }

    // Backfill missing air quality on complexes from nearest station (in-memory only,
    // doesn't write to DB — keeps map-data fast and self-healing)
    const complexes = Array.from(dedupMap.values());
    if (airStations.length > 0) {
      for (const c of complexes) {
        if (c.airQualityPm25) continue; // already cached
        const lat = Number(c.lat), lng = Number(c.lng);
        let best: any = null, bestDist = Infinity;
        for (const s of airStations) {
          const d = Math.sqrt(
            Math.pow((s.lat - lat) * 111000, 2) +
            Math.pow((s.lng - lng) * 80000, 2),
          );
          if (d < bestDist) { bestDist = d; best = s; }
        }
        if (best) {
          (c as any).airQualityPm25 = best.pm25;
          (c as any).airQualityLevel = best.level;
          (c as any).airQualityStation = best.name;
        }
      }
    }

    return {
      complexes,
      faultLines: [...(FAULT_LINES || []), ...(FAULT_ZONES || [])],
      airStations,
      // City boundary polygon (OSM admin_level=4) — drawn as a thin grey
      // outline on the map so users can see where Almaty ends.
      cityBoundary: ALMATY_BOUNDARY,
      // 2040 master-plan street plan: textual timeline (grouped by 5-year
      // wave) + matching OSM LineString geometry. Both arrive on every
      // map-data response; frontend keeps the layer hidden by default
      // and only renders it when the user toggles "Генплан" on.
      urbanPlans: ALMATY_URBAN_PLANS,
      urbanPlanGeometry: ALMATY_URBAN_PLAN_GEOMETRY,
    };
  }

  /** Global paginated list of all complexes (deduplicated) */
  async findAllGlobal(sort: string = "scoreTotal", page: number = 1, limit: number = 50) {
    const orderMap: Record<string, { field: string; dir: "ASC" | "DESC" }> = {
      scoreTotal: { field: "scoreTotal", dir: "DESC" },
      priceAvg: { field: "priceAvg", dir: "ASC" },
      listingsCount: { field: "listingsCount", dir: "DESC" },
      seismicDistanceMeters: { field: "seismicDistanceMeters", dir: "ASC" },
    };
    const order = orderMap[sort] || orderMap.scoreTotal;

    // Cache key includes sort+page+limit; bots iterating through pages still
    // get cached responses. TTL 60s matches map-data so the dataset stays
    // consistent between the two views.
    const cacheKey = `${sort}:${page}:${limit}`;
    const now = Date.now();
    const hit = this.globalListCache.get(cacheKey);
    if (hit && hit.expiresAt > now) return hit.value;

    const all = await this.complexesRepo.find({
      order: { [order.field]: order.dir },
    });

    // Deduplicate by name
    const dedupMap = new Map<string, ResidentialComplexEntity>();
    for (const c of all) {
      const key = c.name.toLowerCase().trim();
      const existing = dedupMap.get(key);
      if (!existing || (Number(c.scoreTotal) || 0) > (Number(existing.scoreTotal) || 0)) {
        dedupMap.set(key, c);
      }
    }

    const deduped = Array.from(dedupMap.values());
    // Re-sort after dedup
    deduped.sort((a, b) => {
      const aVal = Number((a as any)[order.field]) || 0;
      const bVal = Number((b as any)[order.field]) || 0;
      return order.dir === "DESC" ? bVal - aVal : aVal - bVal;
    });

    const total = deduped.length;
    const paged = deduped.slice((page - 1) * limit, page * limit);

    const result = { complexes: paged, total, page, totalPages: Math.ceil(total / limit) };
    this.globalListCache.set(cacheKey, { value: result, expiresAt: now + GLOBAL_LIST_TTL_MS });
    // Cap cache size to prevent memory leak on attacker-iterated keys
    if (this.globalListCache.size > 100) {
      const firstKey = this.globalListCache.keys().next().value;
      if (firstKey !== undefined) this.globalListCache.delete(firstKey);
    }
    return result;
  }

  /** Invalidate caches — call when complexes are mutated (parsing, scoring, etc) */
  invalidateMapCache() {
    this.mapDataCache = null;
    this.globalListCache.clear();
  }

  async findByProject(
    projectId: string,
    sort: string = "scoreTotal",
    page: number = 1,
    limit: number = 20,
  ) {
    const orderMap: Record<string, { field: string; dir: "ASC" | "DESC" }> = {
      scoreTotal: { field: "scoreTotal", dir: "DESC" },
      priceAvg: { field: "priceAvg", dir: "ASC" },
      listingsCount: { field: "listingsCount", dir: "DESC" },
    };
    const order = orderMap[sort] || orderMap.scoreTotal;

    const [complexes, total] = await this.complexesRepo.findAndCount({
      where: { projectId },
      order: { [order.field]: order.dir },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { complexes, total, page, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const complex = await this.complexesRepo.findOne({ where: { id } });
    if (!complex) throw new NotFoundException("Complex not found");
    return complex;
  }

  async findProperties(complexId: string, sort: string = "scoreTotal") {
    const orderMap: Record<string, Record<string, "ASC" | "DESC">> = {
      scoreTotal: { scoreTotal: "DESC" },
      price: { price: "ASC" },
      area: { areaTotal: "DESC" },
    };

    return this.propertiesRepo.find({
      where: { complexId },
      order: orderMap[sort] || orderMap.scoreTotal,
    });
  }

  async getShutovRating(complexId: string) {
    const complex = await this.findOne(complexId);
    const rating = findShutovRating(complex.displayName || complex.name);
    if (!rating) return { found: false };
    return {
      found: true,
      name: rating.name,
      category: rating.category,
      categoryLabel: rating.categoryLabel,
      categoryColor: SHUTOV_CATEGORY_COLORS[rating.category] || "#666",
      description: rating.description,
    };
  }

  async getSeismicRisk(complexId: string) {
    const complex = await this.findOne(complexId);
    if (!complex.lat || !complex.lng) return { found: false };
    const result = findNearestFault(complex.lat, complex.lng);
    return { found: true, ...result };
  }

  /**
   * Public 2GIS reviews for a complex.
   * Looks up reviews on 2GIS via the residential complex name (with lat/lng
   * bias when available). Persists the full reviews payload for 24h so we
   * don't hammer the public demo key during traffic spikes — this is the
   * difference between "ban in 1 hour at viral traffic" vs "essentially
   * unlimited reads".
   */
  async getReviews(complexId: string) {
    const complex = await this.findOne(complexId);
    const name = complex.displayName || complex.name;
    if (!name) {
      return this.emptyReviewsResult();
    }

    // Serve from DB cache if fetched within last 24h. "Empty" result is also
    // cached (we record fetched_at even on miss) to avoid retrying complexes
    // that 2GIS doesn't know about.
    const FRESH_MS = 24 * 60 * 60 * 1000;
    if (
      complex.twogisFetchedAt &&
      Date.now() - new Date(complex.twogisFetchedAt).getTime() < FRESH_MS
    ) {
      const cached = complex.twogisReviewsJson;
      if (cached) return cached;
      return this.emptyReviewsResult();
    }

    const lat = complex.lat ? Number(complex.lat) : undefined;
    const lng = complex.lng ? Number(complex.lng) : undefined;

    const result = await this.twoGisReviews.getReviews(name, lat, lng);
    if (!result) {
      // Persist the negative result to avoid re-fetching for 24h
      await this.complexesRepo.update(complex.id, {
        twogisFetchedAt: new Date(),
        twogisReviewsJson: null as any,
      });
      return this.emptyReviewsResult();
    }

    const payload = {
      found: result.totalReviews > 0 || result.reviews.length > 0,
      totalReviews: result.totalReviews,
      averageRating: result.averageRating,
      reviews: result.reviews,
      twogisUrl: result.twogisUrl,
      buildingName: result.buildingName,
      address: result.address,
    };

    // Persist full payload + aggregates. One DB write per 24h per complex,
    // regardless of how many users click it.
    const newRating = Number(result.averageRating.toFixed(1));
    const newCount = result.totalReviews;
    await this.complexesRepo.update(complex.id, {
      twogisRating: (newCount > 0 ? newRating : null) as any,
      twogisReviewCount: newCount,
      twogisReviewsJson: payload as any,
      twogisFetchedAt: new Date(),
    });

    return payload;
  }

  private emptyReviewsResult() {
    return {
      found: false,
      totalReviews: 0,
      averageRating: 0,
      reviews: [],
      twogisUrl: null,
    };
  }

  async getMapData(projectId: string) {
    const complexes = await this.complexesRepo.find({
      where: { projectId },
      select: [
        "id", "displayName", "lat", "lng", "scoreTotal", "priceAvg",
        "listingsCount", "seismicRiskLevel", "seismicDistanceMeters",
        "commuteMinutes", "photoUrl",
        "district", "priceMin", "priceMax", "shutovCategory",
      ],
    });

    const { FAULT_LINES, FAULT_ZONES } = await import("@dreamapt/shared");

    return {
      complexes: complexes.filter((c) => c.lat && c.lng),
      faultLines: [...(FAULT_LINES || []), ...(FAULT_ZONES || [])],
    };
  }

  /**
   * Recompute aggregate fields (yearBuilt, floorsMax, priceMin/Max/Avg,
   * listingsCount) for all complexes from their associated properties.
   * Useful after a schema bump that adds new aggregate columns — backfills
   * the historical rows in one pass without re-scraping anything.
   *
   * Returns counts of how many complexes were inspected vs. actually
   * mutated. ЖК with zero properties (global Krisha-scraped catalog
   * entries) are left untouched — those need a Krisha re-scrape instead.
   */
  async recomputeAggregatesFromProperties(): Promise<{
    inspected: number;
    updated: number;
    skipped: number;
  }> {
    const all = await this.complexesRepo.find();
    let inspected = 0;
    let updated = 0;
    let skipped = 0;

    for (const c of all) {
      inspected++;
      const properties = await this.propertiesRepo.find({
        where: { complexId: c.id },
        select: ["price", "floorTotal", "yearBuilt"],
      });
      if (properties.length === 0) {
        skipped++;
        continue;
      }

      // Floors max — single-pass max over property.floorTotal.
      const floors = properties
        .map((p) => Number(p.floorTotal))
        .filter((n) => Number.isFinite(n) && n > 0 && n < 200);
      const newFloorsMax = floors.length > 0 ? Math.max(...floors) : null;

      // Year built — modal value (most common). Same robustness as the
      // search pipeline aggregator.
      const years = properties
        .map((p) => p.yearBuilt)
        .filter((y): y is number => typeof y === "number" && y > 1950 && y < 2100);
      const newYearBuilt = years.length > 0 ? this.modal(years) : null;

      // Price aggregates — also useful to keep in sync.
      const prices = properties
        .map((p) => Number(p.price))
        .filter((n) => Number.isFinite(n) && n > 0);
      const newPriceMin = prices.length > 0 ? Math.min(...prices) : null;
      const newPriceMax = prices.length > 0 ? Math.max(...prices) : null;
      const newPriceAvg = prices.length > 0
        ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
        : null;

      // Build update patch — only include keys whose value actually changed,
      // so we skip the UPDATE entirely when everything is already aligned.
      const patch: Record<string, unknown> = {};
      if (newFloorsMax !== null && c.floorsMax !== newFloorsMax) patch.floorsMax = newFloorsMax;
      if (newYearBuilt !== null && c.yearBuilt !== newYearBuilt) patch.yearBuilt = newYearBuilt;
      if (newPriceMin !== null && Number(c.priceMin) !== newPriceMin) patch.priceMin = newPriceMin;
      if (newPriceMax !== null && Number(c.priceMax) !== newPriceMax) patch.priceMax = newPriceMax;
      if (newPriceAvg !== null && Number(c.priceAvg) !== newPriceAvg) patch.priceAvg = newPriceAvg;
      if (c.listingsCount !== properties.length) patch.listingsCount = properties.length;

      if (Object.keys(patch).length > 0) {
        await this.complexesRepo.update(c.id, patch);
        updated++;
      }
    }

    // Refresh map-data cache so users see new floors/year immediately.
    this.invalidateMapCache();

    return { inspected, updated, skipped };
  }

  /** Modal (most-common) helper. Used for yearBuilt where listings usually
   *  agree but a few stragglers may report a different (older/test) year. */
  private modal<T>(arr: T[]): T {
    const counts = new Map<T, number>();
    for (const v of arr) counts.set(v, (counts.get(v) || 0) + 1);
    let best = arr[0], bestCount = 0;
    for (const [v, c] of counts) { if (c > bestCount) { best = v; bestCount = c; } }
    return best;
  }

  /**
   * Recompute seismic risk for every complex. Needed when the threshold
   * table in @dreamapt/shared/findNearestFault changes — stored
   * `seismicRiskLevel` and `seismicDistanceMeters` would otherwise be
   * stale until the next per-complex re-score. Pure CPU pass over the
   * existing fault dataset, no upstream calls.
   */
  async recomputeSeismicForAll(): Promise<{
    inspected: number;
    updated: number;
    skipped: number;
  }> {
    const all = await this.complexesRepo.find({
      select: [
        "id", "lat", "lng",
        "seismicRiskLevel", "seismicDistanceMeters",
        "seismicConfirmedM", "seismicStudiedM", "seismicDisputedM",
      ],
    });
    let inspected = 0;
    let updated = 0;
    let skipped = 0;

    for (const c of all) {
      inspected++;
      if (!c.lat || !c.lng) { skipped++; continue; }
      const seismic = findNearestFault(Number(c.lat), Number(c.lng));
      const newLevel = seismic.riskLevel;
      const newDist = Math.round(seismic.distanceMeters);
      const confirmed = seismic.nearestByType.confirmed;
      const studied = seismic.nearestByType.poorlyStudied;
      const disputed = seismic.nearestByType.disputed;

      // Compare each field to skip pointless UPDATEs. The per-type fields
      // can also be null (no fault of that type in dataset) — keep that.
      const same =
        c.seismicRiskLevel === newLevel &&
        c.seismicDistanceMeters === newDist &&
        (c.seismicConfirmedM ?? null) === confirmed &&
        (c.seismicStudiedM ?? null) === studied &&
        (c.seismicDisputedM ?? null) === disputed;

      if (!same) {
        await this.complexesRepo.update(c.id, {
          seismicRiskLevel: newLevel,
          seismicDistanceMeters: newDist,
          seismicConfirmedM: confirmed as any,
          seismicStudiedM: studied as any,
          seismicDisputedM: disputed as any,
        });
        updated++;
      }
    }

    this.invalidateMapCache();
    return { inspected, updated, skipped };
  }

  /** Delete complexes outside Almaty bounds */
  async deleteNonAlmaty(): Promise<number> {
    const all = await this.complexesRepo.find();
    let deleted = 0;
    for (const c of all) {
      if (!c.lat || !c.lng) continue;
      const lat = Number(c.lat);
      const lng = Number(c.lng);
      if (lat < 43.0 || lat > 43.5 || lng < 76.4 || lng > 77.5) {
        await this.complexesRepo.delete(c.id);
        deleted++;
      }
    }
    return deleted;
  }

  async getProjectForScoring(projectId: string) {
    return this.projectsRepo.findOne({ where: { id: projectId } });
  }
}
