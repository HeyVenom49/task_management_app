import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

const useAuthMock = mock<() => { status: string }>();
mock.module("./AuthContext", () => ({ useAuth: useAuthMock }));

const { RequireAuth } = await import("./RequireAuth");

describe("RequireAuth", () => {
  test("shows a full-page spinner while status is loading", () => {
    useAuthMock.mockReturnValue({ status: "loading" });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<RequireAuth><p>secret</p></RequireAuth>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });

  test("redirects to /login when unauthenticated", () => {
    useAuthMock.mockReturnValue({ status: "unauthenticated" });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<RequireAuth><p>secret</p></RequireAuth>} />
          <Route path="/login" element={<p>login page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  test("renders children when authenticated", () => {
    useAuthMock.mockReturnValue({ status: "authenticated" });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<RequireAuth><p>secret</p></RequireAuth>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("secret")).toBeInTheDocument();
  });
});
