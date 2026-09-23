import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/app-error";
import { verifyAccessToken } from "../auth/token";

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer")) {
      throw new AppError(401, "Unauthorized");
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      throw new AppError(401, "Unauthorized");
    }

    const payload = await verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };

    next();
  } catch {
    next(new AppError(401, "Unauthorized"));
  }
}
