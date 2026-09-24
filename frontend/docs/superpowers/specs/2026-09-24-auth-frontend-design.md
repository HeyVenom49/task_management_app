# Docket — Auth Frontend Design

**Date:** 2026-09-24
**Status:** Approved for implementation planning
**Scope:** The complete authentication flow (register, verify email, login, forgot/reset
password, change password, logout, silent session refresh) plus a minimal authenticated
placeholder home, for the "Docket" task management app frontend. Projects/members/tasks are
explicitly out of scope — the backend has no API for them yet (see `docs/PROJECT_MAP.md` §15).

This spec is downstream of `docs/PROJECT_MAP.md`, which is the verified record of backend
capabilities. Where this spec describes API behavior, it is restating what was verified there
against `backend/src/modules/auth/*`, not inventing new behavior.

---

## 1. Product identity

**Name:** Docket. A docket is literally "a list of matters to be dealt with" — directly on-theme
for task management, with no industry-specific baggage (unlike e.g. "Punch" from construction
punch-lists). Easy to change later; nothing in the implementation is coupled to the name beyond
copy strings and the wordmark.

**Personality:** dense & utilitarian — inspired by Linear and Superhuman's information density
and keyboard-friendly precision, adapted rather than cloned: no illustration assets, no
split-screen hero panels, no gradient hero sections. A single accent color carries the entire
brand identity instead of a color system built from decoration.

---

## 2. Design tokens

Defined as CSS custom properties in `src/styles/tokens.css`, consumed by CSS Modules throughout.

### Typography
- UI text: system font stack — `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. No webfont load — keeps the bundle light and avoids the "every AI-generated app uses Inter" look.
- Metadata/labels (timestamps, field hints, status text): `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`. This is the one deliberate typographic signature of the product.
- Scale: `--text-xs: 12px`, `--text-sm: 13px`, `--text-base: 14px`, `--text-md: 15px`, `--text-lg: 18px`, `--text-xl: 22px`. Body text defaults to 14px — dense, not oversized.
- Line height: 1.4 for body, 1.2 for headings.

### Color
```
--bg:              #FAFAF9   (warm off-white background)
--surface:          #FFFFFF   (cards, panels, inputs)
--border:           #E4E4E1
--border-strong:    #CFCFCA
--text-primary:     #17171A
--text-secondary:   #5B5B60
--text-muted:       #8A8A90

--accent:           #9A2B1F   ("stamp ink" oxblood/brick red — a docket entry is stamped)
--accent-hover:     #7F2318
--accent-contrast:  #FFFFFF   (text on accent)

--success:          #15803D
--warning:          #B45309
--danger:           #DC2626   (kept visually distinct from --accent — different hue weight,
                                brighter/more saturated so error state never reads as "branded")
