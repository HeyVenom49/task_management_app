import express from "express";
import { apiRouter } from "./api";
import { notFound } from "./shared/middleware/notFound";
import { errorHandler } from "./shared/middleware/errorHandler";

const app = express();

app.use(express.json());

app.use("/api", apiRouter);

app.use(notFound);

app.use(errorHandler);

export { app };
