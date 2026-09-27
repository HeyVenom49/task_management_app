import request from "supertest";
import { app } from "../../app";

export function api() {
  return request(app);
}

export function authHeader(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}
