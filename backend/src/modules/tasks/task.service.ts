import type { TaskRepository } from "./task.repository";
import type { MemberRepository } from "../projects/member.repository";
import { BadRequestError, ForbiddenError } from "../../shared/errors";
import type { CreateTaskInput, UpdateTaskInput } from "./task.types";

export class TaskService {
  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly memberRepo: MemberRepository,
  ) {}

  private async requireActiveMember(userId: string, projectId: string) {
    const membership = await this.memberRepo.findByUserAndProject(
      userId,
      projectId,
    );

    if (!membership || membership.status !== "ACTIVE") {
      throw new ForbiddenError("You do not have access to this project");
    }
    return membership;
  }

  //! For future use when we want to delete any task
  //   private async requireOwner(userId: string, projectId: string) {
  //     const membership = await this.requireActiveMember(userId, projectId);
  //     if (membership.role !== "OWNER") {
  //       throw new ForbiddenError("Only owners can do this");
  //     }
  //     return membership;
  //   }

  private async assertAssigneeInProject(
    projectId: string,
    assigneeMemberId: string | null | undefined,
  ) {
    if (assigneeMemberId == null) return;

    const assignee = await this.memberRepo.findById(assigneeMemberId);
    if (
      !assignee ||
      assignee.projectId !== projectId ||
      assignee.status !== "ACTIVE"
    ) {
      throw new BadRequestError("Invalid assignee");
    }
  }

  public async create(
    userId: string,
    projectId: string,
    input: Omit<CreateTaskInput, "projectId" | "creatorMemberId">,
  ) {
    const membership = await this.requireActiveMember(userId, projectId);
    await this.assertAssigneeInProject(projectId, input.assigneeMemberId);

    const task = await this.taskRepo.create({
      projectId,
      creatorMemberId: membership.id,
      assigneeMemberId: input.assigneeMemberId ?? null,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority,
      status: input.status ?? "NOT_STARTED",
    });
    return { task };
  }

  public async list(userId: string, projectId: string) {
    await this.requireActiveMember(userId, projectId);
    const tasks = await this.taskRepo.listByProjectId(projectId);
    return { tasks };
  }

  public async getById(userId: string, projectId: string, taskId: string) {
    await this.requireActiveMember(userId, projectId);
    const task = await this.taskRepo.findById(taskId);
    if (!task || task.projectId !== projectId) {
      throw new BadRequestError("Task not found");
    }
    return { task };
  }

  public async update(
    userId: string,
    projectId: string,
    taskId: string,
    input: UpdateTaskInput,
  ) {
    await this.requireActiveMember(userId, projectId);

    const existing = await this.taskRepo.findById(taskId);
    if (!existing || existing.projectId !== projectId) {
      throw new BadRequestError("Task not found");
    }

    if (input.assigneeMemberId !== undefined) {
      await this.assertAssigneeInProject(projectId, input.assigneeMemberId);
    }

    const task = await this.taskRepo.update(taskId, input);
    return { task };
  }

  public async remove(userId: string, projectId: string, taskId: string) {
    const membership = await this.requireActiveMember(userId, projectId);

    const existing = await this.taskRepo.findById(taskId);
    if (!existing || existing.projectId !== projectId) {
      throw new BadRequestError("Task not found");
    }
    const isOwner = membership.role === "OWNER";
    const isCreator = existing.creatorMemberId === membership.id;
    if (!isOwner && !isCreator) {
      throw new ForbiddenError(
        "Only the creator or an owner can delete this task",
      );
    }
    await this.taskRepo.delete(taskId);
  }
}
