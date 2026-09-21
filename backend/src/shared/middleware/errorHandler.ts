import type { Request, Response, NextFunction } from "express";

export function errorHandler(
  _err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  return res.status(500).json({
    error: "Internal Server Error",
  });
}
