import type { Request, Response, NextFunction } from "express";
import {
  addMemberSchema,
  createProjectSchema,
  memberParamsSchema,
  projectIdParamsSchema,
  updateProjectSchema,
} from "./project.schema";
import type { ProjectServices } from "./project.service";

export class ProjectController {
  constructor(private readonly service: ProjectServices) {}

  public async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      const parsed = createProjectSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: parsed.error.flatten().fieldErrors,
        });
        return;
      }
      const result = await this.service.create(req.user.id, parsed.data.info);
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
      const result = await this.service.listMine(req.user.id);
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

      const params = projectIdParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: params.error.flatten().fieldErrors,
        });
        return;
      }
      const result = await this.service.getById(req.user.id, params.data.id);
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

      const params = projectIdParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: params.error.flatten().fieldErrors,
        });
        return;
      }

      const parsed = updateProjectSchema.safeParse(req.body);
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
        parsed.data.info,
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

      const params = projectIdParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: params.error.flatten().fieldErrors,
        });
        return;
      }
      await this.service.remove(req.user.id, params.data.id);
      res.status(200).json({ message: "Project deleted" });
    } catch (err) {
      next(err);
    }
  }

  public async listMember(req: Request, res: Response, next: NextFunction) {
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
      const result = await this.service.listMember(req.user.id, params.data.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async addMember(req: Request, res: Response, next: NextFunction) {
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
      const parsed = addMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: parsed.error.flatten().fieldErrors,
        });
        return;
      }
      const result = await this.service.addMember(
        req.user.id,
        params.data.id,
        parsed.data.email,
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async removeMember(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      const params = memberParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: params.error.flatten().fieldErrors,
        });
        return;
      }
      await this.service.removeMember(
        req.user.id,
        params.data.id,
        params.data.memberId,
      );
      res.status(200).json({ message: "Member removed" });
    } catch (err) {
      next(err);
    }
  }

  public async reactivateMember(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      const params = memberParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          message: "Validation failed",
          errors: params.error.flatten().fieldErrors,
        });
        return;
      }
      const result = await this.service.reactivateMember(
        req.user.id,
        params.data.id,
        params.data.memberId,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
