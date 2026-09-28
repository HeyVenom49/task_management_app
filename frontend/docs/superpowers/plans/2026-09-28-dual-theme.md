# Dual-Theme (Dark Mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dark theme to Docket alongside the existing "Warm Desk" light theme, with a toggle in the topbar, a system-preference default, a persisted choice, and no flash of the wrong theme on reload — plus a bounded audit that removes hardcoded (non-token) colors and fixes any WCAG AA contrast failures, including one already found in the existing light theme.

**Architecture:** Dark values live as a `:root[data-theme="dark"]` override block in the existing `tokens.css`, so every component (already consuming `var(--*)`) needs zero CSS changes. A new `ThemeProvider`/`useTheme` context (mirroring the existing `AuthContext` pattern) sets the `data-theme` attribute and persists to `localStorage`; a tiny inline script in `index.html` applies the stored/system theme before React mounts, to avoid a flash. A new automated contrast-checking test suite (WCAG relative-luminance math, no browser needed) guards every theme-dependent token pairing going forward.

**Tech Stack:** React 19, CSS custom properties, `bun:test` + Testing Library, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-28-dual-theme-design.md`

## Global Constraints

- No changes to the light theme's existing values, typography, layout, or spacing/radius scale — except the one approved WCAG contrast fix (`--text-muted`, light theme only, Task 1).
- No changes to shipped functional behavior — task edit-mode permissions, optimistic concurrency, backend, routing, or information architecture.
- No landing-page-specific guidance from the `design-taste-frontend` skill (heroes, bento grids, GSAP scroll effects, marquees, testimonials) — inapplicable to this product app.
- Dark theme tokens mirror the light theme's token names 1:1, under `:root[data-theme="dark"]` in `tokens.css`.
- Every theme-dependent token pairing must pass WCAG AA (4.5:1 normal text, 3:1 large text/UI) — verified by an automated test (Task 7), not manual inspection.
- Theme choice persists to `localStorage` under the key `docket-theme`; when no stored value exists, default to the OS preference via `prefers-color-scheme`.
- No dialog focus-trap/Escape-to-close or responsive-breakpoint work — still deferred from the prior feature's final review, unchanged by this plan.
- Follow existing conventions exactly: hand-rolled inline SVG icons (no icon library — matches `TextField.tsx`'s existing eye-icon pattern), CSS Modules, `bun:test` + Testing Library, and — for any mocked module — stable `mock()` references with `.mockImplementation()` rather than property reassignment (this codebase's documented Bun 1.3.14 `mock.module` gotcha).

## Review Focus

- Reloading with a stored dark preference must not flash the light theme first — the `index.html` inline script's algorithm must exactly match `ThemeProvider`'s `getInitialTheme` logic, or the flash returns. (Task 3)
- Every existing test that renders `AppShell` (directly, or via `DashboardPage`/`ProjectPage`/`SecuritySettingsPage`) must still pass once `ThemeToggle` is wired in — a missing `ThemeProvider` wrapper crashes the test with "useTheme must be used within a ThemeProvider," not a silent visual issue. (Task 5)
- A hardcoded, non-token color anywhere outside the one already-known `global.css` instance — the grep sweep must run over the whole `src/` tree, not just the known file, or a dark-mode color bug ships silently. (Task 6)
- The light theme's `--text-muted`/`--surface-inset` pairing (measured at 2.14:1, below the 4.5:1 AA floor) needs the approved fix, and no other existing light-theme pairing has the same undiscovered problem — the automated contrast suite must cover every theme-dependent token pairing, not just the ones already hand-checked while writing this plan. (Task 1, Task 7)
- `ThemeProvider`'s `getInitialTheme` must not throw in an environment where `window.matchMedia` is unavailable — a crash here breaks every page in the app, not just dark mode, since `ThemeProvider` wraps the entire tree. (Task 2)

---

## Task 1: Dark theme tokens + light-theme contrast fix

**Files:**
- Modify: `frontend/src/styles/tokens.css`

**Interfaces:**
- Produces: a `:root[data-theme="dark"]` override block with every theme-dependent custom
  property from the light theme, plus a corrected light-theme `--text-muted` value — consumed by
  every component's existing `var(--*)` references (no other file changes needed for the palette
  itself), and by Task 7's contrast test suite (which asserts on these exact hex values).

There is no existing test file for `tokens.css` (it's pure CSS, not testable via `bun:test`
directly) — this task is verified by Task 7's contrast suite (written against these exact values)
and by `bun run build`.

- [ ] **Step 1: Fix the light theme's `--text-muted` contrast failure**

In `frontend/src/styles/tokens.css`, inside the existing `:root { ... }` block, change:

```css
  --text-muted: #a8a29e;
