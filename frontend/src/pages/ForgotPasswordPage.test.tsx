import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ForgotPasswordPage } from "./ForgotPasswordPage";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("ForgotPasswordPage", () => {
  test("shows the same generic success message regardless of whether the email exists", async () => {
    globalThis.fetch = mock(async () => jsonResponse(200, { message: "If that email exists, we sent a reset link" })) as unknown as typeof fetch;

    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "anyone@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => expect(screen.getByText(/we sent a password reset link/)).toBeInTheDocument());
  });
});
