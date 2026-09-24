import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext";
import { setAccessToken } from "../api/client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const originalFetch = globalThis.fetch;

function Probe() {
  const { status, user } = useAuth();
  return <div>status: {status}, user: {user?.email ?? "none"}</div>;
}

beforeEach(() => {
  setAccessToken(null);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("AuthProvider boot sequence", () => {
  test("resolves to authenticated when refresh then /me both succeed", async () => {
    const responses = [
      jsonResponse(200, { accessToken: "token-1" }),
      jsonResponse(200, { user: { id: "1", name: "Ana", email: "ana@example.com", role: "USER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z" } }),
    ];
    globalThis.fetch = mock(async () => responses.shift()!) as unknown as typeof fetch;

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByText(/status: loading/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/status: authenticated/)).toBeInTheDocument());
    expect(screen.getByText(/ana@example.com/)).toBeInTheDocument();
  });

  test("resolves to unauthenticated when the boot refresh fails, without throwing", async () => {
    globalThis.fetch = mock(async () => jsonResponse(401, { message: "Unauthorized" })) as unknown as typeof fetch;

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText(/status: unauthenticated/)).toBeInTheDocument());
    expect(screen.getByText(/user: none/)).toBeInTheDocument();
  });
});