```

to:

```css
  --text-muted: #6b655d;
```

(Measured: the old value against `--surface-inset` was 2.14:1, below the WCAG AA floor of 4.5:1
for normal text. The new value measures 4.88:1. No other property in this block changes.)

- [ ] **Step 2: Add the dark theme override block**

Immediately after the closing `}` of the existing `:root { ... }` block in
`frontend/src/styles/tokens.css`, add:

```css

:root[data-theme="dark"] {
  --bg: #171310;
  --bg-accent: #1f1a14;
  --bg-glow: rgba(45, 212, 191, 0.08);
  --surface: #1c1814;
  --surface-raised: #221d17;
  --surface-inset: #14110d;
  --border: #2e2820;
  --border-strong: #3d352a;
  --text-primary: #f5f1e8;
  --text-secondary: #b8ad9c;
  --text-muted: #8a7e6f;

  --accent: #2dd4bf;
  --accent-hover: #5eead4;
  --accent-soft: rgba(45, 212, 191, 0.16);
  --accent-contrast: #0b1a17;

  --success: #84cc16;
  --warning: #fb923c;
  --danger: #f87171;
  --info: #60a5fa;

  --shadow-soft: 0 1px 0 rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.4);
  --shadow-elevated: 0 12px 40px rgba(0, 0, 0, 0.5);
  --shadow-focus: 0 0 0 3px var(--accent-soft);
}
```

Every other property (`--font-sans`, `--font-mono`, `--text-*` scale, `--space-*` scale,
`--radius-*`, `--ease-*`, `--duration-*`, `--content-max`) is theme-invariant and stays defined
only in `:root` — it's inherited by `[data-theme="dark"]` automatically since it's not overridden.

- [ ] **Step 3: Verify the build still succeeds**

Run: `bun run build`
Expected: zero errors (this step only catches gross syntax mistakes — Task 7 verifies the actual
color values).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles/tokens.css
git commit -m "feat: add dark theme tokens and fix light-theme text-muted contrast"
```

---

## Task 2: ThemeContext (ThemeProvider + useTheme)

**Files:**
- Create: `frontend/src/theme/ThemeContext.tsx`
- Test: `frontend/src/theme/ThemeContext.test.tsx`

**Interfaces:**
- Produces: `type Theme = "light" | "dark"`; `ThemeProvider({ children }): JSX.Element`;
  `useTheme(): { theme: Theme; setTheme: (theme: Theme) => void }` — consumed by `ThemeToggle`
  (Task 4) and wired into `App.tsx` (Task 5).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/theme/ThemeContext.test.tsx`:

```tsx
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
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/theme/ThemeContext.test.tsx`
Expected: FAIL — `./ThemeContext` module not found.

- [ ] **Step 3: Implement**

Create `frontend/src/theme/ThemeContext.tsx`:

```tsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const STORAGE_KEY = "docket-theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialTheme(): Theme {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  if (typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: setThemeState,
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- useTheme is the paired consumer hook for this file's ThemeProvider; matches the established pattern in AuthContext.tsx.
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/theme/ThemeContext.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/theme/ThemeContext.tsx frontend/src/theme/ThemeContext.test.tsx
git commit -m "feat: add ThemeContext with system-preference default and persistence"
```

---

## Task 3: No-flash inline script in index.html

**Files:**
- Modify: `frontend/index.html`

**Interfaces:**
- Consumes: the same `localStorage` key (`docket-theme`) and `prefers-color-scheme` logic as
  `ThemeContext.tsx`'s `getInitialTheme` (Task 2) — the two must stay algorithmically identical.
- Produces: `data-theme` set on `<html>` before React mounts, so the first paint already has the
  correct theme.

This cannot be unit-tested via `bun:test` (it's a raw inline script in an HTML file, not an
importable module) — verified by manual browser check in Task 8, and by keeping this step's logic
a direct, deliberately-duplicated mirror of Task 2's `getInitialTheme` so there's nothing to drift
independently.

- [ ] **Step 1: Add the inline script**

In `frontend/index.html`, add a `<script>` immediately after the `<title>` tag (before the closing
`</head>`), so it runs as early as possible:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Docket</title>
    <script>
      (function () {
        var stored = localStorage.getItem("docket-theme");
        var theme =
          stored === "light" || stored === "dark"
            ? stored
            : window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
              ? "dark"
              : "light";
        document.documentElement.setAttribute("data-theme", theme);
      })();
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Verify the build still succeeds**

Run: `bun run build`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/index.html
git commit -m "feat: apply stored/system theme before React mounts to avoid a flash"
```

