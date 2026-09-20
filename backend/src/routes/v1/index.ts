import { Router } from "express";
import { healthRouter } from "./health";

const v1Router = Router();

v1Router.use("/health", healthRouter);

export { v1Router };
