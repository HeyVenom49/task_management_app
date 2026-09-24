# Project Map

> Source of truth for frontend implementation. Verified against `backend/src` on 2026-09-24.
> Priority when sources conflict: actual backend source code > this document > inference.

## 1. Product Understanding

A task management app. Users register/authenticate, then (once the backend exposes it) create
**projects**, add **members** to those projects with a role, and manage **tasks** within a
project assigned to a member.

Only the **auth** slice of this product is implemented on the backend today. Projects, members,
and tasks exist only as database tables — there is no API for them yet (see §15).

## 2. Backend Capabilities (implemented)

- Express app (`backend/src/app.ts`), Node-compatible, Postgres via `sql` client, Zod validation.
- CORS locked to `FRONTEND_URL` env var, `credentials: true` (cookies allowed cross-origin).
- Mounted at `/api` → versioned at `/api/v1` (see `backend/src/api/index.ts`, `v1.ts`).
- Modules implemented: `health`, `auth`. No `projects`, `members`, or `tasks` modules exist yet.

## 3. Resources & Relationships (from `001_initial_schema.sql`)

```text
users
 ├── id, name, email (unique), hash_password, role(USER|ADMIN), status(ACTIVE|INACTIVE)
 └── projects (via creator_id)
projects
 ├── id, creator_id → users.id, info, timestamps
 └── members (1:N)
members  (join: user ↔ project)
 ├── user_id → users.id, project_id → projects.id
 ├── role(OWNER|MEMBER), status(ACTIVE|INACTIVE)
 └── UNIQUE(user_id, project_id), UNIQUE(id, project_id)
tasks
 ├── project_id → projects.id
 ├── creator_member_id, assignee_member_id → members.id (composite FK incl. project_id)
 ├── title, description, priority(VERY_LOW|LOW|MODERATE|HIGH|URGENT)
 └── status(NOT_STARTED|IN_PROGRESS|BLOCKED|COMPLETED), default NOT_STARTED — added by
     `006_add_task_status.sql` (untracked/uncommitted as of 2026-09-24). Indexed on
     (project_id, status). Still no route/controller/service exposes it — see §15.
```

Indexes: `members(project_id)`, `tasks(project_id)`. Uniqueness on `users.email` and
`members(user_id, project_id)`.

## 4. API Map (verified, `backend/src/modules/auth`)

Base path: `/api/v1/auth`

| Method | Path                    | Auth        | Body / Query                              | Notes |
|--------|-------------------------|-------------|--------------------------------------------|-------|
| POST   | `/register`              | none        | `{ name(≥3), email, password(8–72) }`      | 201 → `{ user }` |
| POST   | `/login`                 | none        | `{ email, password }`                      | rate-limited (`loginLimiter`); sets refresh cookie; 200 → user+access token (refresh omitted unless `X-Client: mobile`) |
| GET    | `/me`                    | Bearer      | —                                           | 200 → `{ user }` |
| POST   | `/refresh`                | cookie or body | `{ refreshToken }` (mobile) or cookie   | rotates session; reuse of a revoked token revokes all sessions |
| POST   | `/logout`                 | cookie/body | —                                           | clears refresh cookie |
| GET    | `/verify-email`           | none        | `?token=`                                   | 200 → message |
| POST   | `/resend-verification`    | none        | `{ email }`                                 | rate-limited; generic message (no enumeration) |
| POST   | `/change-password`        | Bearer      | `{ currentPassword, newPassword(8–72) }`    | clears refresh cookie (forces re-login) |
| POST   | `/forgot-password`        | none        | `{ email }`                                 | rate-limited; generic message |
| POST   | `/reset-password`         | none        | `{ token, newPassword(8–72) }`              | clears refresh cookie |

Validation errors: `400 { message: "Validation failed", errors: <zod field errors> }`.
Auth errors: `401 { message: "Unauthorized" }` (thrown as `UnauthorizedError` elsewhere).

## 5. Authentication & Authorization