---

## Task 4: ThemeToggle component

**Files:**
- Create: `frontend/src/components/ui/ThemeToggle.tsx`, `ThemeToggle.module.css`,
  `ThemeToggle.test.tsx`

**Interfaces:**
- Consumes: `useTheme` from `frontend/src/theme/ThemeContext.tsx` (Task 2).
- Produces: `<ThemeToggle />` — a self-contained icon button, no props — consumed by `AppShell`
  (Task 5).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/ui/ThemeToggle.test.tsx`:

```tsx
import { beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "../../theme/ThemeContext";
import { ThemeToggle } from "./ThemeToggle";

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

describe("ThemeToggle", () => {
  test("toggles the theme and updates the document attribute", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    const button = screen.getByRole("button", { name: "Switch to dark theme" });

    fireEvent.click(button);

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/ui/ThemeToggle.test.tsx`
Expected: FAIL — `./ThemeToggle` module not found.

- [ ] **Step 3: Implement**

Create `frontend/src/components/ui/ThemeToggle.tsx`:

```tsx
import { useTheme } from "../../theme/ThemeContext";
import styles from "./ThemeToggle.module.css";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-pressed={isDark}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 1.2v1.6M8 13.2v1.6M2.6 8H1M15 8h-1.6M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13.5 9.7A6 6 0 1 1 6.3 2.5a5 5 0 0 0 7.2 7.2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

Create `frontend/src/components/ui/ThemeToggle.module.css`:

```css
.toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    background-color var(--duration-micro) var(--ease-out),
    color var(--duration-micro) var(--ease-out);
}

.toggle:hover {
  color: var(--text-primary);
  background: var(--surface-raised);
}

.toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/components/ui/ThemeToggle.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/ThemeToggle.tsx frontend/src/components/ui/ThemeToggle.module.css frontend/src/components/ui/ThemeToggle.test.tsx
git commit -m "feat: add ThemeToggle component"
```

---

## Task 5: Wire ThemeProvider + ThemeToggle into the app

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/AppShell.tsx`
- Modify: `frontend/src/components/AppShell.test.tsx`
- Modify: `frontend/src/pages/DashboardPage.test.tsx`
- Modify: `frontend/src/pages/ProjectPage.test.tsx`
- Modify: `frontend/src/pages/SecuritySettingsPage.test.tsx`

**Interfaces:**
- Consumes: `ThemeProvider` (Task 2), `ThemeToggle` (Task 4).
- Produces: the toggle is live in the running app; every existing test that renders `AppShell`
  (directly or via a page that uses it) still passes.

This task's tests are the *existing* test files above, made to pass again after the change below
— no new test scenarios are added here (the toggle's own behavior is already covered by Task 4).

- [ ] **Step 1: Wrap the app in ThemeProvider**

In `frontend/src/App.tsx`, add the import and wrap `BrowserRouter`:

```tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { ThemeProvider } from "./theme/ThemeContext";
import { AuthProvider } from "./auth/AuthContext";
```

(add the `ThemeProvider` import as the second import line, right after the `react-router` import)

Then change the returned JSX from:

```tsx
    <BrowserRouter>
      <AuthProvider>
        <Routes>
```

to:

```tsx
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
```

and close it correctly at the bottom — change:

```tsx
      </AuthProvider>
    </BrowserRouter>
  );
```

to:

```tsx
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
```

(Every route inside — the whole existing `<Routes>` block — is unchanged, only its indentation
shifts one level deeper because of the new wrapping `<ThemeProvider>`.)

- [ ] **Step 2: Add the toggle to AppShell**

In `frontend/src/components/AppShell.tsx`, add the import:

```tsx
import { ThemeToggle } from "./ui/ThemeToggle";
```

and add `<ThemeToggle />` to the nav, right before the "Log out" button:

```tsx
        <nav className={styles.nav}>
          <Link to="/settings/security">Security</Link>
          <span className={styles.user}>{user?.email}</span>
          <ThemeToggle />
          <Button variant="secondary" onClick={() => void logout()}>
            Log out
          </Button>
        </nav>
```

- [ ] **Step 3: Run the existing test suite to see what broke**

Run: `bun test`
Expected: FAIL — `AppShell.test.tsx`, `DashboardPage.test.tsx`, `ProjectPage.test.tsx`, and
`SecuritySettingsPage.test.tsx` all throw "useTheme must be used within a ThemeProvider," because
`ThemeToggle` now renders inside `AppShell` and none of these test files wrap their renders in a
`ThemeProvider`.

- [ ] **Step 4: Fix AppShell.test.tsx**

In `frontend/src/components/AppShell.test.tsx`, add the import:

```tsx
import { ThemeProvider } from "../theme/ThemeContext";
```

and wrap the existing render call — change:

```tsx
    render(
      <MemoryRouter>
        <AppShell>
          <p>content</p>
        </AppShell>
      </MemoryRouter>,
    );
```

to:

```tsx
    render(
      <ThemeProvider>
        <MemoryRouter>
          <AppShell>
            <p>content</p>
          </AppShell>
        </MemoryRouter>
      </ThemeProvider>,
    );
```

- [ ] **Step 5: Fix DashboardPage.test.tsx**

In `frontend/src/pages/DashboardPage.test.tsx`, add the import:

```tsx
import { ThemeProvider } from "../theme/ThemeContext";
```

and wrap the `renderDashboard` helper's JSX — change:

```tsx
function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}
```

to:

```tsx
function renderDashboard() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </ThemeProvider>,
  );
}
```

- [ ] **Step 6: Fix ProjectPage.test.tsx**

In `frontend/src/pages/ProjectPage.test.tsx`, add the import:

```tsx
import { ThemeProvider } from "../theme/ThemeContext";
```

and wrap the `renderProjectPage` helper's JSX — change:

```tsx
function renderProjectPage() {
  return render(
    <MemoryRouter initialEntries={["/projects/p1/tasks"]}>
      <Routes>
        <Route path="/projects/:id" element={<ProjectPage />}>
          <Route path="tasks" element={<p>tasks tab content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}
```

to:

```tsx
function renderProjectPage() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={["/projects/p1/tasks"]}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectPage />}>
            <Route path="tasks" element={<p>tasks tab content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}
```

- [ ] **Step 7: Fix SecuritySettingsPage.test.tsx**

In `frontend/src/pages/SecuritySettingsPage.test.tsx`, add the import:

```tsx
import { ThemeProvider } from "../theme/ThemeContext";
```

This file has three separate inline `render(...)` calls (no shared helper) — wrap each one.

First occurrence — change:

```tsx
    render(
      <MemoryRouter initialEntries={["/settings/security"]}>
        <Routes>
          <Route path="/settings/security" element={<SecuritySettingsPage />} />
          <Route path="/login" element={<p>login page</p>} />
        </Routes>
      </MemoryRouter>,
    );
```

to:

```tsx
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/settings/security"]}>
          <Routes>
            <Route path="/settings/security" element={<SecuritySettingsPage />} />
            <Route path="/login" element={<p>login page</p>} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    );
