import type { CreateSessionInput, SessionRecord } from "./auth.types";
import type { TransactionSql, Sql } from "postgres";

type Db = Sql | TransactionSql;

export class SessionRepository {
  constructor(private readonly sql: Sql) {}

  public async createSession(input: CreateSessionInput, db: Db = this.sql) {
    const [row] = await db`
        INSERT INTO sessions
        (
            user_id,
            refresh_token_hash,
            expires_at
        )
        VALUES (
            ${input.userId},
            ${input.tokenHash},
            ${input.expiresAt}
        )
        RETURNING
            id,
            user_id,
            expires_at,
            revoked_at,
            created_at
    `;
    if (!row) {
      throw new Error("Couldn't create session");
    }

    return {
      id: row.id,
      userId: row.user_id,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
    };
  }

  public async findByTokenHash(
    tokenHash: string,
  ): Promise<SessionRecord | null> {
    const [row] = await this.sql`
        SELECT
            id, user_id, expires_at, revoked_at, created_at
        FROM sessions
        WHERE refresh_token_hash = ${tokenHash}
        LIMIT 1
    `;

    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
    };
  }

  public async revoke(sessionId: string, db: Db = this.sql): Promise<boolean> {
    const result = await db`
        UPDATE sessions
        SET revoked_at = NOW()
        WHERE id = ${sessionId}
            AND revoked_at IS NULL
        RETURNING id
    `;
    return result.length > 0;
  }

  public async revokeAllForUser(
    userId: string,
    db: Db = this.sql,
  ): Promise<void> {
    await db`
        UPDATE sessions
        SET revoked_at = NOW()
        WHERE user_id = ${userId} AND revoked_at IS NULL
    `;
  }
}