- Access token: JWT, `Authorization: Bearer <token>`, default 15m expiry (`JWT_EXPIRES_IN`).
- Refresh token: opaque, stored as hash in `sessions` table, 7d expiry (`REFRESH_EXPIRES_IN`).
  - Web clients: delivered as an `httpOnly`, `sameSite=lax` cookie scoped to `/api/v1/auth`.
  - Mobile clients (`X-Client: mobile` header): delivered in the JSON response body instead,
    and must be sent back in the request body to `/refresh`.
- `authenticate` middleware (`shared/middleware/authenticate.ts`) requires the Bearer header only
  — it does not read the cookie. `req.user = { id, email }`.
- No role/permission checks exist anywhere yet (no `ADMIN` gating, no project-role gating) —
  `role`/`member_role` fields exist in the schema but are not enforced by any route today.

## 6. User Roles & Permissions

- `users.role`: `USER` | `ADMIN` — defined, unused by any route so far.
- `members.role`: `OWNER` | `MEMBER` — defined, unused (no members API yet).
- Frontend must not assume any permission gating beyond "authenticated or not" until a
  projects/members API exists.

## 7. User Journeys (backend-supported today)

```text
Register → verify email (link w/ token) → login
Login → access dashboard while access token valid → silent refresh via cookie → logout
Forgot password → email w/ reset token → reset password → must log in again
Logged-in user → change password → must log in again
```

Projects/tasks journeys (create project, invite member, create/assign/update task) are **not
buildable yet** — no backend support. See §15.

## 8. Routes / Screens (proposed, not yet built)

```text
/register
/verify-email        (consumes ?token=, calls GET /auth/verify-email)
/login
/forgot-password
/reset-password       (consumes ?token=)
/                     → dashboard (post-login home; content TBD once projects API exists)
/settings/security     → change password
```

No project/task routes until backend exposes those resources.

## 9. Component Map

Not started — `frontend/src` is still the untouched Vite/React/TS scaffold (default `App.tsx`,
demo assets). No app-specific components exist yet.

## 10. State Map

Auth flows need: Initial, Loading, Submitting, Success, Validation-Error (per-field, from Zod
`errors`), Rate-Limited (429, from `loginLimiter`/`authWriteLimiter`), Unauthorized (401),
Network-Failure. Token refresh needs a silent-retry-then-redirect-to-login pattern.

## 11. Frontend ↔ Backend Dependencies

```text
Register form      → POST /api/v1/auth/register     → users table
Login form          → POST /api/v1/auth/login         → users + sessions
Session bootstrap   → GET  /api/v1/auth/me            → Bearer token required
Silent refresh       → POST /api/v1/auth/refresh       → refresh cookie (web) / body (mobile)
Logout               → POST /api/v1/auth/logout
Verify email         → GET  /api/v1/auth/verify-email  → ?token=
Resend verification  → POST /api/v1/auth/resend-verification
Change password      → POST /api/v1/auth/change-password  (Bearer required)
Forgot password       → POST /api/v1/auth/forgot-password
Reset password        → POST /api/v1/auth/reset-password
```

## 12. Design Direction

Established 2026-09-24 (brainstorming session), scope: full auth flow only (register, verify
email, login, forgot/reset password, change password, logout, silent refresh, minimal
authenticated placeholder home). Full spec: `docs/superpowers/specs/2026-09-24-auth-frontend-design.md`.

- **Product name:** Docket — a docket is literally "a list of matters to be dealt with"
  (legal/court usage), directly on-theme for task management, no industry-specific baggage.
- **Personality:** dense & utilitarian (Linear/Superhuman-inspired, not cloned) — compact
  spacing, no illustration/hero assets, monospace accents for metadata.
