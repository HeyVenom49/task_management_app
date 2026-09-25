import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { RegisterPage } from "./RegisterPage";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ana" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
}

describe("RegisterPage", () => {
  test("shows a check-your-email panel on successful registration", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse(201, { user: { id: "1", name: "Ana", email: "ana@example.com", role: "USER", status: "INACTIVE", createdAt: "2026-01-01T00:00:00Z" } }),
    ) as unknown as typeof fetch;

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );
    fillAndSubmit();

    await waitFor(() => expect(screen.getByText(/We sent a verification link to ana@example.com/)).toBeInTheDocument());
  });

  test("shows the backend's conflict message when the email is already registered", async () => {
    globalThis.fetch = mock(async () => jsonResponse(409, { message: "Email already registered" })) as unknown as typeof fetch;

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );
    fillAndSubmit();

    await waitFor(() => expect(screen.getByText("Email already registered")).toHaveAttribute("role", "alert"));
  });

  test("shows a client-side validation error without calling the API for a short name", () => {
    const fetchMock = mock(async () => jsonResponse(201, { user: {} }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Al" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByText("Name must be at least 3 characters")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("shows an error and returns to clickable state when resend verification fails", async () => {
    let callCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- URL parameter not used in this mock fetch handler
    globalThis.fetch = mock(async (_url: string) => {
      callCount++;
      // First call: registration succeeds
      if (callCount === 1) {
        return jsonResponse(201, { user: { id: "1", name: "Ana", email: "ana@example.com", role: "USER", status: "INACTIVE", createdAt: "2026-01-01T00:00:00Z" } });
      }
      // Second call: resend verification fails
      return jsonResponse(500, { message: "Server error" });
    }) as unknown as typeof fetch;

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );
    fillAndSubmit();

    // Wait for check-your-email panel
    await waitFor(() => expect(screen.getByText(/We sent a verification link to ana@example.com/)).toBeInTheDocument());

    // Click resend button
    const resendButton = screen.getByRole("button", { name: "Resend email" });
    fireEvent.click(resendButton);

    // Wait for error message to appear
    await waitFor(() =>
      expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument(),
    );

    // Verify button is no longer disabled (returned to clickable state)
    expect(resendButton).not.toHaveAttribute("disabled");
  });
});
