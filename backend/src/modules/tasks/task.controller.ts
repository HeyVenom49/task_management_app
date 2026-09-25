import type { NextFunction, Request, Response } from "express";
import type { TaskService } from "./task.service";
import { projectIdParamsSchema } from "../projects/project.schema";
import {
  createTaskSchema,
  taskParamsSchema,
  updateTaskSchema,
} from "./task.schema";

export class TaskController {
  constructor(private readonly service: TaskService) {}

  public async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const params = projectIdParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: params.error.flatten().fieldErrors,
        });
        return;
      }

      const parsed = createTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const result = await this.service.create(
        req.user.id,
        params.data.id,
        parsed.data,
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const params = projectIdParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: params.error.flatten().fieldErrors,
        });
        return;
      }

      const result = await this.service.list(req.user.id, params.data.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async getById(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const params = taskParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: params.error.flatten().fieldErrors,
        });
        return;
      }

      const result = await this.service.getById(
        req.user.id,
        params.data.id,
        params.data.taskId,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async update(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const params = taskParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: params.error.flatten().fieldErrors,
        });
        return;
      }

      const parsed = updateTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const result = await this.service.update(
        req.user.id,
        params.data.id,
        params.data.taskId,
        parsed.data,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async remove(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const params = taskParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: params.error.flatten().fieldErrors,
        });
        return;
      }

      await this.service.remove(
        req.user.id,
        params.data.id,
        params.data.taskId,
      );
      res.status(200).json({ message: "Task deleted" });
    } catch (err) {
      next(err);
    }
  }
}
