import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_EXPIRES_IN: z.string().default("7d"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  COOKIE_SECURE: z.coerce.boolean().default(false),
});

const parsed = envSchema.parse(process.env);

const env = {
  port: parsed.PORT,
  nodeEnv: parsed.NODE_ENV,
  databaseUrl: parsed.DATABASE_URL,
  jwtSecret: parsed.JWT_SECRET,
  jwtExpiresIn: parsed.JWT_EXPIRES_IN,
  refreshExpiresIn: parsed.REFRESH_EXPIRES_IN,
  frontendUrl: parsed.FRONTEND_URL,
  cookieSecure: parsed.COOKIE_SECURE,
};

export default env;
