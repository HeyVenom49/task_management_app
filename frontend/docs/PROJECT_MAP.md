# Project Map

> Source of truth for frontend implementation. Verified against `backend/src` on 2026-09-24;
> re-verified for the projects/members/tasks slice on 2026-09-26.
> Priority when sources conflict: actual backend source code > this document > inference.

## 1. Product Understanding

A task management app. Users register/authenticate, then create **projects**, add **members** to
those projects with a role (`OWNER`/`MEMBER`), and manage **tasks** within a project assigned to a
member.

Both the **auth** slice and the **projects/members/tasks** slice are implemented on the backend
and the frontend as of 2026-09-26. See §15 for the one remaining known gap (reactivate-member is
backend-only, unreachable from the UI).

## 2. Backend Capabilities (implemented)

- Express app (`backend/src/app.ts`), Node-compatible, Postgres via `sql` client, Zod validation.
- CORS locked to `FRONTEND_URL` env var, `credentials: true` (cookies allowed cross-origin).
- Mounted at `/api` → versioned at `/api/v1` (see `backend/src/api/index.ts`, `v1.ts`).
- Modules implemented: `health`, `auth`, `projects` (includes the `member` sub-resource — routes,
  controller methods, and repository all live under `backend/src/modules/projects/`, there is no
  separate `members` module), `tasks` (nested under a project: `backend/src/modules/tasks/`).

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
 └── status(NOT_STARTED|IN_PROGRESS|BLOCKED|COMPLETED), default NOT_STARTED. Indexed on
     (project_id, status). Fully exposed via `/api/v1/projects/:id/tasks` (§4).
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

### Projects (verified, `backend/src/modules/projects`)

Base path: `/api/v1/projects` — every route requires `authenticate` (Bearer token).

| Method | Path                              | Body                | Response                | Notes |
|--------|------------------------------------|----------------------|--------------------------|-------|
| POST   | `/`                                 | `{ info(1-500) }`     | 201 `{ project, membership }` | creator becomes `OWNER` |
| GET    | `/`                                 | —                     | 200 `{ projects }`        | scoped to caller's ACTIVE memberships only (`project.repository.ts` `findForMember`); no admin-wide list |
| GET    | `/:id`                              | —                     | 200 `{ project }`         | 403 if caller is not an ACTIVE member |
| PATCH  | `/:id`                              | `{ info(1-500) }`     | 200 `{ project }`         | OWNER only |
| DELETE | `/:id`                              | —                     | 200 `{ message }`         | OWNER only |
| GET    | `/:id/members`                      | —                     | 200 `{ members }`         | ACTIVE members only (`member.repository.ts:101` filters `status='ACTIVE'`), joined with `name`/`email` |
| POST   | `/:id/members`                      | `{ email }`           | 201 `{ member }`          | OWNER only; target user must exist & be ACTIVE; new member role always `MEMBER` |
| DELETE | `/:id/members/:memberId`            | —                     | 200 `{ message }`         | OWNER only; soft-deactivates (status → INACTIVE); blocked if target is the last active OWNER |
| POST   | `/:id/members/:memberId/reactivate` | —                     | 200 `{ member }`          | platform `users.role === ADMIN` only (`project.service.ts:185`); **not wired to any frontend UI** — see §15 |

A project has **no `name` field**, only `info` (free text, ≤500 chars).

### Tasks (verified, `backend/src/modules/tasks`)

Base path: `/api/v1/projects/:id/tasks` — every route requires `authenticate`.

| Method | Path        | Body                                                                                   | Response         | Notes |
|--------|-------------|------------------------------------------------------------------------------------------|--------------------|-------|
| POST   | `/`          | `{ title(1-200), description?(≤500\|null), priority, status?, assigneeMemberId?\|null }` | 201 `{ task }`     | any ACTIVE member; `status` defaults `NOT_STARTED`; `assigneeMemberId` must be an ACTIVE member of the same project |
| GET    | `/`          | —                                                                                          | 200 `{ tasks }`    | any ACTIVE member; all tasks in the project, no server-side filtering/pagination |
| GET    | `/:taskId`   | —                                                                                          | 200 `{ task }`     | any ACTIVE member |
| PATCH  | `/:taskId`   | any subset of the create fields                                                           | 200 `{ task }`     | any ACTIVE member (not creator-restricted) |
| DELETE | `/:taskId`   | —                                                                                          | 200 `{ message }`  | only the task's creator or a project OWNER |