--info:              #3654A6
```

Rationale for the accent/danger split: both are in the red family, which risks confusion. They
are differentiated by saturation and lightness (accent is darker, duller, "inky"; danger is a
clean, alerting red) and by usage — accent only appears on primary buttons/links/focus rings,
danger only appears on error banners/invalid-field borders. They never appear adjacent in a way
that requires discrimination at a glance.

No dark mode in v1 — deferred (see §11 Deferred Work in PROJECT_MAP.md).

### Spacing
4px base unit: `--space-1: 4px, --space-2: 8px, --space-3: 12px, --space-4: 16px, --space-6: 24px, --space-8: 32px, --space-12: 48px, --space-16: 64px`.

### Radius
`--radius-sm: 6px` (inputs, buttons), `--radius-md: 10px` (panels/cards). Nothing larger — avoids the "everything is a rounded pill" look.

### Shadow
`--shadow-elevated: 0 4px 16px rgba(23,23,26,0.08)` — used only on genuinely floating elements (none exist in v1's auth-only scope, but the token exists for the settings dropdown/menu if one is needed). Flat cards use `1px solid var(--border)` instead of a shadow.

### Motion
`--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`, `--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)`.
Every animation below exists to communicate a state change (arrival, error, success, busy) —
none are decorative. All of it is native CSS (transitions/keyframes) plus the browser's View
Transitions API, progressively enhanced — no animation library, consistent with the "lean,
minimal deps" stack decision.

- **Durations:** micro feedback (hover/press/focus/toggle) 120ms; reveals (error text, banner)
  180–200ms; page/card transitions 220ms. Nothing in the product exceeds ~250ms — fast enough to
  never feel like it's in the user's way, per CLAUDE.md §22.
- **Page-to-page transitions:** navigating between auth screens (e.g. `/login` → `/register`)
  uses `document.startViewTransition()` when available (`if (document.startViewTransition)`,
  otherwise an instant swap — no fallback library, no layout shift either way) to cross-fade the
  outgoing/incoming `AuthLayout` card rather than a hard cut.
- **Card entrance:** on first mount of any `AuthLayout` card, fade + translateY(6px → 0) over
  220ms `--ease-out`. Communicates "you've arrived here," not just decoration.
- **Field states:** focus ring color/shadow transitions over 120ms (already in §2 Color).
  Validation errors reveal via a height+opacity transition (0 → auto via a measured max-height,
  180ms) rather than an instant pop-in — reinforces that the error is a *response* to something
  the user just did.
- **Buttons:** press feedback `transform: scale(0.98)` over 80ms. Loading state cross-fades the
  label out / spinner in over 100ms; the button's width is fixed at mount (measured from its
  longest label) so nothing reflows when the label swaps.
- **Password visibility toggle** (new, §7/§8): the show/hide icon swaps via a 120ms cross-fade,
  same pattern as the button loading swap — a small, concretely useful (not just decorative)
  modern touch on every password field.
- **FormBanner:** slides down (translateY(-4px → 0)) + fades in over 200ms on appearance. No
  shake/bounce — stays in keeping with the dense/utilitarian tone rather than becoming playful.
- **Success confirmation** (verify-email success, reset-password success): a small checkmark
  icon draws itself in via `stroke-dasharray` animation (~300ms `--ease-in-out`) the moment the
  success state renders — a deliberate "this completed" moment on the two screens that are
  purely about confirming an async result, where that confirmation is the entire point of the
  screen.
- **Reduced motion:** every transition/animation above is wrapped so that
  `@media (prefers-reduced-motion: reduce)` removes translateY/scale/draw effects and swaps to
  opacity-only or instant changes — state is still communicated (e.g. the error still appears),
  just without motion.

---

## 3. Layout

Auth screens (`AuthLayout.tsx`) share one shell: a small monospace wordmark ("docket") fixed
top-left, a vertically-centered single-column card (max-width ~380px) containing the form, and a
one-line monospace helper/context string under the card (e.g. password rules, or a link to the
adjacent flow — "Already have an account? Sign in"). No illustration, no marketing copy, no hero
image. This directly serves the "dense & utilitarian" identity and avoids the generic
hero-plus-cards SaaS pattern CLAUDE.md warns against.

The authenticated shell (`DashboardPage`, `SecuritySettingsPage`) uses a simple top bar (wordmark
left, user name + a settings/logout affordance right) with content below — no sidebar, since
there is nothing yet to navigate to beyond Security settings. A sidebar will be introduced when
a projects/tasks module exists to navigate between (do not build one now — no reason for it to
exist yet, per CLAUDE.md §23).

---

## 4. Routes & guards

```
/register
/verify-email          (reads ?token= from the query string)
/login
/forgot-password
/reset-password         (reads ?token= from the query string)
/                       [RequireAuth] → DashboardPage
/settings/security      [RequireAuth] → SecuritySettingsPage
*                       → NotFoundPage
```

- `RequireAuth`: while auth status is `"loading"`, render a full-page spinner (not a flash of
  the login form). If `"unauthenticated"`, redirect to `/login?from=<original path>`. If
  `"authenticated"`, render children.
- `RequireGuest`: wraps `/login`, `/register`, `/forgot-password`, `/reset-password`. If already
  `"authenticated"`, redirect to `/`. `/verify-email` is **not** guest-only — a logged-in user
  might still click a stale verification link; the page should handle both.

Router: `react-router` (v7, data-mode `createBrowserRouter` not required for this scope — plain
`<Routes>`/`<Route>` is sufficient given no loaders/data-fetching-on-navigation is needed; auth
state comes from context, not route loaders).

---

## 5. Auth session architecture

### State shape (`AuthContext`)
```ts
type AuthStatus = "loading" | "authenticated" | "unauthenticated";
type AuthState = {
  status: AuthStatus;
  user: PublicUser | null;
};
```
The access token itself is **not** part of React state — it lives in a module-scoped variable
inside `src/api/client.ts` (`let accessToken: string | null`). This avoids re-rendering the whole
tree on every token rotation and, more importantly, keeps it out of anything that could be
serialized to storage. It is never written to `localStorage`/`sessionStorage`.

### Boot sequence (on `AuthProvider` mount)
```
POST /auth/refresh  (credentials: 'include', no body — cookie carries the refresh token)
   ├─ success → store accessToken in client.ts
   │            → GET /auth/me (Bearer accessToken) → set user, status="authenticated"
   │              (if /me unexpectedly fails here, treat as unauthenticated — do not loop)
   └─ 401/failure → status="unauthenticated", user=null   (expected for a first-time visitor)