- **Typography:** system-ui sans for UI text, `ui-monospace` for metadata/labels. No webfont.
- **Color:** warm off-white background (#FAFAF9), near-black text (#17171A), single deep
  oxblood/brick-red accent (#9A2B1F, "stamp ink" — a docket entry is stamped) kept visually
  distinct from the brighter danger red (#DC2626). Semantic success/warning/info also defined.
- **Spacing/radius/shadow:** 4px base spacing scale; 6px radius on inputs/buttons, 10px on
  panels; shadows reserved for genuinely elevated surfaces (dropdowns), flat 1px borders
  elsewhere.
- **Motion (revised 2026-09-24):** state-driven, not decorative — native CSS + the View
  Transitions API (no animation library). Page-to-page cross-fade between auth screens, card
  entrance on mount, animated error/banner reveals, button press/loading cross-fade, a
  password show/hide toggle, and a stroke-draw success checkmark on the two pure-confirmation
  screens (verify-email, reset-password success). All wrapped for `prefers-reduced-motion`.
- **Layout:** compact centered single-column card for auth screens, no split-screen hero.
- **Stack:** React Router, plain CSS with custom-property tokens (no Tailwind), a small typed
  `apiFetch` wrapper + React Context for session (no React Query), manual controlled forms via
  one shared `useForm` hook (no react-hook-form). Access token in memory only, never persisted.
- **Testing:** `bun test` + `@testing-library/react` (happy-dom), per repo's Bun-tooling rule.

## 13. Design Decisions

See the design doc above for full reasoning. Key ones worth remembering:
- Accent color is thematically justified (stamp ink), not arbitrary — avoids CLAUDE.md's
  "uniqueness must not come from randomly changing colors" trap.
- No dark mode in v1 (deferred) — keeps scope focused on the auth flow itself.
- `register` does not auto-login (backend returns only `{ user }`, no tokens) — UI must route
  to a "check your email" screen, not straight into the app.
- `refresh` returns only a new access token, not the user — app-boot flow is
  `POST /refresh` → `GET /me`, not `POST /refresh` alone.

## 14. Implementation Status

```text
[x] Backend reconnaissance
[x] API map (auth only — projects/tasks have no API yet)
[x] PROJECT_MAP.md created
[ ] Product model / UX architecture sign-off
[ ] Design language (Phase 4)
[ ] Application shell + routing
[ ] Auth flow (register/verify/login/refresh/logout/password reset+change)
[ ] Post-login dashboard (blocked — needs projects API)
[ ] Projects workflow (blocked — needs backend module)
[ ] Tasks workflow (blocked — needs backend module)
[ ] Members workflow (blocked — needs backend module)
[ ] Responsive refinement
[ ] Accessibility audit
```

## 15. Known Backend Limitations

- No `projects`, `members`, or `tasks` API — tables exist in the DB, no routes/controllers.
  Schema is actively evolving (see `006_add_task_status.sql`, uncommitted as of 2026-09-24,
  which adds `tasks.status`) — a projects/tasks backend module looks to be in progress.
- No role/permission enforcement anywhere (`user_role`, `member_role` unused by middleware).
- `backend/CLAUDE.md` (described a Bun-only stack — `Bun.serve()`, no Express — that never
  matched the actual Express+Postgres backend) has since been removed from the working tree
  (unstaged delete as of 2026-09-24). No longer a live discrepancy to track.
- No forgot-password/reset-password/verify-email **email sending** confirmed wired to a real
  provider from what's inspected so far (tokens are generated/hashed; delivery mechanism not
  yet verified in this pass) — flag as open question, not yet confirmed either way.

## 16. Open Questions

- ~~Should the frontend build the full auth flow now and stub/defer the dashboard, or wait for a
  projects/tasks backend module before starting?~~ Resolved 2026-09-24: build the full auth flow
  now; dashboard stays a minimal, honest placeholder until a projects/tasks API exists.
- When the projects/tasks backend module lands (schema work is visibly in progress — see §15),
  revisit §7/§8/§14 to unblock the dashboard/projects/tasks workflows.

## 17. Deferred Work

- Everything under Projects, Members, Tasks (no backend support).
- Admin-role-specific UI (no backend enforcement to build against).

## 18. Completed Work

- Backend reconnaissance (auth module, schema, middleware, env, CORS/cookie behavior).
- This project map.