`priority`: `VERY_LOW\|LOW\|MODERATE\|HIGH\|URGENT`. `status`: `NOT_STARTED\|IN_PROGRESS\|BLOCKED\|COMPLETED`.
Error shape matches auth: `AppError` subclasses → `{ message }` with matching status; Zod
validation failures → 400 `{ message: "Validation failed", errors }`.

Full spec detail: `docs/superpowers/specs/2026-09-25-projects-tasks-frontend-design.md` §1.

## 5. Authentication & Authorization

- Access token: JWT, `Authorization: Bearer <token>`, default 15m expiry (`JWT_EXPIRES_IN`).
- Refresh token: opaque, stored as hash in `sessions` table, 7d expiry (`REFRESH_EXPIRES_IN`).
  - Web clients: delivered as an `httpOnly`, `sameSite=lax` cookie scoped to `/api/v1/auth`.
  - Mobile clients (`X-Client: mobile` header): delivered in the JSON response body instead,
    and must be sent back in the request body to `/refresh`.
- `authenticate` middleware (`shared/middleware/authenticate.ts`) requires the Bearer header only
  — it does not read the cookie. `req.user = { id, email }`.
- Role/permission checks are enforced at the service layer for `projects`/`tasks` (see §6) — auth
  routes themselves still have no role gating beyond "authenticated or not".

## 6. User Roles & Permissions

Verified against `backend/src/modules/projects/project.service.ts` and
`backend/src/modules/tasks/task.service.ts` on 2026-09-26.

- `members.role`: `OWNER` | `MEMBER`, scoped per-project. The project creator is always the first
  `OWNER`. Enforced in `ProjectServices` for: editing/deleting the project, inviting a member,
  removing a member (all OWNER-only).
