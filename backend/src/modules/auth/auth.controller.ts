import type { Request, Response, NextFunction } from "express";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "./auth.schema";
import type { AuthService } from "./auth.service";
import {
  clearRefreshToken,
  readRefreshToken,
  setRefreshCookie,
} from "../../shared/auth/refresh-cookie";
import { errors } from "jose";

export class AuthController {
  constructor(private readonly service: AuthService) {}

  public async register(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const result = await this.service.register(parsed.data);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async login(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = loginSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: parsed.error.flatten().fieldErrors,
        });
        return;
      }
      const result = await this.service.login(parsed.data);
      setRefreshCookie(res, result.refreshToken);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async verifyEmail(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const parsed = verifyEmailSchema.safeParse({ token: req.query.token });
      if (!parsed.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: parsed.error.flatten().fieldErrors,
        });
        return;
      }
      await this.service.verifyEmail(parsed.data.token);
      res.status(200).json({
        message: "Email verified successfully",
      });
    } catch (err) {
      next(err);
    }
  }

  public async resendVerification(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const parsed = resendVerificationSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: parsed.error.flatten().fieldErrors,
        });
        return;
      }
      await this.service.resendVerification(parsed.data.email);
      res.status(200).json({
        message:
          "If that email exists and is unverified, we sent a verification link",
      });
    } catch (err) {
      next(err);
    }
  }

  public async refresh(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const raw = readRefreshToken(req);

      if (!raw) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      const result = await this.service.refresh(raw);
      setRefreshCookie(res, result.refreshToken);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async logout(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const raw = readRefreshToken(req);
      if (raw) {
        await this.service.logout(raw);
      }
      clearRefreshToken(res);
      res.status(200).json({ message: "Logged out" });
    } catch (err) {
      next(err);
    }
  }

  public async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: "Validate failed",
          errors: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      await this.service.changePassword(req.user.id, parsed.data);

      clearRefreshToken(res);
      res.status(200).json({
        message: "Password updated. Please log in again.",
      });
    } catch (err) {
      next(err);
    }
  }

  public async forgotPassword(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const parsed = forgotPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: parsed.error.flatten().fieldErrors,
        });
        return;
      }
      await this.service.forgotPassword(parsed.data.email);

      res.status(200).json({
        message: "If that email exists, we sent a reset link",
      });
    } catch (err) {
      next(err);
    }
  }

  public async resetPassword(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const parsed = resetPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: parsed.error.flatten().fieldErrors,
        });
        return;
      }
      await this.service.resetPassword(
        parsed.data.token,
        parsed.data.newPassword,
      );

      clearRefreshToken(res);
      res.status(200).json({
        message: "Password reset successful",
      });
    } catch (err) {
      next(err);
    }
  }
}
