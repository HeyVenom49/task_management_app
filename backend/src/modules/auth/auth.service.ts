import argon2 from "argon2";
import type { RegisterInput } from "./auth.schema";
import { AuthRepository } from "./auth.repostiory";
import { AppError } from "../../shared/errors/app-error";

export class AuthService {
  constructor(private readonly repo: AuthRepository) {}
  async register(input: RegisterInput) {
    const passwordHash = await argon2.hash(input.password);
    try {
      return this.repo.register({
        name: input.name,
        email: input.email,
        passwordHash,
      });
    } catch (err) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        err.code === "23505"
      ) {
        throw new AppError(409, "Email already registered");
      }
      throw err;
    }
  }
}
