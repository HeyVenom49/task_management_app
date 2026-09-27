import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/app-error";
import { logger } from "../logger/logger";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.requestId;

  if (err instanceof AppError) {
    logger.warn({
      requestId,
      err: { message: err.message, status: err.status, name: err.name },
    });

    res.status(err.status).json({ message: err.message, requestId });
    return;
  }

  logger.error({
    requestId,
    err:
      err instanceof Error
        ? { message: err.message, stack: err.stack }
        : { message: String(err) },
  });
  res.status(500).json({ message: "Internal Server Error", requestId });
}
