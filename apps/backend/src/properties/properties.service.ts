import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PropertyEntity } from "../database/entities/property.entity";
import { CJMScenarioEntity } from "../database/entities/cjm-scenario.entity";

@Injectable()
export class PropertiesService {
  constructor(
    @InjectRepository(PropertyEntity)
    private propertiesRepo: Repository<PropertyEntity>,
    @InjectRepository(CJMScenarioEntity)
    private cjmRepo: Repository<CJMScenarioEntity>,
  ) {}

  async findByProject(
    projectId: string,
    options: { sort?: string; page?: number; limit?: number } = {},
  ) {
    const { sort = "scoreTotal", page = 1, limit = 20 } = options;

    const orderField = sort === "price" ? "price" : sort === "area" ? "areaTotal" : "scoreTotal";
    const [properties, total] = await this.propertiesRepo.findAndCount({
      where: { projectId, isPrimary: true },
      order: { [orderField]: orderField === "price" ? "ASC" : "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      properties,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const property = await this.propertiesRepo.findOne({
      where: { id },
      relations: ["cjmScenarios"],
    });
    if (!property) throw new NotFoundException("Property not found");
    return property;
  }

  async findDuplicates(id: string) {
    const property = await this.propertiesRepo.findOne({ where: { id } });
    if (!property || !property.groupId) return { duplicates: [] };

    const duplicates = await this.propertiesRepo.find({
      where: { groupId: property.groupId },
    });
    return { duplicates: duplicates.filter((p) => p.id !== id) };
  }

  async getCJM(propertyId: string) {
    const scenarios = await this.cjmRepo.find({
      where: { propertyId },
      order: { timeSlot: "ASC" },
    });

    return {
      weekday: scenarios.filter((s) => s.scenarioType === "weekday"),
      weekend: scenarios.filter((s) => s.scenarioType === "weekend"),
    };
  }

  async getDrilldown(scenarioId: string, projectId: string) {
    const scenario = await this.cjmRepo.findOne({ where: { id: scenarioId } });
    if (!scenario) throw new NotFoundException("Scenario not found");

    // Find properties with 80%+ tag overlap
    const allScenarios = await this.cjmRepo
      .createQueryBuilder("cjm")
      .innerJoinAndSelect("cjm.property", "property")
      .where("property.projectId = :projectId", { projectId })
      .andWhere("property.id != :propertyId", { propertyId: scenario.propertyId })
      .andWhere("property.isPrimary = true")
      .getMany();

    const scenarioTags = new Set(scenario.tags);
    const similar = allScenarios
      .filter((s) => {
        const overlap = s.tags.filter((t) => scenarioTags.has(t)).length;
        return overlap / scenarioTags.size >= 0.8;
      })
      .map((s) => s.property)
      .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i);

    return { scenario, similarProperties: similar };
  }
}
