import { Router } from "express";
// import sql from "../../db/client";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthRepository } from "./auth.repostiory";
import sql from "../../db/client";

const repo = new AuthRepository(sql);
const service = new AuthService(repo);
const controller = new AuthController(service);

export const authRouter = Router();

authRouter.post("/register", controller.register.bind(controller));
