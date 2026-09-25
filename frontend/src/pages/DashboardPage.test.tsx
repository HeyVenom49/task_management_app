import { describe, expect, mock, test, afterAll } from "bun:test";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const realAuthContext = { ...(await import("../auth/AuthContext")) };
const useAuthMock = mock(() => ({
  status: "authenticated" as const,
  user: { id: "1", name: "Ana", email: "ana@example.com", role: "USER" as const, status: "ACTIVE" as const, createdAt: "2026-01-01T00:00:00Z" },
  login: mock(async () => {}),
  logout: mock(async () => {}),
  clearSession: mock(() => {}),
}));
mock.module("../auth/AuthContext", () => ({ ...realAuthContext, useAuth: useAuthMock }));

const { DashboardPage } = await import("./DashboardPage");

describe("DashboardPage", () => {
  test("greets the user by name and shows an honest empty state, not fake data", () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Welcome, Ana")).toBeInTheDocument();
    expect(screen.getByText("Projects aren't available yet.")).toBeInTheDocument();
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
  });
});

afterAll(() => {
  mock.module("../auth/AuthContext", () => realAuthContext);
});
