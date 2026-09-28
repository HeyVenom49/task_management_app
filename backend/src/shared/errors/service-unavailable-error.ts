import { AppError } from "./app-error";

export class ServiceUnavailableError extends AppError {
  constructor(message = "Service temporarily unavailable") {
    super(503, message);
    this.name = "ServiceUnavailableError";
  }
}
