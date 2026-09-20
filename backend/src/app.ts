import express from "express";
import { apiRouter } from "./routes/api/api";
import { notFound } from "./middleware/notfound";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

app.use(express.json());

app.use("/api", apiRouter);

app.use(notFound);

app.use(errorHandler);

export { app };
