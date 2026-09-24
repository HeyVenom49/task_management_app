import { afterAll, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

// Capture a COPY of the real module's exports BEFORE mock.module replaces
// it, so it can be restored afterwards. mock.module() replaces the module
// in Bun's module registry for the rest of the test PROCESS (not just this
// file), so without an explicit restore, any test file that runs later and
// imports "./AuthContext" (e.g. via AuthProvider) would get this stub
// instead. Note: when the module is already loaded, Bun's mock.module()
// overwrites properties on the SAME shared exports object rather than
// swapping in a new one, so capturing a plain reference to the module
// namespace (without copying it) would still get mutated by the mock call
// below. Spreading into a new object avoids that.
const realAuthContext = { ...(await import("./AuthContext")) };

const useAuthMock = mock<() => { status: string }>();
mock.module("./AuthContext", () => ({ useAuth: useAuthMock }));

const { RequireGuest } = await import("./RequireGuest");

afterAll(() => {
  mock.module("./AuthContext", () => realAuthContext);
});

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
