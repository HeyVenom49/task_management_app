import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

const realAuthContext = { ...(await import("../auth/AuthContext")) };
const clearSessionMock = mock(() => {});
mock.module("../auth/AuthContext", () => ({
  ...realAuthContext,
  useAuth: () => ({
    status: "authenticated" as const,
    user: {
      id: "1",
      name: "Ana",
      email: "ana@example.com",
      role: "USER" as const,
      status: "ACTIVE" as const,
      createdAt: "2026-01-01T00:00:00Z",
    },
    login: mock(async () => {}),
    logout: mock(async () => {}),
    clearSession: clearSessionMock,
  }),
}));

const { SecuritySettingsPage } = await import("./SecuritySettingsPage");

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

afterAll(() => {
  mock.module("../auth/AuthContext", () => realAuthContext);
});

describe("SecuritySettingsPage", () => {
  test("clears the local session and redirects to /login after a successful change", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse(200, { message: "Password updated. Please log in again." }),
    ) as unknown as typeof fetch;

    render(
      <MemoryRouter initialEntries={["/settings/security"]}>
        <Routes>
          <Route path="/settings/security" element={<SecuritySettingsPage />} />
          <Route path="/login" element={<p>login page</p>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "old-password" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password1" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => expect(screen.getByText("login page")).toBeInTheDocument());
    expect(clearSessionMock).toHaveBeenCalledTimes(1);
  });

  test("navigates to /login with a success message in navigation state after a successful change", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse(200, { message: "Password updated. Please log in again." }),
    ) as unknown as typeof fetch;

    function LoginStateProbe() {
      const location = useLocation();
      const state = location.state as { message?: string } | null;
      return <p>{state?.message ?? "no message"}</p>;
    }

    render(
      <MemoryRouter initialEntries={["/settings/security"]}>
        <Routes>
          <Route path="/settings/security" element={<SecuritySettingsPage />} />
          <Route path="/login" element={<LoginStateProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "old-password" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password1" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() =>
      expect(screen.getByText("Password updated. Please log in again.")).toBeInTheDocument(),
    );
  });

  test("shows the backend's error message on a wrong current password", async () => {
    globalThis.fetch = mock(async () => jsonResponse(401, { message: "Invalid credentials" })) as unknown as typeof fetch;

    render(
      <MemoryRouter initialEntries={["/settings/security"]}>
        <SecuritySettingsPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "wrong" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password1" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => expect(screen.getByText("Invalid credentials")).toHaveAttribute("role", "alert"));
  });
});
