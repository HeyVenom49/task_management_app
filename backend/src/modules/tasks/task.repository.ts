import type { Sql, TransactionSql } from "postgres";
import type { CreateTaskInput, Task, UpdateTaskInput } from "./task.types";

type Db = Sql | TransactionSql;

type TaskRow = {
  id: string;
  project_id: string;
  creator_member_id: string;
  assignee_member_id: string;
  title: string;
  description: string | null;
  priority: Task["priority"];
  status: Task["status"];
  created_at: Date;
  updated_at: Date;
};

export class TaskRepository {
  constructor(private readonly sql: Sql) {}

  private map(row: TaskRow): Task {
    return {
      id: row.id,
      projectId: row.project_id,
      creatorMemberId: row.creator_member_id,
      assigneeMemberId: row.assignee_member_id,
      title: row.title,
      description: row.description,
      priority: row.priority,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public async create(
    input: CreateTaskInput,
    db: Db = this.sql,
  ): Promise<Task> {
    const status = input.status ?? "NOT_STARTED";
    const [row] = await db`
        INSERT INTO tasks (
        project_id,
        creator_member_id,
        assignee_member_id,
        title,
        description,
        priority,
        status
    )
    VALUES (
        ${input.projectId},
        ${input.creatorMemberId},
        ${input.assigneeMemberId ?? null},
        ${input.title},
        ${input.description ?? null},
        ${input.priority},
        ${status}
    )
        RETURNING
            id, project_id, creator_member_id, assignee_member_id, title, description, priority, status, created_at, updated_at
    `;

    if (!row) throw new Error("Couldn't create task");
    return this.map(row as TaskRow);
  }

  public async findById(taskId: string): Promise<Task | null> {
    const [row] = await this.sql`
        SELECT
            id, project_id, creator_member_id, assignee_member_id, title,
            description, priority, status, created_at, updated_at
        FROM tasks
        WHERE id = ${taskId}
        LIMIT 1
    `;
    return row ? this.map(row as TaskRow) : null;
  }

  public async listByProjectId(projectId: string): Promise<Task[]> {
    const rows = await this.sql`
        SELECT
            id, project_id, creator_member_id, assignee_member_id, title,
            description, priority, status, created_at, updated_at
        FROM tasks
        WHERE project_id = ${projectId}
        ORDER BY created_at DESC
    `;
    return rows.map((row) => this.map(row as TaskRow));
  }

  public async update(
    taskId: string,
    input: UpdateTaskInput,
  ): Promise<Task | null> {
    const current = await this.findById(taskId);
    if (!current) return null;

    const title = input.title ?? current.title;
    const description =
      input.description !== undefined ? input.description : current.description;
    const priority = input.priority ?? current.priority;
    const status = input.status ?? current.status;
    const assigneeMemberId =
      input.assigneeMemberId !== undefined
        ? input.assigneeMemberId
        : current.assigneeMemberId;

    const [row] = await this.sql`
        UPDATE tasks
        SET
            title = ${title},
            description = ${description},
            priority = ${priority},
            status = ${status},
            assignee_member_id = ${assigneeMemberId},
            updated_at = NOW()
        WHERE id = ${taskId}
        RETURNING
            id, project_id, creator_member_id, assingnee_member_id, title, description, priority, status, created_at, updated_at
    `;

    return row ? this.map(row as TaskRow) : null;
  }

  public async delete(taskId: string): Promise<boolean> {
    const result = await this.sql`
        DELETE FROM tasks WHERE id = ${taskId} RETURNING id
    `;
    return result.length > 0;
  }
}
