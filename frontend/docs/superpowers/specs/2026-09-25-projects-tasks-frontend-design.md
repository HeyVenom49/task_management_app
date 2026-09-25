# Docket — Projects, Members & Tasks Frontend Design

**Date:** 2026-09-25
**Status:** Approved for implementation planning
**Scope:** The full project/member/task workflow — create/edit/delete a project, invite and
manage members, create/edit/delete tasks within a project — replacing the placeholder dashboard.
Builds on the completed auth frontend (`docs/superpowers/specs/2026-09-24-auth-frontend-design.md`);
reuses its tokens, `useForm`, `apiFetch`, `AuthContext`, and `AppShell` rather than introducing
parallel infrastructure.

This spec restates backend behavior verified directly against `backend/src/modules/projects/*`
and `backend/src/modules/tasks/*` during this session (§1–§3 below), not `docs/PROJECT_MAP.md`,
which was written before those modules existed and is stale on this point — it will be updated
to match this spec once implementation lands (per CLAUDE.md §1D: source code outranks docs).

---

## 1. Backend capabilities (verified against source, 2026-09-25)

### Projects — `/api/v1/projects` (all routes require `authenticate` — Bearer token)

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| POST | `/` | `{ info(1-500 chars) }` | 201 `{ project, membership }` | creator becomes `OWNER` |
| GET | `/` | — | 200 `{ projects }` | projects where caller is an ACTIVE member (any role) |
| GET | `/:id` | — | 200 `{ project }` | 403 if not an ACTIVE member |
| PATCH | `/:id` | `{ info(1-500) }` | 200 `{ project }` | OWNER only |
| DELETE | `/:id` | — | 200 `{ message }` | OWNER only |
| GET | `/:id/members` | — | 200 `{ members }` | ACTIVE members only, joined with `name`/`email` |
| POST | `/:id/members` | `{ email }` | 201 `{ member }` | OWNER only; target user must exist & be ACTIVE; new member role is always `MEMBER` |
| DELETE | `/:id/members/:memberId` | — | 200 `{ message }` | OWNER only; soft-deactivates (status → INACTIVE); blocked if target is the last active OWNER |
| POST | `/:id/members/:memberId/reactivate` | — | 200 `{ member }` | **platform ADMIN only**; reactivates an INACTIVE member back to `MEMBER` — **no frontend path reaches this in v1, see note below** |

A project has **no `name` field** — only `info` (free text, ≤500 chars). There is no dedicated
"list all projects" admin endpoint — `GET /projects` is always scoped to the caller's memberships.

**Reactivate is unreachable from the UI, by design of this pass (not an oversight):**
`MemberRepository.listByProjectId` filters `WHERE ... AND m.status = 'ACTIVE'`
(`member.repository.ts:101`) — no endpoint ever returns INACTIVE members, so there is no id for
the frontend to call `reactivate` with. §2, §4, and §5 below reflect this: no reactivate UI, no
`reactivateMember` API function, in this pass. See §9.

### Tasks — `/api/v1/projects/:id/tasks` (all routes require `authenticate`)

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| POST | `/` | `{ title(1-200), description?(≤500\|null), priority, status?, assigneeMemberId?\|null }` | 201 `{ task }` | any ACTIVE member; `status` defaults to `NOT_STARTED`; `assigneeMemberId` must be an ACTIVE member of the same project |
| GET | `/` | — | 200 `{ tasks }` | any ACTIVE member; all tasks in the project, no filtering/pagination server-side |
| GET | `/:taskId` | — | 200 `{ task }` | any ACTIVE member |
| PATCH | `/:taskId` | any subset of the create fields | 200 `{ task }` | any ACTIVE member (not creator-restricted) |
| DELETE | `/:taskId` | — | 200 `{ message }` | only the task's creator or a project OWNER |

`priority`: `VERY_LOW \| LOW \| MODERATE \| HIGH \| URGENT`.
`status`: `NOT_STARTED \| IN_PROGRESS \| BLOCKED \| COMPLETED`.

**Known bug, to be fixed as part of this work (user-approved, one-line fix, not a rewrite):**
`task.repository.ts`'s `update()` method has a typo in its `RETURNING` clause —
`assingnee_member_id` instead of `assignee_member_id` — which will throw a Postgres column-does-
not-exist error on every `PATCH /projects/:id/tasks/:taskId` against a real database. Fix: correct
the column name. No other backend changes are in scope.

### Errors

Same shape as auth: `AppError` subclasses → `{ message }` with the matching status.
`BadRequestError` → 400, `ForbiddenError` → 403, `ConflictError` → 409 (e.g. duplicate member,
duplicate project info if uniquely constrained), unhandled → 500 generic message. Validation
failures (Zod) → 400 `{ message: "Validation failed", errors: <field errors> }`, same shape the
existing `apiFetch`/`useForm` pipeline already parses.

