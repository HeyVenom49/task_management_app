import "dotenv/config";
import { app } from "./app";
import http from "node:http";
import env from "./config/env";
import { connectRedis, disconnectRedis } from "./shared/redis/redis";
import sql from "./db/client";

const PORT = env.port;

const server = http.createServer(app);

async function start() {
  await connectRedis();
  await new Promise<void>((resolve) => {
    server.listen(PORT, () => {
      console.log(`Server is running on the http://localhost:${PORT}`);
      resolve();
    });
  });
}

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down...`);
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await disconnectRedis();
  await sql.end({ timeout: 5 });
  process.exit(0);
}

start().catch((err) => {
  console.error("Failed to start server: ", err);
  process.exit(1);
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
