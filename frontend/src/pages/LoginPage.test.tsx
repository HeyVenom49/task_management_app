import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { AuthProvider } from "../auth/AuthContext";
import { LoginPage } from "./LoginPage";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<p>dashboard</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("LoginPage", () => {
  test("navigates to / on successful login", async () => {
    const responses = [
      jsonResponse(401, { message: "Unauthorized" }), // AuthProvider boot refresh
      jsonResponse(200, {
        user: { id: "1", name: "Ana", email: "ana@example.com", role: "USER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z" },
        accessToken: "abc123",
      }),
    ];
    globalThis.fetch = mock(async () => responses.shift()!) as unknown as typeof fetch;

    renderLoginPage();
    await waitFor(() => screen.getByLabelText("Email"));
    fillAndSubmit("ana@example.com", "password123");

    await waitFor(() => expect(screen.getByText("dashboard")).toBeInTheDocument());
  });

  test("shows the backend's error message for wrong credentials", async () => {
    const responses = [
      jsonResponse(401, { message: "Unauthorized" }), // boot refresh
      jsonResponse(401, { message: "Invalid email or password" }), // login
    ];
    globalThis.fetch = mock(async () => responses.shift()!) as unknown as typeof fetch;

    renderLoginPage();
    await waitFor(() => screen.getByLabelText("Email"));
    fillAndSubmit("ana@example.com", "wrong-password");

    await waitFor(() => expect(screen.getByText("Invalid email or password")).toHaveAttribute("role", "alert"));
  });

  test("shows a resend-verification action on a 403 unverified-email response", async () => {
    const responses = [
      jsonResponse(401, { message: "Unauthorized" }), // boot refresh
      jsonResponse(403, { message: "Please verify your email" }), // login
    ];
    globalThis.fetch = mock(async () => responses.shift()!) as unknown as typeof fetch;

    renderLoginPage();
    await waitFor(() => screen.getByLabelText("Email"));
    fillAndSubmit("ana@example.com", "password123");

    await waitFor(() => expect(screen.getByText("Resend verification email")).toBeInTheDocument());
  });

  test("shows an error and returns to clickable state when resend verification fails", async () => {
    const responses = [
      jsonResponse(401, { message: "Unauthorized" }), // boot refresh
      jsonResponse(403, { message: "Please verify your email" }), // login
    ];
    globalThis.fetch = mock(async (url: string) => {
      if (typeof url === "string" && url.includes("/auth/resend-verification")) {
        return jsonResponse(500, { message: "Server error" });
      }
      return responses.shift()!;
    }) as unknown as typeof fetch;

    renderLoginPage();
    await waitFor(() => screen.getByLabelText("Email"));
    fillAndSubmit("ana@example.com", "password123");

    await waitFor(() => expect(screen.getByText("Resend verification email")).toBeInTheDocument());

    const resendButton = screen.getByRole("button", { name: "Resend verification email" });
    fireEvent.click(resendButton);

    await waitFor(() =>
      expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument(),
    );
    expect(resendButton).not.toHaveAttribute("disabled");
  });

  test("shows a client-side validation error without calling the API for an invalid email", () => {
    const fetchMock = mock(async () => jsonResponse(401, { message: "Unauthorized" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderLoginPage();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not-an-email" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
  });
});
