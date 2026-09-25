import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).optional().nullable(),
  priority: z.enum(["VERY_LOW", "LOW", "MODERATE", "HIGH", "URGENT"]),
  status: z
    .enum(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED"])
    .optional(),
  assigneeMemberId: z.string().uuid().optional().nullable(),
});

export const updateTaskSchema = createTaskSchema.partial();

export const taskParamsSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
});