```

Second occurrence — change:

```tsx
    render(
      <MemoryRouter initialEntries={["/settings/security"]}>
        <Routes>
          <Route path="/settings/security" element={<SecuritySettingsPage />} />
          <Route path="/login" element={<LoginStateProbe />} />
        </Routes>
      </MemoryRouter>,
    );
```

to:

```tsx
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/settings/security"]}>
          <Routes>
            <Route path="/settings/security" element={<SecuritySettingsPage />} />
            <Route path="/login" element={<LoginStateProbe />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    );
```

Third occurrence — change:

```tsx
    render(
      <MemoryRouter initialEntries={["/settings/security"]}>
        <SecuritySettingsPage />
      </MemoryRouter>,
    );
```

to:

```tsx
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/settings/security"]}>
          <SecuritySettingsPage />
        </MemoryRouter>
      </ThemeProvider>,
    );
```

- [ ] **Step 8: Run the full suite to verify everything passes**

Run: `bun test`
Expected: PASS — 0 fail, across every file (the previously-broken 4 files now pass, nothing else
regresses).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/AppShell.tsx frontend/src/components/AppShell.test.tsx frontend/src/pages/DashboardPage.test.tsx frontend/src/pages/ProjectPage.test.tsx frontend/src/pages/SecuritySettingsPage.test.tsx
git commit -m "feat: wire ThemeProvider and ThemeToggle into the app"
```

