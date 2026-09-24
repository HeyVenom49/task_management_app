import type {
  CreateOpaqueTokenInput,
  VerificationTokenRecord,
} from "./auth.types";
import type { Sql, TransactionSql } from "postgres";

type Db = Sql | TransactionSql;

export class PasswordResetRepository {
  constructor(private readonly sql: Db) {}

  public async createToken(
    input: CreateOpaqueTokenInput,
    db: Db = this.sql,
  ): Promise<VerificationTokenRecord> {
    const [row] = await db`
        INSERT INTO password_reset_tokens (
          user_id,
          token_hash,
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
          used_at,
          created_at
      `;

    if (!row) {
      throw new Error("Couldn't create token");
    }

    return {
      id: row.id,
      userId: row.user_id,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      createdAt: row.created_at,
    };
  }

  public async findTokenByHash(
    tokenHash: string,
  ): Promise<VerificationTokenRecord | null> {
    const [row] = await this.sql`
        SELECT
          id,
          user_id,
          expires_at,
          used_at,
          created_at
        FROM password_reset_tokens
        WHERE token_hash = ${tokenHash}
        LIMIT 1
      `;

    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      createdAt: row.created_at,
    };
  }

  public async markTokenUsed(
    tokenId: string,
    db: Db = this.sql,
  ): Promise<boolean> {
    const result = await db`
        UPDATE password_reset_tokens
        SET used_at = NOW()
        WHERE id = ${tokenId} AND used_at IS NULL
        RETURNING id
      `;

    return result.length > 0;
  }

  public async invalidateUserTokens(
    userId: string,
    db: Db = this.sql,
  ): Promise<void> {
    await db`
          UPDATE password_reset_tokens
          SET used_at = NOW()
          WHERE user_id = ${userId}
          AND used_at IS NULL
      `;
  }
}
