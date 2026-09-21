import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(3),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8).max(72),
});

export type RegisterInput = z.infer<typeof registerSchema>;
