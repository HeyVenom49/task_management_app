import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/app-error";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error(err);
  if (err instanceof AppError) {
    res.status(err.status).json({ message: err.message });
    return;
  }
  res.status(500).json({
    message: "Internal Server Error",
  });
}
