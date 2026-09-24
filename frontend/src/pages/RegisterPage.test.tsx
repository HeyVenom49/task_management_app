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
  fireEvent.click(screen.getByText("Create account"));
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

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Email already registered"));
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
    fireEvent.click(screen.getByText("Create account"));

    expect(screen.getByText("Name must be at least 3 characters")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
