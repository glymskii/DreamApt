import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Logger,
} from "@nestjs/common";
import { PropertiesService } from "./properties.service";
import { CJMService } from "../cjm/cjm.service";
import { TwoGisReviewsService } from "./twogis-reviews.service";
import { ScoringService } from "../scoring/scoring.service";
import { JwtAuthGuard } from "../auth/auth.guard";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PropertyEntity } from "../database/entities/property.entity";
import { SearchProjectEntity } from "../database/entities/search-project.entity";
import { findShutovRating, SHUTOV_CATEGORY_COLORS, findNearestFault } from "@dreamapt/shared";

@Controller()
@UseGuards(JwtAuthGuard)
export class PropertiesController {
  private readonly logger = new Logger(PropertiesController.name);

  constructor(
    private propertiesService: PropertiesService,
    private cjmService: CJMService,
    private reviewsService: TwoGisReviewsService,
    private scoringService: ScoringService,
    @InjectRepository(PropertyEntity)
    private propertiesRepo: Repository<PropertyEntity>,
    @InjectRepository(SearchProjectEntity)
    private projectsRepo: Repository<SearchProjectEntity>,
  ) {}

  @Get("projects/:projectId/properties")
  async findByProject(
    @Param("projectId") projectId: string,
    @Query("sort") sort?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.propertiesService.findByProject(projectId, {
      sort,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get("properties/:id")
  async findOne(@Param("id") id: string) {
    const property = await this.propertiesService.findOne(id);

    // Auto-rescore if AI comment is missing or contains mock text
    if (
      !property.scoringExplanation ||
      property.scoringExplanation.includes("Mock") ||
      property.scoringExplanation.includes("API ключ не установлен") ||
      property.scoringExplanation === ""
    ) {
      // Run re-scoring in background (don't block the response)
      this.rescoreProperty(property.id, property.projectId).catch((err) =>
        this.logger.error(`Background rescore failed for ${property.id}: ${err}`),
      );
    }

    return property;
  }

  @Get("properties/:id/duplicates")
  async findDuplicates(@Param("id") id: string) {
    return this.propertiesService.findDuplicates(id);
  }

  @Get("properties/:id/cjm")
  async getCJM(@Param("id") id: string) {
    const cjm = await this.cjmService.getOrGenerate(id);

    // Get the current property to find its project and score
    const property = await this.propertiesRepo.findOne({ where: { id } });
    if (!property) {
      return { ...cjm, recommendedProperties: [] };
    }

    // Find other properties in the same project with higher score
    const betterProperties = await this.propertiesRepo
      .createQueryBuilder("p")
      .where("p.project_id = :projectId", { projectId: property.projectId })
      .andWhere("p.is_primary = true")
      .andWhere("p.id != :currentId", { currentId: id })
      .andWhere("p.score_total > :currentScore", { currentScore: Number(property.scoreTotal) || 0 })
      .orderBy("p.score_total", "DESC")
      .limit(5)
      .getMany();

    // Extract nearby places (same for all scenarios of a property)
    const allScenarios = [...(cjm.weekday || []), ...(cjm.weekend || [])];
    const nearbyPlaces = allScenarios.find((s) => s.nearbyPlaces?.length)?.nearbyPlaces || [];

    return {
      ...cjm,
      nearbyPlaces,
      recommendedProperties: betterProperties.map((p) => ({
        id: p.id,
        title: p.title,
        complexName: p.complexName,
        district: p.district,
        price: p.price,
        rooms: p.rooms,
        areaTotal: p.areaTotal,
        scoreTotal: p.scoreTotal,
        photos: p.photos?.slice(0, 1) || [],
        commuteMinutes: p.commuteMinutes,
      })),
    };
  }

  @Get("properties/:id/reviews")
  async getReviews(@Param("id") id: string) {
    const property = await this.propertiesService.findOne(id);
    if (!property.complexName) {
      return { reviews: [], totalReviews: 0, averageRating: 0, twogisUrl: null };
    }
    const result = await this.reviewsService.getReviews(
      property.complexName,
      property.lat ?? undefined,
      property.lng ?? undefined,
    );
    return result || { totalReviews: 0, averageRating: 0, twogisUrl: null, complexName: "", address: "", buildingName: "", reviews: [] };
  }

  @Get("properties/:id/shutov-rating")
  async getShutovRating(@Param("id") id: string) {
    const property = await this.propertiesService.findOne(id);
    const rating = findShutovRating(property.complexName || "");
    if (!rating) {
      return { found: false };
    }
    return {
      found: true,
      name: rating.name,
      category: rating.category,
      categoryLabel: rating.categoryLabel,
      categoryColor: SHUTOV_CATEGORY_COLORS[rating.category] || "#666",
      description: rating.description,
    };
  }

  @Get("properties/:id/seismic-risk")
  async getSeismicRisk(@Param("id") id: string) {
    const property = await this.propertiesService.findOne(id);
    if (!property.lat || !property.lng) {
      return { found: false, message: "No coordinates" };
    }
    const result = findNearestFault(property.lat, property.lng);
    return { found: true, ...result };
  }

  @Post("properties/:id/rescore")
  async rescore(@Param("id") id: string) {
    const property = await this.propertiesRepo.findOne({ where: { id } });
    if (!property) {
      return { success: false, message: "Property not found" };
    }
    await this.rescoreProperty(property.id, property.projectId);
    const updated = await this.propertiesRepo.findOne({ where: { id } });
    return {
      success: true,
      scoringExplanation: updated?.scoringExplanation,
      scoreTotal: updated?.scoreTotal,
    };
  }

  @Post("projects/:projectId/rescore-all")
  async rescoreAll(@Param("projectId") projectId: string) {
    const project = await this.projectsRepo.findOne({ where: { id: projectId } });
    if (!project) {
      return { success: false, message: "Project not found" };
    }
    const interviewAnswers = (project.interviewAnswers || {}) as Record<string, unknown>;

    // Run full re-scoring in background
    this.scoringService.scoreProperties(projectId, interviewAnswers).catch((err) =>
      this.logger.error(`Full rescore failed for project ${projectId}: ${err}`),
    );

    return { success: true, message: "Перескоринг запущен. Обновите страницу через несколько секунд." };
  }

  @Get("cjm/:scenarioId/drilldown")
  async getDrilldown(
    @Param("scenarioId") scenarioId: string,
    @Query("projectId") projectId: string,
  ) {
    return this.propertiesService.getDrilldown(scenarioId, projectId);
  }

  private async rescoreProperty(propertyId: string, projectId: string): Promise<void> {
    const project = await this.projectsRepo.findOne({ where: { id: projectId } });
    if (!project?.interviewAnswers) return;

    const interviewAnswers = project.interviewAnswers as Record<string, unknown>;
    await this.scoringService.rescoreSingleProperty(propertyId, interviewAnswers);
  }
}
