import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ComplexService } from "./complex.service";
import { JwtAuthGuard } from "../auth/auth.guard";

@Controller()
@UseGuards(JwtAuthGuard)
export class ComplexController {
  constructor(private complexService: ComplexService) {}

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
}
