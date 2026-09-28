import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { redis } from "../redis/redis";
import { RedisStore } from "rate-limit-redis";
import { ServiceUnavailableError } from "../errors";

const isTest = process.env.NODE_ENV === "test";

const passthrough: RequestHandler = (_req, _res, next) => next();

function buildLimiter(message: string, max = 10): RequestHandler {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
    store: new RedisStore({
      sendCommand: async (...args: string[]) => {
        try {
          if (!redis.isOpen) {
            await redis.connect();
          }
          return await redis.sendCommand(args);
        } catch {
          // Fail-closed: Redis down -> 503 (do not skip rate limits)
          throw new ServiceUnavailableError(
            "Rate limiting unavailable. Try again later.",
          );
        }
      },
      prefix: "rl:",
    }),
  });
}

export const loginLimiter = isTest
  ? passthrough
  : buildLimiter("Too many login attempts. Try again later.");

export const authWriteLimiter = isTest
  ? passthrough
  : buildLimiter("Too many requests. Try again later.");
