import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate";
import { ProjectRepository } from "./project.repository";
import sql from "../../db/client";
import { ProjectServices } from "./project.service";
import { ProjectController } from "./project.controller";

const repo = new ProjectRepository(sql);
const service = new ProjectServices(sql, repo);
const controller = new ProjectController(service);

const projectRouter = Router();

projectRouter.use(authenticate);

projectRouter.post("/", (req, res, next) => controller.create(req, res, next));
projectRouter.get("/", (req, res, next) => controller.list(req, res, next));
projectRouter.get("/:id", (req, res, next) =>
  controller.getById(req, res, next),
);
projectRouter.patch("/:id", (req, res, next) =>
  controller.update(req, res, next),
);
projectRouter.delete("/:id", (req, res, next) =>
  controller.remove(req, res, next),
);

export { projectRouter };
