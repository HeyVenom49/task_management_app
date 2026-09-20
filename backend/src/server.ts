import "dotenv/config";
import { app } from "./app";
import http from "node:http";
import env from "./config/env";

const PORT = env.port;

const server = http.createServer(app);

async function start() {
  await new Promise<void>((resolve) => {
    server.listen(PORT, () => {
      console.log(`Server is running on the http://localhost:${PORT}`);
      resolve();
    });
  });
}

start().catch((err) => {
  console.error("Failed to start server: ", err);
  process.exit(1);
});
