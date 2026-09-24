import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

const useAuthMock = mock<() => { status: string }>();
mock.module("./AuthContext", () => ({ useAuth: useAuthMock }));

const { RequireGuest } = await import("./RequireGuest");

describe("RequireGuest", () => {
  test("redirects to / when already authenticated", () => {
    useAuthMock.mockReturnValue({ status: "authenticated" });
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<RequireGuest><p>login form</p></RequireGuest>} />
          <Route path="/" element={<p>dashboard</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("dashboard")).toBeInTheDocument();
  });

  test("renders children when unauthenticated", () => {
    useAuthMock.mockReturnValue({ status: "unauthenticated" });
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<RequireGuest><p>login form</p></RequireGuest>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("login form")).toBeInTheDocument();
  });
});
