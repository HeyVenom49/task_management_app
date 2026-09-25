import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate";
import { ProjectRepository } from "./project.repository";
import sql from "../../db/client";
import { ProjectServices } from "./project.service";
import { ProjectController } from "./project.controller";
import { MemberRepository } from "./member.repository";
import { AuthRepository } from "../auth/auth.repository";

const repo = new ProjectRepository(sql);
const memberRepo = new MemberRepository(sql);
const authRepo = new AuthRepository(sql);
const service = new ProjectServices(sql, repo, memberRepo, authRepo);
const controller = new ProjectController(service);

const projectRouter = Router();

projectRouter.use(authenticate);

// POST
projectRouter.post("/", (req, res, next) => controller.create(req, res, next));
projectRouter.post("/:id/members", (req, res, next) =>
  controller.addMember(req, res, next),
);
projectRouter.post("/:id/members/:memberId/reactivate", (req, res, next) =>
  controller.reactivateMember(req, res, next),
);

// GET
projectRouter.get("/", (req, res, next) => controller.list(req, res, next));
projectRouter.get("/:id", (req, res, next) =>
  controller.getById(req, res, next),
);
projectRouter.get("/:id/members", (req, res, next) =>
  controller.listMember(req, res, next),
);

// PATCH
projectRouter.patch("/:id", (req, res, next) =>
  controller.update(req, res, next),
);

// DELETE
projectRouter.delete("/:id", (req, res, next) =>
  controller.remove(req, res, next),
);
projectRouter.delete("/:id/members/:memberId", (req, res, next) =>
  controller.removeMember(req, res, next),
);

export { projectRouter };
