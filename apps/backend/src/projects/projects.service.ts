import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SearchProjectEntity } from "../database/entities/search-project.entity";

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(SearchProjectEntity)
    private projectsRepo: Repository<SearchProjectEntity>,
  ) {}

  async findAllByUser(userId: string) {
    return this.projectsRepo.find({
      where: { userId },
      order: { createdAt: "DESC" },
    });
  }

  async findOne(id: string, userId: string) {
    const project = await this.projectsRepo.findOne({
      where: { id, userId },
    });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  async create(userId: string, name: string) {
    const project = this.projectsRepo.create({ userId, name, status: "draft" });
    return this.projectsRepo.save(project);
  }

  async updateInterview(id: string, userId: string, answers: Record<string, unknown>, name?: string) {
    const project = await this.findOne(id, userId);
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