---

## Task 6: Hardcoded-color audit

**Files:**
- Modify: `frontend/src/styles/tokens.css`
- Modify: `frontend/src/styles/global.css`
- Modify: any additional `.module.css` file the sweep in Step 3 finds (see decision procedure
  below — cannot be enumerated in advance, this is the audit's job)

**Interfaces:**
- Consumes: nothing new.
- Produces: no hardcoded, non-token color remains in any stylesheet that would silently fail to
  adapt under `data-theme="dark"`.

- [ ] **Step 1: Add the missing token for the one already-known instance**

In `frontend/src/styles/tokens.css`, inside the existing `:root { ... }` block, add a new
property right after `--bg-glow`:

```css
  --bg-glow-secondary: rgba(180, 83, 9, 0.04);
```

(This preserves the exact current light-theme visual — same literal value, now named.)

In the `:root[data-theme="dark"] { ... }` block (added in Task 1), add the dark counterpart right
after `--bg-glow`:

```css
  --bg-glow-secondary: rgba(251, 146, 60, 0.06);
```

- [ ] **Step 2: Fix the known instance in global.css**

In `frontend/src/styles/global.css`, change:

```css
  background:
    radial-gradient(900px 420px at 8% -8%, var(--bg-glow), transparent 55%),
    radial-gradient(700px 360px at 96% 4%, rgba(180, 83, 9, 0.04), transparent 50%),
    linear-gradient(180deg, #f7f5f0 0%, var(--bg) 42%, #efece5 100%);
```

The `rgba(180, 83, 9, 0.04)` literal becomes the new token:

```css
  background:
    radial-gradient(900px 420px at 8% -8%, var(--bg-glow), transparent 55%),
    radial-gradient(700px 360px at 96% 4%, var(--bg-glow-secondary), transparent 50%),
    linear-gradient(180deg, var(--surface-raised) 0%, var(--bg) 42%, var(--surface-inset) 100%);
```

(The two literal hex stops in the `linear-gradient`, `#f7f5f0` and `#efece5`, are also hardcoded —
they happen to equal the light theme's `--surface-raised` and `--surface-inset` exactly. Replacing
them with those tokens is a zero-visual-change fix in light mode, and makes the gradient adapt
correctly in dark mode instead of keeping light-mode paper tones on a dark canvas.)

- [ ] **Step 3: Sweep the rest of the codebase**

Run:

```bash
grep -rn "#[0-9a-fA-F]\{3,8\}\|rgba\?(" frontend/src --include="*.css" | grep -v "var(--"
```

This lists every literal color in every stylesheet that isn't already a `var(--*)` reference.
`global.css` should now show zero hits (fixed in Step 2). For every other hit:

- If it's a color that already has an equivalent token (e.g. a `#1c1917`-style literal that
  matches an existing `--text-primary`), replace the literal with `var(--the-matching-token)`.
