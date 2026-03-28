import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
} from "@nestjs/common";
import { ProjectsService } from "./projects.service";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateInterviewDto } from "./dto/update-interview.dto";
import { JwtAuthGuard } from "../auth/auth.guard";

@Controller("projects")
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Get()
  async findAll(@Request() req) {
    return { projects: await this.projectsService.findAllByUser(req.user.id) };
  }

  @Post()
  async create(@Request() req, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(req.user.id, dto.name);
  }

  @Get(":id")
  async findOne(@Request() req, @Param("id") id: string) {
    return this.projectsService.findOne(id, req.user.id);
  }

  @Patch(":id/interview")
  async updateInterview(
    @Request() req,
    @Param("id") id: string,
    @Body() dto: UpdateInterviewDto,
  ) {
    return this.projectsService.updateInterview(id, req.user.id, dto.answers, dto.name);
  }
}
