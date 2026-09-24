import { AppError } from "./app-error";

export class BadRequestError extends AppError {
  constructor(message = "Bad Request") {
    super(400, message);
    this.name = "BadRequestError";
  }
}
