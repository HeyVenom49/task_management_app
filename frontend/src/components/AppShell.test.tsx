import { afterAll, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

// Capture a COPY of the real module's exports BEFORE mock.module replaces
// it, so it can be restored afterwards. mock.module() replaces the module
// in Bun's module registry for the rest of the test PROCESS (not just this
// file), so without an explicit restore, any test file that runs later and
// imports "../auth/AuthContext" (e.g. via AuthProvider) would get this stub
// instead. See RequireAuth.test.tsx for the same pattern.
const realAuthContext = { ...(await import("../auth/AuthContext")) };
mock.module("../auth/AuthContext", () => ({
  ...realAuthContext,
  useAuth: mock(() => ({
    status: "authenticated" as const,
    user: { id: "u1", name: "Ana", email: "ana@example.com", role: "USER" as const, status: "ACTIVE" as const, createdAt: "2026-01-01T00:00:00Z" },
    login: mock(async () => {}),
    logout: mock(async () => {}),
    clearSession: mock(() => {}),
  })),
}));

afterAll(() => {
  mock.module("../auth/AuthContext", () => realAuthContext);
});

const { AppShell } = await import("./AppShell");

describe("AppShell", () => {
  test("the wordmark links back to the dashboard", () => {
    render(
      <MemoryRouter>
        <AppShell>
          <p>content</p>
        </AppShell>
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "docket" })).toHaveAttribute("href", "/");
  });
});
