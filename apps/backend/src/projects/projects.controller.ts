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
import { ViewerGuard, parseGuestId, viewerOf } from "../auth/viewer.guard";

/** Searches are open to guests: every route takes a signed-in user or a
 *  guest id (ViewerGuard), except claiming, which needs the account. */
@Controller("projects")
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Get()
  @UseGuards(ViewerGuard)
  async findAll(@Request() req) {
    return { projects: await this.projectsService.findAllForViewer(viewerOf(req)) };
  }

  @Post()
  @UseGuards(ViewerGuard)
  async create(@Request() req, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(viewerOf(req), dto.name);
  }

  /** Called right after sign-in with the guest id still in the browser. */
  @Post("claim-guest")
  @UseGuards(JwtAuthGuard)
  async claimGuest(@Request() req) {
    const guestId = parseGuestId(req.headers["x-guest-id"]);
    const claimed = guestId
      ? await this.projectsService.claimGuestProjects(req.user.id, guestId)
      : 0;
    return { claimed };
  }

  @Get(":id")
  @UseGuards(ViewerGuard)
  async findOne(@Request() req, @Param("id") id: string) {
    return this.projectsService.findOne(id, viewerOf(req));
  }

  @Patch(":id/interview")
  @UseGuards(ViewerGuard)
  async updateInterview(
    @Request() req,
    @Param("id") id: string,
    @Body() dto: UpdateInterviewDto,
  ) {
    return this.projectsService.updateInterview(id, viewerOf(req), dto.answers, dto.name);
  }
}
