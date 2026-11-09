import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { SearchProjectEntity } from "../database/entities/search-project.entity";
import type { Viewer } from "../auth/viewer.guard";
import { canAccessProject, ownedProjectsWhere } from "./project-access";

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(SearchProjectEntity)
    private projectsRepo: Repository<SearchProjectEntity>,
  ) {}

  async findAllForViewer(viewer: Viewer) {
    return this.projectsRepo.find({
      where: ownedProjectsWhere(viewer),
      order: { createdAt: "DESC" },
    });
  }

  async findOne(id: string, viewer: Viewer) {
    const project = await this.projectsRepo.findOne({ where: { id } });
    if (!project || !canAccessProject(project, viewer)) {
      throw new NotFoundException("Project not found");
    }
    return project;
  }

  /** A signed-in viewer's search is theirs; a guest's waits for them to sign in. */
  async create(viewer: Viewer, name: string) {
    const project = this.projectsRepo.create({
      userId: viewer.userId ?? null,
      guestId: viewer.userId ? null : viewer.guestId ?? null,
      name,
      status: "draft",
    });
    return this.projectsRepo.save(project);
  }

  /** The guest just signed in: their searches move to the account. */
  async claimGuestProjects(userId: string, guestId: string): Promise<number> {
    const result = await this.projectsRepo.update(
      { guestId, userId: IsNull() },
      { userId, guestId: null },
    );
    return result.affected ?? 0;
  }

  async updateInterview(id: string, viewer: Viewer, answers: Record<string, unknown>, name?: string) {
    const project = await this.findOne(id, viewer);
    project.interviewAnswers = answers;
    project.status = "interview_complete";
    if (name) {
      project.name = name;
    }
    return this.projectsRepo.save(project);
  }

  async updateStatus(id: string, status: string) {
    await this.projectsRepo.update(id, { status });
  }
}
