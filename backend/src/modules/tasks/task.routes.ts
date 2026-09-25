import { Router } from "express";
import sql from "../../db/client";
import { MemberRepository } from "../projects/member.repository";
import { TaskController } from "./task.controller";
import { TaskRepository } from "./task.repository";
import { TaskService } from "./task.service";
import { authenticate } from "../../shared/middleware/authenticate";

const taskRepo = new TaskRepository(sql);
const memberRepo = new MemberRepository(sql);
const service = new TaskService(taskRepo, memberRepo);
const controller = new TaskController(service);

const taskRouter = Router({ mergeParams: true });

taskRouter.use(authenticate);

// POST
taskRouter.post("/", (req, res, next) => controller.create(req, res, next));

// GET
taskRouter.get("/", (req, res, next) => controller.list(req, res, next));
taskRouter.get("/:taskId", (req, res, next) =>
  controller.getById(req, res, next),
);

// PATCH
taskRouter.patch("/:taskId", (req, res, next) =>
  controller.update(req, res, next),
);

// DELETE
taskRouter.delete("/:taskId", (req, res, next) =>
  controller.remove(req, res, next),
);

export { taskRouter };
