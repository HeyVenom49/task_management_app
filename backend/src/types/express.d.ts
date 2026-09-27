import "express";

declare module "express-serve-static-core" {
  interface Request {
    user?: {
      id: string;
      email: string;
    };
    requestId?: string;
    cookies: Record<string, string>;
  }
}
