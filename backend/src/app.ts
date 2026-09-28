import express from "express";
import { apiRouter } from "./api";
import { notFound } from "./shared/middleware/notFound";
import { errorHandler } from "./shared/middleware/errorHandler";
import cors from "cors";
import cookieParser from "cookie-parser";
import env from "./config/env";
import { requestId } from "./shared/middleware/requestId";
import { requestLogger } from "./shared/middleware/requestLogger";
import { readFileSync } from "fs";
import { join } from "node:path";
import { parse } from "yaml";
import swaggerUi from "swagger-ui-express";

const app = express();

app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true,
  }),
);

if (env.nodeEnv !== "production") {
  const raw = readFileSync(
    join(import.meta.dirname, "../docs/openapi.yaml"),
    "utf8",
  );
  const spec = parse(raw);
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(spec));
}

app.use(requestId);

app.use(requestLogger);

app.use(cookieParser());

app.use(express.json({ limit: "100kb" }));

app.use("/api", apiRouter);

app.use(notFound);

app.use(errorHandler);

export { app };
