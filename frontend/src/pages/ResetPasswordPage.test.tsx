import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ResetPasswordPage } from "./ResetPasswordPage";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("ResetPasswordPage", () => {
  test("shows an invalid-link message immediately when there is no token", () => {
    render(
      <MemoryRouter initialEntries={["/reset-password"]}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("This link is invalid or expired.")).toBeInTheDocument();
  });

  test("blocks submit when the passwords don't match", () => {
    const fetchMock = mock(async () => jsonResponse(200, { message: "Password reset successful" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(
      <MemoryRouter initialEntries={["/reset-password?token=abc"]}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "different1" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(screen.getByText("Passwords don't match")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("shows success with a link to sign in after a matching reset", async () => {
    globalThis.fetch = mock(async () => jsonResponse(200, { message: "Password reset successful" })) as unknown as typeof fetch;

    render(
      <MemoryRouter initialEntries={["/reset-password?token=abc"]}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => expect(screen.getByText("Your password has been reset.")).toBeInTheDocument());
    expect(screen.getByText("Sign in")).toBeInTheDocument();
  });
});
