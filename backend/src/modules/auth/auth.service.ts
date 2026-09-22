import argon2 from "argon2";
import type { RegisterInput } from "./auth.schema";
import { AuthRepository } from "./auth.repository";
import { ConflictError } from "../../shared/errors/conflict-error";
import type { EmailVerificationRepository } from "./email-verification.repository";
import type { PublicUser } from "./auth.types";
import { createHash, randomBytes } from "node:crypto";
import { AppError } from "../../shared/errors/app-error";
import type { Sql, TransactionSql } from "postgres";

type Db = Sql | TransactionSql;

export class AuthService {
  constructor(
    private readonly sql: Sql,
    private readonly repo: AuthRepository,
    private readonly verificationRepo: EmailVerificationRepository,
  ) {}

  private async findByEmail(email: string): Promise<void> {
    const existing = await this.repo.findByEmail(email);

    if (existing) {
      throw new ConflictError("Email already registered");
    }
  }

  private hashToken(rawToken: string): string {
    return createHash("sha256").update(rawToken).digest("hex");
  }

  private async issueVerificationToken(
    userId: string,
    db: Db = this.sql,
  ): Promise<string> {
    await this.verificationRepo.invalidateUserTokens(userId, db);

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

    await this.verificationRepo.createToken(
      {
        userId,
        tokenHash,
        expiresAt,
      },
      db,
    );
    return rawToken;
  }

  public async register(input: RegisterInput): Promise<{ user: PublicUser }> {
    await this.findByEmail(input.email);

    const passwordHash = await argon2.hash(input.password);

    try {
      const { user, rawToken } = await this.sql.begin(async (tx) => {
        const user = await this.repo.createUser(
          { name: input.name, email: input.email, passwordHash },
          tx,
        );
        const rawToken = await this.issueVerificationToken(user.id, tx);
        return { user, rawToken };
      });
      if (process.env.NODE_ENV !== "production") {
        console.log(`Verify token for ${user.email}: ${rawToken}`);
      }
      return { user };
    } catch (err) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        err.code === "23505"
      ) {
        throw new ConflictError("Email already registered");
      }
      throw err;
    }
  }

  public async verifyEmail(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const record = await this.verificationRepo.findTokenByHash(tokenHash);

    if (!record) {
      throw new AppError(400, "Invalid or expired verification link");
    }
    if (record.usedAt) {
      throw new AppError(400, "Verification link already used");
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new AppError(400, "Verification link expired");
    }

    await this.sql.begin(async (tx) => {
      const marked = await this.verificationRepo.markTokenUsed(record.id, tx);
      if (!marked) {
        throw new AppError(400, "Verification link already used");
      }
      await this.repo.markEmailVerified(record.userId, tx);
    });
  }

  public async resendVerification(email: string): Promise<void> {
    const user = await this.repo.findByEmail(email);
    if (!user || user.status === "ACTIVE") return;
    const rawToken = await this.issueVerificationToken(user.id);
    console.log(
      `Resending the verification token to ${user.email}: ${rawToken}`,
    );
  }
}