- If it's a real, reused value with no existing token (e.g. a component-specific tint), promote it
  to a new token in `tokens.css` (both `:root` and `:root[data-theme="dark"]`, following the
  naming pattern of nearby tokens), then reference the new token from the component's CSS Module.
  Choose the dark-mode counterpart using the same reasoning as Task 1/this task's Step 1 — a
  brighter/more-saturated variant for accent-like colors, a darker one for background-like colors.
- If it's genuinely theme-invariant (this should be rare — e.g. `#ffffff`/`#000000` used as a
  fixed overlay scrim color, not as page content), leave it, but add a one-line CSS comment above
  it explaining why it doesn't need a token (e.g. `/* fixed overlay scrim, intentionally
  theme-invariant */`).

Do not touch `.tsx`/`.ts` files in this step — inline style props and JS-computed colors are out
of scope; this audit is CSS-file-only, matching where the token system lives.

- [ ] **Step 4: Re-run the sweep to confirm it's clean**

Run the same grep command from Step 3 again.
Expected: every remaining hit is either inside a `var(--*)` reference (filtered out by the
command already) or has the theme-invariant comment from Step 3 directly above it.

- [ ] **Step 5: Run the full suite and build**

Run: `bun test && bun run build && bun run lint`
Expected: all three pass clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/styles/tokens.css frontend/src/styles/global.css
# plus any other files Step 3 modified
git commit -m "fix: remove hardcoded colors so the palette adapts correctly under dark mode"
```

---

## Task 7: Automated contrast test suite

**Files:**
- Create: `frontend/src/utils/contrast.ts`
- Test: `frontend/src/utils/contrast.test.ts`

**Interfaces:**
- Produces: `contrastRatio(hexA: string, hexB: string): number` (WCAG relative-luminance
  contrast ratio, order-independent) — used by this task's own test file to assert every
  theme-dependent token pairing meets WCAG AA. No other file imports this function; it exists to
  give this project a permanent, automated guard against future contrast regressions.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/contrast.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { contrastRatio } from "./contrast";

describe("contrastRatio", () => {
  test("black on white is the maximum ratio", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  test("identical colors have a ratio of 1", () => {
    expect(contrastRatio("#171310", "#171310")).toBeCloseTo(1, 5);
  });

  test("is order-independent", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(contrastRatio("#ffffff", "#000000"), 5);
  });
});

const AA_NORMAL_TEXT = 4.5;
const AA_LARGE_TEXT = 3;

