import type { Request, Response } from "express";
import env from "../../config/env";

const COOKIE_NAME = "refreshToken";

export function setRefreshCookie(res: Response, rawRefresh: string) {
  res.cookie(COOKIE_NAME, rawRefresh, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    path: "/api/v1/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshToken(res: Response) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    path: "/api/v1/auth",
  });
}

export function readRefreshToken(req: {
  cookies?: Record<string, string>;
  body?: { refreshToken?: string };
}): string | undefined {
  return req.cookies?.refreshToken ?? req.body?.refreshToken;
}

export function wantsRefreshInBody(req: Request): boolean {
  const client = req.headers["x-client"];
  return typeof client === "string" && client.toLowerCase() === "mobile";
}

export function sendAuthTokens(
  req: Request,
  res: Response,
  result: { refreshToken: string } & Record<string, unknown>,
  status = 200,
): void {
  setRefreshCookie(res, result.refreshToken);
  const { refreshToken, ...rest } = result;

  if (wantsRefreshInBody(req)) {
    res.status(status).json({ ...rest, refreshToken });
  } else {
    res.status(status).json(rest);
  }
}
