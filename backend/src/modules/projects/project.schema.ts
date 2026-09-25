import { z } from "zod";

export const createProjectSchema = z.object({
  info: z.string().trim().min(1).max(500),
});

export const updateProjectSchema = z.object({
  info: z.string().trim().min(1).max(500),
});

export const projectIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const addMemberSchema = z.object({
  email: z.email().trim().toLowerCase(),
});

export const memberParamsSchema = z.object({
  id: z.string().uuid(),
  memberId: z.string().uuid(),
});

export type CreateProjectBody = z.infer<typeof createProjectSchema>;
export type UpdateProjectBody = z.infer<typeof updateProjectSchema>;