describe("light theme token contrast (WCAG AA)", () => {
  test("text-primary on bg", () => {
    expect(contrastRatio("#1c1917", "#f3f1ec")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  test("text-secondary on bg", () => {
    expect(contrastRatio("#57534e", "#f3f1ec")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  test("text-muted on surface-inset (the lowest-contrast pairing in the system)", () => {
    expect(contrastRatio("#6b655d", "#efece5")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  test("accent-contrast on accent (button fill)", () => {
    expect(contrastRatio("#ffffff", "#0f766e")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  test("accent as a text/link color on bg", () => {
    expect(contrastRatio("#0f766e", "#f3f1ec")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  test("danger on bg", () => {
    expect(contrastRatio("#b91c1c", "#f3f1ec")).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
  });
  test("warning on bg", () => {
    expect(contrastRatio("#b45309", "#f3f1ec")).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
  });
  test("success on bg", () => {
    expect(contrastRatio("#3f6212", "#f3f1ec")).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
  });
  test("info on bg", () => {
    expect(contrastRatio("#1d4ed8", "#f3f1ec")).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
  });
});

describe("dark theme token contrast (WCAG AA)", () => {
  test("text-primary on bg", () => {
    expect(contrastRatio("#f5f1e8", "#171310")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  test("text-secondary on bg", () => {
    expect(contrastRatio("#b8ad9c", "#171310")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  test("text-muted on surface-inset (the lowest-contrast pairing in the system)", () => {
    expect(contrastRatio("#8a7e6f", "#14110d")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  test("accent-contrast on accent (button fill)", () => {
    expect(contrastRatio("#0b1a17", "#2dd4bf")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  test("accent as a text/link color on bg", () => {
    expect(contrastRatio("#2dd4bf", "#171310")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  test("danger on bg", () => {
    expect(contrastRatio("#f87171", "#171310")).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
  });
  test("warning on bg", () => {
    expect(contrastRatio("#fb923c", "#171310")).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
  });
  test("success on bg", () => {
    expect(contrastRatio("#84cc16", "#171310")).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
  });
  test("info on bg", () => {
    expect(contrastRatio("#60a5fa", "#171310")).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/utils/contrast.test.ts`
Expected: FAIL — `./contrast` module not found.

- [ ] **Step 3: Implement**

Create `frontend/src/utils/contrast.ts`:

```ts
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

function channelLuminance(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

/** WCAG 2.x contrast ratio between two colors, order-independent. Range: 1 (no contrast) to 21 (black/white). */
export function contrastRatio(hexA: string, hexB: string): number {
  const luminanceA = relativeLuminance(hexA);
  const luminanceB = relativeLuminance(hexB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/utils/contrast.test.ts`
Expected: PASS (13 tests). If any token-pairing test fails, that means either this plan's stated
hex value doesn't match what's actually in `tokens.css` (fix `tokens.css` to match Task 1/6, or
fix this test to match a deliberate later change — check `git log` on `tokens.css` for which is
true) or a real contrast problem was missed during planning — in that case, adjust the failing
token's value in `tokens.css` (following the same brighten/darken-for-contrast reasoning as
Task 1), re-run this suite, and re-run `bun test` for the whole project to confirm nothing else
broke.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/contrast.ts frontend/src/utils/contrast.test.ts
git commit -m "test: add automated WCAG contrast checks for both themes"
```

---

## Task 8: Final verification

**Files:**
- Modify: `frontend/docs/PROJECT_MAP.md`

**Interfaces:**
- Consumes: nothing new — this task verifies everything built in Tasks 1–7 together and records
  the new theming system in the project map, per this repo's own `CLAUDE.md` §1G.

- [ ] **Step 1: Run the full automated suite**

Run: `bun test && bun run build && bun run lint`
Expected: all three pass clean — 0 test failures, 0 build errors, 0 lint errors.

- [ ] **Step 2: Manual browser verification**

Run: `bun run dev`, open the app in a browser.

Walk through, in **both** light and dark mode (use the new toggle to switch):
- Dashboard (empty state, project list, create-project form)
- A project's Tasks tab (list, filters, TaskDrawer open for create and edit)
- Members tab (invite form as owner, member list)
- Settings tab (edit info, delete-project confirm dialog)
- Security settings page
- The auth screens (login, register) — confirm they inherit the theme correctly since
  `ThemeProvider` wraps the whole app in `App.tsx`, including routes outside `AppShell`

Also specifically verify the no-flash behavior: switch to dark mode, hard-reload the page (not a
soft navigation) — the page should never show a flash of the light theme before settling on dark.

If anything reads as broken, low-contrast, or shows a leftover light-mode-only color, fix it
directly (it's a bug in this plan's own output, not a new task) and re-run Step 1.

- [ ] **Step 3: Sweep for leftover TODO/FIXME markers**

Run: `grep -rn "TODO\|FIXME" frontend/src`
Expected: no new matches introduced by this plan's work (pre-existing matches unrelated to this
plan, if any, are out of scope — investigate and resolve only ones this plan's tasks introduced).

- [ ] **Step 4: Update PROJECT_MAP.md**

Read `frontend/docs/PROJECT_MAP.md` first, then update it to record:
- A new "Theming" note (wherever the map's existing structure best fits it — likely near the
  Design Direction/Decisions sections) describing: dual-theme system added, dark as a togglable
  alternative to the existing light "Warm Desk" theme, default follows OS preference, persisted to
  `localStorage`, mechanism is a `data-theme` attribute + CSS custom-property overrides in
  `tokens.css`.
- The light-theme `--text-muted` contrast fix (a pre-existing accessibility bug, now fixed) as a
  completed-work entry, so it's not rediscovered as a mystery later.
- `frontend/src/utils/contrast.ts` added to whatever section lists shared utilities/components.

- [ ] **Step 5: Commit**

```bash
git add frontend/docs/PROJECT_MAP.md
git commit -m "docs: update PROJECT_MAP for the dual-theme system"
```
