import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ComplexService } from "./complex.service";
import { SearchService } from "../search/search.service";
import { JwtAuthGuard } from "../auth/auth.guard";

@Controller()
export class ComplexController {
  constructor(
    private complexService: ComplexService,
    private searchService: SearchService,
  ) {}

  // ── Global endpoints (auth required but not project-scoped) ──

  @Get("complexes/map-data")
  @UseGuards(JwtAuthGuard)
  async getGlobalMapData() {
    return this.complexService.findAllForMap();
  }

  @Get("complexes/all")
  @UseGuards(JwtAuthGuard)
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

  // ── Single complex endpoints ──

  @Get("complexes/:id")
  @UseGuards(JwtAuthGuard)
  async findOne(@Param("id") id: string) {
    return this.complexService.findOne(id);
  }

  @Get("complexes/:id/properties")
  @UseGuards(JwtAuthGuard)
  async findProperties(
    @Param("id") id: string,
    @Query("sort") sort: string = "scoreTotal",
  ) {
    return { properties: await this.complexService.findProperties(id, sort) };
  }

  @Get("complexes/:id/shutov")
  @UseGuards(JwtAuthGuard)
  async getShutov(@Param("id") id: string) {
    return this.complexService.getShutovRating(id);
  }

  @Get("complexes/:id/seismic")
  @UseGuards(JwtAuthGuard)
  async getSeismic(@Param("id") id: string) {
    return this.complexService.getSeismicRisk(id);
  }

  // ── Project-scoped endpoints ──

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
