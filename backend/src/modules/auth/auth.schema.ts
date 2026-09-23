import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(3),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8).max(72),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const resendVerificationSchema = z.object({
  email: z.email().trim().toLowerCase(),
});

export const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
