import express from "express";
import { apiRouter } from "./api";
import { notFound } from "./shared/middleware/notFound";
import { errorHandler } from "./shared/middleware/errorHandler";
import cors from "cors";
import cookieParser from "cookie-parser";
import env from "./config/env";

const app = express();

app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true,
  }),
);

app.use(cookieParser());

app.use(express.json());

app.use("/api", apiRouter);

app.use(notFound);

app.use(errorHandler);

export { app };