## 2. Roles & permissions (frontend-enforced as UX only — backend remains authoritative)

- `members.role`: `OWNER \| MEMBER`, scoped per-project. First member (creator) is always OWNER.
- `users.role`: `USER \| ADMIN`, platform-wide, already available on `AuthContext`'s `user.role`.

| Action | Allowed | Frontend gating |
|---|---|---|
| Edit project info, delete project | project OWNER | Settings tab not rendered for MEMBER |
| Invite / remove member | project OWNER | invite form / remove action not rendered for MEMBER |
| Create / edit task, change its status or assignee | any ACTIVE project member | always available inside a project the user is a member of |
| Delete task | task's creator, or project OWNER | delete action hidden on rows where `task.creatorMemberId !== viewer's membership.id` unless viewer is OWNER |

A logged-in user who is not an ACTIVE member of `:id` gets a 403 from every project/task endpoint.
The frontend treats that identically to a 404 (see §5) — it never renders a "you don't have
permission" page that reveals the project exists.

## 3. Routes / Information architecture

```
/                              Dashboard — list of the caller's projects, "New project"
/projects/:id                 Project detail, redirects to .../tasks (default tab)
/projects/:id/tasks           Tasks tab — the dense task list, "New task"
/projects/:id/members         Members tab — member list, invite (owner), remove (owner),
                               reactivate (admin)
/projects/:id/settings        Settings tab — owner only: edit info, delete project
/settings/security             unchanged
```

No standalone task-detail route. A task opens in a slide-over `TaskDrawer` over the Tasks tab to
view/edit/delete it; the same drawer component (in "create" mode) handles new-task creation.
Rationale: tasks have no sub-resources in this backend (no comments/attachments), so a full page
per task would be empty scaffolding, and a drawer keeps the list visible for context while
editing. Members/Settings are tabs, not top-level routes, because they're meaningless without a
project context and share the project header (info text, role badge, tab nav).

## 4. API integration layer

`src/api/projects.ts` and `src/api/tasks.ts`, following the existing `api/auth.ts` shape exactly
— thin functions around the existing `apiFetch<T>`, no business logic:

```ts
// api/projects.ts
listProjects(): Promise<{ projects: Project[] }>
createProject(info: string): Promise<{ project: Project; membership: Member }>
getProject(id: string): Promise<{ project: Project }>
updateProject(id: string, info: string): Promise<{ project: Project }>
deleteProject(id: string): Promise<{ message: string }>
listMembers(projectId: string): Promise<{ members: MemberWithUser[] }>
addMember(projectId: string, email: string): Promise<{ member: Member }>
removeMember(projectId: string, memberId: string): Promise<{ message: string }>
// no reactivateMember — no frontend-reachable id to call it with, see §1

// api/tasks.ts
listTasks(projectId: string): Promise<{ tasks: Task[] }>
createTask(projectId: string, input: CreateTaskInput): Promise<{ task: Task }>
updateTask(projectId: string, taskId: string, input: UpdateTaskInput): Promise<{ task: Task }>
deleteTask(projectId: string, taskId: string): Promise<{ message: string }>
```

`src/types/project.ts`, `src/types/task.ts` — typed 1:1 against the backend's `project.types.ts`
/ `task.types.ts` (camelCase, string-literal unions for role/status/priority, no `any`).

**Also need:** the caller's own membership for the current project (role, membership id — needed
for the permission checks in §2 and to know "is this my task"). `GET /projects/:id/members`
returns all members, so the frontend derives "my membership" by finding the row whose `userId`
matches `AuthContext`'s `user.id`, rather than adding a new backend endpoint.

**Data ownership:** no React Query, consistent with the rest of the app. Each page fetches on
mount via `useState`/`useEffect` and owns its own loading/error state. `ProjectPage` fetches the
project + member list once (member list is needed by all three tabs for role/permission checks)
and passes them down; `ProjectTasksPage` fetches tasks independently. Mutations splice the
returned object into local state or refetch the list — no global store, no cache invalidation
layer. This matches the existing app's scale (no pagination, no cross-page staleness to manage).

## 5. Screens & components

```
pages/
  DashboardPage.tsx        rewritten — fetches listProjects, dense list (not cards), "New
                            project" inline form, empty state for zero projects
  ProjectPage.tsx           shell — fetches project + members once, renders header (info
                             excerpt as title, your-role badge, tab nav), outlet for nested tab
                             routes; handles the project-level loading/403-as-404/not-found states
  ProjectTasksPage.tsx      dense task list, status/priority filter, "New task" → TaskDrawer
  ProjectMembersPage.tsx    member list (name, email, role), invite form (owner), remove
                             action (owner) per §2 — inactive/removed members are not listed
                             by the backend, so they simply disappear from this view (§1)
  ProjectSettingsPage.tsx   owner-only — edit info form, delete-project (ConfirmDialog)

