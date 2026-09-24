import type { CreateUserInput, PublicUser, UserAuthRow } from "./auth.types";

import type { Sql, TransactionSql } from "postgres";

type Db = Sql | TransactionSql;

export class AuthRepository {
  constructor(private readonly sql: Sql) {}

  public async createUser(
    input: CreateUserInput,
    db: Db = this.sql,
  ): Promise<PublicUser> {
    const [row] = await db`
            INSERT INTO users (
                name,
                email,
                hash_password,
                role,
                status
            )
            VALUES (
                ${input.name},
                ${input.email},
                ${input.passwordHash},
                'USER',
                'INACTIVE'
            )
            RETURNING
                id,
                name,
                email,
                role,
                status,
                created_at
        `;

    if (!row) {
      throw new Error("Failed to create user");
    }
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  public async findByEmail(email: string): Promise<UserAuthRow | null> {
    const [row] = await this.sql`
        SELECT id, name, email, hash_password, role, status, created_at
        FROM users
        WHERE email = ${email}
        LIMIT 1
    `;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      hashPassword: row.hash_password,
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  public async findById(id: string): Promise<PublicUser | null> {
    const [row] = await this.sql`
      SELECT id, name, email, role, status, created_at
      FROM users
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  public async findAuthById(id: string): Promise<UserAuthRow | null> {
    const [row] = await this.sql`
      SELECT id, name, email, hash_password, role, status, created_at
      FROM users
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      hashPassword: row.hash_password,
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  public async markEmailVerified(
    userId: string,
    db: Db = this.sql,
  ): Promise<void> {
    await db`
        UPDATE users SET email_verified_at = NOW(), status = 'ACTIVE' WHERE id = ${userId}
    `;
  }

  public async updatePassword(
    userId: string,
    passwordHash: string,
    db: Db = this.sql,
  ): Promise<void> {
    await db`
      UPDATE users
      SET hash_password = ${passwordHash}, updated_at = NOW()
      WHERE id = ${userId}
    `;
  }
}