```
This is a **silent** flow — no error is surfaced to the user for a failed boot refresh; it's the
normal case for anyone who isn't logged in.

### Login / register
- `login(email, password)` → `POST /auth/login` → response already contains `{ user, accessToken }` (refresh cookie set by the server) → store both directly, `status="authenticated"`, navigate to `/` (or `?from=`).
- `register(name, email, password)` → `POST /auth/register` → response is `{ user }` only, **no tokens**. Do not authenticate. Navigate to a "check your email" confirmation state (see §7) — this mirrors the backend's actual behavior (new users start `INACTIVE` until they verify).

### Logout
`POST /auth/logout` (clears the server-side session + cookie) → clear in-memory token, `user=null`, `status="unauthenticated"`, navigate to `/login`. Fire-and-forget the network call's failure — always clear local state regardless, since the user's intent is to leave the authenticated area.

### Refresh-and-retry on 401
`apiFetch` special-cases one scenario: an authenticated request (one that sent a Bearer token)
comes back `401`. It then:
1. Calls the refresh flow exactly once (never recurse).
2. On success, retries the original request once with the new token.
3. On failure, clears session state and lets the 401 propagate as an `ApiError` (the caller —
   typically a `RequireAuth`-guarded page — redirects to `/login`).

This does **not** apply to `/auth/login`, `/auth/register`, `/auth/refresh` itself, or any
unauthenticated request — a 401 from `/auth/login` is just "wrong password" and must surface
normally.

### No mobile header
The frontend never sends `X-Client: mobile`. The refresh token stays exclusively in the
`httpOnly` cookie the backend sets — it never appears in a JS-readable response body or in
frontend state. This is a deliberate security choice, not an oversight: it matches what the
backend's `wantsRefreshInBody` branch implies is the *web* client's intended behavior.

---

## 6. API integration layer

### `src/api/client.ts`
```ts
export class ApiError extends Error {
  status: number;
  fieldErrors?: Record<string, string[] | undefined>;
}

