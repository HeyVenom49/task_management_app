import type { Sql } from "postgres";
import type { ProjectRepository } from "./project.repository";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
} from "../../shared/errors";
import type { MemberRepository } from "./member.repository";
import type { AuthRepository } from "../auth/auth.repository";

export class ProjectServices {
  constructor(
    private readonly sql: Sql,
    private readonly repo: ProjectRepository,
    private readonly memberRepo: MemberRepository,
    private readonly authRepo: AuthRepository,
  ) {}

  private async requireActiveMember(userId: string, projectId: string) {
    const membership = await this.memberRepo.findByUserAndProject(
      userId,
      projectId,
    );

    if (!membership || membership.status !== "ACTIVE") {
      throw new ForbiddenError("You do not have access to this project");
    }

    const project = await this.repo.findById(projectId);
    if (!project) {
      throw new ForbiddenError("You do not have access to this project");
    }

    return { project, membership };
  }

  private async requireOwner(userId: string, projectId: string) {
    const ctx = await this.requireActiveMember(userId, projectId);
    if (ctx.membership.role !== "OWNER") {
      throw new ForbiddenError("You do not have access to this project");
    }
    return ctx;
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "23505"
    );
  }

  public async create(userId: string, info: string) {
    try {
      return await this.sql.begin(async (tx) => {
        const project = await this.repo.create({ creatorId: userId, info }, tx);
        const membership = await this.memberRepo.create(
          {
            userId,
            projectId: project.id,
            role: "OWNER",
          },
          tx,
        );
        return { project, membership };
      });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictError("A project with this name already exists");
      }
      throw err;
    }
  }

  public async listMine(userId: string) {
    const projects = await this.repo.findForMember(userId);
    return { projects };
  }

  public async getById(userId: string, projectId: string) {
    const { project } = await this.requireActiveMember(userId, projectId);
    return { project };
  }

  public async update(userId: string, projectId: string, info: string) {
    await this.requireOwner(userId, projectId);
    try {
      const project = await this.repo.update(projectId, { info });
      return { project };
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictError("A project with this name already exists");
      }
      throw err;
    }
  }

  public async remove(userId: string, projectId: string) {
    await this.requireOwner(userId, projectId);
    await this.repo.delete(projectId);
  }

  public async listMember(userId: string, projectId: string) {
    await this.requireActiveMember(userId, projectId);
    const members = await this.memberRepo.listByProjectId(projectId);
    return { members };
  }

  public async addMember(userId: string, projectId: string, email: string) {
    await this.requireOwner(userId, projectId);

    const user = await this.authRepo.findByEmail(email);
    if (!user || user.status !== "ACTIVE") {
      throw new BadRequestError("User not found or not verified");
    }

    if (user.id === userId) {
      throw new BadRequestError("You are already a member");
    }

    const existing = await this.memberRepo.findByUserAndProject(
      user.id,
      projectId,
    );

    if (existing?.status === "ACTIVE") {
      throw new ConflictError("User is already a member");
    }

    if (existing?.status === "INACTIVE") {
      throw new ConflictError(
        "User was removed; ask a platform admin to reactivate",
      );
    }

    try {
      const member = await this.memberRepo.create({
        userId: user.id,
        projectId,
        role: "MEMBER",
      });
      return { member };
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictError("User is already a member");
      }
      throw err;
    }
  }

  public async removeMember(
    actorId: string,
    projectId: string,
    memberId: string,
  ) {
    await this.requireOwner(actorId, projectId);

    const target = await this.memberRepo.findById(memberId);

    if (
      !target ||
      target.projectId !== projectId ||
      target.status !== "ACTIVE"
    ) {
      throw new BadRequestError("Member not found");
    }

    if (target.role === "OWNER") {
      const owners = await this.memberRepo.countActiveOwners(projectId);
      if (owners <= 1) {
        throw new BadRequestError("Cannot remove the last owner");
      }
    }

    await this.memberRepo.deactivate(memberId);
  }

  public async reactivateMember(
    actorId: string,
    projectId: string,
    memberId: string,
  ) {
    const actor = await this.authRepo.findById(actorId);
    if (!actor || actor.role !== "ADMIN") {
      throw new ForbiddenError("Only platform admins can reactivate members");
    }

    const project = await this.repo.findById(projectId);
    if (!project) {
      throw new BadRequestError("Project not found");
    }

    const target = await this.memberRepo.findById(memberId);
    if (!target || target.projectId !== projectId) {
      throw new BadRequestError("Member not found");
    }
    if (target.status === "ACTIVE") {
      throw new ConflictError("Member is already active");
    }

    const member = await this.memberRepo.reactivate(memberId, "MEMBER");
    if (!member) {
      throw new BadRequestError("Could not reactivate member");
    }
    return { member };
  }
}