components/
  ProjectRow                 dashboard list item
  TaskRow                     dense list row — status pill, title, priority pill, assignee
                              initials, updated-at (monospace)
  TaskDrawer                  slide-over, dual-purpose create/edit, delete action inside when
                               editing and permitted
  MemberRow                   members list row
  StatusPill / PriorityPill   shared small badges (§6 for color mapping)
  ConfirmDialog                shared — delete project, remove member
  Tabs                         shared tab-nav primitive (Tasks/Members/Settings)
```

Create-project and create/edit-task forms use the existing `useForm` hook. `useForm` is
string-keyed; `priority`/`status`/`assigneeMemberId` are held as strings (select values) in form
state and coerced to the typed union/nullable only at the API-call boundary — no change to
`useForm` itself.

## 6. Visual treatment

Extends the existing token set (`src/styles/tokens.css`) — no new colors beyond a derived
priority ramp; no new spacing/radius/shadow values.

- **Dashboard:** a dense single-column list, not a card grid (CLAUDE.md flags repetitive-cards as
  a default to avoid). Each row: `info` truncated to ~2 lines, role badge, member count, created
  date, trailing chevron. Same density posture as the auth screens' information hierarchy.
- **Project header:** `info` text doubles as the page title (no separate name field exists) —
  first ~60 chars styled as heading, full text revealed on hover/expand. Role badge next to it.
  Tab nav below uses flat 1px borders (no pill tabs, no sliding underline) — consistent with
  "shadows only on genuinely elevated surfaces" from the auth spec.
- **TaskRow:** single line — status pill, title, priority pill, assignee initials,
  right-aligned `updated_at` in `--font-mono` (continuing the existing "monospace for metadata"
  convention). Hover shifts background subtly; click opens `TaskDrawer`.
- **Pills:** status pill colors map to existing semantic tokens — `NOT_STARTED` → `--text-muted`,
  `IN_PROGRESS` → `--info`, `BLOCKED` → `--warning`, `COMPLETED` → `--success` (all at low-opacity
  backgrounds, full-opacity text). Priority pill uses a single-hue intensity ramp derived from
  `--text-muted` → `--danger` across the five levels (VERY_LOW palest, URGENT reads as
  `--danger`) — systematic, not five arbitrary colors (CLAUDE.md §31).
- **TaskDrawer:** slides in from the right using the existing `--duration-page` / `--ease-out`
  tokens — same motion family as the auth flow's page cross-fade, not a new animation language.
  Respects `prefers-reduced-motion` (fades instead of slides).
- **ConfirmDialog:** plain modal, `--shadow-elevated`, no glassmorphism.

## 7. States

Every list-bearing screen (dashboard, tasks, members) implements: Initial/Loading (skeleton rows,
not a bare spinner), Loaded, Empty (dashboard: "You don't have any projects yet" + CTA; tasks:
"No tasks yet" + CTA; members is never empty — the creator is always present as OWNER), Error
(network/500 → the existing `FormBanner` component with a retry action), Forbidden-as-Not-Found
(direct nav to a project/task the caller isn't an ACTIVE member of, or a deleted/nonexistent id →
one generic "Project not found" state, not a distinct scary Forbidden page — see §2). Mutations
(create/edit/delete project, task, member) reuse the existing `isSubmitting`-disables-button →
`FormBanner`-on-failure pattern already established by the auth forms.

## 8. Testing & verification

Same bar as the completed auth work: `bun test` + `@testing-library/react` (happy-dom) per
component/page, covering loading/empty/error/permission-hidden states, not only the happy path.
Before calling this done: `bun test`, `bun run build` (`tsc -b && vite build`), `bun run lint`,
and a `TODO`/`FIXME` sweep of `src/` — matching the auth feature's Task-18 integration pass.
Manual smoke test against a real running backend (multi-user flows: invite a second user, assign
a task to them, have them log in and see it) is required before considering this feature
end-to-end verified, the same caveat the auth spec closed with.

## 9. Explicitly out of scope

- Task comments/attachments/activity history — no backend support.
- Real-time updates (websockets/polling) — nothing in the backend suggests this is coming; static
  fetch-on-mount is correct for what exists today.
- A persistent project-switcher sidebar (Approach A considered during brainstorming, deferred —
  revisit if a user's project count grows enough that the dashboard-list pattern stops scaling).
- Admin-wide project/member management (no such backend endpoint exists — `GET /projects` is
  always scoped to the caller's own memberships).
- Reactivating a removed member — `POST /:id/members/:memberId/reactivate` exists and is
  ADMIN-gated on the backend, but `GET /:id/members` only ever returns ACTIVE members
  (`member.repository.ts:101`), so there is no frontend-reachable id to call it with. Not built
  in this pass; would need a backend change (e.g. an admin-only "list inactive members" query or
  an `includeInactive` flag) to become buildable, which is out of scope here per CLAUDE.md §4 (no
  backend changes beyond the one-line typo fix already agreed).
