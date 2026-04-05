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
@UseGuards(JwtAuthGuard)
export class ComplexController {
  constructor(
    private complexService: ComplexService,
    private searchService: SearchService,
  ) {}

  @Get("projects/:projectId/complexes")
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

  @Get("complexes/:id")
  async findOne(@Param("id") id: string) {
    return this.complexService.findOne(id);
  }

  @Get("complexes/:id/properties")
  async findProperties(
    @Param("id") id: string,
    @Query("sort") sort: string = "scoreTotal",
  ) {
    return { properties: await this.complexService.findProperties(id, sort) };
  }

  @Get("complexes/:id/shutov")
  async getShutov(@Param("id") id: string) {
    return this.complexService.getShutovRating(id);
  }

  @Get("complexes/:id/seismic")
  async getSeismic(@Param("id") id: string) {
    return this.complexService.getSeismicRisk(id);
  }

  @Get("projects/:projectId/map-data")
  async getMapData(@Param("projectId") projectId: string) {
    return this.complexService.getMapData(projectId);
  }

  @Post("projects/:projectId/migrate-complexes")
  async migrateComplexes(@Param("projectId") projectId: string) {
    // Group existing properties into complexes for old projects
    await this.searchService.groupPropertiesIntoComplexes(projectId);

    // Score the complexes using project's interview answers
    const project = await this.complexService.getProjectForScoring(projectId);
    if (project?.interviewAnswers) {
      await this.searchService.scoreComplexes(projectId, project.interviewAnswers);
    }

    const result = await this.complexService.findByProject(projectId, "scoreTotal", 1, 100);
    return {
      migrated: true,
      complexesCreated: result.total,
    };
  }
}
