import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ComplexService } from "./complex.service";
import { KrishaComplexParserService } from "./krisha-complex-parser.service";
import { SearchService } from "../search/search.service";
import { JwtAuthGuard } from "../auth/auth.guard";
import { OptionalJwtGuard } from "../auth/optional-jwt.guard";
import { AdminGuard } from "../auth/admin.guard";

@Controller()
export class ComplexController {
  constructor(
    private complexService: ComplexService,
    private krishaComplexParser: KrishaComplexParserService,
    private searchService: SearchService,
  ) {}

  // ── PUBLIC endpoints (no auth required) ──

  @Get("complexes/map-data")
  async getGlobalMapData() {
    return this.complexService.findAllForMap();
  }

  @Get("complexes/all")
  async findAllGlobal(
    @Query("sort") sort: string = "scoreTotal",
    @Query("page") page: string = "1",
    @Query("limit") limit: string = "50",
  ) {
    return this.complexService.findAllGlobal(
      sort,
      parseInt(page) || 1,
      parseInt(limit) || 50,
    );
  }

  @Get("complexes/:id")
  async findOne(@Param("id") id: string) {
    return this.complexService.findOne(id);
  }

  @Get("complexes/:id/seismic")
  async getSeismic(@Param("id") id: string) {
    return this.complexService.getSeismicRisk(id);
  }

  /** 2GIS reviews — fully public, anchor of "open data" value prop */
  @Get("complexes/:id/reviews")
  async getReviews(@Param("id") id: string) {
    return this.complexService.getReviews(id);
  }

  // ── Mixed: public but unlocks data when authenticated ──

  /**
   * Shutov rating: guests see only existence + locked teaser.
   * Authenticated users get full data (category, label, color, description).
   */
  @Get("complexes/:id/shutov")
  @UseGuards(OptionalJwtGuard)
  async getShutov(@Param("id") id: string, @Req() req: any) {
    const full = await this.complexService.getShutovRating(id);
    if (!full.found) return { found: false };
    if (!req.user) {
      // Locked teaser for guests
      return {
        found: true,
        locked: true,
        name: full.name,
      };
    }
    const { found: _f, ...rest } = full as any;
    return { found: true, locked: false, ...rest };
  }

  // ── PRIVATE endpoints (login required) ──

  /** Properties list — only for authenticated users */
  @Get("complexes/:id/properties")
  @UseGuards(JwtAuthGuard)
  async findProperties(
    @Param("id") id: string,
    @Query("sort") sort: string = "scoreTotal",
  ) {
    return { properties: await this.complexService.findProperties(id, sort) };
  }

  // ── Project-scoped (private) ──

  @Get("projects/:projectId/complexes")
  @UseGuards(JwtAuthGuard)
  async findByProject(
    @Param("projectId") projectId: string,
    @Query("sort") sort: string = "scoreTotal",
    @Query("page") page: string = "1",
    @Query("limit") limit: string = "20",
  ) {
    return this.complexService.findByProject(
      projectId,
      sort,
      parseInt(page) || 1,
      parseInt(limit) || 20,
    );
  }

  @Get("projects/:projectId/map-data")
  @UseGuards(JwtAuthGuard)
  async getMapData(@Param("projectId") projectId: string) {
    return this.complexService.getMapData(projectId);
  }

  // ── Admin only (data ops) ──

  @Post("complexes/cleanup-non-almaty")
  @UseGuards(AdminGuard)
  async cleanupNonAlmaty() {
    const deleted = await this.complexService.deleteNonAlmaty();
    return { deleted };
  }

  @Post("complexes/parse-krisha")
  @UseGuards(AdminGuard)
  async parseAllFromKrisha() {
    this.krishaComplexParser.parseAndSaveAll().catch((err) => {
      console.error("Krisha complex parsing failed:", err);
    });
    return {
      started: true,
      message: "Parsing all Almaty complexes from Krisha.kz in background",
    };
  }

  @Post("projects/:projectId/migrate-complexes")
  @UseGuards(JwtAuthGuard)
  async migrateComplexes(@Param("projectId") projectId: string) {
    await this.searchService.groupPropertiesIntoComplexes(projectId);
    const project = await this.complexService.getProjectForScoring(projectId);
    if (project?.interviewAnswers) {
      await this.searchService.scoreComplexes(projectId, project.interviewAnswers);
    }
    const result = await this.complexService.findByProject(projectId, "scoreTotal", 1, 100);
    return { migrated: true, complexesCreated: result.total };
  }
}
