import { Router } from "express";
import { healthRouter } from "../modules/health";
import { authRouter } from "../modules/auth/auth.routes";
import { projectRouter } from "../modules/projects/project.routes";
import { taskRouter } from "../modules/tasks/task.routes";

const v1Router = Router();
v1Router.use("/health", healthRouter);
v1Router.use("/auth", authRouter);
v1Router.use("/projects", projectRouter);
v1Router.use("/projects/:id/tasks", taskRouter);
export { v1Router };
