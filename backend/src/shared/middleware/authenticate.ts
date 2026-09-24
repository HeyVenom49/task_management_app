import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../auth/token";
import { UnauthorizedError } from "../errors";

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedError();
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      throw new UnauthorizedError();
    }

    const payload = await verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };

    next();
  } catch {
    next(new UnauthorizedError());
  }
}
