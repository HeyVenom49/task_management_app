import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { setAccessToken } from "./api/client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  setAccessToken(null);
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("App routing", () => {
  test("redirects an unauthenticated visitor at / to the login page", async () => {
    globalThis.fetch = mock(async () => jsonResponse(401, { message: "Unauthorized" })) as unknown as typeof fetch;
    const { default: App } = await import("./App");

    render(<App />);
    await waitFor(() => expect(screen.getByText("Sign in")).toBeInTheDocument());
  });

  test("renders NotFoundPage for an unknown route", async () => {
    window.history.pushState({}, "", "/does-not-exist");
    globalThis.fetch = mock(async () => jsonResponse(401, { message: "Unauthorized" })) as unknown as typeof fetch;
    const { default: App } = await import("./App");

    render(<App />);
    await waitFor(() => expect(screen.getByText("Page not found")).toBeInTheDocument());
  });
});
