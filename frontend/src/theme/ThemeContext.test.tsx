import { beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, useTheme } from "./ThemeContext";

function mockMatchMedia(matches: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function ThemeProbe() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <p>current: {theme}</p>
      <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>flip</button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  mockMatchMedia(false);
});

describe("ThemeProvider", () => {
  test("defaults to the system preference when nothing is stored", () => {
    mockMatchMedia(true);
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByText("current: dark")).toBeInTheDocument();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  test("defaults to light when the system has no dark preference", () => {
    mockMatchMedia(false);
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByText("current: light")).toBeInTheDocument();
  });

  test("a stored preference overrides the system preference", () => {
    window.localStorage.setItem("docket-theme", "light");
    mockMatchMedia(true);
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByText("current: light")).toBeInTheDocument();
  });

  test("setTheme updates the DOM attribute and persists to localStorage", () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "flip" }));
    expect(screen.getByText("current: dark")).toBeInTheDocument();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem("docket-theme")).toBe("dark");
  });

  test("useTheme throws when used outside a ThemeProvider", () => {
    function Bare() {
      useTheme();
      return null;
    }
    expect(() => render(<Bare />)).toThrow("useTheme must be used within a ThemeProvider");
  });

  test("does not throw and defaults to light when window.matchMedia is unavailable", () => {
    // @ts-expect-error -- simulating an environment without matchMedia support
    delete window.matchMedia;

    expect(() =>
      render(
        <ThemeProvider>
          <ThemeProbe />
        </ThemeProvider>,
      ),
    ).not.toThrow();
    expect(screen.getByText("current: light")).toBeInTheDocument();
  });

  test("mounting with no stored preference does not write the OS-derived default to localStorage", () => {
    mockMatchMedia(true);
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(window.localStorage.getItem("docket-theme")).toBeNull();
  });

  test("does not throw when localStorage.getItem throws (e.g. privacy-restricted browser)", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function () {
      throw new Error("SecurityError");
    };
    try {
      expect(() =>
        render(
          <ThemeProvider>
            <ThemeProbe />
          </ThemeProvider>,
        ),
      ).not.toThrow();
      expect(screen.getByText("current: light")).toBeInTheDocument();
    } finally {
      Storage.prototype.getItem = original;
    }
  });

  test("does not throw when localStorage.setItem throws, and the in-memory theme still updates", () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      throw new Error("QuotaExceededError");
    };
    try {
      expect(() => fireEvent.click(screen.getByRole("button", { name: "flip" }))).not.toThrow();
      expect(screen.getByText("current: dark")).toBeInTheDocument();
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
