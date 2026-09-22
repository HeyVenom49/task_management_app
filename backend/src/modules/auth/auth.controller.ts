import type { Request, Response, NextFunction } from "express";
import {
  registerSchema,
  resendVerificationSchema,
  verifyEmailSchema,
} from "./auth.schema";
import type { AuthService } from "./auth.service";

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

  public async verifyEmail(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const parsed = verifyEmailSchema.safeParse(req.body);
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
}
