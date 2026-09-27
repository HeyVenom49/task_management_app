process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/task_management";
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? "test-secret-at-least-16-chars";
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "15m";
process.env.REFRESH_EXPIRES_IN = process.env.REFRESH_EXPIRES_IN ?? "7d";
process.env.FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";
process.env.COOKIE_SECURE = "false";
