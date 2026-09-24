import argon2 from "argon2";
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
} from "./auth.schema";
import { AuthRepository } from "./auth.repository";
import type { EmailVerificationRepository } from "./email-verification.repository";
import type { PublicUser } from "./auth.types";
import { createHash, randomBytes } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import { signAccessToken } from "../../shared/auth/token";
import type { SessionRepository } from "./session.repository";
import {
  BadRequestError,
  ForbiddenError,
  UnauthorizedError,
  ConflictError,
} from "../../shared/errors";
import { parseDurationToMs } from "../../shared/auth/duration";
import env from "../../config/env";
import type { PasswordResetRepository } from "./password-reset.repository";

type Db = Sql | TransactionSql;

const DUMMY_HASH = await argon2.hash("dummy-password-for-timing");
export class AuthService {
  constructor(
    private readonly sql: Sql,
    private readonly repo: AuthRepository,
    private readonly verificationRepo: EmailVerificationRepository,
    private readonly sessionRepo: SessionRepository,
    private readonly passwordResetRepo: PasswordResetRepository,
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
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

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

  private async issuePasswordResetToken(
    userId: string,
    db: Db = this.sql,
  ): Promise<string> {
    await this.passwordResetRepo.invalidateUserTokens(userId, db);

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.passwordResetRepo.createToken(
      { userId, tokenHash, expiresAt },
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

  public async login(
    input: LoginInput,
  ): Promise<{ user: PublicUser; accessToken: string; refreshToken: string }> {
    const user = await this.repo.findByEmail(input.email);
    const hashToCheck = user?.hashPassword ?? DUMMY_HASH;
    const ok = await argon2.verify(hashToCheck, input.password);

    if (!user || !ok) {
      throw new UnauthorizedError("Invalid email or password");
    }

    if (user.status !== "ACTIVE") {
      throw new ForbiddenError("Please verify your email");
    }

    const accessToken = await signAccessToken({
      sub: user.id,
      email: user.email,
    });

    const rawRefresh = randomBytes(32).toString("base64url");
    const tokenHash = this.hashToken(rawRefresh);

    const refreshExpireAt = new Date(
      Date.now() + parseDurationToMs(env.refreshExpiresIn),
    );

    await this.sessionRepo.createSession({
      userId: user.id,
      tokenHash,
      expiresAt: refreshExpireAt,
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
      },
      accessToken,
      refreshToken: rawRefresh,
    };
  }

  public async verifyEmail(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const record = await this.verificationRepo.findTokenByHash(tokenHash);

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestError("Invalid or expired verification link");
    }

    await this.sql.begin(async (tx) => {
      const marked = await this.verificationRepo.markTokenUsed(record.id, tx);
      if (!marked) {
        throw new BadRequestError("Invalid or expired verification link");
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

  public async refresh(rawRefreshToken: string) {
    const hash = this.hashToken(rawRefreshToken);
    const session = await this.sessionRepo.findByTokenHash(hash);

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedError("Invalid refresh token");
    }

    if (session.revokedAt) {
      await this.sessionRepo.revokeAllForUser(session.userId);
      throw new UnauthorizedError("Invalid refresh token");
    }

    const user = await this.repo.findById(session.userId);
    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedError("Invalid refresh token");
    }

    const newRawRefresh = randomBytes(32).toString("base64url");
    const tokenHash = this.hashToken(newRawRefresh);
    const expiresAt = new Date(
      Date.now() + parseDurationToMs(env.refreshExpiresIn),
    );

    await this.sql.begin(async (tx) => {
      const revoked = await this.sessionRepo.revoke(session.id, tx);
      if (!revoked) {
        throw new UnauthorizedError("Invalid refresh token");
      }
      await this.sessionRepo.createSession(
        { userId: user.id, tokenHash, expiresAt },
        tx,
      );
    });

    const accessToken = await signAccessToken({
      sub: user.id,
      email: user.email,
    });
    return { accessToken, refreshToken: newRawRefresh };
  }

  public async logout(rawRefreshToken: string) {
    const hash = this.hashToken(rawRefreshToken);
    const session = await this.sessionRepo.findByTokenHash(hash);
    if (session && !session.revokedAt) {
      await this.sessionRepo.revoke(session.id);
    }
  }

  public async changePassword(
    userId: string,
    input: ChangePasswordInput,
  ): Promise<void> {
    const user = await this.repo.findAuthById(userId);
    const hashToCheck = user?.hashPassword || DUMMY_HASH;
    const ok = await argon2.verify(hashToCheck, input.currentPassword);

    if (!user || !ok) {
      throw new UnauthorizedError("Invalid credentials");
    }

    if (input.currentPassword === input.newPassword) {
      throw new BadRequestError("New password must be different");
    }

    const passwordHash = await argon2.hash(input.newPassword);
    await this.repo.updatePassword(user.id, passwordHash);
    await this.sessionRepo.revokeAllForUser(user.id);
  }

  public async forgotPassword(email: string): Promise<void> {
    const user = await this.repo.findByEmail(email);

    if (!user || user.status !== "ACTIVE") return;

    const rawToken = await this.issuePasswordResetToken(user.id);
    if (env.nodeEnv !== "production") {
      console.log(`Password reset token for ${user.email}: ${rawToken}`);
    }
  }

  public async resetPassword(
    rawToken: string,
    newPassword: string,
  ): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const record = await this.passwordResetRepo.findTokenByHash(tokenHash);
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestError("Invalid or expired reset link");
    }

    const passwordHash = await argon2.hash(newPassword);
    await this.sql.begin(async (tx) => {
      const marked = await this.passwordResetRepo.markTokenUsed(record.id, tx);

      if (!marked) {
        throw new BadRequestError("Invalid or expired reset link");
      }

      await this.repo.updatePassword(record.userId, passwordHash, tx);
      await this.sessionRepo.revokeAllForUser(record.userId, tx);
    });
  }
}
