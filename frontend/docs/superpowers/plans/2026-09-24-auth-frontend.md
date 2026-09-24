# Docket Auth Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete authentication frontend for Docket (register, verify-email, login, forgot/reset password, change password, logout, silent session refresh, route guards, design tokens, and a minimal authenticated placeholder dashboard) against the existing, unmodified Express backend.

**Architecture:** A React 19 + Vite SPA using `react-router` for routing, a thin typed `apiFetch` wrapper over the native `fetch` for all backend calls, React Context for session state (access token kept in memory only, never persisted), one shared `useForm` hook driving all forms, and plain CSS Modules against a small custom-property token system — no Tailwind, no react-hook-form, no React Query.

**Tech Stack:** React 19, TypeScript, Vite, react-router, CSS Modules, `bun test` + `@testing-library/react` + `@happy-dom/global-registrator` for tests. Bun is dev tooling only — all application code stays Node-compatible (no `Bun.*` APIs).

**Spec:** `frontend/docs/superpowers/specs/2026-09-24-auth-frontend-design.md` (read this first — it has the full rationale). Backend contracts are verified in `frontend/docs/PROJECT_MAP.md` §4–§5.

## Global Constraints

- Bun is dev tooling only (`bun install`, `bun run dev`, `bun test`, `bun run build`); no `Bun.*` API anywhere in `src/`.
- No `any` anywhere.
- `verbatimModuleSyntax: true` is set in `tsconfig.app.json` — every type-only import must use `import type { X } from "..."`.
- `erasableSyntaxOnly: true` is set — no TypeScript `enum`, no parameter-property shorthand in classes, no namespaces. Use plain string-literal union types instead of enums.
- `noUnusedLocals`/`noUnusedParameters: true` — no unused identifiers; prefix intentionally-unused params with `_`.
- No Tailwind, no CSS-in-JS runtime — CSS Modules only, consuming the custom-property tokens from `src/styles/tokens.css`.
- No `react-hook-form`, no `@tanstack/react-query` — the shared `useForm` hook and `apiFetch`/Context are the only data/form layers.
- The access token lives in a module-scoped variable inside `src/api/client.ts` only. Never write it to `localStorage`/`sessionStorage`, never put it in React state.
- Every `fetch` call goes through `apiFetch` (`src/api/client.ts`) with `credentials: "include"`. Never send an `X-Client: mobile` header — the refresh token must stay in the httpOnly cookie only.
- API base URL: `import.meta.env.VITE_API_URL`, default `"http://localhost:4000/api/v1"`.
- Backend response shapes are exact and verified — do not add fields that don't exist: `register` → `{user}` only (no tokens, no auto-login); `login` → `{user, accessToken}`; `refresh` → `{accessToken}` only (no user); `me` → `{user}`; every other auth endpoint → `{message}`.
- Design tokens (colors, spacing, radius, motion durations) must match the spec's exact values — they are restated in Task 1 below.
- Do not touch anything under `backend/`.

---

## File Structure

```
frontend/
  .env.example                          new — VITE_API_URL sample
  .gitignore                            modified — add `.env`
  bunfig.toml                           new — bun test preload config
  tsconfig.app.json                     modified — add "bun" to compilerOptions.types
  src/
    vite-env.d.ts                       new — augments ImportMetaEnv with VITE_API_URL
    styles/
      tokens.css                        new — design tokens (colors/type/spacing/radius/motion)
      global.css                        new — resets, base typography, reduced-motion clamp
    types/
      auth.ts                           new — PublicUser + all auth request/response types
    api/
      client.ts                         new — apiFetch, ApiError, token storage, 401-retry
      auth.ts                           new — one typed function per auth endpoint
    hooks/
      useForm.ts                        new — shared controlled-form state/validation/submit hook
      useTransitionNavigate.ts          new — navigate() wrapped in View Transitions when available
    auth/
      AuthContext.tsx                   new — AuthProvider, useAuth(), boot/login/logout/session-expiry
      RequireAuth.tsx                   new — route guard, redirects unauthenticated → /login
      RequireGuest.tsx                  new — route guard, redirects authenticated → /
    components/
      ui/
        Button.tsx / .module.css        new — primary/secondary/text variants, loading cross-fade
        Spinner.tsx / .module.css       new — inline + full-page spinner
        TextField.tsx / .module.css     new — label/error/focus ring/password show-hide toggle
        FormBanner.tsx / .module.css    new — error/success/info banner, animated reveal
        SuccessCheck.tsx / .module.css  new — stroke-draw checkmark for pure-confirmation screens
      AuthLayout.tsx / .module.css      new — shared centered-card shell for guest screens
      AppShell.tsx / .module.css        new — top bar shell for authenticated screens
    pages/
      RegisterPage.tsx                  new
      VerifyEmailPage.tsx               new
      LoginPage.tsx                     new
      ForgotPasswordPage.tsx            new
      ResetPasswordPage.tsx             new
      DashboardPage.tsx / .module.css   new
      SecuritySettingsPage.tsx          new
      NotFoundPage.tsx                  new
    App.tsx                             rewritten — router + route guards wiring
    main.tsx                            modified — import global.css/tokens.css
    App.css                             deleted — scaffold leftover
    assets/react.svg, vite.svg, hero.png deleted — scaffold leftovers
```

Every `.tsx`/`.ts` file above with meaningful logic gets a co-located `*.test.ts(x)` file (named per-task below).

---

### Task 1: Project setup — scaffold cleanup, test infra, design tokens

**Files:**
- Delete: `src/App.css`, `src/assets/react.svg`, `src/assets/vite.svg`, `src/assets/hero.png`
- Modify: `package.json` (deps), `tsconfig.app.json`, `.gitignore`, `src/main.tsx`
- Create: `bunfig.toml`, `test/setup.ts`, `.env.example`, `src/vite-env.d.ts`, `src/styles/tokens.css`, `src/styles/global.css`, `src/smoke.test.tsx`

**Interfaces:**
- Produces: a working `bun test` command with DOM support, and the CSS custom properties every later component references (`--bg`, `--surface`, `--border`, `--border-strong`, `--text-primary`, `--text-secondary`, `--text-muted`, `--accent`, `--accent-hover`, `--accent-contrast`, `--success`, `--warning`, `--danger`, `--info`, `--font-sans`, `--font-mono`, `--text-xs/sm/base/md/lg/xl`, `--space-1/2/3/4/6/8/12/16`, `--radius-sm/md`, `--shadow-elevated`, `--ease-out`, `--ease-in-out`, `--duration-micro/reveal/page`).

- [ ] **Step 1: Write the smoke test proving RTL + happy-dom will work once configured**

Create `src/smoke.test.tsx`:
```tsx
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";

describe("test infrastructure", () => {
  test("renders into a real DOM", () => {
    render(<div>docket</div>);
    expect(screen.getByText("docket")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun test src/smoke.test.tsx`
Expected: FAIL — `@testing-library/react` is not installed and there is no DOM global (`document is not defined` or a module-resolution error).

- [ ] **Step 3: Install dependencies**

```bash
bun add react-router
bun add -d @types/bun @testing-library/react @testing-library/jest-dom @happy-dom/global-registrator
```

- [ ] **Step 4: Add the test preload config**

Create `bunfig.toml`:
```toml
[test]
preload = ["./test/setup.ts"]
```

Create `test/setup.ts`:
```ts
import { afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

const { cleanup } = await import("@testing-library/react");
const matchers = await import("@testing-library/jest-dom/matchers");
const { expect } = await import("bun:test");

expect.extend(matchers);
afterEach(cleanup);
```

- [ ] **Step 5: Let TypeScript see Bun's globals**

In `tsconfig.app.json`, change:
```json
"types": ["vite/client"],
```
to:
```json
"types": ["vite/client", "bun"],
```

- [ ] **Step 6: Run the smoke test again and confirm it passes**

Run: `bun test src/smoke.test.tsx`
Expected: PASS

- [ ] **Step 7: Remove the scaffold and add design tokens**

Delete `src/App.css`, `src/assets/react.svg`, `src/assets/vite.svg`, `src/assets/hero.png`.

Create `src/styles/tokens.css`:
```css
:root {
  --bg: #FAFAF9;
  --surface: #FFFFFF;
  --border: #E4E4E1;
  --border-strong: #CFCFCA;
  --text-primary: #17171A;
  --text-secondary: #5B5B60;
  --text-muted: #8A8A90;

  --accent: #9A2B1F;
  --accent-hover: #7F2318;
  --accent-contrast: #FFFFFF;

  --success: #15803D;
  --warning: #B45309;
  --danger: #DC2626;
  --info: #3654A6;

  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;

  --text-xs: 12px;
  --text-sm: 13px;
  --text-base: 14px;
  --text-md: 15px;
  --text-lg: 18px;
  --text-xl: 22px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;

  --radius-sm: 6px;
  --radius-md: 10px;

  --shadow-elevated: 0 4px 16px rgba(23, 23, 26, 0.08);

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);

  --duration-micro: 120ms;
  --duration-reveal: 180ms;
  --duration-page: 220ms;
}
```

Create `src/styles/global.css`:
```css
* {
  box-sizing: border-box;
}

html, body, #root {
  height: 100%;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3 {
  line-height: 1.2;
  margin: 0;
}

button, input {
  font-family: inherit;
}

a {
  color: var(--accent);
}

::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 220ms;
  animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
```

Modify `src/main.tsx` to:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/global.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

(`src/App.tsx` is rewritten in Task 11 — it will fail to compile between now and then only if you run `bun run build`; running `bun run dev`/`bun test` is unaffected. This is expected and resolved by Task 11.)

- [ ] **Step 8: Env config**

Create `.env.example`:
```
VITE_API_URL=http://localhost:4000/api/v1
```

Create `src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}
```

