import { Router } from "express";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthRepository } from "./auth.repository";
import sql from "../../db/client";
import { EmailVerificationRepository } from "./email-verification.repository";
import { authenticate } from "../../shared/middleware/authenticate";
import { SessionRepository } from "./session.repository";
import { PasswordResetRepository } from "./password-reset.repository";
import { authWriteLimiter, loginLimiter } from "../../shared/auth/rate-limit";

const repo = new AuthRepository(sql);
const emailVerification = new EmailVerificationRepository(sql);
const sessions = new SessionRepository(sql);
const passwordReset = new PasswordResetRepository(sql);
const service = new AuthService(
  sql,
  repo,
  emailVerification,
  sessions,
  passwordReset,
);
const controller = new AuthController(service);

const authRouter = Router();

authRouter.post("/register", (req, res, next) => {
  controller.register(req, res, next);
});

authRouter.post("/login", loginLimiter, (req, res, next) => {
  controller.login(req, res, next);
});

authRouter.get("/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});

authRouter.post("/refresh", (req, res, next) => {
  controller.refresh(req, res, next);
});

authRouter.post("/logout", (req, res, next) => {
  controller.logout(req, res, next);
});

authRouter.get("/verify-email", (req, res, next) => {
  controller.verifyEmail(req, res, next);
});

authRouter.post("/resend-verification", authWriteLimiter, (req, res, next) => {
  controller.resendVerification(req, res, next);
});

authRouter.post("/change-password", authenticate, (req, res, next) => {
  controller.changePassword(req, res, next);
});

authRouter.post("/forgot-password", authWriteLimiter, (req, res, next) => {
  controller.forgotPassword(req, res, next);
});

authRouter.post("/reset-password", (req, res, next) => {
  controller.resetPassword(req, res, next);
});

export { authRouter };
