import { afterEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { VerifyEmailPage } from "./VerifyEmailPage";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("VerifyEmailPage", () => {
  test("shows success once verification resolves", async () => {
    globalThis.fetch = mock(async () => jsonResponse(200, { message: "Email verified successfully" })) as unknown as typeof fetch;

    render(
      <MemoryRouter initialEntries={["/verify-email?token=abc123"]}>
        <VerifyEmailPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("status", { name: "Verifying your email" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Email verified/)).toBeInTheDocument());
    expect(screen.getByText("Go to sign in")).toBeInTheDocument();
  });

  test("shows an error state when the backend rejects the token", async () => {
    globalThis.fetch = mock(async () => jsonResponse(400, { message: "Invalid or expired verification link" })) as unknown as typeof fetch;

    render(
      <MemoryRouter initialEntries={["/verify-email?token=bad"]}>
        <VerifyEmailPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("This link is invalid or expired.")).toBeInTheDocument());
  });

  test("shows an error state immediately when there is no token in the URL", async () => {
    render(
      <MemoryRouter initialEntries={["/verify-email"]}>
        <VerifyEmailPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("This link is invalid or expired.")).toBeInTheDocument();
  });
});
