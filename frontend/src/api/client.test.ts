import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { apiFetch, ApiError, getAccessToken, setAccessToken, setSessionExpiredHandler } from "./client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  setAccessToken(null);
  setSessionExpiredHandler(null);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("apiFetch", () => {
  test("returns parsed JSON on a 2xx response", async () => {
    globalThis.fetch = mock(async () => jsonResponse(200, { message: "ok" })) as unknown as typeof fetch;
    const result = await apiFetch<{ message: string }>("/auth/logout", { method: "POST" });
    expect(result.message).toBe("ok");
  });

  test("attaches the Authorization header when a token is set", async () => {
    setAccessToken("token-123");
    const fetchMock = mock(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer token-123");
      return jsonResponse(200, { user: {} });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await apiFetch("/auth/me");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("throws ApiError with fieldErrors on a 400 validation response", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse(400, { message: "Validation failed", errors: { email: ["Invalid email"] } }),
    ) as unknown as typeof fetch;

    await expect(apiFetch("/auth/register", { method: "POST", body: {} })).rejects.toMatchObject({
      status: 400,
      message: "Validation failed",
      fieldErrors: { email: ["Invalid email"] },
    });
  });

  test("throws a generic ApiError for a 500 response, ignoring the body's message", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse(500, { message: "Server error" }),
    ) as unknown as typeof fetch;

    await expect(apiFetch("/auth/me")).rejects.toMatchObject({
      status: 500,
      message: "Something went wrong. Please try again.",
    });
  });

  test("throws a generic ApiError when fetch itself rejects (network failure)", async () => {
    globalThis.fetch = mock(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    await expect(apiFetch("/auth/me")).rejects.toMatchObject({
      status: 0,
      message: "Something went wrong. Please try again.",
    });
  });

  test("retries once after a silent refresh on a 401, then succeeds", async () => {
    setAccessToken("expired-token");
    const responses = [
      jsonResponse(401, { message: "Unauthorized" }), // original call
      jsonResponse(200, { accessToken: "new-token" }), // refresh
      jsonResponse(200, { user: { id: "1" } }), // retried original call
    ];
    globalThis.fetch = mock(async () => responses.shift()!) as unknown as typeof fetch;

    const result = await apiFetch<{ user: { id: string } }>("/auth/me");
    expect(result.user.id).toBe("1");
    expect(getAccessToken()).toBe("new-token");
  });

  test("calls the session-expired handler and rethrows when the refresh-after-401 also fails", async () => {
    setAccessToken("expired-token");
    let called = false;
    setSessionExpiredHandler(() => {
      called = true;
    });
    const responses = [
      jsonResponse(401, { message: "Unauthorized" }), // original call
      jsonResponse(401, { message: "Invalid refresh token" }), // refresh fails
    ];
    globalThis.fetch = mock(async () => responses.shift()!) as unknown as typeof fetch;

    await expect(apiFetch("/auth/me")).rejects.toBeInstanceOf(ApiError);
    expect(called).toBe(true);
    expect(getAccessToken()).toBeNull();
  });

  test("de-duplicates concurrent refreshes: two concurrent 401s trigger only one /auth/refresh call", async () => {
    setAccessToken("expired-token");
    let refreshCalls = 0;
    let meCalls = 0;
    const fetchMock = mock(async (url: string) => {
      if (url.includes("/auth/refresh")) {
        refreshCalls++;
        return jsonResponse(200, { accessToken: "new-token" });
      }
      if (url.includes("/auth/me")) {
        meCalls++;
        // The first two calls are the original (pre-refresh) attempts; later calls are retries.
        if (meCalls <= 2) {
          return jsonResponse(401, { message: "Unauthorized" });
        }
        return jsonResponse(200, { user: { id: "1" } });
      }
      throw new Error(`Unexpected URL in test: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const [a, b] = await Promise.all([
      apiFetch<{ user: { id: string } }>("/auth/me"),
      apiFetch<{ user: { id: string } }>("/auth/me"),
    ]);

    expect(a.user.id).toBe("1");
    expect(b.user.id).toBe("1");
    expect(refreshCalls).toBe(1);
  });

  test("never retries a 401 from /auth/login itself", async () => {
    const fetchMock = mock(async () => jsonResponse(401, { message: "Invalid email or password" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(apiFetch("/auth/login", { method: "POST", body: {} })).rejects.toMatchObject({
      status: 401,
      message: "Invalid email or password",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
