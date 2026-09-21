import { Router } from "express";
import { healthRouter } from "../modules/health";

const v1Router = Router();
v1Router.use("/health", healthRouter);
export { v1Router };