- `users.role`: `USER` | `ADMIN`, platform-wide (already on `AuthContext`'s `user.role`). The
  *only* route gated on it is `POST /:id/members/:memberId/reactivate`
  (`project.service.ts:185`, `actor.role !== "ADMIN"` → 403) — and that endpoint has no
  frontend-reachable id to call it with (see §15), so in practice this gate is backend-only today.
- Task actions: create/edit/change-status/change-assignee are open to any ACTIVE project member
  (not role-gated). Delete is restricted to the task's creator or the project OWNER
  (`task.service.ts`).
- Any authenticated user who is not an ACTIVE member of a given project gets 403 from every
  project/task endpoint for that project — the frontend treats this identically to "not found"
  (design spec §7, `ProjectPage`'s not-found state), never revealing that the project exists.
- Frontend permission checks (hiding Settings tab / invite / remove / delete-task) are UX
  affordances only — the backend service layer remains authoritative, per CLAUDE.md §13.

## 7. User Journeys (backend-supported today)

```text
Register → verify email (link w/ token) → login
Login → access dashboard while access token valid → silent refresh via cookie → logout
Forgot password → email w/ reset token → reset password → must log in again
Logged-in user → change password → must log in again
```

```text
Dashboard → "New project" → create (POST /projects) → land on /projects/:id/tasks (owner)
Project (as owner) → Members tab → invite by email (POST /:id/members) → member appears
Invited member → logs in → sees project on their own dashboard (GET /projects, scoped to
  their memberships) → opens it
Project (any ACTIVE member) → Tasks tab → "New task" → TaskDrawer (create mode) → assign to
  a member → POST /:id/tasks
Any ACTIVE member → opens a task row → TaskDrawer (edit mode) → change status/assignee/priority
  → PATCH /:id/tasks/:taskId
Task's creator or project OWNER → delete task (ConfirmDialog) → DELETE /:id/tasks/:taskId
  (a non-creator, non-owner member never sees the delete action — §6)
Project OWNER → Settings tab → edit info (PATCH /:id) or delete project (DELETE /:id,
  ConfirmDialog) → redirected to dashboard on delete
Project OWNER → Members tab → remove member (DELETE /:id/members/:memberId) → member
  disappears from the list (soft-deactivated, not reachable again from the UI — §15)
```

## 8. Routes / Screens (implemented, verified against `src/App.tsx` 2026-09-26)

```text
/register
/verify-email          (consumes ?token=, calls GET /auth/verify-email)
/login
/forgot-password
/reset-password         (consumes ?token=)
/                       → DashboardPage — list of the caller's projects, "New project"
/projects/:id           → ProjectPage (shell: header + tab nav), index redirects → tasks
  /projects/:id/tasks     → ProjectTasksPage — task list, "New task" → TaskDrawer
  /projects/:id/members   → ProjectMembersPage — member list, invite (owner), remove (owner)
  /projects/:id/settings  → ProjectSettingsPage — owner only: edit info, delete project
/settings/security       → change password
*                        → NotFoundPage
```

No standalone task-detail route — a task opens in a slide-over `TaskDrawer` over the Tasks tab
(dual-purpose: create mode and edit mode). No reactivate-member route/UI (see §15).

## 9. Component Map

Verified against `frontend/src/components` and `frontend/src/components/ui` on 2026-09-26.

```text
components/
├── AppShell            top-level nav shell, used by every authenticated route
├── AuthLayout           centered-card layout, used by the auth screens
├── ProjectRow            dashboard list item (DashboardPage)
├── TaskRow               dense task-list row: status pill, title, priority pill, assignee
│                         initials, updated-at (ProjectTasksPage)
├── TaskDrawer            slide-over, dual-purpose create/edit task, delete action inside when
│                         editing and permitted (ProjectTasksPage)
├── MemberRow             members-list row (ProjectMembersPage)
└── ui/
    ├── Button, TextField, TextArea    form primitives (auth screens + all project/task forms)
    ├── FormBanner                      inline error/success banner (all forms)
    ├── Spinner, SuccessCheck           loading / confirmation micro-interactions
    ├── ConfirmDialog                   shared modal — delete project, delete task, remove member
    ├── Tabs                            tab-nav primitive — Tasks/Members/Settings (ProjectPage)
    ├── StatusPill                      task status badge (TaskRow, TaskDrawer)
    └── PriorityPill                    task priority badge (TaskRow, TaskDrawer)
```

Feature-specific components (`ProjectRow`, `TaskRow`, `TaskDrawer`, `MemberRow`) stay flat in
`components/` rather than nested under a `features/` tree — matches the existing (small) scale of
the codebase, no separate feature-folder convention was introduced.

## 10. State Map

Auth flows need: Initial, Loading, Submitting, Success, Validation-Error (per-field, from Zod
`errors`), Rate-Limited (429, from `loginLimiter`/`authWriteLimiter`), Unauthorized (401),
Network-Failure. Token refresh needs a silent-retry-then-redirect-to-login pattern.

Dashboard/Tasks/Members screens (per the design spec's §7) implement: Initial/Loading (skeleton
rows, not a bare spinner), Loaded, Empty (dashboard: "no projects yet" + CTA; tasks: "no tasks
yet" + CTA; members is never empty — the OWNER creator is always present), Error (network/500 →
`FormBanner` with a retry action), and Forbidden-as-Not-Found (a project/task the caller isn't an
ACTIVE member of, or a deleted/nonexistent id, renders one generic "Project not found" state
rather than a distinct Forbidden page, so the UI never confirms a project's existence to a
non-member). Mutations (create/edit/delete project, task, member) reuse the existing
`isSubmitting`-disables-button → `FormBanner`-on-failure pattern from the auth forms.

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

Dashboard (list)      → GET    /api/v1/projects                        → caller's memberships
Create project         → POST   /api/v1/projects                        → creator becomes OWNER
Project header/tabs    → GET    /api/v1/projects/:id                     → 403 if not ACTIVE member
                        → GET    /api/v1/projects/:id/members             → role/permission derivation
Edit project info       → PATCH  /api/v1/projects/:id                     → OWNER only
Delete project           → DELETE /api/v1/projects/:id                     → OWNER only
Invite member             → POST   /api/v1/projects/:id/members             → OWNER only
Remove member              → DELETE /api/v1/projects/:id/members/:memberId  → OWNER only, soft-deactivate
Task list                  → GET    /api/v1/projects/:id/tasks               → any ACTIVE member
Create task                 → POST   /api/v1/projects/:id/tasks               → any ACTIVE member
Edit/reassign/restatus task  → PATCH  /api/v1/projects/:id/tasks/:taskId       → any ACTIVE member
Delete task                  → DELETE /api/v1/projects/:id/tasks/:taskId       → creator or OWNER only
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
[x] API map (auth, projects, tasks — full surface)
[x] PROJECT_MAP.md created
[x] Product model / UX architecture sign-off
[x] Design language (Phase 4)
[x] Application shell + routing
[x] Auth flow (register/verify/login/refresh/logout/password reset+change)
[x] Post-login dashboard (real project list, create-project flow)
[x] Projects workflow (create, view, edit info, delete — owner-gated where applicable)
[x] Tasks workflow (create, view, edit, reassign, restatus, delete — creator/owner-gated delete)
[x] Members workflow — invite/list/remove implemented and verified; reactivate intentionally
    NOT built (no frontend-reachable id — GET /:id/members never returns INACTIVE members, see §15)
[ ] Responsive refinement (not separately audited in this pass)
[ ] Accessibility audit (not separately audited in this pass)
```

## 15. Known Backend Limitations

- **Reactivate-member is unreachable from the UI.** `POST /:id/members/:memberId/reactivate`
  exists and is platform-ADMIN-gated (`project.service.ts:185`), but
  `MemberRepository.listByProjectId` filters `WHERE ... AND m.status = 'ACTIVE'`
  (`member.repository.ts:101`) — no endpoint ever returns an INACTIVE member's id, so the frontend
  has nothing to call `reactivate` with. Not built in this pass, by design (see §17). Would need a
  backend change (e.g. an admin-only "list inactive members" query, or an `includeInactive` flag)
  to become buildable — out of scope for this plan per CLAUDE.md §4.
- A project has **no `name` field**, only `info` (free text, ≤500 chars) — reflected throughout
  the dashboard/project-header UI (info text doubles as the title).
- `backend/CLAUDE.md` (described a Bun-only stack — `Bun.serve()`, no Express — that never
  matched the actual Express+Postgres backend) has since been removed from the working tree.
  No longer a live discrepancy to track.
- No forgot-password/reset-password/verify-email **email sending** confirmed wired to a real
  provider from what's inspected so far (tokens are generated/hashed; delivery mechanism not
  yet verified) — flag as open question, not yet confirmed either way.

## 16. Open Questions

- ~~Should the frontend build the full auth flow now and stub/defer the dashboard, or wait for a
  projects/tasks backend module before starting?~~ Resolved 2026-09-24: build the full auth flow
  now; dashboard stays a minimal, honest placeholder until a projects/tasks API exists.
- ~~When the projects/tasks backend module lands, revisit §7/§8/§14 to unblock the
  dashboard/projects/tasks workflows.~~ Resolved 2026-09-25/26: it landed — this is the answer.
  Projects/members/tasks are implemented end-to-end per this project map's current state.
- No forgot/reset/verify-email delivery-mechanism confirmation (carried over from §15, still open
  — unrelated to this feature).

## 17. Deferred Work

- **Reactivate-member UI** — backend endpoint exists but has no frontend-reachable id (§15).
- **Real-time updates** (websockets/polling) — nothing in the backend suggests this is coming;
  static fetch-on-mount matches what exists today.
- **Task comments/attachments/activity history** — no backend support.
- **A persistent project-switcher sidebar** — considered during brainstorming (Approach A),
  deferred; revisit if a user's project count grows enough that the dashboard-list pattern stops
  scaling.
- **Admin-wide project/member management** — no such backend endpoint exists; `GET /projects` is
  always scoped to the caller's own memberships.
- **No responsive breakpoints in the projects/tasks feature's stylesheets** — none of the new
  CSS modules (project list, tabs, task list, drawer, dialogs, etc.) contain a `@media` query
  other than `prefers-reduced-motion`. The task list and other dense screens will squeeze or
  overflow at phone widths; a real responsive pass (breakpoints, not just fluid units) is next.
- **`ConfirmDialog` and `TaskDrawer` declare modal ARIA roles without modal keyboard behavior** —
  both render `role="dialog"`/`"alertdialog"` with `aria-modal="true"`, but neither implements
  Escape-to-close, a focus trap while open, or focus-restore to the trigger on close. As shipped
  this is a worse-than-nothing signal to assistive tech: it claims the background is inert while
  keyboard focus can still reach it. Needs a standalone accessibility pass.

## 18. Completed Work

- Backend reconnaissance (auth module, schema, middleware, env, CORS/cookie behavior).
- This project map.
- **2026-09-25 — Auth frontend implementation complete (Tasks 1–18 of the plan).** Built the
  full auth-only frontend against the backend's `/api/v1/auth` surface (see §4):
  design tokens (typography/color/spacing/radius/motion, §12); the shared `useForm` hook and
  `apiFetch` client; `AuthContext`/session bootstrap with silent refresh-on-load and in-memory
  access token; route guards (redirect unauthenticated users to `/login`, redirect authenticated
  users away from auth screens); `AppShell` navigation; and every screen in §8 — Register,
  VerifyEmail, Login, ForgotPassword, ResetPassword, an honest placeholder Dashboard (no
  fabricated projects/tasks content, per §15), and SecuritySettings (change password, which logs
  the user out per backend behavior). Logout is wired through `AuthContext`. All work verified
  via Task 18's final integration pass: `bun test` (56 pass / 0 fail / 0 errors across 20 files),
  `bun run build` (`tsc -b && vite build`, zero errors), `bun run lint` (zero errors), and a
  `TODO`/`FIXME` sweep of `src/` (no matches).
  Plan: `docs/superpowers/plans/2026-09-24-auth-frontend.md`.
  Spec: `docs/superpowers/specs/2026-09-24-auth-frontend-design.md`.
- **Pending:** Task 18 Step 4 (manual smoke test walking register → verify-email → login →
  change-password → logout → forgot/reset-password against a real running backend, plus a
  `prefers-reduced-motion` check) was **not** run in this pass — no backend instance, database,
  or credentials were available in this environment. This step still needs to be run by hand
  against a real backend (Postgres + Express, per `backend/src/config/env.ts`) before the auth
  feature is considered fully verified end-to-end. See Task 18's brief and report for the exact
  walkthrough steps.
- **2026-09-26 — Projects/Members/Tasks frontend implementation complete (Tasks 1–16 of the
  `2026-09-25-projects-tasks-frontend` plan).** Built the full project/member/task workflow
  against the backend's `/api/v1/projects` and `/api/v1/projects/:id/tasks` surfaces (§4): a
  one-line backend typo fix (`task.repository.ts`'s `update()` `RETURNING` clause,
  `assingnee_member_id` → `assignee_member_id`, verified fixed in source — Task 1); typed API
  layers `src/api/projects.ts`/`src/api/tasks.ts` and `src/types/project.ts`/`src/types/task.ts`;
  new UI primitives `StatusPill`, `PriorityPill`, `TextArea`, `ConfirmDialog`, `Tabs`; feature
  components `TaskDrawer`, `TaskRow`, `MemberRow`, `ProjectRow`; a rewritten `DashboardPage` (real
  project list + create flow, replacing the honest placeholder); `ProjectPage` shell with
  header/tab nav and forbidden-as-not-found handling; `ProjectTasksPage`, `ProjectMembersPage`
  (invite/list/remove — reactivate intentionally not built, §15/§17), `ProjectSettingsPage`
  (edit/delete, owner-gated); and route wiring in `src/App.tsx` per §8. All work verified via this
  task's (Task 16) final integration pass:
    - `bun test` — 110 pass / 0 fail across 35 files (182 `expect()` calls). Pre-existing
      `act()` warnings from `useForm.test.tsx`/`LoginPage.test.tsx` are informational, not
      failures — not introduced by this feature.
    - `bun run build` (`tsc -b && vite build`) — zero TypeScript errors, zero build errors.
    - `bun run lint` (`eslint .`) — zero errors.
    - `grep -rn "TODO\|FIXME" src` — no matches.
    - Backend claims (typo fix, ACTIVE-only member filter, ADMIN-gated reactivate, OWNER/creator
      permission checks) re-verified directly against `backend/src/modules/projects/*` and
      `backend/src/modules/tasks/*` source in this pass, not taken on faith from the spec.
  Plan: `docs/superpowers/plans/2026-09-25-projects-tasks-frontend.md`; task briefs/reports live
  under `.superpowers/sdd/2026-09-25-projects-tasks-frontend/`.
  Spec: `docs/superpowers/specs/2026-09-25-projects-tasks-frontend-design.md`.
  Minor cosmetic findings parked during code review (none blocking): small duplication between an
  effect's fetch logic and its retry handler in `ProjectPage.tsx` and `DashboardPage.tsx`;
  `ProjectSettingsPage.tsx` references `styles.form`, a class not defined in
  `ProjectSettingsPage.module.css` (form still renders correctly, one intended layout rule is
  just inert); `TaskDrawer` has no focus-trap/Escape-to-close (matches the plan's own reference
  code, not unique to this task).
- **Pending:** the manual multi-user smoke test described in this plan's spec §8 (register two
  users → verify both → login as A → create project → invite B → B sees it on their dashboard →
  B assigned a task → A edits its status → B's delete attempt on a task they don't own/aren't
  OWNER for fails → A (creator) deletes it successfully) was **not** run in this pass — no backend
  instance, Postgres database, or credentials were reachable in this environment, the same gap
  the auth feature's entry above already recorded. This still needs to be run by hand against a
  real backend before the projects/members/tasks feature is considered fully verified end-to-end.
