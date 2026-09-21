import { Router, type Request, type Response } from "express";
import sql from "../../db/client";

const healthRouter = Router();

healthRouter.get("/", (_req: Request, res: Response) => {
  res.status(200).json({ message: "OK" });
});

healthRouter.get("/db", async (_req: Request, res: Response) => {
  const result = await sql`SELECT 1`;
  return res.json({
    database: result[0],
  });
});

export { healthRouter };
