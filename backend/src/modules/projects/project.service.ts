import type { Sql } from "postgres";
import type { ProjectRepository } from "./project.repository";
import { ForbiddenError } from "../../shared/errors";

export class ProjectServices {
  constructor(
    private readonly sql: Sql,
    private readonly repo: ProjectRepository,
  ) {}

  private async requireOwned(userId: string, projectId: string) {
    const project = await this.repo.findById(projectId);
    if (!project || project.creatorId !== userId) {
      throw new ForbiddenError("You do not have access to this project");
    }
    return project;
  }

  public async create(userId: string, info: string) {
    const project = await this.repo.create({ creatorId: userId, info });
    return { project };
  }

  public async listMine(userId: string) {
    const projects = await this.repo.findByCreatorId(userId);
    return { projects };
  }

  public async getById(userId: string, projectId: string) {
    const project = await this.requireOwned(userId, projectId);
    return { project };
  }

  public async update(userId: string, projectId: string, info: string) {
    await this.requireOwned(userId, projectId);
    const project = await this.repo.update(projectId, { info });
    return { project };
  }

  public async remove(userId: string, projectId: string) {
    await this.requireOwned(userId, projectId);
    await this.repo.delete(projectId);
  }
}
