import type { TaskRepository } from "./task.repository";
import type { MemberRepository } from "../projects/member.repository";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors";
import type { CreateTaskInput, UpdateTaskInput } from "./task.types";
import type { Sql, TransactionSql } from "postgres";

type Db = Sql | TransactionSql;
export class TaskService {
  constructor(
    private readonly sql: Sql,
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
    db: Db,
  ) {
    if (assigneeMemberId == null) return;

    const assignee = await this.memberRepo.lockById(assigneeMemberId, db);
    if (
      !assignee ||
      assignee.projectId !== projectId ||
      assignee.status !== "ACTIVE"
    ) {
      throw new BadRequestError("Invalid assignee");
    }
  }

  private assertCanUpdateTask(
    membership: { id: string; role: "OWNER" | "MEMBER" },
    task: { creatorMemberId: string; assigneeMemberId: string | null },
    input: UpdateTaskInput,
  ): void {
    const isOwner = membership.role === "OWNER";
    const isCreator = task.creatorMemberId === membership.id;
    const isAssignee = task.assigneeMemberId === membership.id;

    // who can update at all?
    if (!isOwner && !isCreator && !isAssignee) {
      throw new ForbiddenError("You cannot update this task");
    }

    // What fields may appear in the body?
    // Owner/Creator -> any UpdateTaskInput key
    // Assignee -> only "status"
    const allowed: readonly (keyof UpdateTaskInput)[] =
      isOwner || isCreator
        ? ([
            "title",
            "description",
            "priority",
            "status",
            "assigneeMemberId",
          ] as const)
        : (["status"] as const);

    // Which keys did the client actually send?
    const sent = (Object.keys(input) as (keyof UpdateTaskInput)[]).filter(
      (key) => input[key] !== undefined && key !== "expectedUpdatedAt",
    );

    // Mixed / forbidden fields -> reject entire request
    const forbidden = sent.filter((key) => !allowed.includes(key));
    if (forbidden.length > 0) {
      throw new ForbiddenError("You cannot update one or more of these fields");
    }
  }

  private isCheckViolation(err: unknown): boolean {
    return (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "23514"
    );
  }

  private async requireActiveMemberLocked(
    userId: string,
    projectId: string,
    db: Db,
  ) {
    const membership = await this.memberRepo.lockByUserAndProject(
      userId,
      projectId,
      db,
    );
    if (!membership || membership.status !== "ACTIVE") {
      throw new ForbiddenError("You do not have access to this project");
    }
    return membership;
  }

  public async create(
    userId: string,
    projectId: string,
    input: Omit<CreateTaskInput, "projectId" | "creatorMemberId">,
  ) {
    try {
      return await this.sql.begin(async (tx) => {
        const membership = await this.requireActiveMemberLocked(
          userId,
          projectId,
          tx,
        );

        await this.assertAssigneeInProject(
          projectId,
          input.assigneeMemberId,
          tx,
        );

        const task = await this.taskRepo.create(
          {
            projectId,
            creatorMemberId: membership.id,
            assigneeMemberId: input.assigneeMemberId ?? null,
            title: input.title,
            description: input.description ?? null,
            priority: input.priority,
            status: input.status ?? "NOT_STARTED",
          },
          tx,
        );
        return { task };
      });
    } catch (err) {
      if (this.isCheckViolation(err)) {
        throw new BadRequestError("Invalid assignee");
      }
      throw err;
    }
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
      throw new NotFoundError("Task not found");
    }
    return { task };
  }

  public async update(
    userId: string,
    projectId: string,
    taskId: string,
    input: UpdateTaskInput,
  ) {
    try {
      return await this.sql.begin(async (tx) => {
        const membership = await this.requireActiveMemberLocked(
          userId,
          projectId,
          tx,
        );

        const existing = await this.taskRepo.findById(taskId, tx);
        if (!existing || existing.projectId !== projectId) {
          throw new NotFoundError("Task not found");
        }

        this.assertCanUpdateTask(membership, existing, input);

        if (input.assigneeMemberId !== undefined) {
          await this.assertAssigneeInProject(
            projectId,
            input.assigneeMemberId,
            tx,
          );
        }
        const task = await this.taskRepo.update(taskId, input, tx);
        if (!task) {
          const still = await this.taskRepo.findById(taskId, tx);
          if (!still || still.projectId !== projectId) {
            throw new NotFoundError("Task not found");
          }
          throw new ConflictError("Task was modified; reload and try again");
        }
        return { task };
      });
    } catch (err) {
      if (this.isCheckViolation(err)) {
        throw new BadRequestError("Invalid assignee");
      }
      throw err;
    }
  }

  public async remove(userId: string, projectId: string, taskId: string) {
    const membership = await this.requireActiveMember(userId, projectId);

    const existing = await this.taskRepo.findById(taskId);
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundError("Task not found");
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
