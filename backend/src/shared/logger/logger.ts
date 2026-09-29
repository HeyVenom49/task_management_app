import { pino } from "pino";
import env from "../../config/env";

function canUsePretty(): boolean {
  if (env.nodeEnv !== "development") return false;

  try {
    require.resolve("pino-pretty");
    return true;
  } catch {
    return false;
  }
}

export const logger = pino({
  level: env.nodeEnv === "test" ? "silent" : "info",
  ...(canUsePretty()
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }
    : {}),
});
