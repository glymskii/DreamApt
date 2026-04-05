import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ResidentialComplexEntity } from "../database/entities/residential-complex.entity";
import { PropertyEntity } from "../database/entities/property.entity";
import { findShutovRating, findNearestFault, SHUTOV_CATEGORY_COLORS, SHUTOV_CATEGORY_LABELS } from "@dreamapt/shared";

@Injectable()
export class ComplexService {
  constructor(
    @InjectRepository(ResidentialComplexEntity)
    private complexesRepo: Repository<ResidentialComplexEntity>,
    @InjectRepository(PropertyEntity)
    private propertiesRepo: Repository<PropertyEntity>,
  ) {}

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

    return {
      complexes,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
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
        "listingsCount", "seismicRiskLevel", "commuteMinutes", "photoUrl",
        "district", "priceMin", "priceMax", "shutovCategory",
      ],
    });

    // Import fault data from shared package
    const { FAULT_LINES } = await import("@dreamapt/shared");

    return {
      complexes: complexes.filter((c) => c.lat && c.lng),
      faultLines: FAULT_LINES || [],
    };
  }
}