// apiFetch<T>(path, init?) -> Promise<T>
// - base URL from import.meta.env.VITE_API_URL (default "http://localhost:4000/api/v1")
// - always credentials: 'include'
// - JSON request/response; throws ApiError on non-2xx, parsing {message, errors?} from body
// - attaches `Authorization: Bearer <token>` when an in-memory token exists
// - owns the 401-refresh-retry described in §5
// - exposes getAccessToken()/setAccessToken() for AuthContext to read/write, kept private
//   otherwise (nothing outside auth/ should touch the token directly)
```

### `src/api/auth.ts`
One typed function per endpoint, each returning the exact shape the backend sends (verified in
`docs/PROJECT_MAP.md` §4):

| Function | Calls | Request | Response |
|---|---|---|---|
| `register` | `POST /auth/register` | `{name, email, password}` | `{user: PublicUser}` |
| `login` | `POST /auth/login` | `{email, password}` | `{user, accessToken}` |
| `me` | `GET /auth/me` | — (Bearer) | `{user: PublicUser}` |
| `refresh` | `POST /auth/refresh` | — (cookie) | `{accessToken}` |
| `logout` | `POST /auth/logout` | — (cookie) | `{message}` |
| `verifyEmail` | `GET /auth/verify-email?token=` | — | `{message}` |
| `resendVerification` | `POST /auth/resend-verification` | `{email}` | `{message}` |
| `changePassword` | `POST /auth/change-password` | `{currentPassword, newPassword}` (Bearer) | `{message}` — caller must then treat the session as ended (server revokes it) |
| `forgotPassword` | `POST /auth/forgot-password` | `{email}` | `{message}` |
| `resetPassword` | `POST /auth/reset-password` | `{token, newPassword}` | `{message}` |

`PublicUser = { id, name, email, role: "USER"|"ADMIN", status: "ACTIVE"|"INACTIVE", createdAt }`
— mirrors `backend/src/modules/auth/auth.types.ts` exactly; no `any`.

---

## 7. Screens, states, and copy behavior

Each form follows: Initial → (client validation on blur) → Submitting (button disabled, label
swaps to "-ing…") → Success (redirect, or an inline success panel where there's nowhere to
redirect to) → Error (banner and/or field errors, form stays editable, submit re-enabled).

- **Register** — fields: name, email, password. On success: replace the form with a "Check your
  email" panel (no redirect — there's nothing to redirect *to* yet since the account isn't
  active). Include a "Resend email" action wired to `resendVerification`.
- **Verify email** — reads `?token=`; on mount, calls `verifyEmail`. Three states: verifying
  (spinner), success (`SuccessCheck` + "Email verified — you can sign in now" + link to
  `/login`), failure ("This link is invalid or expired" + link back to register/resend). No
  form — it's an automatic action page.
- **Login** — fields: email, password. Special-cases the backend's `403 "Please verify your
  email"` response: banner shows that exact message plus an inline "Resend verification email"
  action (prompts for the email again since login doesn't have it server-confirmed pre-auth).
  Rate-limit (`429`) shows the backend's own message verbatim ("Too many login attempts. Try
  again later.").
- **Forgot password** — field: email. Always shows the same generic success panel regardless of
  whether the email exists (matches the backend's intentional non-enumeration — the frontend
  must not "helpfully" reveal whether an account exists).
- **Reset password** — reads `?token=`; fields: new password (+ confirm, client-side only — the
  backend doesn't require confirmation but it's a reasonable UX safeguard), both with the
  password show/hide toggle. On success: `SuccessCheck` + message + link to `/login` (backend
  revokes all sessions on reset, so there's no "you're now logged in" path).
- **Change password** (`/settings/security`) — fields: current password, new password. On
  success: explicit message "Password updated. Please log in again." then log the user out
  locally (session was revoked server-side) and redirect to `/login`.
- **Dashboard** (`/`) — shows the user's name/email and an honest empty state: "Projects aren't
  available yet — this is where your projects and tasks will show up once that part of the
  product is built." This is not a fake dashboard; it says plainly what's missing and why,
  per CLAUDE.md §11/§37 (no fake data, no meaningless "nothing here").

### Error banner rules
- `ApiError` with `fieldErrors` → map each to its `TextField`, plus optionally a summary banner
  ("Please fix the highlighted fields") only if there's a mix of field and non-field errors.
- `ApiError` without `fieldErrors` → banner shows `err.message` verbatim (backend messages are
  already human-safe, per `errorHandler.ts` always emitting `{message}` and never leaking stack
  traces/internals).
- Network failure (`fetch` throws, not an HTTP error) or an unparseable response → generic
  "Something went wrong. Please try again." — never show a raw `TypeError` or similar.
- 500 responses → backend always sends `{message: "Internal Server Error"}` for unhandled
  errors; the frontend shows a friendlier "Something went wrong. Please try again." instead of
  that literal string.

---

## 8. Components

Extracted only because they repeat across the 5 forms (per CLAUDE.md §26 — no speculative design
system):
- `Button` — variants: primary (accent fill), secondary (bordered), text/link. States: idle,
  hover, active, disabled, loading (spinner replaces label, width doesn't jump).
- `TextField` — label, input, inline error message (animated reveal, §2 Motion), focus ring using
  `--accent`. A `type="password"` field renders a show/hide toggle button inside it (icon
  cross-fades, §2 Motion) — `aria-pressed` on the toggle, `aria-label` "Show password"/"Hide
  password". Associates label/error via `htmlFor`/`aria-describedby` for a11y.
- `FormBanner` — top-of-form banner, variants: error, success, info. Animated reveal per §2.
- `Spinner` — single small inline spinner, reused by `Button` (loading) and full-page loading
  states (`RequireAuth` boot, `VerifyEmailPage`).
- `SuccessCheck` — small inline SVG checkmark with the stroke-draw animation from §2 Motion, used
  by `VerifyEmailPage` and `ResetPasswordPage` on their success state. No icon library dependency
  — this and the password-toggle eye icon are the only two icons the product needs, both hand-written inline SVGs.
- `AuthLayout` — the shared centered-card shell described in §3, owns the card entrance
  transition and the view-transition page-to-page cross-fade from §2 Motion.

`useForm` hook (`src/hooks/useForm.ts`): generic controlled-form state — `values`, `errors`,
`touched`, `handleChange`, `handleBlur` (triggers field validation), `handleSubmit(onSubmit)`
(runs full validation, calls `onSubmit(values)`, catches `ApiError` and merges `fieldErrors`
back into form state, sets `isSubmitting`). Validation rules per field are passed in and mirror
the backend's Zod constraints exactly (name ≥3 chars, password 8–72 chars, valid email shape) —
client-side validation is a UX convenience; the backend result is always authoritative and
already-shown field errors get overwritten by whatever the server actually says.

---

## 9. File structure

```
src/
  api/
    client.ts
    auth.ts
  auth/
    AuthContext.tsx
    RequireAuth.tsx
    RequireGuest.tsx
  types/
    auth.ts
  pages/
    RegisterPage.tsx
    VerifyEmailPage.tsx
    LoginPage.tsx
    ForgotPasswordPage.tsx
    ResetPasswordPage.tsx
    DashboardPage.tsx
    SecuritySettingsPage.tsx
    NotFoundPage.tsx
  components/
    ui/
      Button.tsx
      TextField.tsx
      FormBanner.tsx
      Spinner.tsx
    AuthLayout.tsx
  hooks/
    useForm.ts
  styles/
    tokens.css
    global.css
  App.tsx
  main.tsx
.env.example      (VITE_API_URL=http://localhost:4000/api/v1)
```

Existing Vite scaffold files (`App.css`, demo `assets/react.svg`, `assets/vite.svg`,
`assets/hero.png`) are removed as part of implementation — they're placeholder scaffold content,
not part of the product (CLAUDE.md §33 Phase 10 / §36 no placeholder UI).

---

## 10. Testing

Per the repo's Bun-as-dev-tooling rule (`CLAUDE.md` §1A), tests run via `bun test`, not
vitest/jest. Add `@testing-library/react` + a DOM shim (`happy-dom` via `@happy-dom/global-registrator`,
Bun's documented pattern for DOM testing) as dev dependencies.

Coverage for this scope:
- `useForm` — validation triggers, error merging from a mocked `ApiError`, `isSubmitting` toggling.
- `apiFetch` — 2xx pass-through, 4xx → `ApiError` with `fieldErrors`, network failure → distinguishable error, the single-retry-after-refresh behavior on 401.
- `AuthContext` boot — refresh-success-then-me path, refresh-failure path, both asserted via mocked `fetch`.
- Each page's critical path — happy path (renders, submits, calls the right API function, navigates), validation error path (bad input shows field errors), server error path (banner shown, form stays usable).

No end-to-end browser test layer in this scope (no Playwright) — the pages are simple enough
that RTL component tests cover the meaningful behavior; can be added later if the surface grows.

---

## 11. Explicit non-goals (this scope)

- No projects/members/tasks UI — no backend support (see PROJECT_MAP.md §15).
- No dark mode.
- No "remember me" / persistent-login-beyond-cookie option — the backend's 7-day refresh cookie
  already governs session length; no additional frontend mechanism.
- No password strength meter — backend only enforces length (8–72); inventing a strength
  heuristic the backend doesn't check would be UI that implies validation that isn't real.
- No social/OAuth login — backend only supports email+password.
