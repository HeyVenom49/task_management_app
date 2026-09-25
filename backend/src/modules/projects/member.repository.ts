import type { Sql, TransactionSql } from "postgres";
import type {
  CreateMemberInput,
  Member,
  MemberWithUser,
} from "../projects/project.types";

type Db = Sql | TransactionSql;

type MemberRow = {
  id: string;
  user_id: string;
  project_id: string;
  role: "OWNER" | "MEMBER";
  status: "ACTIVE" | "INACTIVE";
  created_at: Date;
  updated_at: Date;
};

type MemberWithUserRow = MemberRow & {
  name: string;
  email: string;
};

export class MemberRepository {
  constructor(private readonly sql: Sql) {}

  private map(row: MemberRow): Member {
    return {
      id: row.id,
      userId: row.user_id,
      projectId: row.project_id,
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapWithUser(row: MemberWithUserRow): MemberWithUser {
    return {
      ...this.map(row),
      name: row.name,
      email: row.email,
    };
  }

  public async create(
    input: CreateMemberInput,
    db: Db = this.sql,
  ): Promise<Member> {
    const status = input.status ?? "ACTIVE";
    const [row] = await db`
        INSERT INTO members (user_id, project_id, role, status)
        VALUES (${input.userId}, ${input.projectId}, ${input.role}, ${status})
        RETURNING id, user_id, project_id, role, status, created_at, updated_at
    `;

    if (!row) throw new Error("Couldn't create member");

    return this.map(row as MemberRow);
  }

  public async findById(id: string): Promise<Member | null> {
    const [row] = await this.sql`
        SELECT id, user_id, project_id, role, status, created_at, updated_at
        FROM members
        WHERE id = ${id}
        LIMIT 1
    `;
    return row ? this.map(row as MemberRow) : null;
  }

  public async findByUserAndProject(
    userId: string,
    projectId: string,
  ): Promise<Member | null> {
    const [row] = await this.sql`
        SELECT id, user_id, project_id, role, status, created_at, updated_at
        FROM members
        WHERE user_id = ${userId} AND project_id = ${projectId}
        LIMIT 1
    `;
    return row ? this.map(row as MemberRow) : null;
  }

  public async listByProjectId(projectId: string): Promise<MemberWithUser[]> {
    const rows = await this.sql`
        SELECT
            m.id,
            m.user_id,
            m.project_id,
            m.role,
            m.status,
            m.created_at,
            m.updated_at,
            u.name,
            u.email
        FROM members m
        INNER JOIN users u ON u.id = m.user_id
        WHERE m.project_id = ${projectId} AND m.status = 'ACTIVE'
        ORDER By m.created_at ASC
    `;
    return rows.map((row) => this.mapWithUser(row as MemberWithUserRow));
  }

  public async countActiveOwners(projectId: string): Promise<number> {
    const [row] = await this.sql`
        SELECT COUNT(*)::int AS count
        FROM members
        WHERE project_id = ${projectId}
            AND role = 'OWNER'
            AND status = 'ACTIVE'
    `;
    return row?.count ?? 0;
  }

  public async deactivate(
    memberId: string,
    db: Db = this.sql,
  ): Promise<boolean> {
    const result = await db`
        UPDATE members
        SET status = 'INACTIVE', updated_at = NOW()
        WHERE id = ${memberId} AND status = 'ACTIVE'
        RETURNING id
    `;
    return result.length > 0;
  }

  public async reactivate(
    memberId: string,
    role: "OWNER" | "MEMBER" = "MEMBER",
    db: Db = this.sql,
  ) {
    const [row] = await db`
      UPDATE members
      SET 
        status = 'ACTIVE',
        role = ${role},
        updated_at = NOW()
      WHERE id = ${memberId} AND status = 'INACTIVE'
      RETURNING id, user_id, project_id, role, status, created_at, updated_at
    `;
    return row ? this.map(row as MemberRow) : null;
  }
}
