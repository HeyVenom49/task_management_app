import type { Sql, TransactionSql } from "postgres";
import type {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
} from "./project.types";

type Db = Sql | TransactionSql;

type ProjectRow = {
  id: string;
  creator_id: string;
  info: string;
  created_at: Date;
  updated_at: Date;
};

export class ProjectRepository {
  constructor(private readonly sql: Sql) {}

  private map(row: ProjectRow): Project {
    return {
      id: row.id,
      creatorId: row.creator_id,
      info: row.info,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public async create(
    input: CreateProjectInput,
    db: Db = this.sql,
  ): Promise<Project> {
    const [row] = await db`
      INSERT INTO projects (creator_id, info)
      VALUES (${input.creatorId}, ${input.info})
      RETURNING id, creator_id, info, created_at, updated_at
    `;
    if (!row) throw new Error("Couldn't create project");
    return this.map(row as ProjectRow);
  }

  public async findById(id: string): Promise<Project | null> {
    const [row] = await this.sql`
        SELECT id, creator_id, info, created_at, updated_at
        FROM projects
        WHERE id = ${id}
        LIMIT 1
    `;
    return row ? this.map(row as ProjectRow) : null;
  }

  public async findByCreatorId(creatorId: string): Promise<Project[]> {
    const rows = await this.sql`
        SELECT id, creator_id, info, created_at, updated_at
        FROM projects
        WHERE creator_id = ${creatorId}
        ORDER BY created_at DESC
    `;

    return rows.map((row) => this.map(row as ProjectRow));
  }

  public async update(
    id: string,
    input: UpdateProjectInput,
  ): Promise<Project | null> {
    const [row] = await this.sql`
        UPDATE projects
        SET info = ${input.info}, updated_at = NOW()
        WHERE id = ${id}
        RETURNING id, creator_id, info, created_at, updated_at
    `;
    return row ? this.map(row as ProjectRow) : null;
  }

  public async delete(id: string): Promise<boolean> {
    const result = await this.sql`
        DELETE FROM projects
        WHERE id = ${id}
        RETURNING id
    `;
    return result.length > 0;
  }

  public async findForMember(userId: string): Promise<Project[]> {
    const rows = await this.sql`
        SELECT p.id, p.creator_id, p.info, p.created_at, p.updated_at
        FROM projects p
        INNER JOIN members m ON m.project_id = p.id
        WHERE m.user_id = ${userId} AND m.status = 'ACTIVE'
        ORDER BY p.created_at DESC
    `;
    return rows.map((row) => this.map(row as ProjectRow));
  }
}
