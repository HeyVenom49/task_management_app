import { Router } from "express";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthRepository } from "./auth.repository";
import sql from "../../db/client";
import { EmailVerificationRepository } from "./email-verification.repository";

const repo = new AuthRepository(sql);
const emailVerification = new EmailVerificationRepository(sql);
const service = new AuthService(sql, repo, emailVerification);
const controller = new AuthController(service);

const authRouter = Router();

authRouter.post("/register", (req, res, next) => {
  controller.register(req, res, next);
});

authRouter.post("/verify-email", (req, res, next) => {
  controller.verifyEmail(req, res, next);
});

authRouter.post("/resend-verification", (req, res, next) => {
  controller.resendVerification(req, res, next);
});

export { authRouter };
