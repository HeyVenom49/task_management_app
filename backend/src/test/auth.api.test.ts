import { beforeEach, describe, expect, test } from "bun:test";
import { resetDb } from "./helper/db";
import { registerVerifiedUser } from "./helper/auth";
import { api, authHeader } from "./helper/http";

describe("auth api", () => {
  beforeEach(async () => {
    await resetDb();
  });

  test("register + login + GET /me", async () => {
    const { accessToken, user } = await registerVerifiedUser({
      name: "Alice",
      email: "alice@example.com",
      password: "password123",
    });

    expect(user.email).toBe("alice@example.com");

    const me = await api().get("/api/v1/auth/me").set(authHeader(accessToken));

    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("alice@example.com");
  });

  test("GET /projects without token -> 401", async () => {
    const res = await api().get("/api/v1/projects");
    expect(res.status).toBe(401);
  });
});
