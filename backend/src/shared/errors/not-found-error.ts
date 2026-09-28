import { AppError } from "./app-error";

export class NotFoundError extends AppError {
  constructor(message = "Not Found") {
    super(404, message);
    this.name = "NotFoundError";
  }
}
