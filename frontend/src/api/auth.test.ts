import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as authApi from "./auth";
import { getAccessToken, setAccessToken } from "./client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  setAccessToken(null);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("auth API layer", () => {
  test("register does not set an access token (backend returns no tokens)", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse(201, { user: { id: "1", name: "Ana", email: "ana@example.com", role: "USER", status: "INACTIVE", createdAt: "2026-01-01T00:00:00Z" } }),
    ) as unknown as typeof fetch;

    const result = await authApi.register({ name: "Ana", email: "ana@example.com", password: "password123" });
    expect(result.user.email).toBe("ana@example.com");
    expect(getAccessToken()).toBeNull();
  });

  test("login stores the returned access token", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse(200, {
        user: { id: "1", name: "Ana", email: "ana@example.com", role: "USER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z" },
        accessToken: "abc123",
      }),
    ) as unknown as typeof fetch;

    await authApi.login({ email: "ana@example.com", password: "password123" });
    expect(getAccessToken()).toBe("abc123");
  });

  test("refresh stores the new access token and does not require a user in the response", async () => {
    globalThis.fetch = mock(async () => jsonResponse(200, { accessToken: "new-token" })) as unknown as typeof fetch;

    const result = await authApi.refresh();
    expect(result.accessToken).toBe("new-token");
    expect(getAccessToken()).toBe("new-token");
  });

  test("logout clears the local access token", async () => {
    setAccessToken("abc123");
    globalThis.fetch = mock(async () => jsonResponse(200, { message: "Logged out" })) as unknown as typeof fetch;

    await authApi.logout();
    expect(getAccessToken()).toBeNull();
  });

  test("changePassword clears the local access token (backend revokes the session)", async () => {
    setAccessToken("abc123");
    globalThis.fetch = mock(async () =>
      jsonResponse(200, { message: "Password updated. Please log in again." }),
    ) as unknown as typeof fetch;

    await authApi.changePassword({ currentPassword: "old", newPassword: "newpassword1" });
    expect(getAccessToken()).toBeNull();
  });

  test("logout clears the local access token even when the network call fails", async () => {
    setAccessToken("abc123");
    globalThis.fetch = mock(async () =>
      jsonResponse(500, { message: "Internal error" }),
    ) as unknown as typeof fetch;

    await expect(authApi.logout()).rejects.toBeTruthy();
    expect(getAccessToken()).toBeNull();
  });

  test("verifyEmail URL-encodes the token into the query string", async () => {
    const fetchMock = mock(async (url: string) => {
      expect(url).toContain("/auth/verify-email?token=abc%20123");
      return jsonResponse(200, { message: "Email verified successfully" });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await authApi.verifyEmail("abc 123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
