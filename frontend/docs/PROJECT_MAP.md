# Project Map

> Source of truth for frontend implementation. Verified against `backend/src` on 2026-09-24;
> re-verified for the projects/members/tasks slice on 2026-09-26; dual-theme (dark mode) added
> 2026-09-28 (frontend-only, no backend changes).
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
| PATCH  | `/:taskId`   | any subset of the create fields                                                           | 200 `{ task }`     | OWNER/creator: any fields; assignee: `status` only (mixed fields → 403); other members → 403 |
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
- Task create: any ACTIVE member. Task update (`assertCanUpdateTask`): project OWNER or task
  creator → all fields; assignee → `status` only (extra fields → 403 entire request); other
  active members → 403. Delete: creator or OWNER (`task.service.ts`).
- Any authenticated user who is not an ACTIVE member of a given project gets 403 from every
  project/task endpoint for that project — the frontend treats this identically to "not found"
  (design spec §7, `ProjectPage`'s not-found state), never revealing that the project exists.
- Frontend permission checks (Settings tab / invite / remove / delete-task / TaskDrawer field
  enablement + PATCH body shape via `utils/taskPermissions.ts`) are UX affordances only — the
  backend service layer remains authoritative, per CLAUDE.md §13.

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
OWNER/creator → TaskDrawer full edit → PATCH all fields
Assignee (non-owner/creator) → TaskDrawer status-only → PATCH `{ status }` only
Other member → TaskDrawer read-only (no Save)
Task's creator or project OWNER → delete task → DELETE /:id/tasks/:taskId
  (non-creator, non-owner never sees Delete — §6)
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
    ├── PriorityPill                    task priority badge (TaskRow, TaskDrawer)
    └── ThemeToggle                     light/dark toggle icon-button (AppShell topbar)
```

`theme/ThemeContext.tsx` (`ThemeProvider`/`useTheme`) and `utils/contrast.ts`
(`contrastRatio`/`compositeOver`/`relativeLuminance` — WCAG relative-luminance contrast math, used
only by its own test suite, which checks both token-vs-canvas pairs and real composed pairings —
pill text on its own tinted background, the modal/drawer overlay scrim over each theme's
canvas — not just tokens in isolation) added 2026-09-28; see §12's Theming note.

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
Edit task (full)             → PATCH  /api/v1/projects/:id/tasks/:taskId       → OWNER or creator
Restatus task                → PATCH  /api/v1/projects/:id/tasks/:taskId       → assignee (`status` only)
Delete task                  → DELETE /api/v1/projects/:id/tasks/:taskId       → creator or OWNER only
```

## 12. Design Direction

Revised 2026-09-26 as **Docket Signal** (full visual overhaul; IA/routes/API unchanged).
Original auth-only spec remains historical in `docs/superpowers/specs/2026-09-24-auth-frontend-design.md`.
References (principles only, not clones): Linear density, Cursor singular accent, Cal clarity,
Superhuman tight type — via `frontend/design-md/` + taste skill.

- **Product name:** Docket — "a list of matters to be dealt with."
- **Personality:** cool utilitarian craft with editorial type presence — dense enough for daily
  lists, not a marketing landing page.
- **Typography:** self-hosted **Outfit** (UI) + **JetBrains Mono** (metadata only).
- **Color:** cool zinc canvas (`#F4F4F5`), near-black ink (`#18181B`), singular **signal teal**
  accent (`#0D9488` / hover `#0F766E`). Danger stays distinct (`#DC2626`). No oxblood.
- **Spacing/radius/shadow:** 4px spacing scale; 6px / 10px radii; soft elevation on auth card +
  drawer; hairline borders elsewhere.
- **Motion:** state-driven CSS + View Transitions; auth panel enter, row hover, drawer slide;
  all honor `prefers-reduced-motion`.
- **Layout:** auth = asymmetric split (teal brand column + form); app = sticky frosted top bar,
  max-width content column.
- **Stack:** React Router, CSS modules + tokens (no Tailwind), `apiFetch` + Auth Context,
  shared `useForm`. Access token in memory only.
- **Testing:** `bun test` + `@testing-library/react` (happy-dom).
- **Theming (added 2026-09-28):** a dark theme now exists alongside the light "Warm Desk" theme
  above, togglable via `ThemeToggle` in `AppShell`'s topbar. Defaults to the visitor's OS
  preference (`prefers-color-scheme`) on first visit, then persists the explicit choice to
  `localStorage` (`docket-theme`). Mechanism: a `data-theme="dark"` attribute on `<html>`
  (`src/theme/ThemeContext.tsx`), with CSS custom-property overrides in `tokens.css`'s
  `:root[data-theme="dark"]` block — every component already consumed `var(--*)` tokens, so no
  component CSS needed to change, only the token values. A small inline script in `index.html`
  applies the stored/system theme before React mounts, to avoid a flash of the wrong theme on
  reload. Dark values keep the light theme's own teal accent and Outfit/JetBrains Mono typography
  (not a re-skin) — only the canvas/surface/border/text palette gets a near-black, Linear-inspired
  counterpart. `tokens.css` declares `color-scheme: light` / `dark` per theme so native browser UI
  (scrollbars, form controls) follows the app theme too. Every text/background pairing actually
  used by a themed component — token-vs-canvas pairs, pill text composited on its own tinted
  background, and the modal/drawer overlay scrim composited over each theme's canvas — is covered
  by an automated WCAG AA contrast test (`src/utils/contrast.ts` + `.test.ts`), not just eyeballed
  or checked as an isolated token pair (a first pass that only checked tokens against `--bg` missed
  three real failures — see §13).

## 13. Design Decisions

- Accent is **signal teal** (from-scratch 2026-09-26 overhaul), not stamp-ink oxblood.
- Design-md brands are reference vocabulary only — no copied palettes, proprietary fonts, or layouts.
- **Dark mode added 2026-09-28** (supersedes the earlier "deferred" decision below): dark is a
  full alternative theme, not a partial/sidebar-only treatment — see §12's Theming note. The
  existing light theme's palette, typography, and layout are unchanged; only new dark-mode token
  values and a toggle were added.
- The light theme's `--text-muted` value had a real WCAG AA contrast failure against
  `--surface-inset` (2.14:1, measured while building the dark-theme contrast test suite; AA
  requires 4.5:1 for normal text). Fixed 2026-09-28 by darkening `--text-muted` from `#a8a29e` to
  `#6b655d` (now 4.88:1) — a one-token color correction, not a redesign. Recorded here so it isn't
  rediscovered as a mystery later.
- **Final-review fix pass (2026-09-28)** found the first contrast suite only checked tokens against
  `--bg`/`--surface-inset` in isolation, missing how colors actually composite in the app. Three
  real WCAG AA failures were found and fixed:
  - Dark `--text-muted` (`#8a7e6f`) failed 4.5:1 against `--surface-raised` (4.21:1) and `--surface`
    (4.45:1) — both lighter than `--surface-inset`, the only surface the first suite tested against,
    so a token-vs-bg-only test passed while the real worst case failed. Lightened to `#9a8d7c` (now
    ≥4.6:1 against every dark surface, including a pill's own 8%-tinted background).
  - Light `--warning` (`#b45309`) failed 4.5:1 against its own tinted pill background (`StatusPill`
    `.BLOCKED` at 14%: 3.82:1; `PriorityPill` `.MODERATE` at 12%: 3.95:1) — pill text is
    `--text-xs` (12px), which is WCAG "normal text" (4.5:1), not "large text" (3:1); the first
    suite tested `--warning` against `--bg` at the large-text threshold, which doesn't reflect how
    the color is actually used. Darkened to `#92450a` (now ≥5:1 against both pill backgrounds).
  - `TaskDrawer`/`ConfirmDialog`'s overlay scrim was a fixed `rgba(28, 25, 23, N)`, intended to be
    theme-invariant, but `(28, 25, 23)` is lighter than the dark theme's `--bg` (`#171310`) — so in
    dark mode the "dimming" scrim actually lightened the page instead of dimming it. Changed to a
    pure-black base (`rgba(0, 0, 0, N)`), which is guaranteed darker than any canvas. All three now
    have a permanent regression test in `contrast.test.ts`'s composed-background suite.
- `ThemeContext.tsx`'s `localStorage` access is now guarded (`try`/`catch` around both the read in
  `getInitialTheme` and the write in `setTheme`) so a privacy-restricted browser (storage blocked or
  full) degrades to an in-memory-only theme instead of crashing the whole app — there's no error
  boundary above `ThemeProvider` in `main.tsx`, so an unguarded throw here previously would have
  blanked the entire app, not just the toggle. Also fixed: the provider used to write to
  `localStorage` on every mount, including one that only derived its value from OS preference —
  permanently freezing that default into storage before the visitor ever made a choice. Persistence
  now happens only inside `setTheme`, i.e. only on an explicit toggle click.
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
[x] Dual-theme (dark mode) — toggle, system-preference default, persisted choice, no-flash
    on reload, hardcoded-color audit, automated WCAG contrast suite (2026-09-28)
[ ] Responsive refinement (not separately audited in this pass)
[ ] Accessibility audit (not separately audited in this pass; note ConfirmDialog/TaskDrawer's
    modal-keyboard gap in §17 — unchanged by the theming work)
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
- **2026-09-28 — Dual-theme (dark mode) implementation complete (Tasks 1–8 of the
  `2026-09-28-dual-theme` plan).** Added a dark theme alongside the existing light "Warm Desk"
  theme: `:root[data-theme="dark"]` token overrides in `tokens.css` (§12); `ThemeContext`
  (`ThemeProvider`/`useTheme`, mirrors the existing `AuthContext` pattern) with system-preference
  default and `localStorage` persistence; a `ThemeToggle` icon-button wired into `AppShell`'s
  topbar; an inline `index.html` script applying the stored/system theme before React mounts, to
  avoid a flash; a codebase-wide hardcoded-color audit (10 stylesheet files) that either tied a
  literal to its already-matching semantic token via `color-mix()` (self-healing a few
  pre-existing mismatches left over from before the app was re-themed — e.g. `StatusPill`'s and
  `PriorityPill`'s backgrounds didn't match any current token) or marked it theme-invariant with a
  one-line comment (overlay scrims, depth-shadow hairlines, and the `AuthLayout` branded gradient
  panel, none of which were in scope to redesign); and a permanent automated WCAG AA contrast test
  suite (`src/utils/contrast.ts`) covering every theme-dependent token pairing in both themes. Also
  fixed a real pre-existing accessibility bug in the light theme (see §13's `--text-muted` note).
  All work verified via this plan's (Task 8) final integration pass:
    - `bun test` — 151 pass / 0 fail across 39 files (244 `expect()` calls). Pre-existing `act()`
      warnings are informational, not failures — not introduced by this work.
    - `bun run build` (`tsc -b && vite build`) — zero errors.
    - `bun run lint` (`eslint .`) — zero errors.
    - `grep -rn "TODO\|FIXME" src` — no matches.
    - Hardcoded-color sweep (`grep` for literal colors outside `var(--*)`) re-run after fixes —
      every remaining hit is either a token definition in `tokens.css` itself or has a
      theme-invariant comment directly above it.
  Plan: `docs/superpowers/plans/2026-09-28-dual-theme.md`; task briefs/reports live under
  `.superpowers/sdd/2026-09-28-dual-theme/`.
  Spec: `docs/superpowers/specs/2026-09-28-dual-theme-design.md`.
  **Pending:** this plan's Step 2 called for a manual browser walkthrough of both themes across
  every screen (Dashboard, Tasks/Members/Settings tabs, TaskDrawer, Security settings, the auth
  screens, plus a hard-reload no-flash check). In this environment only a partial, programmatic
  version was possible: the dev server was started and confirmed to boot and serve HTTP 200; the
  served HTML was confirmed to contain the no-flash inline script in the correct position; the
  served `tokens.css` was confirmed to contain both the light and dark token blocks with the
  expected values. An actual visual/interactive walkthrough in a real browser — seeing the
  rendered colors, clicking the toggle, exercising every screen, and confirming the hard-reload
  no-flash behavior with human eyes — was **not** performed and still needs to be done by hand
  before this feature is considered fully verified end-to-end.
- **2026-09-28 — Final whole-branch review fix pass.** A fresh Opus review of the full dual-theme
  branch (commits `a065add2..2dc2749`) independently re-derived real WCAG contrast numbers against
  the shipped CSS (not just re-reading the plan) and found 2 Critical + 6 Important issues. All
  Critical/Important findings were fixed in one TDD pass (failing test written first for each,
  confirmed RED against the pre-fix code, then made to pass):
  - The three contrast failures and their fixes are recorded in §13.
  - `ThemeContext.tsx`'s unguarded `localStorage` access and its mount-time persistence bug are
    recorded in §13.
  - `contrast.test.ts` gained a `compositeOver`/`relativeLuminance`-based "composed-background"
    suite (real pill-on-tint and scrim-on-canvas pairings, not just token-vs-bg) and a
    "modal/drawer overlay scrim" suite — both described in §12's Theming note and §9.
  Minor findings from the review were deferred, not fixed (per `executing-plans`' final-review
  process — minors don't enter the fix pass): `ThemeContext.test.tsx`'s `matchMedia`-deletion test
  has no `afterAll` restore (harmless today only because of the `typeof !== "function"` guard
  elsewhere); `ThemeToggle` encodes its state via both `aria-pressed` and a state-dependent
  `aria-label`, which double-announces to screen readers — should pick one; `Button.module.css`'s
  `.secondary` and `Tabs.module.css`'s `.active` still carry a near-black (not pure-black) fixed
  shadow tint left over from before this pass — same class of bug the scrim fix addressed, but at
  3-6% opacity the effect is invisible rather than wrong, so it was left as dead-not-broken styling.
  Verified via `bun test` (full suite green after the fixes), `bun run build`, `bun run lint`.
  Ledger: `.superpowers/sdd/2026-09-28-dual-theme/progress.md`.
