import { describe, expect, test } from "bun:test";
import { api } from "./helper/http";

describe("failure responses", () => {
  test("unknown route does not leak internals", async () => {
    const res = await api().get("/api/v1/this-does-not-exist");
    expect(res.status).toBe(404);
    const text = JSON.stringify(res.body);
    expect(text.toLowerCase().includes("postgres")).toBe(false);
    expect(text.toLowerCase().includes("at /")).toBe(false);
  });

  test("invalid JWT -> 401 with safe message", async () => {
    const res = await api()
      .get("/api/v1/projects")
      .set({ Authorization: "Bearer not.a.jwt" });
    expect(res.status).toBe(401);
    expect(res.body.message).toBeTruthy();
    expect(JSON.stringify(res.body).includes("JsonWebToken")).toBe(false);
  });
});
