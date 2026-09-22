import { Router } from "express";
import { healthRouter } from "../modules/health";
import { authRouter } from "../modules/auth/auth.routes";

const v1Router = Router();
v1Router.use("/health", healthRouter);
v1Router.use("/auth", authRouter);
export { v1Router };
