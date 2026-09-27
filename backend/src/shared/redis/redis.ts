import { createClient } from "redis";
import env from "../../config/env";

export const redis = createClient({
  url: env.redisUrl ?? "redis://127.0.0.1:6379",
});

redis.on("error", (err) => {
  console.error("Redis error", err);
});

export async function connectRedis(): Promise<void> {
  if (!redis.isOpen) {
    await redis.connect();
  }
}
