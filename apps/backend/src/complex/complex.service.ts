import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ResidentialComplexEntity } from "../database/entities/residential-complex.entity";
import { PropertyEntity } from "../database/entities/property.entity";
import { SearchProjectEntity } from "../database/entities/search-project.entity";
import { findShutovRating, findNearestFault, SHUTOV_CATEGORY_COLORS, SHUTOV_CATEGORY_LABELS } from "@dreamapt/shared";

@Injectable()
export class ComplexService {
  constructor(
    @InjectRepository(ResidentialComplexEntity)
    private complexesRepo: Repository<ResidentialComplexEntity>,
    @InjectRepository(PropertyEntity)
    private propertiesRepo: Repository<PropertyEntity>,
    @InjectRepository(SearchProjectEntity)
    private projectsRepo: Repository<SearchProjectEntity>,
  ) {}

  /** Get all complexes globally, deduplicated by normalized name (best score wins) */
  async findAllForMap() {
    const all = await this.complexesRepo.find({
      select: [
        "id", "name", "displayName", "lat", "lng", "scoreTotal", "priceAvg",
        "listingsCount", "seismicRiskLevel", "seismicDistanceMeters",
        "commuteMinutes", "photoUrl", "district", "priceMin", "priceMax",
        "shutovCategory", "scoreInfrastructure", "scoreLifestyle",
        "scoreCommute", "scoreSeismic", "floorsMax", "floorSegment",
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

    const { FAULT_LINES, FAULT_ZONES } = await import("@dreamapt/shared");

    return {
      complexes: Array.from(dedupMap.values()),
      faultLines: [...(FAULT_LINES || []), ...(FAULT_ZONES || [])],
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

    return { complexes: paged, total, page, totalPages: Math.ceil(total / limit) };
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