Add `.env` to `.gitignore` (append to the existing file, don't remove anything):
```
.env
```

- [ ] **Step 9: Commit**

```bash
git add package.json bun.lock tsconfig.app.json bunfig.toml test/setup.ts .gitignore .env.example \
  src/vite-env.d.ts src/styles/tokens.css src/styles/global.css src/main.tsx src/smoke.test.tsx
git rm src/App.css src/assets/react.svg src/assets/vite.svg src/assets/hero.png
git commit -m "chore: set up test infra and design tokens for Docket auth frontend"
```

---

### Task 2: API client (`apiFetch`, `ApiError`, session-expiry hook)

**Files:**
- Create: `src/api/client.ts`, `src/api/client.test.ts`

**Interfaces:**
- Consumes: `import.meta.env.VITE_API_URL` (Task 1).
- Produces (used by every later task that talks to the backend):
  - `class ApiError extends Error { status: number; fieldErrors?: FieldErrors }`
  - `type FieldErrors = Record<string, string[] | undefined>`
  - `function apiFetch<T>(path: string, options?: { method?: string; body?: unknown }): Promise<T>`
  - `function getAccessToken(): string | null`
  - `function setAccessToken(token: string | null): void`
  - `function setSessionExpiredHandler(handler: (() => void) | null): void`

- [ ] **Step 1: Write the failing tests**

Create `src/api/client.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { apiFetch, ApiError, getAccessToken, setAccessToken, setSessionExpiredHandler } from "./client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  setAccessToken(null);
  setSessionExpiredHandler(null);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("apiFetch", () => {
  test("returns parsed JSON on a 2xx response", async () => {
    globalThis.fetch = mock(async () => jsonResponse(200, { message: "ok" })) as unknown as typeof fetch;
    const result = await apiFetch<{ message: string }>("/auth/logout", { method: "POST" });
    expect(result.message).toBe("ok");
  });

  test("attaches the Authorization header when a token is set", async () => {
    setAccessToken("token-123");
    const fetchMock = mock(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer token-123");
      return jsonResponse(200, { user: {} });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await apiFetch("/auth/me");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("throws ApiError with fieldErrors on a 400 validation response", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse(400, { message: "Validation failed", errors: { email: ["Invalid email"] } }),
    ) as unknown as typeof fetch;

    await expect(apiFetch("/auth/register", { method: "POST", body: {} })).rejects.toMatchObject({
      status: 400,
      message: "Validation failed",
      fieldErrors: { email: ["Invalid email"] },
    });
  });

  test("throws a generic ApiError when fetch itself rejects (network failure)", async () => {
    globalThis.fetch = mock(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    await expect(apiFetch("/auth/me")).rejects.toMatchObject({
      status: 0,
      message: "Something went wrong. Please try again.",
    });
  });

  test("retries once after a silent refresh on a 401, then succeeds", async () => {
    setAccessToken("expired-token");
    const responses = [
      jsonResponse(401, { message: "Unauthorized" }), // original call
      jsonResponse(200, { accessToken: "new-token" }), // refresh
      jsonResponse(200, { user: { id: "1" } }), // retried original call
    ];
    globalThis.fetch = mock(async () => responses.shift()!) as unknown as typeof fetch;

    const result = await apiFetch<{ user: { id: string } }>("/auth/me");
    expect(result.user.id).toBe("1");
    expect(getAccessToken()).toBe("new-token");
  });

  test("calls the session-expired handler and rethrows when the refresh-after-401 also fails", async () => {
    setAccessToken("expired-token");
    let called = false;
    setSessionExpiredHandler(() => {
      called = true;
    });
    const responses = [
      jsonResponse(401, { message: "Unauthorized" }), // original call
      jsonResponse(401, { message: "Invalid refresh token" }), // refresh fails
    ];
    globalThis.fetch = mock(async () => responses.shift()!) as unknown as typeof fetch;

    await expect(apiFetch("/auth/me")).rejects.toBeInstanceOf(ApiError);
    expect(called).toBe(true);
    expect(getAccessToken()).toBeNull();
  });

  test("never retries a 401 from /auth/login itself", async () => {
    const fetchMock = mock(async () => jsonResponse(401, { message: "Invalid email or password" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(apiFetch("/auth/login", { method: "POST", body: {} })).rejects.toMatchObject({
      status: 401,
      message: "Invalid email or password",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/api/client.test.ts`
Expected: FAIL — `./client` does not exist.

- [ ] **Step 3: Implement `src/api/client.ts`**

```ts
export type FieldErrors = Record<string, string[] | undefined>;

export class ApiError extends Error {
  status: number;
  fieldErrors?: FieldErrors;

  constructor(status: number, message: string, fieldErrors?: FieldErrors) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1";
const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";
const NO_RETRY_PATHS = ["/auth/login", "/auth/register", "/auth/refresh"];

let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

type ApiFetchOptions = {
  method?: string;
  body?: unknown;
};

type ErrorBody = {
  message?: string;
  errors?: FieldErrors;
};

async function rawRequest<T>(path: string, options: ApiFetchOptions, token: string | null): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, GENERIC_ERROR_MESSAGE);
  }

  const text = await response.text();
  const data = (text ? JSON.parse(text) : {}) as ErrorBody & Record<string, unknown>;

  if (!response.ok) {
    throw new ApiError(response.status, data.message ?? GENERIC_ERROR_MESSAGE, data.errors);
  }

  return data as T;
}

async function refreshAccessToken(): Promise<boolean> {
  try {
    const data = await rawRequest<{ accessToken: string }>("/auth/refresh", { method: "POST" }, null);
    accessToken = data.accessToken;
    return true;
  } catch {
    accessToken = null;
    return false;
  }
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, options, accessToken);
  } catch (err) {
    const canRetry =
      err instanceof ApiError &&
      err.status === 401 &&
      accessToken !== null &&
      !NO_RETRY_PATHS.includes(path);

    if (!canRetry) {
      throw err;
    }

    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      onSessionExpired?.();
      throw err;
    }
    return rawRequest<T>(path, options, accessToken);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/api/client.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/api/client.ts src/api/client.test.ts
git commit -m "feat: add typed apiFetch client with session-expiry-aware 401 retry"
```

---

### Task 3: Auth types + API layer

**Files:**
- Create: `src/types/auth.ts`, `src/api/auth.ts`, `src/api/auth.test.ts`

**Interfaces:**
- Consumes: `apiFetch`, `ApiError`, `setAccessToken` from Task 2 (`src/api/client.ts`).
- Produces:
  - Types: `PublicUser`, `RegisterInput`, `LoginInput`, `ChangePasswordInput`, `RegisterResponse`, `LoginResponse`, `MeResponse`, `RefreshResponse`, `MessageResponse`.
  - Functions (all in `src/api/auth.ts`): `register(input: RegisterInput): Promise<RegisterResponse>`, `login(input: LoginInput): Promise<LoginResponse>`, `me(): Promise<MeResponse>`, `refresh(): Promise<RefreshResponse>`, `logout(): Promise<MessageResponse>`, `verifyEmail(token: string): Promise<MessageResponse>`, `resendVerification(email: string): Promise<MessageResponse>`, `changePassword(input: ChangePasswordInput): Promise<MessageResponse>`, `forgotPassword(email: string): Promise<MessageResponse>`, `resetPassword(token: string, newPassword: string): Promise<MessageResponse>`.

- [ ] **Step 1: Write `src/types/auth.ts` (no test needed — types only)**

```ts
export type UserRole = "USER" | "ADMIN";
export type UserStatus = "ACTIVE" | "INACTIVE";

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
};

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

export type RegisterResponse = { user: PublicUser };
export type LoginResponse = { user: PublicUser; accessToken: string };
export type MeResponse = { user: PublicUser };
export type RefreshResponse = { accessToken: string };
export type MessageResponse = { message: string };
```

- [ ] **Step 2: Write the failing tests for the API layer**

Create `src/api/auth.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as authApi from "./auth";
import { getAccessToken, setAccessToken } from "./client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  setAccessToken(null);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("auth API layer", () => {
  test("register does not set an access token (backend returns no tokens)", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse(201, { user: { id: "1", name: "Ana", email: "ana@example.com", role: "USER", status: "INACTIVE", createdAt: "2026-01-01T00:00:00Z" } }),
    ) as unknown as typeof fetch;

    const result = await authApi.register({ name: "Ana", email: "ana@example.com", password: "password123" });
    expect(result.user.email).toBe("ana@example.com");
    expect(getAccessToken()).toBeNull();
  });

  test("login stores the returned access token", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse(200, {
        user: { id: "1", name: "Ana", email: "ana@example.com", role: "USER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z" },
        accessToken: "abc123",
      }),
    ) as unknown as typeof fetch;

    await authApi.login({ email: "ana@example.com", password: "password123" });
    expect(getAccessToken()).toBe("abc123");
  });

  test("refresh stores the new access token and does not require a user in the response", async () => {
    globalThis.fetch = mock(async () => jsonResponse(200, { accessToken: "new-token" })) as unknown as typeof fetch;

    const result = await authApi.refresh();
    expect(result.accessToken).toBe("new-token");
    expect(getAccessToken()).toBe("new-token");
  });

  test("logout clears the local access token", async () => {
    setAccessToken("abc123");
    globalThis.fetch = mock(async () => jsonResponse(200, { message: "Logged out" })) as unknown as typeof fetch;

    await authApi.logout();
    expect(getAccessToken()).toBeNull();
  });

  test("changePassword clears the local access token (backend revokes the session)", async () => {
    setAccessToken("abc123");
    globalThis.fetch = mock(async () =>
      jsonResponse(200, { message: "Password updated. Please log in again." }),
    ) as unknown as typeof fetch;

    await authApi.changePassword({ currentPassword: "old", newPassword: "newpassword1" });
    expect(getAccessToken()).toBeNull();
  });

  test("verifyEmail URL-encodes the token into the query string", async () => {
    const fetchMock = mock(async (url: string) => {
      expect(url).toContain("/auth/verify-email?token=abc%20123");
      return jsonResponse(200, { message: "Email verified successfully" });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await authApi.verifyEmail("abc 123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test src/api/auth.test.ts`
Expected: FAIL — `./auth` does not exist.

- [ ] **Step 4: Implement `src/api/auth.ts`**

```ts
import { apiFetch, setAccessToken } from "./client";
import type {
  ChangePasswordInput,
  LoginInput,
  LoginResponse,
  MeResponse,
  MessageResponse,
  RefreshResponse,
  RegisterInput,
  RegisterResponse,
} from "../types/auth";

export function register(input: RegisterInput): Promise<RegisterResponse> {
  return apiFetch<RegisterResponse>("/auth/register", { method: "POST", body: input });
}

export async function login(input: LoginInput): Promise<LoginResponse> {
  const result = await apiFetch<LoginResponse>("/auth/login", { method: "POST", body: input });
  setAccessToken(result.accessToken);
  return result;
}

export function me(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/auth/me");
}

export async function refresh(): Promise<RefreshResponse> {
  const result = await apiFetch<RefreshResponse>("/auth/refresh", { method: "POST" });
  setAccessToken(result.accessToken);
  return result;
}

export async function logout(): Promise<MessageResponse> {
  const result = await apiFetch<MessageResponse>("/auth/logout", { method: "POST" });
  setAccessToken(null);
  return result;
}

export function verifyEmail(token: string): Promise<MessageResponse> {
  return apiFetch<MessageResponse>(`/auth/verify-email?token=${encodeURIComponent(token)}`);
}

export function resendVerification(email: string): Promise<MessageResponse> {
  return apiFetch<MessageResponse>("/auth/resend-verification", { method: "POST", body: { email } });
}

export async function changePassword(input: ChangePasswordInput): Promise<MessageResponse> {
  const result = await apiFetch<MessageResponse>("/auth/change-password", { method: "POST", body: input });
  setAccessToken(null);
  return result;
}

export function forgotPassword(email: string): Promise<MessageResponse> {
  return apiFetch<MessageResponse>("/auth/forgot-password", { method: "POST", body: { email } });
}

export async function resetPassword(token: string, newPassword: string): Promise<MessageResponse> {
  const result = await apiFetch<MessageResponse>("/auth/reset-password", {
    method: "POST",
    body: { token, newPassword },
  });
  setAccessToken(null);
  return result;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/api/auth.test.ts`
Expected: PASS (all 6 tests)

- [ ] **Step 6: Commit**

```bash
git add src/types/auth.ts src/api/auth.ts src/api/auth.test.ts
git commit -m "feat: add typed auth API layer over apiFetch"
```

---

### Task 4: `useForm` hook

**Files:**
- Create: `src/hooks/useForm.ts`, `src/hooks/useForm.test.tsx`

**Interfaces:**
- Consumes: `ApiError` from `src/api/client.ts` (Task 2).
- Produces:
```ts
type Validators<T> = Partial<{ [K in keyof T]: (value: T[K], values: T) => string | undefined }>;

function useForm<T extends Record<string, string>>(options: {
  initialValues: T;
  validators?: Validators<T>;
  onSubmit: (values: T) => Promise<void>;
}): {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  formError: string | null;
  isSubmitting: boolean;
  handleChange: (name: keyof T, value: T[keyof T]) => void;
  handleBlur: (name: keyof T) => void;
  handleSubmit: (event: FormEvent) => void;
};
```
  Every page task (12–17) consumes this exact shape.

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/useForm.test.tsx` (a tiny harness component drives the hook, since hooks can't be called outside a component):
```tsx
import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "./useForm";
import { ApiError } from "../api/client";

type Values = { email: string; password: string };

function TestForm({ onSubmit }: { onSubmit: (values: Values) => Promise<void> }) {
  const { values, errors, formError, isSubmitting, handleChange, handleBlur, handleSubmit } = useForm<Values>({
    initialValues: { email: "", password: "" },
    validators: {
      email: (v) => (v.includes("@") ? undefined : "Enter a valid email address"),
    },
    onSubmit,
  });

  return (
    <form onSubmit={handleSubmit}>
      {formError && <p role="alert">{formError}</p>}
      <input
        aria-label="email"
        value={values.email}
        onChange={(e) => handleChange("email", e.target.value)}
        onBlur={() => handleBlur("email")}
      />
      {errors.email && <span>{errors.email}</span>}
      <button type="submit" disabled={isSubmitting}>
        Submit
      </button>
    </form>
  );
}

describe("useForm", () => {
  test("shows a field validation error on blur without calling onSubmit", () => {
    const onSubmit = mock(async () => {});
    render(<TestForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("email"), { target: { value: "not-an-email" } });
    fireEvent.blur(screen.getByLabelText("email"));

    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("blocks submit and surfaces the field error when validation fails on submit", () => {
    const onSubmit = mock(async () => {});
    render(<TestForm onSubmit={onSubmit} />);

    fireEvent.click(screen.getByText("Submit"));

    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("calls onSubmit with current values when validation passes", async () => {
    const onSubmit = mock(async () => {});
    render(<TestForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("email"), { target: { value: "ana@example.com" } });
    fireEvent.click(screen.getByText("Submit"));

    await Promise.resolve();
    expect(onSubmit).toHaveBeenCalledWith({ email: "ana@example.com", password: "" });
  });

  test("merges server fieldErrors and shows the top-level message on an ApiError", async () => {
    const onSubmit = mock(async () => {
      throw new ApiError(400, "Validation failed", { email: ["Email already registered"] });
    });
    render(<TestForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("email"), { target: { value: "ana@example.com" } });
    fireEvent.click(screen.getByText("Submit"));

    await screen.findByText("Email already registered");
    expect(screen.getByRole("alert")).toHaveTextContent("Validation failed");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/hooks/useForm.test.tsx`
Expected: FAIL — `./useForm` does not exist.

- [ ] **Step 3: Implement `src/hooks/useForm.ts`**

```ts
import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "../api/client";

type Validators<T> = Partial<{
  [K in keyof T]: (value: T[K], values: T) => string | undefined;
}>;

type UseFormOptions<T> = {
  initialValues: T;
  validators?: Validators<T>;
  onSubmit: (values: T) => Promise<void>;
};

type FieldErrors<T> = Partial<Record<keyof T, string>>;

export function useForm<T extends Record<string, string>>({
  initialValues,
  validators,
  onSubmit,
}: UseFormOptions<T>) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<FieldErrors<T>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validateField(name: keyof T, value: T[keyof T]): string | undefined {
    return validators?.[name]?.(value, values);
  }

  function handleChange(name: keyof T, value: T[keyof T]): void {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  function handleBlur(name: keyof T): void {
    setErrors((prev) => ({ ...prev, [name]: validateField(name, values[name]) }));
  }

  function validateAll(): boolean {
    if (!validators) return true;
    const nextErrors: FieldErrors<T> = {};
    let hasError = false;
    for (const key of Object.keys(validators) as (keyof T)[]) {
      const error = validateField(key, values[key]);
      if (error) {
        nextErrors[key] = error;
        hasError = true;
      }
    }
    setErrors(nextErrors);
    return !hasError;
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setFormError(null);
    if (!validateAll()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fieldErrors) {
          const nextErrors: FieldErrors<T> = {};
          for (const [field, messages] of Object.entries(err.fieldErrors)) {
            if (messages?.[0]) {
              nextErrors[field as keyof T] = messages[0];
            }
          }
          setErrors((prev) => ({ ...prev, ...nextErrors }));
        }
        setFormError(err.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return { values, errors, formError, isSubmitting, handleChange, handleBlur, handleSubmit };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/hooks/useForm.test.tsx`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useForm.ts src/hooks/useForm.test.tsx
git commit -m "feat: add shared useForm hook for controlled forms"
```

---

### Task 5: `Button` + `Spinner` components

**Files:**
- Create: `src/components/ui/Spinner.tsx`, `src/components/ui/Spinner.module.css`, `src/components/ui/Button.tsx`, `src/components/ui/Button.module.css`, `src/components/ui/Button.test.tsx`

**Interfaces:**
- Produces: `<Spinner label?: string; fullPage?: boolean; className?: string />`, `<Button variant?: "primary"|"secondary"|"text"; isLoading?: boolean; ...ButtonHTMLAttributes<HTMLButtonElement> />`. Consumed by every page task and by `AppShell`/`RequireAuth`/`RequireGuest`.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/Button.test.tsx`:
```tsx
import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { Button } from "./Button";

describe("Button", () => {
  test("renders its label and responds to click", () => {
    const onClick = mock(() => {});
    render(<Button onClick={onClick}>Sign in</Button>);

    fireEvent.click(screen.getByText("Sign in"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("is disabled and marked busy while loading, and does not fire onClick", () => {
    const onClick = mock(() => {});
    render(
      <Button onClick={onClick} isLoading>
        Sign in
      </Button>,
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");

    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/components/ui/Button.test.tsx`
Expected: FAIL — `./Button` does not exist.

- [ ] **Step 3: Implement `Spinner`**

Create `src/components/ui/Spinner.module.css`:
```css
.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(0, 0, 0, 0.15);
  border-top-color: var(--text-secondary);
  animation: spin 700ms linear infinite;
}

.fullPage {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
```

Create `src/components/ui/Spinner.tsx`:
```tsx
import styles from "./Spinner.module.css";

type SpinnerProps = {
  label?: string;
  fullPage?: boolean;
  className?: string;
};

export function Spinner({ label = "Loading", fullPage = false, className }: SpinnerProps) {
  const spinner = (
    <span
      className={[styles.spinner, className].filter(Boolean).join(" ")}
      role="status"
      aria-label={label}
    />
  );
  if (!fullPage) return spinner;
  return <div className={styles.fullPage}>{spinner}</div>;
}
```

- [ ] **Step 4: Implement `Button`**

Create `src/components/ui/Button.module.css`:
```css
.button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: 40px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition:
    transform var(--duration-micro) var(--ease-out),
    background-color var(--duration-micro) var(--ease-out);
}

.button:active:not(:disabled) {
  transform: scale(0.98);
}

.button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.primary {
  background: var(--accent);
  color: var(--accent-contrast);
}

.primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.secondary {
  background: var(--surface);
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.text {
  background: transparent;
  color: var(--accent);
  height: auto;
  padding: var(--space-1) 0;
}

.label {
  transition: opacity 100ms var(--ease-out);
}

.button[aria-busy="true"] .label {
  opacity: 0;
}

.spinnerSlot {
  position: absolute;
  opacity: 0;
  transition: opacity 100ms var(--ease-out);
}

.button[aria-busy="true"] .spinnerSlot {
  opacity: 1;
}
```

Create `src/components/ui/Button.tsx`:
```tsx
import type { ButtonHTMLAttributes } from "react";
import { Spinner } from "./Spinner";
import styles from "./Button.module.css";

type ButtonVariant = "primary" | "secondary" | "text";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  isLoading?: boolean;
};

export function Button({
  variant = "primary",
  isLoading = false,
  disabled,
  children,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={[styles.button, styles[variant], className].filter(Boolean).join(" ")}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
    >
      <span className={styles.label}>{children}</span>
      {isLoading && (
        <span className={styles.spinnerSlot}>
          <Spinner label="" />
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/components/ui/Button.test.tsx`
Expected: PASS (both tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Spinner.tsx src/components/ui/Spinner.module.css \
  src/components/ui/Button.tsx src/components/ui/Button.module.css src/components/ui/Button.test.tsx
git commit -m "feat: add Button and Spinner primitives"
```

---

### Task 6: `TextField` (label, error reveal, password show/hide toggle)

**Files:**
- Create: `src/components/ui/TextField.tsx`, `src/components/ui/TextField.module.css`, `src/components/ui/TextField.test.tsx`

**Interfaces:**
- Produces: `<TextField label: string; error?: string; ...InputHTMLAttributes<HTMLInputElement> />`. Consumed by every page task (12–17).

- [ ] **Step 1: Write the failing tests**

Create `src/components/ui/TextField.test.tsx`:
```tsx
import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { TextField } from "./TextField";

describe("TextField", () => {
  test("associates the label and shows a validation error", () => {
    render(<TextField label="Email" value="" onChange={() => {}} error="Enter a valid email address" />);

    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address");
  });

  test("calls onChange with the new value", () => {
    const onChange = mock(() => {});
    render(<TextField label="Email" value="" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test("renders a show/hide toggle for password fields that switches the input type", () => {
    render(<TextField label="Password" type="password" value="secret" onChange={() => {}} />);

    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByLabelText("Show password"));
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Hide password")).toBeInTheDocument();
  });

  test("does not render a toggle for non-password fields", () => {
    render(<TextField label="Email" type="email" value="" onChange={() => {}} />);
    expect(screen.queryByLabelText("Show password")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/components/ui/TextField.test.tsx`
Expected: FAIL — `./TextField` does not exist.

- [ ] **Step 3: Implement**

Create `src/components/ui/TextField.module.css`:
```css
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-bottom: var(--space-4);
}

.label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.inputWrap {
  position: relative;
}

.input {
  width: 100%;
  height: 40px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text-primary);
  font-size: var(--text-base);
  transition:
    border-color var(--duration-micro) var(--ease-out),
    box-shadow var(--duration-micro) var(--ease-out);
}

.input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(154, 43, 31, 0.15);
}

.inputError {
  border-color: var(--danger);
}

.toggle {
  position: absolute;
  right: var(--space-2);
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  padding: var(--space-1);
  color: var(--text-muted);
  cursor: pointer;
}

.error {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--danger);
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  transition:
    max-height var(--duration-reveal) var(--ease-out),
    opacity var(--duration-reveal) var(--ease-out);
}

.error[data-visible="true"] {
  max-height: 32px;
  opacity: 1;
}
```

Create `src/components/ui/TextField.tsx`:
```tsx
import { useId, useState } from "react";
import type { InputHTMLAttributes } from "react";
import styles from "./TextField.module.css";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export function TextField({ label, error, id, type = "text", ...rest }: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && revealed ? "text" : type;

  return (
    <div className={styles.field}>
      <label htmlFor={fieldId} className={styles.label}>
        {label}
      </label>
      <div className={styles.inputWrap}>
        <input
          {...rest}
          id={fieldId}
          type={inputType}
          className={[styles.input, error ? styles.inputError : ""].filter(Boolean).join(" ")}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        />
        {isPassword && (
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setRevealed((prev) => !prev)}
            aria-pressed={revealed}
            aria-label={revealed ? "Hide password" : "Show password"}
          >
            <EyeIcon revealed={revealed} />
          </button>
        )}
      </div>
      <p id={errorId} role="alert" className={styles.error} data-visible={Boolean(error)}>
        {error}
      </p>
    </div>
  );
}

function EyeIcon({ revealed }: { revealed: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {revealed ? (
        <path
          d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5Zm7 2.2A2.2 2.2 0 1 0 8 5.8a2.2 2.2 0 0 0 0 4.4Z"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      ) : (
        <path
          d="M1 1l14 14M6.2 6.4A2.2 2.2 0 0 0 9.7 9.8M3.5 3.7C2 4.8 1 8 1 8s2.5 5 7 5c1.2 0 2.2-.3 3.1-.8M12.7 11c1.4-1.1 2.3-3 2.3-3s-2.5-5-7-5c-.7 0-1.3.1-1.9.2"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      )}
    </svg>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/components/ui/TextField.test.tsx`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/TextField.tsx src/components/ui/TextField.module.css src/components/ui/TextField.test.tsx
git commit -m "feat: add TextField with animated error reveal and password toggle"
```

---

### Task 7: `FormBanner` + `SuccessCheck`

**Files:**
- Create: `src/components/ui/FormBanner.tsx`, `src/components/ui/FormBanner.module.css`, `src/components/ui/FormBanner.test.tsx`, `src/components/ui/SuccessCheck.tsx`, `src/components/ui/SuccessCheck.module.css`, `src/components/ui/SuccessCheck.test.tsx`

**Interfaces:**
- Produces: `<FormBanner variant: "error"|"success"|"info"; children: ReactNode />`, `<SuccessCheck />`. Consumed by pages in Tasks 12–15.

- [ ] **Step 1: Write the failing tests**

Create `src/components/ui/FormBanner.test.tsx`:
```tsx
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { FormBanner } from "./FormBanner";

describe("FormBanner", () => {
  test("renders an error banner with role=alert", () => {
    render(<FormBanner variant="error">Invalid email or password</FormBanner>);
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid email or password");
  });

  test("renders a success banner with role=status", () => {
    render(<FormBanner variant="success">Password reset successful</FormBanner>);
    expect(screen.getByRole("status")).toHaveTextContent("Password reset successful");
  });
});
```

Create `src/components/ui/SuccessCheck.test.tsx`:
```tsx
import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { SuccessCheck } from "./SuccessCheck";

describe("SuccessCheck", () => {
  test("renders a decorative, screen-reader-hidden checkmark", () => {
    const { container } = render(<SuccessCheck />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/components/ui/FormBanner.test.tsx src/components/ui/SuccessCheck.test.tsx`
Expected: FAIL — neither module exists.

- [ ] **Step 3: Implement `FormBanner`**

Create `src/components/ui/FormBanner.module.css`:
```css
.banner {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  margin-bottom: var(--space-4);
  animation: reveal var(--duration-reveal) var(--ease-out);
}

.error {
  background: rgba(220, 38, 38, 0.08);
  color: var(--danger);
  border: 1px solid rgba(220, 38, 38, 0.2);
}

.success {
  background: rgba(21, 128, 61, 0.08);
  color: var(--success);
  border: 1px solid rgba(21, 128, 61, 0.2);
}

.info {
  background: rgba(54, 84, 166, 0.08);
  color: var(--info);
  border: 1px solid rgba(54, 84, 166, 0.2);
}

@keyframes reveal {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

Create `src/components/ui/FormBanner.tsx`:
```tsx
import type { ReactNode } from "react";
import styles from "./FormBanner.module.css";

type FormBannerProps = {
  variant: "error" | "success" | "info";
  children: ReactNode;
};

export function FormBanner({ variant, children }: FormBannerProps) {
  return (
    <div className={[styles.banner, styles[variant]].join(" ")} role={variant === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Implement `SuccessCheck`**

Create `src/components/ui/SuccessCheck.module.css`:
```css
.check {
  display: block;
  margin: 0 auto var(--space-4);
}

.circle {
  stroke-dasharray: 113;
  stroke-dashoffset: 113;
  animation: draw 400ms var(--ease-in-out) forwards;
}

.tick {
  stroke-dasharray: 24;
  stroke-dashoffset: 24;
  animation: draw 300ms var(--ease-in-out) 300ms forwards;
}

@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}
```

Create `src/components/ui/SuccessCheck.tsx`:
```tsx
import styles from "./SuccessCheck.module.css";

export function SuccessCheck() {
  return (
    <svg
      className={styles.check}
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      role="presentation"
      aria-hidden="true"
    >
      <circle cx="20" cy="20" r="18" stroke="var(--success)" strokeWidth="2" className={styles.circle} />
      <path
        d="M12 20.5l5.5 5.5L28 14.5"
        stroke="var(--success)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={styles.tick}
      />
    </svg>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/components/ui/FormBanner.test.tsx src/components/ui/SuccessCheck.test.tsx`
Expected: PASS (3 tests total)

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/FormBanner.tsx src/components/ui/FormBanner.module.css src/components/ui/FormBanner.test.tsx \
  src/components/ui/SuccessCheck.tsx src/components/ui/SuccessCheck.module.css src/components/ui/SuccessCheck.test.tsx
git commit -m "feat: add FormBanner and SuccessCheck feedback components"
```

---

### Task 8: `AuthLayout` + `useTransitionNavigate`

**Files:**
- Create: `src/components/AuthLayout.tsx`, `src/components/AuthLayout.module.css`, `src/components/AuthLayout.test.tsx`, `src/hooks/useTransitionNavigate.ts`

**Interfaces:**
- Consumes: `react-router`'s `useNavigate`/`NavigateOptions` (Task 1 dependency install).
- Produces: `<AuthLayout title: string; helper?: ReactNode; children: ReactNode />` (consumed by Tasks 12–15), `function useTransitionNavigate(): (to: string, options?: NavigateOptions) => void` (available for any page that wants an animated redirect — used in Task 14's login-success redirect).

- [ ] **Step 1: Write the failing test for `AuthLayout`**

Create `src/components/AuthLayout.test.tsx`:
```tsx
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { AuthLayout } from "./AuthLayout";

describe("AuthLayout", () => {
  test("renders the title, wordmark, helper content, and children", () => {
    render(
      <AuthLayout title="Sign in" helper={<span>Need an account?</span>}>
        <p>form goes here</p>
      </AuthLayout>,
    );

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByText("docket")).toBeInTheDocument();
    expect(screen.getByText("Need an account?")).toBeInTheDocument();
    expect(screen.getByText("form goes here")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/AuthLayout.test.tsx`
Expected: FAIL — `./AuthLayout` does not exist.

- [ ] **Step 3: Implement `AuthLayout`**

Create `src/components/AuthLayout.module.css`:
```css
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  view-transition-name: auth-page;
}

.wordmark {
  position: fixed;
  top: var(--space-6);
  left: var(--space-6);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.card {
  width: 100%;
  max-width: 380px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-8);
  animation: enter var(--duration-page) var(--ease-out);
}

.title {
  font-size: var(--text-xl);
  margin-bottom: var(--space-6);
}

.helper {
  margin-top: var(--space-4);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

@keyframes enter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

Create `src/components/AuthLayout.tsx`:
```tsx
import type { ReactNode } from "react";
import styles from "./AuthLayout.module.css";

type AuthLayoutProps = {
  title: string;
  helper?: ReactNode;
  children: ReactNode;
};

export function AuthLayout({ title, helper, children }: AuthLayoutProps) {
  return (
    <div className={styles.page}>
      <div className={styles.wordmark}>docket</div>
      <div className={styles.card}>
        <h1 className={styles.title}>{title}</h1>
        {children}
      </div>
      {helper && <p className={styles.helper}>{helper}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/AuthLayout.test.tsx`
Expected: PASS

- [ ] **Step 5: Implement `useTransitionNavigate`** (no dedicated test — it is a thin wrapper exercised indirectly through LoginPage's tests in Task 14; feature-detection logic is trivial enough that a unit test would only assert the guard clause, which the type system already enforces)

Create `src/hooks/useTransitionNavigate.ts`:
```ts
import { useNavigate } from "react-router";
import type { NavigateOptions } from "react-router";

type DocumentWithViewTransitions = Document & {
  startViewTransition?: (callback: () => void) => void;
};

export function useTransitionNavigate() {
  const navigate = useNavigate();

  return (to: string, options?: NavigateOptions) => {
    const doc = document as DocumentWithViewTransitions;
    if (doc.startViewTransition) {
      doc.startViewTransition(() => navigate(to, options));
    } else {
      navigate(to, options);
    }
  };
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/AuthLayout.tsx src/components/AuthLayout.module.css src/components/AuthLayout.test.tsx \
  src/hooks/useTransitionNavigate.ts
git commit -m "feat: add AuthLayout shell and view-transition-aware navigate hook"
```

---

### Task 9: `AuthContext` (boot sequence, login, logout, clearSession, session-expiry wiring)

**Files:**
- Create: `src/auth/AuthContext.tsx`, `src/auth/AuthContext.test.tsx`

**Interfaces:**
- Consumes: `authApi.refresh`, `authApi.me`, `authApi.login`, `authApi.logout` (Task 3); `setSessionExpiredHandler` (Task 2); `PublicUser` (Task 3).
- Produces (consumed by `RequireAuth`/`RequireGuest` in Task 10, and by every page in Tasks 12–17):
```ts
type AuthStatus = "loading" | "authenticated" | "unauthenticated";
function useAuth(): {
  status: AuthStatus;
  user: PublicUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearSession: () => void;
};
function AuthProvider(props: { children: ReactNode }): JSX.Element;
```

- [ ] **Step 1: Write the failing tests**

Create `src/auth/AuthContext.test.tsx`:
```tsx
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext";
import { setAccessToken } from "../api/client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const originalFetch = globalThis.fetch;

function Probe() {
  const { status, user } = useAuth();
  return <div>status: {status}, user: {user?.email ?? "none"}</div>;
}

beforeEach(() => {
  setAccessToken(null);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("AuthProvider boot sequence", () => {
  test("resolves to authenticated when refresh then /me both succeed", async () => {
    const responses = [
      jsonResponse(200, { accessToken: "token-1" }),
      jsonResponse(200, { user: { id: "1", name: "Ana", email: "ana@example.com", role: "USER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z" } }),
    ];
    globalThis.fetch = mock(async () => responses.shift()!) as unknown as typeof fetch;

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByText(/status: loading/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/status: authenticated/)).toBeInTheDocument());
    expect(screen.getByText(/ana@example.com/)).toBeInTheDocument();
  });

  test("resolves to unauthenticated when the boot refresh fails, without throwing", async () => {
    globalThis.fetch = mock(async () => jsonResponse(401, { message: "Unauthorized" })) as unknown as typeof fetch;

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText(/status: unauthenticated/)).toBeInTheDocument());
    expect(screen.getByText(/user: none/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/auth/AuthContext.test.tsx`
Expected: FAIL — `./AuthContext` does not exist.

- [ ] **Step 3: Implement `src/auth/AuthContext.tsx`**

```tsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import * as authApi from "../api/auth";
import { setSessionExpiredHandler } from "../api/client";
import type { PublicUser } from "../types/auth";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  user: PublicUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearSession: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<PublicUser | null>(null);

  function clearSession(): void {
    setUser(null);
    setStatus("unauthenticated");
  }

  useEffect(() => {
    setSessionExpiredHandler(clearSession);
    return () => setSessionExpiredHandler(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        await authApi.refresh();
        const { user: me } = await authApi.me();
        if (!cancelled) {
          setUser(me);
          setStatus("authenticated");
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setStatus("unauthenticated");
        }
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      async login(email, password) {
        const result = await authApi.login({ email, password });
        setUser(result.user);
        setStatus("authenticated");
      },
      async logout() {
        try {
          await authApi.logout();
        } finally {
          clearSession();
        }
      },
      clearSession,
    }),
    [status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/auth/AuthContext.test.tsx`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add src/auth/AuthContext.tsx src/auth/AuthContext.test.tsx
git commit -m "feat: add AuthContext with silent-refresh boot sequence"
```

---

### Task 10: `RequireAuth` + `RequireGuest` route guards

**Files:**
- Create: `src/auth/RequireAuth.tsx`, `src/auth/RequireGuest.tsx`, `src/auth/RequireAuth.test.tsx`, `src/auth/RequireGuest.test.tsx`

**Interfaces:**
- Consumes: `useAuth` (Task 9), `Spinner` (Task 5), `react-router`'s `Navigate`/`useLocation`.
- Produces: `<RequireAuth children: ReactNode />`, `<RequireGuest children: ReactNode />`. Consumed by `App.tsx` routing in Task 11.

- [ ] **Step 1: Write the failing tests**

These tests need to control what `useAuth()` returns without going through the real network boot sequence, so they mock the `../auth/AuthContext` module directly.

Create `src/auth/RequireAuth.test.tsx`:
```tsx
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
```

Create `src/auth/RequireGuest.test.tsx`:
```tsx
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/auth/RequireAuth.test.tsx src/auth/RequireGuest.test.tsx`
Expected: FAIL — neither module exists.

- [ ] **Step 3: Implement both guards**

Create `src/auth/RequireAuth.tsx`:
```tsx
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "./AuthContext";
import { Spinner } from "../components/ui/Spinner";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return <Spinner label="Loading" fullPage />;
  }
  if (status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
```

Create `src/auth/RequireGuest.tsx`:
```tsx
import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "./AuthContext";
import { Spinner } from "../components/ui/Spinner";

export function RequireGuest({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") {
    return <Spinner label="Loading" fullPage />;
  }
  if (status === "authenticated") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/auth/RequireAuth.test.tsx src/auth/RequireGuest.test.tsx`
Expected: PASS (5 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/auth/RequireAuth.tsx src/auth/RequireGuest.tsx src/auth/RequireAuth.test.tsx src/auth/RequireGuest.test.tsx
git commit -m "feat: add RequireAuth and RequireGuest route guards"
```

---

### Task 11: Router wiring in `App.tsx` + `NotFoundPage`

**Files:**
- Modify: `src/App.tsx`
- Create: `src/pages/NotFoundPage.tsx`, `src/App.test.tsx`

**Interfaces:**
- Consumes: `AuthProvider` (Task 9), `RequireAuth`/`RequireGuest` (Task 10), `AuthLayout` (Task 8). Placeholder imports for pages not yet built (Tasks 12–17) — this task creates minimal stub versions of pages it doesn't yet own, and each later page task replaces its stub with the real implementation.

Since `App.tsx` must import every page, and pages are built in later tasks, this task creates a thin **stub** for each page not yet implemented (`export function X() { return <p>X</p>; }`) so the app compiles and the routing itself is fully testable now. Each of Tasks 12–17 replaces its stub file's contents — no new import wiring needed later.

- [ ] **Step 1: Write the failing routing test**

Create `src/App.test.tsx`:
```tsx
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { setAccessToken } from "./api/client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  setAccessToken(null);
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("App routing", () => {
  test("redirects an unauthenticated visitor at / to the login page", async () => {
    globalThis.fetch = mock(async () => jsonResponse(401, { message: "Unauthorized" })) as unknown as typeof fetch;
    const { default: App } = await import("./App");

    render(<App />);
    await waitFor(() => expect(screen.getByText("Sign in")).toBeInTheDocument());
  });

  test("renders NotFoundPage for an unknown route", async () => {
    window.history.pushState({}, "", "/does-not-exist");
    globalThis.fetch = mock(async () => jsonResponse(401, { message: "Unauthorized" })) as unknown as typeof fetch;
    const { default: App } = await import("./App");

    render(<App />);
    await waitFor(() => expect(screen.getByText("Page not found")).toBeInTheDocument());
  });
});
```

Note: this test asserts on the text `"Sign in"`, which is the real `LoginPage`'s heading (Task 14). Until Task 14 lands, `LoginPage` is a stub and this specific assertion will fail — that's expected and accepted for this task; the important thing this task proves is that routing/guards/provider wiring compiles and renders *something* at each path. Update the assertion to match whatever the stub renders (e.g. `screen.getByText("LoginPage")`) for now, and Task 14 does not need to touch this test — the stub text and the real page's `<h1>` text should be made to match from the start to avoid rework: give the `LoginPage` stub the exact text `"Sign in"` (its future real heading) so this test never needs revisiting.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/App.test.tsx`
Expected: FAIL — `./App` (in its current scaffold form) does not export routes matching these paths, and `./pages/NotFoundPage` does not exist.

- [ ] **Step 3: Create `NotFoundPage`**

Create `src/pages/NotFoundPage.tsx`:
```tsx
import { Link } from "react-router";
import { AuthLayout } from "../components/AuthLayout";

export function NotFoundPage() {
  return (
    <AuthLayout title="Page not found">
      <p>We couldn't find that page.</p>
      <Link to="/">Go home</Link>
    </AuthLayout>
  );
}
```

- [ ] **Step 4: Create stub pages for everything Tasks 12–17 will implement**

Create `src/pages/RegisterPage.tsx`:
```tsx
export function RegisterPage() {
  return <p>Create your account</p>;
}
```

Create `src/pages/VerifyEmailPage.tsx`:
```tsx
export function VerifyEmailPage() {
  return <p>Verify your email</p>;
}
```

Create `src/pages/LoginPage.tsx`:
```tsx
export function LoginPage() {
  return <p>Sign in</p>;
}
```

Create `src/pages/ForgotPasswordPage.tsx`:
```tsx
export function ForgotPasswordPage() {
  return <p>Forgot password</p>;
}
```

Create `src/pages/ResetPasswordPage.tsx`:
```tsx
export function ResetPasswordPage() {
  return <p>Choose a new password</p>;
}
```

Create `src/pages/DashboardPage.tsx`:
```tsx
export function DashboardPage() {
  return <p>Dashboard</p>;
}
```

Create `src/pages/SecuritySettingsPage.tsx`:
```tsx
export function SecuritySettingsPage() {
  return <p>Change password</p>;
}
```

- [ ] **Step 5: Rewrite `src/App.tsx`**

```tsx
import { BrowserRouter, Route, Routes } from "react-router";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import { RequireGuest } from "./auth/RequireGuest";
import { RegisterPage } from "./pages/RegisterPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";
import { LoginPage } from "./pages/LoginPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { DashboardPage } from "./pages/DashboardPage";
import { SecuritySettingsPage } from "./pages/SecuritySettingsPage";
import { NotFoundPage } from "./pages/NotFoundPage";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/register"
            element={
              <RequireGuest>
                <RegisterPage />
              </RequireGuest>
            }
          />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route
            path="/login"
            element={
              <RequireGuest>
                <LoginPage />
              </RequireGuest>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <RequireGuest>
                <ForgotPasswordPage />
              </RequireGuest>
            }
          />
          <Route
            path="/reset-password"
            element={
              <RequireGuest>
                <ResetPasswordPage />
              </RequireGuest>
            }
          />
          <Route
            path="/"
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings/security"
            element={
              <RequireAuth>
                <SecuritySettingsPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test src/App.test.tsx`
Expected: PASS (both tests)

- [ ] **Step 7: Run the full suite and the dev build to confirm nothing else broke**

Run: `bun test`
Expected: PASS (every test file so far)

Run: `bun run build`
Expected: succeeds (this is the first point `tsc -b` type-checks `App.tsx` against the real page stubs — fix any type errors surfaced here before continuing)

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/pages
git commit -m "feat: wire up routing, guards, and page stubs"
```

---

### Task 12: `RegisterPage`

**Files:**
- Modify: `src/pages/RegisterPage.tsx` (replacing the Task 11 stub)
- Create: `src/pages/RegisterPage.test.tsx`

**Interfaces:**
- Consumes: `AuthLayout` (Task 8), `Button`/`TextField`/`FormBanner` (Tasks 5–7), `useForm` (Task 4), `authApi.register`/`authApi.resendVerification` (Task 3).

- [ ] **Step 1: Write the failing tests**

Create `src/pages/RegisterPage.test.tsx`:
```tsx
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/pages/RegisterPage.test.tsx`
Expected: FAIL — the stub renders only `"Create your account"` with no form.

- [ ] **Step 3: Implement `RegisterPage`**

```tsx
import { useState } from "react";
import { Link } from "react-router";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/TextField";
import { FormBanner } from "../components/ui/FormBanner";
import { useForm } from "../hooks/useForm";
import * as authApi from "../api/auth";

type RegisterValues = { name: string; email: string; password: string };

const validators = {
  name: (value: string) => (value.trim().length < 3 ? "Name must be at least 3 characters" : undefined),
  email: (value: string) => (/^\S+@\S+\.\S+$/.test(value) ? undefined : "Enter a valid email address"),
  password: (value: string) =>
    value.length < 8
      ? "Password must be at least 8 characters"
      : value.length > 72
        ? "Password must be at most 72 characters"
        : undefined,
};

export function RegisterPage() {
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  const { values, errors, formError, isSubmitting, handleChange, handleBlur, handleSubmit } =
    useForm<RegisterValues>({
      initialValues: { name: "", email: "", password: "" },
      validators,
      onSubmit: async (formValues) => {
        await authApi.register(formValues);
        setRegisteredEmail(formValues.email);
      },
    });

  async function handleResend() {
    if (!registeredEmail) return;
    setResendState("sending");
    await authApi.resendVerification(registeredEmail);
    setResendState("sent");
  }

  if (registeredEmail) {
    return (
      <AuthLayout title="Check your email">
        <FormBanner variant="success">
          We sent a verification link to {registeredEmail}. Click it to activate your account.
        </FormBanner>
        <Button
          variant="text"
          type="button"
          onClick={handleResend}
          isLoading={resendState === "sending"}
          disabled={resendState === "sent"}
        >
          {resendState === "sent" ? "Email sent" : "Resend email"}
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create your account" helper={<Link to="/login">Already have an account? Sign in</Link>}>
      <form onSubmit={handleSubmit} noValidate>
        {formError && <FormBanner variant="error">{formError}</FormBanner>}
        <TextField
          label="Name"
          value={values.name}
          onChange={(e) => handleChange("name", e.target.value)}
          onBlur={() => handleBlur("name")}
          error={errors.name}
          autoComplete="name"
        />
        <TextField
          label="Email"
          type="email"
          value={values.email}
          onChange={(e) => handleChange("email", e.target.value)}
          onBlur={() => handleBlur("email")}
          error={errors.email}
          autoComplete="email"
        />
        <TextField
          label="Password"
          type="password"
          value={values.password}
          onChange={(e) => handleChange("password", e.target.value)}
          onBlur={() => handleBlur("password")}
          error={errors.password}
          autoComplete="new-password"
        />
        <Button type="submit" isLoading={isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/pages/RegisterPage.test.tsx`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/pages/RegisterPage.tsx src/pages/RegisterPage.test.tsx
git commit -m "feat: implement RegisterPage"
```

---

### Task 13: `VerifyEmailPage`

**Files:**
- Modify: `src/pages/VerifyEmailPage.tsx`
- Create: `src/pages/VerifyEmailPage.test.tsx`

**Interfaces:**
- Consumes: `AuthLayout` (Task 8), `Spinner`/`SuccessCheck`/`FormBanner` (Tasks 5–7), `authApi.verifyEmail` (Task 3), `useSearchParams` from `react-router`.

- [ ] **Step 1: Write the failing tests**

Create `src/pages/VerifyEmailPage.test.tsx`:
```tsx
import { afterEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { VerifyEmailPage } from "./VerifyEmailPage";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("VerifyEmailPage", () => {
  test("shows success once verification resolves", async () => {
    globalThis.fetch = mock(async () => jsonResponse(200, { message: "Email verified successfully" })) as unknown as typeof fetch;

    render(
      <MemoryRouter initialEntries={["/verify-email?token=abc123"]}>
        <VerifyEmailPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("status", { name: "Verifying your email" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Email verified/)).toBeInTheDocument());
    expect(screen.getByText("Go to sign in")).toBeInTheDocument();
  });

  test("shows an error state when the backend rejects the token", async () => {
    globalThis.fetch = mock(async () => jsonResponse(400, { message: "Invalid or expired verification link" })) as unknown as typeof fetch;

    render(
      <MemoryRouter initialEntries={["/verify-email?token=bad"]}>
        <VerifyEmailPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("This link is invalid or expired.")).toBeInTheDocument());
  });

  test("shows an error state immediately when there is no token in the URL", async () => {
    render(
      <MemoryRouter initialEntries={["/verify-email"]}>
        <VerifyEmailPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("This link is invalid or expired.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/pages/VerifyEmailPage.test.tsx`
Expected: FAIL — the stub has no async behavior or states.

- [ ] **Step 3: Implement `VerifyEmailPage`**

```tsx
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AuthLayout } from "../components/AuthLayout";
import { Spinner } from "../components/ui/Spinner";
import { SuccessCheck } from "../components/ui/SuccessCheck";
import { FormBanner } from "../components/ui/FormBanner";
import * as authApi from "../api/auth";

type VerifyState = "verifying" | "success" | "error";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<VerifyState>(token ? "verifying" : "error");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    authApi
      .verifyEmail(token)
      .then(() => {
        if (!cancelled) setState("success");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <AuthLayout title="Verify your email">
      {state === "verifying" && <Spinner label="Verifying your email" />}
      {state === "success" && (
        <>
          <SuccessCheck />
          <FormBanner variant="success">Email verified — you can sign in now.</FormBanner>
          <Link to="/login">Go to sign in</Link>
        </>
      )}
      {state === "error" && (
        <>
          <FormBanner variant="error">This link is invalid or expired.</FormBanner>
          <Link to="/register">Back to registration</Link>
        </>
      )}
    </AuthLayout>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/pages/VerifyEmailPage.test.tsx`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/pages/VerifyEmailPage.tsx src/pages/VerifyEmailPage.test.tsx
git commit -m "feat: implement VerifyEmailPage"
```

---

### Task 14: `LoginPage`

**Files:**
- Modify: `src/pages/LoginPage.tsx`
- Create: `src/pages/LoginPage.test.tsx`

**Interfaces:**
- Consumes: `useAuth` (Task 9), `useTransitionNavigate` (Task 8), `ApiError` (Task 2), `authApi.resendVerification` (Task 3), `AuthLayout`/`Button`/`TextField`/`FormBanner` (Tasks 5–8), `useForm` (Task 4).

- [ ] **Step 1: Write the failing tests**

Create `src/pages/LoginPage.test.tsx`:
```tsx
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
  fireEvent.click(screen.getByText("Sign in"));
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

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Invalid email or password"));
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/pages/LoginPage.test.tsx`
Expected: FAIL — the stub has no form.

- [ ] **Step 3: Implement `LoginPage`**

```tsx
import { useState } from "react";
import { Link, useLocation } from "react-router";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/TextField";
import { FormBanner } from "../components/ui/FormBanner";
import { useForm } from "../hooks/useForm";
import { useAuth } from "../auth/AuthContext";
import { useTransitionNavigate } from "../hooks/useTransitionNavigate";
import { ApiError } from "../api/client";
import * as authApi from "../api/auth";

type LoginValues = { email: string; password: string };

const validators = {
  email: (value: string) => (/^\S+@\S+\.\S+$/.test(value) ? undefined : "Enter a valid email address"),
  password: (value: string) => (value.length < 1 ? "Enter your password" : undefined),
};

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useTransitionNavigate();
  const location = useLocation();
  const [needsVerification, setNeedsVerification] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const { values, errors, formError, isSubmitting, handleChange, handleBlur, handleSubmit } = useForm<LoginValues>({
    initialValues: { email: "", password: "" },
    validators,
    onSubmit: async (formValues) => {
      setNeedsVerification(null);
      try {
        await login(formValues.email, formValues.password);
        navigate(from, { replace: true });
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          setNeedsVerification(formValues.email);
          return;
        }
        throw err;
      }
    },
  });

  async function handleResend() {
    if (!needsVerification) return;
    setResendState("sending");
    await authApi.resendVerification(needsVerification);
    setResendState("sent");
  }

  return (
    <AuthLayout title="Sign in" helper={<Link to="/register">Need an account? Create one</Link>}>
      <form onSubmit={handleSubmit} noValidate>
        {needsVerification && (
          <FormBanner variant="error">
            Please verify your email before signing in.{" "}
            <Button
              variant="text"
              type="button"
              onClick={handleResend}
              isLoading={resendState === "sending"}
              disabled={resendState === "sent"}
            >
              {resendState === "sent" ? "Email sent" : "Resend verification email"}
            </Button>
          </FormBanner>
        )}
        {formError && !needsVerification && <FormBanner variant="error">{formError}</FormBanner>}
        <TextField
          label="Email"
          type="email"
          value={values.email}
          onChange={(e) => handleChange("email", e.target.value)}
          onBlur={() => handleBlur("email")}
          error={errors.email}
          autoComplete="email"
        />
        <TextField
          label="Password"
          type="password"
          value={values.password}
          onChange={(e) => handleChange("password", e.target.value)}
          onBlur={() => handleBlur("password")}
          error={errors.password}
          autoComplete="current-password"
        />
        <p>
          <Link to="/forgot-password">Forgot password?</Link>
        </p>
        <Button type="submit" isLoading={isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/pages/LoginPage.test.tsx`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Re-run `App.test.tsx` — it now exercises the real `LoginPage`**

Run: `bun test src/App.test.tsx`
Expected: PASS (the earlier stub-based assertion already matched `"Sign in"`, so this should pass unchanged)

- [ ] **Step 6: Commit**

```bash
git add src/pages/LoginPage.tsx src/pages/LoginPage.test.tsx
git commit -m "feat: implement LoginPage with 403 verification handling"
```

---

### Task 15: `ForgotPasswordPage` + `ResetPasswordPage`

**Files:**
- Modify: `src/pages/ForgotPasswordPage.tsx`, `src/pages/ResetPasswordPage.tsx`
- Create: `src/pages/ForgotPasswordPage.test.tsx`, `src/pages/ResetPasswordPage.test.tsx`

**Interfaces:**
- Consumes: same primitives as Task 12 (`AuthLayout`, `Button`, `TextField`, `FormBanner`, `SuccessCheck`, `useForm`), plus `authApi.forgotPassword`/`authApi.resetPassword` (Task 3) and `useSearchParams` from `react-router`.

- [ ] **Step 1: Write the failing tests**

Create `src/pages/ForgotPasswordPage.test.tsx`:
```tsx
import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ForgotPasswordPage } from "./ForgotPasswordPage";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("ForgotPasswordPage", () => {
  test("shows the same generic success message regardless of whether the email exists", async () => {
    globalThis.fetch = mock(async () => jsonResponse(200, { message: "If that email exists, we sent a reset link" })) as unknown as typeof fetch;

    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "anyone@example.com" } });
    fireEvent.click(screen.getByText("Send reset link"));

    await waitFor(() => expect(screen.getByText(/we sent a password reset link/)).toBeInTheDocument());
  });
});
```

Create `src/pages/ResetPasswordPage.test.tsx`:
```tsx
import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ResetPasswordPage } from "./ResetPasswordPage";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("ResetPasswordPage", () => {
  test("shows an invalid-link message immediately when there is no token", () => {
    render(
      <MemoryRouter initialEntries={["/reset-password"]}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("This link is invalid or expired.")).toBeInTheDocument();
  });

  test("blocks submit when the passwords don't match", () => {
    const fetchMock = mock(async () => jsonResponse(200, { message: "Password reset successful" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(
      <MemoryRouter initialEntries={["/reset-password?token=abc"]}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "different1" } });
    fireEvent.click(screen.getByText("Reset password"));

    expect(screen.getByText("Passwords don't match")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("shows success with a link to sign in after a matching reset", async () => {
    globalThis.fetch = mock(async () => jsonResponse(200, { message: "Password reset successful" })) as unknown as typeof fetch;

    render(
      <MemoryRouter initialEntries={["/reset-password?token=abc"]}>
        <ResetPasswordPage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByText("Reset password"));

    await waitFor(() => expect(screen.getByText("Your password has been reset.")).toBeInTheDocument());
    expect(screen.getByText("Sign in")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/pages/ForgotPasswordPage.test.tsx src/pages/ResetPasswordPage.test.tsx`
Expected: FAIL — both stubs have no form.

- [ ] **Step 3: Implement `ForgotPasswordPage`**

```tsx
import { useState } from "react";
import { Link } from "react-router";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/TextField";
import { FormBanner } from "../components/ui/FormBanner";
import { useForm } from "../hooks/useForm";
import * as authApi from "../api/auth";

type ForgotValues = { email: string };

const validators = {
  email: (value: string) => (/^\S+@\S+\.\S+$/.test(value) ? undefined : "Enter a valid email address"),
};

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  const { values, errors, formError, isSubmitting, handleChange, handleBlur, handleSubmit } = useForm<ForgotValues>({
    initialValues: { email: "" },
    validators,
    onSubmit: async (formValues) => {
      await authApi.forgotPassword(formValues.email);
      setSent(true);
    },
  });

  if (sent) {
    return (
      <AuthLayout title="Check your email">
        <FormBanner variant="success">If that email exists, we sent a password reset link.</FormBanner>
        <Link to="/login">Back to sign in</Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Forgot password" helper={<Link to="/login">Back to sign in</Link>}>
      <form onSubmit={handleSubmit} noValidate>
        {formError && <FormBanner variant="error">{formError}</FormBanner>}
        <TextField
          label="Email"
          type="email"
          value={values.email}
          onChange={(e) => handleChange("email", e.target.value)}
          onBlur={() => handleBlur("email")}
          error={errors.email}
          autoComplete="email"
        />
        <Button type="submit" isLoading={isSubmitting}>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}
```

- [ ] **Step 4: Implement `ResetPasswordPage`**

```tsx
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/TextField";
import { FormBanner } from "../components/ui/FormBanner";
import { SuccessCheck } from "../components/ui/SuccessCheck";
import { useForm } from "../hooks/useForm";
import * as authApi from "../api/auth";

type ResetValues = { newPassword: string; confirmPassword: string };

const validators = {
  newPassword: (value: string) =>
    value.length < 8
      ? "Password must be at least 8 characters"
      : value.length > 72
        ? "Password must be at most 72 characters"
        : undefined,
  confirmPassword: (value: string, allValues: ResetValues) =>
    value !== allValues.newPassword ? "Passwords don't match" : undefined,
};

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [done, setDone] = useState(false);

  const { values, errors, formError, isSubmitting, handleChange, handleBlur, handleSubmit } = useForm<ResetValues>({
    initialValues: { newPassword: "", confirmPassword: "" },
    validators,
    onSubmit: async (formValues) => {
      if (!token) return;
      await authApi.resetPassword(token, formValues.newPassword);
      setDone(true);
    },
  });

  if (!token) {
    return (
      <AuthLayout title="Reset password">
        <FormBanner variant="error">This link is invalid or expired.</FormBanner>
        <Link to="/forgot-password">Request a new link</Link>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="Password reset">
        <SuccessCheck />
        <FormBanner variant="success">Your password has been reset.</FormBanner>
        <Link to="/login">Sign in</Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password">
      <form onSubmit={handleSubmit} noValidate>
        {formError && <FormBanner variant="error">{formError}</FormBanner>}
        <TextField
          label="New password"
          type="password"
          value={values.newPassword}
          onChange={(e) => handleChange("newPassword", e.target.value)}
          onBlur={() => handleBlur("newPassword")}
          error={errors.newPassword}
          autoComplete="new-password"
        />
        <TextField
          label="Confirm password"
          type="password"
          value={values.confirmPassword}
          onChange={(e) => handleChange("confirmPassword", e.target.value)}
          onBlur={() => handleBlur("confirmPassword")}
          error={errors.confirmPassword}
          autoComplete="new-password"
        />
        <Button type="submit" isLoading={isSubmitting}>
          Reset password
        </Button>
      </form>
    </AuthLayout>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/pages/ForgotPasswordPage.test.tsx src/pages/ResetPasswordPage.test.tsx`
Expected: PASS (4 tests total)

- [ ] **Step 6: Commit**

```bash
git add src/pages/ForgotPasswordPage.tsx src/pages/ForgotPasswordPage.test.tsx \
  src/pages/ResetPasswordPage.tsx src/pages/ResetPasswordPage.test.tsx
git commit -m "feat: implement ForgotPasswordPage and ResetPasswordPage"
```

---

### Task 16: `AppShell` + `DashboardPage`

**Files:**
- Create: `src/components/AppShell.tsx`, `src/components/AppShell.module.css`
- Modify: `src/pages/DashboardPage.tsx`
- Create: `src/pages/DashboardPage.module.css`, `src/pages/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: `useAuth` (Task 9), `Button` (Task 5).
- Produces: `<AppShell children: ReactNode />` (also consumed by Task 17's `SecuritySettingsPage`).

- [ ] **Step 1: Write the failing test**

Create `src/pages/DashboardPage.test.tsx`:
```tsx
import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const useAuthMock = mock(() => ({
  status: "authenticated" as const,
  user: { id: "1", name: "Ana", email: "ana@example.com", role: "USER" as const, status: "ACTIVE" as const, createdAt: "2026-01-01T00:00:00Z" },
  login: mock(async () => {}),
  logout: mock(async () => {}),
  clearSession: mock(() => {}),
}));
mock.module("../auth/AuthContext", () => ({ useAuth: useAuthMock }));

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/pages/DashboardPage.test.tsx`
Expected: FAIL — the stub renders only `"Dashboard"`.

- [ ] **Step 3: Implement `AppShell`**

Create `src/components/AppShell.module.css`:
```css
.shell {
  min-height: 100vh;
}

.topBar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-6);
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.wordmark {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.nav {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  font-size: var(--text-sm);
}

.user {
  font-family: var(--font-mono);
  color: var(--text-secondary);
}

.content {
  padding: var(--space-8) var(--space-6);
}
```

Create `src/components/AppShell.tsx`:
```tsx
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { Button } from "./ui/Button";
import styles from "./AppShell.module.css";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className={styles.shell}>
      <header className={styles.topBar}>
        <span className={styles.wordmark}>docket</span>
        <nav className={styles.nav}>
          <Link to="/settings/security">Security</Link>
          <span className={styles.user}>{user?.email}</span>
          <Button variant="secondary" onClick={() => void logout()}>
            Log out
          </Button>
        </nav>
      </header>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Implement `DashboardPage`**

Create `src/pages/DashboardPage.module.css`:
```css
.heading {
  font-size: var(--text-xl);
  margin-bottom: var(--space-6);
}

.empty {
  max-width: 480px;
  padding: var(--space-6);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.detail {
  color: var(--text-secondary);
  font-size: var(--text-sm);
}
```

Create `src/pages/DashboardPage.tsx`:
```tsx
import { AppShell } from "../components/AppShell";
import { useAuth } from "../auth/AuthContext";
import styles from "./DashboardPage.module.css";

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <AppShell>
      <h1 className={styles.heading}>Welcome, {user?.name}</h1>
      <div className={styles.empty}>
        <p>Projects aren't available yet.</p>
        <p className={styles.detail}>
          This is where your projects and tasks will show up once that part of Docket is built.
        </p>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test src/pages/DashboardPage.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/AppShell.tsx src/components/AppShell.module.css \
  src/pages/DashboardPage.tsx src/pages/DashboardPage.module.css src/pages/DashboardPage.test.tsx
git commit -m "feat: implement AppShell and an honest DashboardPage empty state"
```

---

### Task 17: `SecuritySettingsPage`

**Files:**
- Modify: `src/pages/SecuritySettingsPage.tsx`
- Create: `src/pages/SecuritySettingsPage.test.tsx`

**Interfaces:**
- Consumes: `AppShell` (Task 16), `Button`/`TextField`/`FormBanner` (Tasks 5–7), `useForm` (Task 4), `authApi.changePassword` (Task 3), `useAuth().clearSession` (Task 9), `useNavigate` from `react-router`.

- [ ] **Step 1: Write the failing test**

Create `src/pages/SecuritySettingsPage.test.tsx`:
```tsx
import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

const clearSessionMock = mock(() => {});
mock.module("../auth/AuthContext", () => ({
  useAuth: () => ({
    status: "authenticated" as const,
    user: { id: "1", name: "Ana", email: "ana@example.com", role: "USER" as const, status: "ACTIVE" as const, createdAt: "2026-01-01T00:00:00Z" },
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
    fireEvent.click(screen.getByText("Update password"));

    await waitFor(() => expect(screen.getByText("login page")).toBeInTheDocument());
    expect(clearSessionMock).toHaveBeenCalledTimes(1);
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
    fireEvent.click(screen.getByText("Update password"));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Invalid credentials"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/pages/SecuritySettingsPage.test.tsx`
Expected: FAIL — the stub has no form.

- [ ] **Step 3: Implement `SecuritySettingsPage`**

```tsx
import { useNavigate } from "react-router";
import { AppShell } from "../components/AppShell";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/TextField";
import { FormBanner } from "../components/ui/FormBanner";
import { useForm } from "../hooks/useForm";
import { useAuth } from "../auth/AuthContext";
import * as authApi from "../api/auth";

type ChangePasswordValues = { currentPassword: string; newPassword: string };

const validators = {
  currentPassword: (value: string) => (value.length < 1 ? "Enter your current password" : undefined),
  newPassword: (value: string) =>
    value.length < 8
      ? "Password must be at least 8 characters"
      : value.length > 72
        ? "Password must be at most 72 characters"
        : undefined,
};

export function SecuritySettingsPage() {
  const navigate = useNavigate();
  const { clearSession } = useAuth();

  const { values, errors, formError, isSubmitting, handleChange, handleBlur, handleSubmit } =
    useForm<ChangePasswordValues>({
      initialValues: { currentPassword: "", newPassword: "" },
      validators,
      onSubmit: async (formValues) => {
        await authApi.changePassword(formValues);
        clearSession();
        navigate("/login", { replace: true });
      },
    });

  return (
    <AppShell>
      <h1>Change password</h1>
      <form onSubmit={handleSubmit} noValidate>
        {formError && <FormBanner variant="error">{formError}</FormBanner>}
        <TextField
          label="Current password"
          type="password"
          value={values.currentPassword}
          onChange={(e) => handleChange("currentPassword", e.target.value)}
          onBlur={() => handleBlur("currentPassword")}
          error={errors.currentPassword}
          autoComplete="current-password"
        />
        <TextField
          label="New password"
          type="password"
          value={values.newPassword}
          onChange={(e) => handleChange("newPassword", e.target.value)}
          onBlur={() => handleBlur("newPassword")}
          error={errors.newPassword}
          autoComplete="new-password"
        />
        <Button type="submit" isLoading={isSubmitting}>
          Update password
        </Button>
      </form>
    </AppShell>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/pages/SecuritySettingsPage.test.tsx`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add src/pages/SecuritySettingsPage.tsx src/pages/SecuritySettingsPage.test.tsx
git commit -m "feat: implement SecuritySettingsPage"
```

---

### Task 18: Final integration pass

**Files:**
- No new files expected; this task verifies and tidies the whole feature, and updates `frontend/docs/PROJECT_MAP.md`.

**Interfaces:** none new — this task is verification, not new surface area.

- [ ] **Step 1: Run the full test suite**

Run: `bun test`
Expected: every test file passes (Tasks 1–17). Fix anything failing before proceeding.

- [ ] **Step 2: Run the production build**

Run: `bun run build`
Expected: `tsc -b` and `vite build` both succeed with no type errors.

- [ ] **Step 3: Run the linter**

Run: `bun run lint`
Expected: no errors. If `eslint-plugin-react-hooks`/`react-refresh` flag anything (e.g. a component file exporting a non-component alongside a component), fix it directly — don't disable the rule.

- [ ] **Step 4: Manual smoke test against the real backend**

This requires the backend actually running — do this by hand, not as an automated step:
1. In `backend/`, ensure `.env` is configured (`DATABASE_URL`, `JWT_SECRET`, etc. per `backend/src/config/env.ts`) and migrations are applied (`bun run migrate` if that script exists, or however the repo currently runs `backend/src/db/migrate.ts`), then start it (`bun src/server.ts`).
2. In `frontend/`, copy `.env.example` to `.env` (adjust `VITE_API_URL` if the backend isn't on port 4000), then `bun run dev`.
3. Walk the full journey: register → copy the verification token the backend logs to its console (registration does not send real email — see `docs/PROJECT_MAP.md` §15) → visit `/verify-email?token=<that token>` → confirm success → log in → confirm you land on `/` and see your name → visit `/settings/security`, change your password with the correct current password → confirm you're redirected to `/login` → log back in with the new password → log out → confirm you're bounced to `/login` if you try to visit `/` directly → try `/forgot-password` → copy the reset token from the backend console → `/reset-password?token=<token>` → set a new password → log in with it.
5. Confirm `prefers-reduced-motion` (toggle it in your OS or browser devtools) removes the entrance/reveal animations without breaking any state transition.

If anything in this walkthrough surfaces a bug, fix it and add a regression test to the relevant task's test file before moving on — do not leave a known-broken flow undocumented.

- [ ] **Step 5: Remove dead code**

Search for and remove anything no longer needed:
```bash
grep -rn "TODO\|FIXME" src/
```
Expected: no matches (this plan intentionally contains none). If the manual pass left any behind, remove them.

- [ ] **Step 6: Update `frontend/docs/PROJECT_MAP.md`**

Update §14 Implementation Status to check off:
```
[x] Application shell + routing
[x] Auth flow (register/verify/login/refresh/logout/password reset+change)
```
Update §18 Completed Work with a dated entry summarizing what was built (register, verify-email, login, forgot/reset password, change password, logout, silent refresh, route guards, design tokens, placeholder dashboard) and a pointer to this plan and its spec. Leave §7/§8/§14's projects/tasks rows as `[ ]` — still blocked on backend work, per §15/§16.

- [ ] **Step 7: Commit**

```bash
git add frontend/docs/PROJECT_MAP.md
git commit -m "docs: mark auth frontend implementation complete in PROJECT_MAP"
```

---

## Self-Review Notes

- **Spec coverage:** every §7 screen (register, verify-email, login, forgot-password, reset-password, dashboard, security settings) has a task (12–17); every §5 session-architecture behavior (silent boot refresh, in-memory token, 401-retry-then-redirect, no mobile header) is in Tasks 2–3 and 9; every §2 motion behavior (card entrance, banner/error reveal, button press/loading cross-fade, password toggle cross-fade, success-check draw, reduced-motion clamp) is in Tasks 1 and 5–8; §8 components map 1:1 to Tasks 5–8 and 16; §11 non-goals (no dark mode, no remember-me, no password strength meter, no OAuth) are simply absent from every task, which is correct — nothing implements them.
- **Type consistency check performed:** `PublicUser`/`RegisterInput`/`LoginInput`/`ChangePasswordInput`/response types (Task 3) are the only source of these names and are imported, never redefined, in every later task. `useForm`'s returned shape (`values, errors, formError, isSubmitting, handleChange, handleBlur, handleSubmit`) is identical across Tasks 4 and 12–17. `AuthContext`'s `useAuth()` shape (`status, user, login, logout, clearSession`) is identical across Tasks 9, 10, 14, 16, and 17 — in particular, Task 17 uses `clearSession`, not a second call to `logout()`, matching the reasoning that the backend already revoked the session and cleared the cookie during `change-password`.
- **No placeholders remain** — every step above has runnable code, not a description of code.
