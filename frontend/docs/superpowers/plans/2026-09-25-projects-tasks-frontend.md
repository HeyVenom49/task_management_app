# Projects, Members & Tasks Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder dashboard with a real projects/members/tasks workflow — create/view/edit/delete projects, invite/remove members, and create/edit/delete tasks — against the backend's now-implemented `/api/v1/projects` and `/api/v1/projects/:id/tasks` modules.

**Architecture:** Dashboard-centric IA (`/` lists projects, `/projects/:id` is a per-project shell with Tasks/Members/Settings tabs sharing one `Outlet`-context fetch). Thin `api/projects.ts`/`api/tasks.ts` functions wrap the existing `apiFetch`; pages own their own fetch-on-mount state (no React Query, no global store), matching the completed auth frontend's conventions exactly.

**Tech Stack:** React 19, react-router (nested routes + nested-route `Outlet` context), CSS Modules on the existing `tokens.css` scale, `bun:test` + `@testing-library/react` (happy-dom).

**Spec:** `docs/superpowers/specs/2026-09-25-projects-tasks-frontend-design.md`

## Global Constraints

- No `any` types anywhere — every API response/request is typed against the backend's verified shapes (spec §1, §4).
- No React Query, no global store — each page fetches its own data via `useState`/`useEffect`; mutations splice the returned object into local state or refetch (spec §4).
- No new design tokens beyond what already exists in `src/styles/tokens.css` — reuse `--bg/--surface/--border/--text-*/--accent/--success/--warning/--danger/--info/--space-*/--radius-*/--shadow-elevated/--duration-*/--ease-*` (spec §6).
- Frontend permission gating (owner-only actions, delete-own-task) is UX only — never treat it as a security boundary; the backend remains authoritative (spec §2, CLAUDE.md §13).
- No backend changes beyond the one agreed fix: the `assingnee_member_id` → `assignee_member_id` typo in `task.repository.ts`'s `update()` `RETURNING` clause (spec §1, Task 1 below). No other backend files change.
- No reactivate-member UI or `reactivateMember` API function in this pass — `GET /:id/members` never returns INACTIVE members, so there's no id to call it with (spec §1/§9).
- Every list-bearing screen implements Loading/Loaded/Empty/Error states, not just the happy path (spec §7); every mutation reuses the existing `isSubmitting`-disables-button → `FormBanner`-on-failure pattern already established by the auth forms.
- Follow existing conventions exactly: `useForm` (string-keyed values/validators), `apiFetch`/`ApiError`, CSS Modules colocated with components, `bun:test` mocking either `globalThis.fetch` (api-layer tests) or the api module via `mock.module` (page-level tests) — both patterns already used in `src/api/auth.test.ts` and `src/pages/DashboardPage.test.tsx` respectively.

## Review Focus

- Removing the last active OWNER from a project → backend returns 400 "Cannot remove the last owner"; the Members tab must surface that exact message inline, not crash or show a generic error. (Task 12)
- Inviting a member by an email with no matching ACTIVE user → backend returns 400 "User not found or not verified"; the invite form must show that message and must not add a phantom row. (Task 12)
- A non-owner, non-creator viewing a task they didn't create → the Delete action must not render at all, verified by a test, not left to rely on a backend 403 that never gets triggered. (Task 10)
- Direct navigation to `/projects/:id` for a project the user isn't an active member of (or a deleted one) → renders "Project not found," not a raw error dump, an infinite spinner, or a page that leaks whether the project exists. (Task 9)
- Assigning/reassigning a task to a member id that is no longer an ACTIVE member of the project → backend returns 400 "Invalid assignee"; `TaskDrawer` must surface that message via the existing `useForm` error path rather than silently failing. (Task 10)

---

## Task 1: Fix the task-update column typo (backend)

**Files:**
- Modify: `backend/src/modules/tasks/task.repository.ts:110-122`

**Interfaces:**
- Produces: a working `PATCH /projects/:id/tasks/:taskId` — every later frontend task-editing task (10, 11) depends on this actually returning 200, not a Postgres column error.

There is no backend test suite in this repo (no test script, no `*.test.ts` files under `backend/`) — this fix is verified by static inspection and, later, by the manual smoke test in Task 16, not an automated backend test.

- [ ] **Step 1: Read the current buggy `RETURNING` clause**

```bash
grep -n "assingnee_member_id" backend/src/modules/tasks/task.repository.ts
```

Expected: one match, inside `update()`'s `RETURNING` clause.

- [ ] **Step 2: Fix the typo**

In `backend/src/modules/tasks/task.repository.ts`, inside `update()`:

```ts
    const [row] = await this.sql`
        UPDATE tasks
        SET
            title = ${title},
            description = ${description},
            priority = ${priority},
            status = ${status},
            assignee_member_id = ${assigneeMemberId},
            updated_at = NOW()
        WHERE id = ${taskId}
        RETURNING
            id, project_id, creator_member_id, assignee_member_id, title, description, priority, status, created_at, updated_at
    `;
```

(Only the `RETURNING` clause's column name changes — `assingnee_member_id` → `assignee_member_id`. The `SET` clause already had the correct spelling.)

- [ ] **Step 3: Verify the typo is gone**

```bash
grep -rn "assingnee" backend/src/
```

Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/tasks/task.repository.ts
git commit -m "fix: correct assignee_member_id typo in task update RETURNING clause"
```

---

## Task 2: Project & member types + API layer

**Files:**
- Create: `frontend/src/types/project.ts`
- Create: `frontend/src/api/projects.ts`
- Test: `frontend/src/api/projects.test.ts`

**Interfaces:**
- Consumes: `apiFetch<T>` (`src/api/client.ts`), `MessageResponse` (`src/types/auth.ts`).
- Produces: `Project`, `Member`, `MemberWithUser`, `MemberRole`, `MemberStatus` types; `listProjects`, `createProject`, `getProject`, `updateProject`, `deleteProject`, `listMembers`, `addMember`, `removeMember` functions — consumed by every page task (8–14).

- [ ] **Step 1: Write the types**

Create `frontend/src/types/project.ts`:

```ts
export type MemberRole = "OWNER" | "MEMBER";
export type MemberStatus = "ACTIVE" | "INACTIVE";

export type Project = {
  id: string;
  creatorId: string;
  info: string;
  createdAt: string;
  updatedAt: string;
};

export type Member = {
  id: string;
  userId: string;
  projectId: string;
  role: MemberRole;
  status: MemberStatus;
  createdAt: string;
  updatedAt: string;
};

export type MemberWithUser = Member & {
  name: string;
  email: string;
};
```

- [ ] **Step 2: Write the failing API layer test**

Create `frontend/src/api/projects.test.ts`:

```ts
import { afterEach, describe, expect, mock, test } from "bun:test";
import * as projectsApi from "./projects";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("projects API layer", () => {
  test("listProjects returns the projects array", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse(200, {
        projects: [{ id: "p1", creatorId: "u1", info: "Launch plan", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
      }),
    ) as unknown as typeof fetch;

    const result = await projectsApi.listProjects();
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]?.info).toBe("Launch plan");
  });

  test("createProject POSTs info and returns project + membership", async () => {
    const fetchMock = mock(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(init.body as string)).toEqual({ info: "New project" });
      return jsonResponse(201, {
        project: { id: "p1", creatorId: "u1", info: "New project", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
        membership: { id: "m1", userId: "u1", projectId: "p1", role: "OWNER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await projectsApi.createProject("New project");
    expect(result.membership.role).toBe("OWNER");
  });

  test("addMember POSTs the email to /projects/:id/members", async () => {
    const fetchMock = mock(async (url: string, init: RequestInit) => {
      expect(url).toContain("/projects/p1/members");
      expect(JSON.parse(init.body as string)).toEqual({ email: "bo@example.com" });
      return jsonResponse(201, {
        member: { id: "m2", userId: "u2", projectId: "p1", role: "MEMBER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await projectsApi.addMember("p1", "bo@example.com");
    expect(result.member.role).toBe("MEMBER");
  });

  test("removeMember DELETEs /projects/:id/members/:memberId", async () => {
    const fetchMock = mock(async (url: string, init: RequestInit) => {
      expect(url).toContain("/projects/p1/members/m2");
      expect(init.method).toBe("DELETE");
      return jsonResponse(200, { message: "Member removed" });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await projectsApi.removeMember("p1", "m2");
    expect(result.message).toBe("Member removed");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test src/api/projects.test.ts`
Expected: FAIL — `./projects` module not found.

- [ ] **Step 4: Implement the API layer**

Create `frontend/src/api/projects.ts`:

```ts
import { apiFetch } from "./client";
import type { Member, MemberWithUser, Project } from "../types/project";
import type { MessageResponse } from "../types/auth";

export function listProjects(): Promise<{ projects: Project[] }> {
  return apiFetch<{ projects: Project[] }>("/projects");
}

export function createProject(info: string): Promise<{ project: Project; membership: Member }> {
  return apiFetch<{ project: Project; membership: Member }>("/projects", {
    method: "POST",
    body: { info },
  });
}

export function getProject(id: string): Promise<{ project: Project }> {
  return apiFetch<{ project: Project }>(`/projects/${id}`);
}

export function updateProject(id: string, info: string): Promise<{ project: Project }> {
  return apiFetch<{ project: Project }>(`/projects/${id}`, {
    method: "PATCH",
    body: { info },
  });
}

export function deleteProject(id: string): Promise<MessageResponse> {
  return apiFetch<MessageResponse>(`/projects/${id}`, { method: "DELETE" });
}

export function listMembers(projectId: string): Promise<{ members: MemberWithUser[] }> {
  return apiFetch<{ members: MemberWithUser[] }>(`/projects/${projectId}/members`);
}

export function addMember(projectId: string, email: string): Promise<{ member: Member }> {
  return apiFetch<{ member: Member }>(`/projects/${projectId}/members`, {
    method: "POST",
    body: { email },
  });
}

export function removeMember(projectId: string, memberId: string): Promise<MessageResponse> {
  return apiFetch<MessageResponse>(`/projects/${projectId}/members/${memberId}`, {
    method: "DELETE",
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test src/api/projects.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/project.ts frontend/src/api/projects.ts frontend/src/api/projects.test.ts
git commit -m "feat: add projects/members API layer and types"
```

---

## Task 3: Task types + API layer

**Files:**
- Create: `frontend/src/types/task.ts`
- Create: `frontend/src/api/tasks.ts`
- Test: `frontend/src/api/tasks.test.ts`

**Interfaces:**
- Consumes: `apiFetch<T>`, `MessageResponse`.
- Produces: `Task`, `TaskStatus`, `TaskPriority`, `CreateTaskInput`, `UpdateTaskInput` types; `listTasks`, `createTask`, `updateTask`, `deleteTask` functions — consumed by Tasks 9–11.

- [ ] **Step 1: Write the types**

Create `frontend/src/types/task.ts`:

```ts
export type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";
export type TaskPriority = "VERY_LOW" | "LOW" | "MODERATE" | "HIGH" | "URGENT";

export type Task = {
  id: string;
  projectId: string;
  creatorMemberId: string;
  assigneeMemberId: string | null;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateTaskInput = {
  title: string;
  description?: string | null;
  priority: TaskPriority;
  status?: TaskStatus;
  assigneeMemberId?: string | null;
};

export type UpdateTaskInput = Partial<CreateTaskInput>;
```

- [ ] **Step 2: Write the failing API layer test**

Create `frontend/src/api/tasks.test.ts`:

```ts
import { afterEach, describe, expect, mock, test } from "bun:test";
import * as tasksApi from "./tasks";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const sampleTask = {
  id: "t1",
  projectId: "p1",
  creatorMemberId: "m1",
  assigneeMemberId: null,
  title: "Write the plan",
  description: null,
  priority: "MODERATE",
  status: "NOT_STARTED",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("tasks API layer", () => {
  test("listTasks GETs /projects/:id/tasks", async () => {
    const fetchMock = mock(async (url: string) => {
      expect(url).toContain("/projects/p1/tasks");
      return jsonResponse(200, { tasks: [sampleTask] });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await tasksApi.listTasks("p1");
    expect(result.tasks).toHaveLength(1);
  });

  test("createTask POSTs the input body", async () => {
    const fetchMock = mock(async (url: string, init: RequestInit) => {
      expect(url).toContain("/projects/p1/tasks");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({
        title: "Write the plan",
        description: null,
        priority: "MODERATE",
        status: "NOT_STARTED",
        assigneeMemberId: null,
      });
      return jsonResponse(201, { task: sampleTask });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await tasksApi.createTask("p1", {
      title: "Write the plan",
      description: null,
      priority: "MODERATE",
      status: "NOT_STARTED",
      assigneeMemberId: null,
    });
    expect(result.task.id).toBe("t1");
  });

  test("updateTask PATCHes /projects/:id/tasks/:taskId", async () => {
    const fetchMock = mock(async (url: string, init: RequestInit) => {
      expect(url).toContain("/projects/p1/tasks/t1");
      expect(init.method).toBe("PATCH");
      return jsonResponse(200, { task: { ...sampleTask, status: "IN_PROGRESS" } });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await tasksApi.updateTask("p1", "t1", { status: "IN_PROGRESS" });
    expect(result.task.status).toBe("IN_PROGRESS");
  });

  test("deleteTask DELETEs /projects/:id/tasks/:taskId", async () => {
    const fetchMock = mock(async (url: string, init: RequestInit) => {
      expect(url).toContain("/projects/p1/tasks/t1");
      expect(init.method).toBe("DELETE");
      return jsonResponse(200, { message: "Task deleted" });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await tasksApi.deleteTask("p1", "t1");
    expect(result.message).toBe("Task deleted");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test src/api/tasks.test.ts`
Expected: FAIL — `./tasks` module not found.

- [ ] **Step 4: Implement the API layer**

Create `frontend/src/api/tasks.ts`:

```ts
import { apiFetch } from "./client";
import type { CreateTaskInput, Task, UpdateTaskInput } from "../types/task";
import type { MessageResponse } from "../types/auth";

export function listTasks(projectId: string): Promise<{ tasks: Task[] }> {
  return apiFetch<{ tasks: Task[] }>(`/projects/${projectId}/tasks`);
}

export function createTask(projectId: string, input: CreateTaskInput): Promise<{ task: Task }> {
  return apiFetch<{ task: Task }>(`/projects/${projectId}/tasks`, {
    method: "POST",
    body: input,
  });
}

export function updateTask(
  projectId: string,
  taskId: string,
  input: UpdateTaskInput,
): Promise<{ task: Task }> {
  return apiFetch<{ task: Task }>(`/projects/${projectId}/tasks/${taskId}`, {
    method: "PATCH",
    body: input,
  });
}

export function deleteTask(projectId: string, taskId: string): Promise<MessageResponse> {
  return apiFetch<MessageResponse>(`/projects/${projectId}/tasks/${taskId}`, {
    method: "DELETE",
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test src/api/tasks.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/task.ts frontend/src/api/tasks.ts frontend/src/api/tasks.test.ts
git commit -m "feat: add tasks API layer and types"
```

---

## Task 4: Membership helper

**Files:**
- Create: `frontend/src/utils/membership.ts`
- Test: `frontend/src/utils/membership.test.ts`

**Interfaces:**
- Consumes: `MemberWithUser` (Task 2).
- Produces: `findOwnMembership(members, userId): MemberWithUser | null` — consumed by `ProjectPage` (Task 9).

`GET /projects/:id/members` returns every ACTIVE member, not "my membership" directly — this derives the caller's own row from it (spec §4).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/utils/membership.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { findOwnMembership } from "./membership";
import type { MemberWithUser } from "../types/project";

const members: MemberWithUser[] = [
  { id: "m1", userId: "u1", projectId: "p1", role: "OWNER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Ana", email: "ana@example.com" },
  { id: "m2", userId: "u2", projectId: "p1", role: "MEMBER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Bo", email: "bo@example.com" },
];

describe("findOwnMembership", () => {
  test("returns the member row matching the given userId", () => {
    expect(findOwnMembership(members, "u2")?.id).toBe("m2");
  });

  test("returns null when the userId has no membership in the list", () => {
    expect(findOwnMembership(members, "u9")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/utils/membership.test.ts`
Expected: FAIL — `./membership` module not found.

- [ ] **Step 3: Implement**

Create `frontend/src/utils/membership.ts`:

```ts
import type { MemberWithUser } from "../types/project";

export function findOwnMembership(members: MemberWithUser[], userId: string): MemberWithUser | null {
  return members.find((member) => member.userId === userId) ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/utils/membership.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/membership.ts frontend/src/utils/membership.test.ts
git commit -m "feat: add findOwnMembership helper"
```

---

## Task 5: Status & priority pill components

**Files:**
- Create: `frontend/src/components/ui/StatusPill.tsx`, `frontend/src/components/ui/StatusPill.module.css`
- Create: `frontend/src/components/ui/PriorityPill.tsx`, `frontend/src/components/ui/PriorityPill.module.css`
- Test: `frontend/src/components/ui/StatusPill.test.tsx`, `frontend/src/components/ui/PriorityPill.test.tsx`

**Interfaces:**
- Consumes: `TaskStatus`, `TaskPriority` (Task 3).
- Produces: `<StatusPill status={TaskStatus} />`, `<PriorityPill priority={TaskPriority} />` — consumed by `TaskRow` (Task 11).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/ui/StatusPill.test.tsx`:

```tsx
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { StatusPill } from "./StatusPill";

describe("StatusPill", () => {
  test.each([
    ["NOT_STARTED", "Not started"],
    ["IN_PROGRESS", "In progress"],
    ["BLOCKED", "Blocked"],
    ["COMPLETED", "Completed"],
  ] as const)("renders the label for %s", (status, label) => {
    render(<StatusPill status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
```

Create `frontend/src/components/ui/PriorityPill.test.tsx`:

```tsx
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { PriorityPill } from "./PriorityPill";

describe("PriorityPill", () => {
  test.each([
    ["VERY_LOW", "Very low"],
    ["LOW", "Low"],
    ["MODERATE", "Moderate"],
    ["HIGH", "High"],
    ["URGENT", "Urgent"],
  ] as const)("renders the label for %s", (priority, label) => {
    render(<PriorityPill priority={priority} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/components/ui/StatusPill.test.tsx src/components/ui/PriorityPill.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

Create `frontend/src/components/ui/StatusPill.tsx`:

```tsx
import type { TaskStatus } from "../../types/task";
import styles from "./StatusPill.module.css";

const LABELS: Record<TaskStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
};

export function StatusPill({ status }: { status: TaskStatus }) {
  return <span className={[styles.pill, styles[status]].join(" ")}>{LABELS[status]}</span>;
}
```

Create `frontend/src/components/ui/StatusPill.module.css`:

```css
.pill {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  white-space: nowrap;
}

.NOT_STARTED {
  background: rgba(138, 138, 144, 0.14);
  color: var(--text-secondary);
}

.IN_PROGRESS {
  background: rgba(54, 84, 166, 0.14);
  color: var(--info);
}

.BLOCKED {
  background: rgba(180, 83, 9, 0.14);
  color: var(--warning);
}

.COMPLETED {
  background: rgba(21, 128, 61, 0.14);
  color: var(--success);
}
```

Create `frontend/src/components/ui/PriorityPill.tsx`:

```tsx
import type { TaskPriority } from "../../types/task";
import styles from "./PriorityPill.module.css";

const LABELS: Record<TaskPriority, string> = {
  VERY_LOW: "Very low",
  LOW: "Low",
  MODERATE: "Moderate",
  HIGH: "High",
  URGENT: "Urgent",
};

export function PriorityPill({ priority }: { priority: TaskPriority }) {
  return <span className={[styles.pill, styles[priority]].join(" ")}>{LABELS[priority]}</span>;
}
```

Create `frontend/src/components/ui/PriorityPill.module.css`:

```css
.pill {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  white-space: nowrap;
}

.VERY_LOW {
  background: rgba(138, 138, 144, 0.08);
  color: var(--text-muted);
}

.LOW {
  background: rgba(138, 138, 144, 0.16);
  color: var(--text-secondary);
}

.MODERATE {
  background: rgba(180, 83, 9, 0.12);
  color: var(--warning);
}

.HIGH {
  background: rgba(220, 38, 38, 0.12);
  color: var(--danger);
}

.URGENT {
  background: var(--danger);
  color: var(--accent-contrast);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/components/ui/StatusPill.test.tsx src/components/ui/PriorityPill.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/StatusPill.tsx frontend/src/components/ui/StatusPill.module.css frontend/src/components/ui/StatusPill.test.tsx frontend/src/components/ui/PriorityPill.tsx frontend/src/components/ui/PriorityPill.module.css frontend/src/components/ui/PriorityPill.test.tsx
git commit -m "feat: add StatusPill and PriorityPill components"
```

---

## Task 6: TextArea shared component

**Files:**
- Create: `frontend/src/components/ui/TextArea.tsx`, `frontend/src/components/ui/TextArea.module.css`
- Test: `frontend/src/components/ui/TextArea.test.tsx`

**Interfaces:**
- Produces: `<TextArea label error {...textareaProps} />` — consumed by `TaskDrawer` (Task 10), `DashboardPage` (Task 14), `ProjectSettingsPage` (Task 13). Three independent consumers justify a shared primitive here (CLAUDE.md §14/§26), mirroring `TextField`'s id/error/`aria-describedby` pattern exactly.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/ui/TextArea.test.tsx`:

```tsx
import { describe, expect, test, mock } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { TextArea } from "./TextArea";

describe("TextArea", () => {
  test("renders the label and forwards value/onChange", () => {
    const handleChange = mock(() => {});
    render(<TextArea label="Description" value="hello" onChange={handleChange} />);

    const field = screen.getByLabelText("Description");
    expect(field).toHaveValue("hello");
    fireEvent.change(field, { target: { value: "hello world" } });
    expect(handleChange).toHaveBeenCalled();
  });

  test("shows the error message with role=alert when error is set", () => {
    render(<TextArea label="Description" value="" onChange={() => {}} error="Too long" />);
    expect(screen.getByText("Too long")).toHaveAttribute("role", "alert");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/ui/TextArea.test.tsx`
Expected: FAIL — `./TextArea` module not found.

- [ ] **Step 3: Implement**

Create `frontend/src/components/ui/TextArea.tsx`:

```tsx
import { useId } from "react";
import type { TextareaHTMLAttributes } from "react";
import styles from "./TextArea.module.css";

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
};

export function TextArea({ label, error, id, ...rest }: TextAreaProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;

  return (
    <div className={styles.field}>
      <label htmlFor={fieldId} className={styles.label}>
        {label}
      </label>
      <textarea
        {...rest}
        id={fieldId}
        className={[styles.textarea, error ? styles.textareaError : ""].filter(Boolean).join(" ")}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
      />
      <p id={errorId} role="alert" className={styles.error} data-visible={Boolean(error)}>
        {error}
      </p>
    </div>
  );
}
```

Create `frontend/src/components/ui/TextArea.module.css`:

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

.textarea {
  width: 100%;
  min-height: 96px;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text-primary);
  font-size: var(--text-base);
  font-family: inherit;
  resize: vertical;
  transition:
    border-color var(--duration-micro) var(--ease-out),
    box-shadow var(--duration-micro) var(--ease-out);
}

.textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(154, 43, 31, 0.15);
}

.textareaError {
  border-color: var(--danger);
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/components/ui/TextArea.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/TextArea.tsx frontend/src/components/ui/TextArea.module.css frontend/src/components/ui/TextArea.test.tsx
git commit -m "feat: add TextArea component"
```

---

## Task 7: ConfirmDialog component

**Files:**
- Create: `frontend/src/components/ui/ConfirmDialog.tsx`, `frontend/src/components/ui/ConfirmDialog.module.css`
- Test: `frontend/src/components/ui/ConfirmDialog.test.tsx`

**Interfaces:**
- Consumes: `Button` (`src/components/ui/Button.tsx`).
- Produces: `<ConfirmDialog title description confirmLabel isConfirming onConfirm onCancel />` — consumed by `ProjectMembersPage` (Task 12) and `ProjectSettingsPage` (Task 13).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/ui/ConfirmDialog.test.tsx`:

```tsx
import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  test("calls onConfirm when the confirm button is clicked", () => {
    const onConfirm = mock(() => {});
    render(
      <ConfirmDialog
        title="Delete this?"
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("calls onCancel when Cancel is clicked or the overlay is clicked", () => {
    const onCancel = mock(() => {});
    render(
      <ConfirmDialog
        title="Delete this?"
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("clicking inside the dialog does not trigger onCancel", () => {
    const onCancel = mock(() => {});
    render(
      <ConfirmDialog
        title="Delete this?"
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText("Delete this?"));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/ui/ConfirmDialog.test.tsx`
Expected: FAIL — `./ConfirmDialog` module not found.

- [ ] **Step 3: Implement**

Create `frontend/src/components/ui/ConfirmDialog.tsx`:

```tsx
import { useId } from "react";
import { Button } from "./Button";
import styles from "./ConfirmDialog.module.css";

type ConfirmDialogProps = {
  title: string;
  description: string;
  confirmLabel: string;
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  isConfirming = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();

  return (
    <div className={styles.overlay} role="presentation" onClick={onCancel}>
      <div
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <p className={styles.description}>{description}</p>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onCancel} disabled={isConfirming}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} isLoading={isConfirming}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

Create `frontend/src/components/ui/ConfirmDialog.module.css`:

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(23, 23, 26, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  z-index: 10;
}

.dialog {
  width: 100%;
  max-width: 420px;
  padding: var(--space-6);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-elevated);
}

.title {
  margin: 0 0 var(--space-2);
  font-size: var(--text-lg);
}

.description {
  margin: 0 0 var(--space-6);
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/components/ui/ConfirmDialog.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/ConfirmDialog.tsx frontend/src/components/ui/ConfirmDialog.module.css frontend/src/components/ui/ConfirmDialog.test.tsx
git commit -m "feat: add ConfirmDialog component"
```

---

## Task 8: Tabs component

**Files:**
- Create: `frontend/src/components/ui/Tabs.tsx`, `frontend/src/components/ui/Tabs.module.css`
- Test: `frontend/src/components/ui/Tabs.test.tsx`

**Interfaces:**
- Produces: `<Tabs items={{ to: string; label: string }[]} />` — consumed by `ProjectPage` (Task 9).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/ui/Tabs.test.tsx`:

```tsx
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Tabs } from "./Tabs";

describe("Tabs", () => {
  test("renders a link per item and marks the current route active", () => {
    render(
      <MemoryRouter initialEntries={["/projects/p1/members"]}>
        <Tabs
          items={[
            { to: "/projects/p1/tasks", label: "Tasks" },
            { to: "/projects/p1/members", label: "Members" },
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Tasks" })).toHaveAttribute("href", "/projects/p1/tasks");
    const membersLink = screen.getByRole("link", { name: "Members" });
    expect(membersLink).toHaveAttribute("aria-current", "page");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/ui/Tabs.test.tsx`
Expected: FAIL — `./Tabs` module not found.

- [ ] **Step 3: Implement**

Create `frontend/src/components/ui/Tabs.tsx`:

```tsx
import { NavLink } from "react-router";
import styles from "./Tabs.module.css";

type TabsProps = {
  items: { to: string; label: string }[];
};

export function Tabs({ items }: TabsProps) {
  return (
    <nav className={styles.tabs} aria-label="Project sections">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => [styles.tab, isActive ? styles.active : ""].filter(Boolean).join(" ")}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
```

Create `frontend/src/components/ui/Tabs.module.css`:

```css
.tabs {
  display: flex;
  gap: var(--space-4);
  border-bottom: 1px solid var(--border);
  margin-bottom: var(--space-6);
}

.tab {
  padding: var(--space-2) 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  text-decoration: none;
  border-bottom: 2px solid transparent;
}

.active {
  color: var(--text-primary);
  border-bottom-color: var(--accent);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/components/ui/Tabs.test.tsx`
Expected: PASS (1 test). `NavLink` sets `aria-current="page"` automatically on the active link.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/Tabs.tsx frontend/src/components/ui/Tabs.module.css frontend/src/components/ui/Tabs.test.tsx
git commit -m "feat: add Tabs navigation component"
```

---

## Task 9: ProjectPage shell

**Files:**
- Create: `frontend/src/pages/ProjectPage.tsx`, `frontend/src/pages/ProjectPage.module.css`
- Test: `frontend/src/pages/ProjectPage.test.tsx`

**Interfaces:**
- Consumes: `getProject`, `listMembers` (Task 2), `findOwnMembership` (Task 4), `Tabs` (Task 8), `AppShell`, `Spinner`, `FormBanner`, `Button`, `useAuth`, `ApiError`.
- Produces: `ProjectOutletContext = { project: Project; members: MemberWithUser[]; membership: MemberWithUser; refreshMembers: () => Promise<void> }`, delivered via `<Outlet context={...} />` — consumed by `ProjectTasksPage` (Task 11), `ProjectMembersPage` (Task 12), `ProjectSettingsPage` (Task 13).

Covers Review Focus: direct navigation to a project the caller isn't an active member of (or a nonexistent one) renders "Project not found," not a crash or infinite spinner.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/pages/ProjectPage.test.tsx`:

```tsx
import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { ApiError } from "../api/client";

const realAuthContext = { ...(await import("../auth/AuthContext")) };
const useAuthMock = mock(() => ({
  status: "authenticated" as const,
  user: { id: "u1", name: "Ana", email: "ana@example.com", role: "USER" as const, status: "ACTIVE" as const, createdAt: "2026-01-01T00:00:00Z" },
  login: mock(async () => {}),
  logout: mock(async () => {}),
  clearSession: mock(() => {}),
}));
mock.module("../auth/AuthContext", () => ({ ...realAuthContext, useAuth: useAuthMock }));

const projectsApiMock = {
  getProject: mock(async () => ({ project: { id: "p1", creatorId: "u1", info: "Launch plan", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" } })),
  listMembers: mock(async () => ({
    members: [
      { id: "m1", userId: "u1", projectId: "p1", role: "OWNER" as const, status: "ACTIVE" as const, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Ana", email: "ana@example.com" },
    ],
  })),
};
mock.module("../api/projects", () => projectsApiMock);

const { ProjectPage } = await import("./ProjectPage");

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

afterEach(() => {
  projectsApiMock.getProject = mock(async () => ({ project: { id: "p1", creatorId: "u1", info: "Launch plan", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" } }));
  projectsApiMock.listMembers = mock(async () => ({
    members: [
      { id: "m1", userId: "u1", projectId: "p1", role: "OWNER" as const, status: "ACTIVE" as const, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Ana", email: "ana@example.com" },
    ],
  }));
});

describe("ProjectPage", () => {
  test("renders the project header, role badge, and tab content once loaded", async () => {
    renderProjectPage();
    await waitFor(() => expect(screen.getByText("Launch plan")).toBeInTheDocument());
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("tasks tab content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });

  test("hides the Settings tab for a MEMBER", async () => {
    projectsApiMock.listMembers = mock(async () => ({
      members: [
        { id: "m1", userId: "u1", projectId: "p1", role: "MEMBER" as const, status: "ACTIVE" as const, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Ana", email: "ana@example.com" },
      ],
    }));
    renderProjectPage();
    await waitFor(() => expect(screen.getByText("Launch plan")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
  });

  test("renders a not-found state on a 403 from getProject", async () => {
    projectsApiMock.getProject = mock(async () => {
      throw new ApiError(403, "You do not have access to this project");
    });
    renderProjectPage();
    await waitFor(() => expect(screen.getByText("Project not found.")).toBeInTheDocument());
  });

  test("renders a retry-able error banner on a network/500 failure", async () => {
    projectsApiMock.getProject = mock(async () => {
      throw new ApiError(500, "Something went wrong. Please try again.");
    });
    renderProjectPage();
    await waitFor(() => expect(screen.getByText("Something went wrong loading this project.")).toBeInTheDocument());
  });
});

afterAll(() => {
  mock.module("../auth/AuthContext", () => realAuthContext);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/pages/ProjectPage.test.tsx`
Expected: FAIL — `./ProjectPage` module not found.

- [ ] **Step 3: Implement**

Create `frontend/src/pages/ProjectPage.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { Link, Outlet, useParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { AppShell } from "../components/AppShell";
import { Tabs } from "../components/ui/Tabs";
import { Spinner } from "../components/ui/Spinner";
import { FormBanner } from "../components/ui/FormBanner";
import { Button } from "../components/ui/Button";
import { ApiError } from "../api/client";
import { getProject, listMembers } from "../api/projects";
import { findOwnMembership } from "../utils/membership";
import type { MemberWithUser, Project } from "../types/project";
import styles from "./ProjectPage.module.css";

export type ProjectOutletContext = {
  project: Project;
  members: MemberWithUser[];
  membership: MemberWithUser;
  refreshMembers: () => Promise<void>;
};

type LoadState = "loading" | "loaded" | "not-found" | "error";

function NotFound() {
  return (
    <AppShell>
      <div className={styles.notFound}>
        <p>Project not found.</p>
        <Link to="/">Back to dashboard</Link>
      </div>
    </AppShell>
  );
}

export function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [state, setState] = useState<LoadState>("loading");
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<MemberWithUser[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setState("loading");
    try {
      const [projectResult, membersResult] = await Promise.all([getProject(id), listMembers(id)]);
      setProject(projectResult.project);
      setMembers(membersResult.members);
      setState("loaded");
    } catch (err) {
      if (err instanceof ApiError && (err.status === 403 || err.status === 400)) {
        setState("not-found");
      } else {
        setState("error");
      }
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refreshMembers(): Promise<void> {
    if (!id) return;
    const result = await listMembers(id);
    setMembers(result.members);
  }

  if (state === "loading") {
    return <Spinner label="Loading project" fullPage />;
  }

  if (state === "not-found") {
    return <NotFound />;
  }

  if (state === "error" || !project) {
    return (
      <AppShell>
        <FormBanner variant="error">Something went wrong loading this project.</FormBanner>
        <Button variant="secondary" onClick={() => void load()}>
          Retry
        </Button>
      </AppShell>
    );
  }

  const membership = user ? findOwnMembership(members, user.id) : null;
  if (!membership) {
    return <NotFound />;
  }

  const tabs = [
    { to: `/projects/${project.id}/tasks`, label: "Tasks" },
    { to: `/projects/${project.id}/members`, label: "Members" },
  ];
  if (membership.role === "OWNER") {
    tabs.push({ to: `/projects/${project.id}/settings`, label: "Settings" });
  }

  const context: ProjectOutletContext = { project, members, membership, refreshMembers };

  return (
    <AppShell>
      <header className={styles.header}>
        <h1 className={styles.title}>{project.info}</h1>
        <span className={styles.roleBadge}>{membership.role === "OWNER" ? "Owner" : "Member"}</span>
        <span className={styles.memberCount}>
          {members.length} {members.length === 1 ? "member" : "members"}
        </span>
      </header>
      <Tabs items={tabs} />
      <div className={styles.tabContent}>
        <Outlet context={context} />
      </div>
    </AppShell>
  );
}
```

Create `frontend/src/pages/ProjectPage.module.css`:

```css
.header {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.title {
  font-size: var(--text-xl);
  margin: 0;
  max-width: 60ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.roleBadge {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  padding: 2px var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.memberCount {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.tabContent {
  padding-top: var(--space-2);
}

.notFound {
  padding: var(--space-8) 0;
  text-align: center;
  color: var(--text-secondary);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/pages/ProjectPage.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ProjectPage.tsx frontend/src/pages/ProjectPage.module.css frontend/src/pages/ProjectPage.test.tsx
git commit -m "feat: add ProjectPage shell with tabs and outlet context"
```

---

## Task 10: TaskDrawer component

**Files:**
- Create: `frontend/src/components/TaskDrawer.tsx`, `frontend/src/components/TaskDrawer.module.css`
- Test: `frontend/src/components/TaskDrawer.test.tsx`

**Interfaces:**
- Consumes: `createTask`, `updateTask`, `deleteTask` (Task 3), `useForm`, `TextField`, `TextArea` (Task 6), `Button`, `FormBanner`, `ApiError`, `MemberWithUser`/`MemberRole` (Task 2).
- Produces: `<TaskDrawer projectId members ownMembershipId ownRole task onClose onCreated onUpdated onDeleted />` — consumed by `ProjectTasksPage` (Task 11). Dual-purpose: `task === null` is create mode, `task !== null` is edit mode.

Covers Review Focus: assigning a task to a member id no longer ACTIVE in the project surfaces the backend's "Invalid assignee" message via the existing `useForm` error path.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/TaskDrawer.test.tsx`:

```tsx
import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "../api/client";
import type { MemberWithUser } from "../types/project";
import type { Task } from "../types/task";

const tasksApiMock = {
  createTask: mock(async () => ({ task: {} })),
  updateTask: mock(async () => ({ task: {} })),
  deleteTask: mock(async () => ({ message: "Task deleted" })),
};
mock.module("../api/tasks", () => tasksApiMock);

const { TaskDrawer } = await import("./TaskDrawer");

const members: MemberWithUser[] = [
  { id: "m1", userId: "u1", projectId: "p1", role: "OWNER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Ana", email: "ana@example.com" },
  { id: "m2", userId: "u2", projectId: "p1", role: "MEMBER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Bo", email: "bo@example.com" },
];

const existingTask: Task = {
  id: "t1",
  projectId: "p1",
  creatorMemberId: "m1",
  assigneeMemberId: null,
  title: "Write the plan",
  description: null,
  priority: "MODERATE",
  status: "NOT_STARTED",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

afterEach(() => {
  tasksApiMock.createTask = mock(async () => ({ task: {} }));
  tasksApiMock.updateTask = mock(async () => ({ task: {} }));
  tasksApiMock.deleteTask = mock(async () => ({ message: "Task deleted" }));
});

describe("TaskDrawer", () => {
  test("create mode: submitting calls createTask and onCreated", async () => {
    tasksApiMock.createTask = mock(async () => ({ task: { ...existingTask, id: "t2", title: "New task" } }));
    const onCreated = mock(() => {});

    render(
      <TaskDrawer
        projectId="p1"
        members={members}
        ownMembershipId="m1"
        ownRole="OWNER"
        task={null}
        onClose={() => {}}
        onCreated={onCreated}
        onUpdated={() => {}}
        onDeleted={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New task" } });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => expect(tasksApiMock.createTask).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ title: "New task" }));
  });

  test("edit mode: shows Delete only when the viewer is the creator or an OWNER", () => {
    const { rerender } = render(
      <TaskDrawer
        projectId="p1"
        members={members}
        ownMembershipId="m2"
        ownRole="MEMBER"
        task={existingTask}
        onClose={() => {}}
        onCreated={() => {}}
        onUpdated={() => {}}
        onDeleted={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

    rerender(
      <TaskDrawer
        projectId="p1"
        members={members}
        ownMembershipId="m1"
        ownRole="OWNER"
        task={existingTask}
        onClose={() => {}}
        onCreated={() => {}}
        onUpdated={() => {}}
        onDeleted={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  test("shows the backend's 'Invalid assignee' message on submit failure", async () => {
    tasksApiMock.updateTask = mock(async () => {
      throw new ApiError(400, "Invalid assignee");
    });

    render(
      <TaskDrawer
        projectId="p1"
        members={members}
        ownMembershipId="m1"
        ownRole="OWNER"
        task={existingTask}
        onClose={() => {}}
        onCreated={() => {}}
        onUpdated={() => {}}
        onDeleted={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByText("Invalid assignee")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/components/TaskDrawer.test.tsx`
Expected: FAIL — `./TaskDrawer` module not found.

- [ ] **Step 3: Implement**

Create `frontend/src/components/TaskDrawer.tsx`:

```tsx
import { useId, useState } from "react";
import { useForm } from "../hooks/useForm";
import { TextField } from "./ui/TextField";
import { TextArea } from "./ui/TextArea";
import { Button } from "./ui/Button";
import { FormBanner } from "./ui/FormBanner";
import { ApiError } from "../api/client";
import { createTask, deleteTask, updateTask } from "../api/tasks";
import type { MemberRole, MemberWithUser } from "../types/project";
import type { CreateTaskInput, Task, TaskPriority, TaskStatus } from "../types/task";
import styles from "./TaskDrawer.module.css";

type TaskDrawerProps = {
  projectId: string;
  members: MemberWithUser[];
  ownMembershipId: string;
  ownRole: MemberRole;
  task: Task | null;
  onClose: () => void;
  onCreated: (task: Task) => void;
  onUpdated: (task: Task) => void;
  onDeleted: (taskId: string) => void;
};

type TaskFormValues = {
  title: string;
  description: string;
  priority: string;
  status: string;
  assigneeMemberId: string;
};

export function TaskDrawer({
  projectId,
  members,
  ownMembershipId,
  ownRole,
  task,
  onClose,
  onCreated,
  onUpdated,
  onDeleted,
}: TaskDrawerProps) {
  const titleId = useId();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { values, errors, formError, isSubmitting, handleChange, handleBlur, handleSubmit } =
    useForm<TaskFormValues>({
      initialValues: {
        title: task?.title ?? "",
        description: task?.description ?? "",
        priority: task?.priority ?? "MODERATE",
        status: task?.status ?? "NOT_STARTED",
        assigneeMemberId: task?.assigneeMemberId ?? "",
      },
      validators: {
        title: (value) =>
          value.trim().length === 0
            ? "Title is required"
            : value.length > 200
              ? "Title must be 200 characters or fewer"
              : undefined,
        description: (value) => (value.length > 500 ? "Description must be 500 characters or fewer" : undefined),
      },
      async onSubmit(formValues) {
        const input: CreateTaskInput = {
          title: formValues.title.trim(),
          description: formValues.description.trim() === "" ? null : formValues.description.trim(),
          priority: formValues.priority as TaskPriority,
          status: formValues.status as TaskStatus,
          assigneeMemberId: formValues.assigneeMemberId === "" ? null : formValues.assigneeMemberId,
        };
        if (task) {
          const result = await updateTask(projectId, task.id, input);
          onUpdated(result.task);
        } else {
          const result = await createTask(projectId, input);
          onCreated(result.task);
        }
      },
    });

  async function handleDelete(): Promise<void> {
    if (!task) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteTask(projectId, task.id);
      onDeleted(task.id);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setIsDeleting(false);
    }
  }

  const canDelete = task !== null && (ownRole === "OWNER" || task.creatorMemberId === ownMembershipId);

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className={styles.heading}>
          {task ? "Edit task" : "New task"}
        </h2>
        {(formError || deleteError) && <FormBanner variant="error">{formError ?? deleteError}</FormBanner>}
        <form onSubmit={handleSubmit} className={styles.form}>
          <TextField
            label="Title"
            value={values.title}
            error={errors.title}
            onChange={(event) => handleChange("title", event.target.value)}
            onBlur={() => handleBlur("title")}
          />
          <TextArea
            label="Description"
            value={values.description}
            error={errors.description}
            onChange={(event) => handleChange("description", event.target.value)}
            onBlur={() => handleBlur("description")}
          />
          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="task-priority" className={styles.label}>
                Priority
              </label>
              <select id="task-priority" value={values.priority} onChange={(event) => handleChange("priority", event.target.value)}>
                <option value="VERY_LOW">Very low</option>
                <option value="LOW">Low</option>
                <option value="MODERATE">Moderate</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="task-status" className={styles.label}>
                Status
              </label>
              <select id="task-status" value={values.status} onChange={(event) => handleChange("status", event.target.value)}>
                <option value="NOT_STARTED">Not started</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="BLOCKED">Blocked</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor="task-assignee" className={styles.label}>
              Assignee
            </label>
            <select
              id="task-assignee"
              value={values.assigneeMemberId}
              onChange={(event) => handleChange("assigneeMemberId", event.target.value)}
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting || isDeleting}>
              Cancel
            </Button>
            {canDelete && (
              <Button
                type="button"
                variant="secondary"
                isLoading={isDeleting}
                disabled={isSubmitting}
                onClick={() => void handleDelete()}
              >
                Delete
              </Button>
            )}
            <Button type="submit" variant="primary" isLoading={isSubmitting} disabled={isDeleting}>
              {task ? "Save changes" : "Create task"}
            </Button>
          </div>
        </form>
      </aside>
    </div>
  );
}
```

Create `frontend/src/components/TaskDrawer.module.css`:

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(23, 23, 26, 0.3);
  display: flex;
  justify-content: flex-end;
  z-index: 10;
}

.drawer {
  width: 100%;
  max-width: 420px;
  height: 100%;
  overflow-y: auto;
  padding: var(--space-6);
  background: var(--surface);
  box-shadow: var(--shadow-elevated);
  animation: slideIn var(--duration-page) var(--ease-out);
}

.heading {
  margin: 0 0 var(--space-4);
  font-size: var(--text-lg);
}

.form {
  display: flex;
  flex-direction: column;
}

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

.row {
  display: flex;
  gap: var(--space-3);
}

.row .field {
  flex: 1;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .drawer {
    animation: none;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/components/TaskDrawer.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/TaskDrawer.tsx frontend/src/components/TaskDrawer.module.css frontend/src/components/TaskDrawer.test.tsx
git commit -m "feat: add TaskDrawer create/edit/delete component"
```

---

## Task 11: TaskRow + ProjectTasksPage

**Files:**
- Create: `frontend/src/components/TaskRow.tsx`, `frontend/src/components/TaskRow.module.css`
- Create: `frontend/src/pages/ProjectTasksPage.tsx`, `frontend/src/pages/ProjectTasksPage.module.css`
- Test: `frontend/src/components/TaskRow.test.tsx`, `frontend/src/pages/ProjectTasksPage.test.tsx`

**Interfaces:**
- Consumes: `StatusPill`, `PriorityPill` (Task 5), `TaskDrawer` (Task 10), `listTasks` (Task 3), `ProjectOutletContext` (Task 9).
- Produces: `ProjectTasksPage` — routed at `/projects/:id/tasks` (wired in Task 15).

The non-creator/non-owner "no Delete affordance" behavior (Review Focus item 3) is enforced and tested entirely inside `TaskDrawer` (Task 10) — this task just wires the drawer open on row click, it adds no new permission logic of its own.

- [ ] **Step 1: Write the failing `TaskRow` test**

Create `frontend/src/components/TaskRow.test.tsx`:

```tsx
import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { TaskRow } from "./TaskRow";
import type { Task } from "../types/task";

const task: Task = {
  id: "t1",
  projectId: "p1",
  creatorMemberId: "m1",
  assigneeMemberId: "m2",
  title: "Write the plan",
  description: null,
  priority: "HIGH",
  status: "IN_PROGRESS",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
};

describe("TaskRow", () => {
  test("renders title, status, priority, and assignee name, and calls onClick", () => {
    const onClick = mock(() => {});
    render(<TaskRow task={task} assigneeName="Bo" onClick={onClick} />);

    expect(screen.getByText("Write the plan")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Bo")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Write the plan"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("shows 'Unassigned' when assigneeName is null", () => {
    render(<TaskRow task={task} assigneeName={null} onClick={() => {}} />);
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/TaskRow.test.tsx`
Expected: FAIL — `./TaskRow` module not found.

- [ ] **Step 3: Implement `TaskRow`**

Create `frontend/src/components/TaskRow.tsx`:

```tsx
import { StatusPill } from "./ui/StatusPill";
import { PriorityPill } from "./ui/PriorityPill";
import type { Task } from "../types/task";
import styles from "./TaskRow.module.css";

type TaskRowProps = {
  task: Task;
  assigneeName: string | null;
  onClick: () => void;
};

export function TaskRow({ task, assigneeName, onClick }: TaskRowProps) {
  return (
    <button type="button" className={styles.row} onClick={onClick}>
      <StatusPill status={task.status} />
      <span className={styles.title}>{task.title}</span>
      <PriorityPill priority={task.priority} />
      <span className={styles.assignee}>{assigneeName ?? "Unassigned"}</span>
      <span className={styles.updatedAt}>{new Date(task.updatedAt).toLocaleDateString()}</span>
    </button>
  );
}
```

Create `frontend/src/components/TaskRow.module.css`:

```css
.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--duration-micro) var(--ease-out);
}

.row:hover {
  background: rgba(23, 23, 26, 0.02);
}

.title {
  flex: 1;
  font-size: var(--text-base);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.assignee {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  min-width: 96px;
}

.updatedAt {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
}
```

- [ ] **Step 4: Run the `TaskRow` test to verify it passes**

Run: `bun test src/components/TaskRow.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing `ProjectTasksPage` test**

Create `frontend/src/pages/ProjectTasksPage.test.tsx`:

```tsx
import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import type { ProjectOutletContext } from "./ProjectPage";

const tasksApiMock = {
  listTasks: mock(async () => ({ tasks: [] as unknown[] })),
  createTask: mock(async () => ({ task: {} })),
  updateTask: mock(async () => ({ task: {} })),
  deleteTask: mock(async () => ({ message: "Task deleted" })),
};
mock.module("../api/tasks", () => tasksApiMock);

const { ProjectTasksPage } = await import("./ProjectTasksPage");

const baseContext: ProjectOutletContext = {
  project: { id: "p1", creatorId: "u1", info: "Launch plan", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  members: [
    { id: "m1", userId: "u1", projectId: "p1", role: "OWNER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Ana", email: "ana@example.com" },
  ],
  membership: { id: "m1", userId: "u1", projectId: "p1", role: "OWNER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Ana", email: "ana@example.com" },
  refreshMembers: mock(async () => {}),
};

function renderTasksPage(context: ProjectOutletContext = baseContext) {
  return render(
    <MemoryRouter initialEntries={["/projects/p1/tasks"]}>
      <Routes>
        <Route path="/projects/:id" element={<Outlet context={context} />}>
          <Route path="tasks" element={<ProjectTasksPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  tasksApiMock.listTasks = mock(async () => ({ tasks: [] }));
});

describe("ProjectTasksPage", () => {
  test("shows the empty state when there are no tasks", async () => {
    renderTasksPage();
    await waitFor(() => expect(screen.getByText(/No tasks yet/)).toBeInTheDocument());
  });

  test("lists fetched tasks and resolves the assignee name from members", async () => {
    tasksApiMock.listTasks = mock(async () => ({
      tasks: [
        { id: "t1", projectId: "p1", creatorMemberId: "m1", assigneeMemberId: "m1", title: "Write the plan", description: null, priority: "MODERATE", status: "NOT_STARTED", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      ],
    }));
    renderTasksPage();
    await waitFor(() => expect(screen.getByText("Write the plan")).toBeInTheDocument());
    expect(screen.getByText("Ana")).toBeInTheDocument();
  });

  test("clicking 'New task' opens the drawer in create mode", async () => {
    renderTasksPage();
    await waitFor(() => expect(screen.getByText(/No tasks yet/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "New task" }));
    expect(screen.getByText("New task", { selector: "h2" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `bun test src/pages/ProjectTasksPage.test.tsx`
Expected: FAIL — `./ProjectTasksPage` module not found.

- [ ] **Step 7: Implement `ProjectTasksPage`**

Create `frontend/src/pages/ProjectTasksPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router";
import type { ProjectOutletContext } from "./ProjectPage";
import { listTasks } from "../api/tasks";
import { TaskRow } from "../components/TaskRow";
import { TaskDrawer } from "../components/TaskDrawer";
import { Button } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { FormBanner } from "../components/ui/FormBanner";
import type { Task, TaskPriority, TaskStatus } from "../types/task";
import styles from "./ProjectTasksPage.module.css";

type LoadState = "loading" | "loaded" | "error";

export function ProjectTasksPage() {
  const { project, members, membership } = useOutletContext<ProjectOutletContext>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "">("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  async function load(): Promise<void> {
    setState("loading");
    try {
      const result = await listTasks(project.id);
      setTasks(result.tasks);
      setState("loaded");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void load();
    // project.id is stable for the lifetime of this route; load() is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const assigneeNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members) map.set(member.id, member.name);
    return map;
  }, [members]);

  const filteredTasks = tasks.filter(
    (task) =>
      (statusFilter === "" || task.status === statusFilter) &&
      (priorityFilter === "" || task.priority === priorityFilter),
  );

  const drawerTask = isCreating ? null : editingTask;
  const isDrawerOpen = isCreating || editingTask !== null;

  function closeDrawer(): void {
    setIsCreating(false);
    setEditingTask(null);
  }

  if (state === "loading") {
    return <Spinner label="Loading tasks" />;
  }

  if (state === "error") {
    return (
      <div>
        <FormBanner variant="error">Something went wrong loading tasks.</FormBanner>
        <Button variant="secondary" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as TaskStatus | "")}
        >
          <option value="">All statuses</option>
          <option value="NOT_STARTED">Not started</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="BLOCKED">Blocked</option>
          <option value="COMPLETED">Completed</option>
        </select>
        <select
          aria-label="Filter by priority"
          value={priorityFilter}
          onChange={(event) => setPriorityFilter(event.target.value as TaskPriority | "")}
        >
          <option value="">All priorities</option>
          <option value="VERY_LOW">Very low</option>
          <option value="LOW">Low</option>
          <option value="MODERATE">Moderate</option>
          <option value="HIGH">High</option>
          <option value="URGENT">Urgent</option>
        </select>
        <Button variant="primary" onClick={() => setIsCreating(true)}>
          New task
        </Button>
      </div>

      {tasks.length === 0 ? (
        <p className={styles.empty}>No tasks yet — create the first one to get started.</p>
      ) : filteredTasks.length === 0 ? (
        <p className={styles.empty}>No tasks match these filters.</p>
      ) : (
        <div className={styles.list}>
          {filteredTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              assigneeName={task.assigneeMemberId ? (assigneeNames.get(task.assigneeMemberId) ?? null) : null}
              onClick={() => setEditingTask(task)}
            />
          ))}
        </div>
      )}

      {isDrawerOpen && (
        <TaskDrawer
          projectId={project.id}
          members={members}
          ownMembershipId={membership.id}
          ownRole={membership.role}
          task={drawerTask}
          onClose={closeDrawer}
          onCreated={(task) => {
            setTasks((prev) => [task, ...prev]);
            closeDrawer();
          }}
          onUpdated={(task) => {
            setTasks((prev) => prev.map((existing) => (existing.id === task.id ? task : existing)));
            closeDrawer();
          }}
          onDeleted={(taskId) => {
            setTasks((prev) => prev.filter((existing) => existing.id !== taskId));
            closeDrawer();
          }}
        />
      )}
    </div>
  );
}
```

Create `frontend/src/pages/ProjectTasksPage.module.css`:

```css
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.empty {
  color: var(--text-secondary);
  font-size: var(--text-sm);
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `bun test src/pages/ProjectTasksPage.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/TaskRow.tsx frontend/src/components/TaskRow.module.css frontend/src/components/TaskRow.test.tsx frontend/src/pages/ProjectTasksPage.tsx frontend/src/pages/ProjectTasksPage.module.css frontend/src/pages/ProjectTasksPage.test.tsx
git commit -m "feat: add task list view with filters and drawer wiring"
```

---

## Task 12: MemberRow + ProjectMembersPage

**Files:**
- Create: `frontend/src/components/MemberRow.tsx`, `frontend/src/components/MemberRow.module.css`
- Create: `frontend/src/pages/ProjectMembersPage.tsx`, `frontend/src/pages/ProjectMembersPage.module.css`
- Test: `frontend/src/pages/ProjectMembersPage.test.tsx`

**Interfaces:**
- Consumes: `addMember`, `removeMember` (Task 2), `ConfirmDialog` (Task 7), `useForm`, `TextField`, `ProjectOutletContext` (Task 9).
- Produces: `ProjectMembersPage` — routed at `/projects/:id/members` (wired in Task 15).

Members can't remove themselves from this UI (`canRemove` excludes the viewer's own row) even though the backend would technically allow an owner to self-remove if another owner exists — self-removal mid-session would strand the page since `ProjectPage` re-derives membership on every load. This is a UX call, not a backend limitation.

Covers Review Focus: removing the last active OWNER surfaces the backend's exact "Cannot remove the last owner" message; inviting an email with no matching ACTIVE user surfaces "User not found or not verified" without adding a phantom row.

- [ ] **Step 1: Write the failing `MemberRow` test inline with the page test (below)** — `MemberRow` is presentational and small enough that its behavior is fully exercised through `ProjectMembersPage`'s tests; write it directly.

Create `frontend/src/components/MemberRow.tsx`:

```tsx
import { Button } from "./ui/Button";
import type { MemberWithUser } from "../types/project";
import styles from "./MemberRow.module.css";

type MemberRowProps = {
  member: MemberWithUser;
  canRemove: boolean;
  isRemoving: boolean;
  onRemove: () => void;
};

export function MemberRow({ member, canRemove, isRemoving, onRemove }: MemberRowProps) {
  return (
    <div className={styles.row}>
      <div className={styles.identity}>
        <span className={styles.name}>{member.name}</span>
        <span className={styles.email}>{member.email}</span>
      </div>
      <span className={styles.role}>{member.role === "OWNER" ? "Owner" : "Member"}</span>
      {canRemove && (
        <Button variant="secondary" isLoading={isRemoving} onClick={onRemove}>
          Remove
        </Button>
      )}
    </div>
  );
}
```

Create `frontend/src/components/MemberRow.module.css`:

```css
.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.identity {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.name {
  font-size: var(--text-base);
  color: var(--text-primary);
}

.email {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.role {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
}
```

- [ ] **Step 2: Write the failing `ProjectMembersPage` tests**

Create `frontend/src/pages/ProjectMembersPage.test.tsx`:

```tsx
import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { ApiError } from "../api/client";
import type { ProjectOutletContext } from "./ProjectPage";

const projectsApiMock = {
  addMember: mock(async () => ({ member: {} })),
  removeMember: mock(async () => ({ message: "Member removed" })),
};
mock.module("../api/projects", () => projectsApiMock);

const { ProjectMembersPage } = await import("./ProjectMembersPage");

const owner = { id: "m1", userId: "u1", projectId: "p1", role: "OWNER" as const, status: "ACTIVE" as const, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Ana", email: "ana@example.com" };
const member = { id: "m2", userId: "u2", projectId: "p1", role: "MEMBER" as const, status: "ACTIVE" as const, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Bo", email: "bo@example.com" };

function renderMembersPage(context: ProjectOutletContext) {
  return render(
    <MemoryRouter initialEntries={["/projects/p1/members"]}>
      <Routes>
        <Route path="/projects/:id" element={<Outlet context={context} />}>
          <Route path="members" element={<ProjectMembersPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  projectsApiMock.addMember = mock(async () => ({ member: {} }));
  projectsApiMock.removeMember = mock(async () => ({ message: "Member removed" }));
});

describe("ProjectMembersPage", () => {
  test("owner sees the invite form and a Remove action on other members, not on themselves", async () => {
    const refreshMembers = mock(async () => {});
    renderMembersPage({
      project: { id: "p1", creatorId: "u1", info: "Launch plan", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      members: [owner, member],
      membership: owner,
      refreshMembers,
    });

    expect(screen.getByLabelText("Invite by email")).toBeInTheDocument();
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    expect(removeButtons).toHaveLength(1); // only Bo's row, not Ana's (the viewer)
  });

  test("member sees no invite form and no Remove actions", async () => {
    renderMembersPage({
      project: { id: "p1", creatorId: "u1", info: "Launch plan", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      members: [owner, member],
      membership: member,
      refreshMembers: mock(async () => {}),
    });

    expect(screen.queryByLabelText("Invite by email")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  test("shows the backend's message when inviting an unverified/unknown email", async () => {
    projectsApiMock.addMember = mock(async () => {
      throw new ApiError(400, "User not found or not verified");
    });
    renderMembersPage({
      project: { id: "p1", creatorId: "u1", info: "Launch plan", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      members: [owner],
      membership: owner,
      refreshMembers: mock(async () => {}),
    });

    fireEvent.change(screen.getByLabelText("Invite by email"), { target: { value: "unknown@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    await waitFor(() => expect(screen.getByText("User not found or not verified")).toBeInTheDocument());
  });

  test("shows the backend's message when removing the last owner", async () => {
    projectsApiMock.removeMember = mock(async () => {
      throw new ApiError(400, "Cannot remove the last owner");
    });
    renderMembersPage({
      project: { id: "p1", creatorId: "u1", info: "Launch plan", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      members: [owner, member],
      membership: owner,
      refreshMembers: mock(async () => {}),
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(screen.getByText("Cannot remove the last owner")).toBeInTheDocument());
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun test src/pages/ProjectMembersPage.test.tsx`
Expected: FAIL — `./ProjectMembersPage` module not found.

- [ ] **Step 4: Implement `ProjectMembersPage`**

Create `frontend/src/pages/ProjectMembersPage.tsx`:

```tsx
import { useState } from "react";
import { useOutletContext } from "react-router";
import type { ProjectOutletContext } from "./ProjectPage";
import { addMember, removeMember } from "../api/projects";
import { ApiError } from "../api/client";
import { useForm } from "../hooks/useForm";
import { TextField } from "../components/ui/TextField";
import { Button } from "../components/ui/Button";
import { FormBanner } from "../components/ui/FormBanner";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { MemberRow } from "../components/MemberRow";
import type { MemberWithUser } from "../types/project";
import styles from "./ProjectMembersPage.module.css";

type InviteFormValues = { email: string };

export function ProjectMembersPage() {
  const { project, members, membership, refreshMembers } = useOutletContext<ProjectOutletContext>();
  const [removeTarget, setRemoveTarget] = useState<MemberWithUser | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const isOwner = membership.role === "OWNER";

  const { values, errors, formError, isSubmitting, handleChange, handleBlur, handleSubmit } =
    useForm<InviteFormValues>({
      initialValues: { email: "" },
      validators: {
        email: (value) => (/^\S+@\S+\.\S+$/.test(value) ? undefined : "Enter a valid email address"),
      },
      async onSubmit(formValues) {
        await addMember(project.id, formValues.email.trim().toLowerCase());
        await refreshMembers();
      },
    });

  async function confirmRemove(): Promise<void> {
    if (!removeTarget) return;
    setIsRemoving(true);
    setRemoveError(null);
    try {
      await removeMember(project.id, removeTarget.id);
      await refreshMembers();
      setRemoveTarget(null);
    } catch (err) {
      setRemoveError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <div className={styles.page}>
      {isOwner && (
        <form onSubmit={handleSubmit} className={styles.inviteForm}>
          {formError && <FormBanner variant="error">{formError}</FormBanner>}
          <TextField
            label="Invite by email"
            type="email"
            value={values.email}
            error={errors.email}
            onChange={(event) => handleChange("email", event.target.value)}
            onBlur={() => handleBlur("email")}
          />
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            Invite
          </Button>
        </form>
      )}

      {removeError && <FormBanner variant="error">{removeError}</FormBanner>}

      <div className={styles.list}>
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            canRemove={isOwner && member.id !== membership.id}
            isRemoving={isRemoving && removeTarget?.id === member.id}
            onRemove={() => setRemoveTarget(member)}
          />
        ))}
      </div>

      {removeTarget && (
        <ConfirmDialog
          title="Remove member?"
          description={`${removeTarget.name} will lose access to this project.`}
          confirmLabel="Remove"
          isConfirming={isRemoving}
          onConfirm={() => void confirmRemove()}
          onCancel={() => {
            setRemoveTarget(null);
            setRemoveError(null);
          }}
        />
      )}
    </div>
  );
}
```

Create `frontend/src/pages/ProjectMembersPage.module.css`:

```css
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.inviteForm {
  display: flex;
  align-items: flex-end;
  gap: var(--space-3);
  max-width: 420px;
}

.inviteForm > :first-child {
  flex: 1;
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test src/pages/ProjectMembersPage.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/MemberRow.tsx frontend/src/components/MemberRow.module.css frontend/src/pages/ProjectMembersPage.tsx frontend/src/pages/ProjectMembersPage.module.css frontend/src/pages/ProjectMembersPage.test.tsx
git commit -m "feat: add members list, invite, and remove workflow"
```

---

## Task 13: ProjectSettingsPage

**Files:**
- Create: `frontend/src/pages/ProjectSettingsPage.tsx`, `frontend/src/pages/ProjectSettingsPage.module.css`
- Test: `frontend/src/pages/ProjectSettingsPage.test.tsx`

**Interfaces:**
- Consumes: `updateProject`, `deleteProject` (Task 2), `ConfirmDialog` (Task 7), `TextArea` (Task 6), `useForm`, `ProjectOutletContext` (Task 9).
- Produces: `ProjectSettingsPage` — routed at `/projects/:id/settings` (wired in Task 15). Redirects non-owners to the Tasks tab (double gate — the tab link is already hidden by `ProjectPage`, but a MEMBER hitting this URL directly still gets redirected, not a broken settings form).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/pages/ProjectSettingsPage.test.tsx`:

```tsx
import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { ApiError } from "../api/client";
import type { ProjectOutletContext } from "./ProjectPage";

const projectsApiMock = {
  updateProject: mock(async () => ({ project: {} })),
  deleteProject: mock(async () => ({ message: "Project deleted" })),
};
mock.module("../api/projects", () => projectsApiMock);

const { ProjectSettingsPage } = await import("./ProjectSettingsPage");

const owner = { id: "m1", userId: "u1", projectId: "p1", role: "OWNER" as const, status: "ACTIVE" as const, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Ana", email: "ana@example.com" };
const member = { id: "m2", userId: "u2", projectId: "p1", role: "MEMBER" as const, status: "ACTIVE" as const, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Bo", email: "bo@example.com" };
const project = { id: "p1", creatorId: "u1", info: "Launch plan", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };

function renderSettingsPage(context: ProjectOutletContext) {
  return render(
    <MemoryRouter initialEntries={["/projects/p1/settings"]}>
      <Routes>
        <Route path="/projects/:id" element={<Outlet context={context} />}>
          <Route path="settings" element={<ProjectSettingsPage />} />
          <Route path="tasks" element={<p>tasks tab</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  projectsApiMock.updateProject = mock(async () => ({ project: {} }));
  projectsApiMock.deleteProject = mock(async () => ({ message: "Project deleted" }));
});

describe("ProjectSettingsPage", () => {
  test("redirects a MEMBER to the tasks tab instead of showing the form", async () => {
    renderSettingsPage({ project, members: [owner, member], membership: member, refreshMembers: mock(async () => {}) });
    await waitFor(() => expect(screen.getByText("tasks tab")).toBeInTheDocument());
  });

  test("an OWNER can submit the info form", async () => {
    renderSettingsPage({ project, members: [owner], membership: owner, refreshMembers: mock(async () => {}) });
    fireEvent.change(screen.getByLabelText("Project info"), { target: { value: "Updated plan" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(projectsApiMock.updateProject).toHaveBeenCalledWith("p1", "Updated plan"));
  });

  test("confirming delete calls deleteProject", async () => {
    renderSettingsPage({ project, members: [owner], membership: owner, refreshMembers: mock(async () => {}) });
    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete", exact: true }));
    await waitFor(() => expect(projectsApiMock.deleteProject).toHaveBeenCalledWith("p1"));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/pages/ProjectSettingsPage.test.tsx`
Expected: FAIL — `./ProjectSettingsPage` module not found.

- [ ] **Step 3: Implement**

Create `frontend/src/pages/ProjectSettingsPage.tsx`:

```tsx
import { useState } from "react";
import { Navigate, useNavigate, useOutletContext } from "react-router";
import type { ProjectOutletContext } from "./ProjectPage";
import { deleteProject, updateProject } from "../api/projects";
import { ApiError } from "../api/client";
import { useForm } from "../hooks/useForm";
import { TextArea } from "../components/ui/TextArea";
import { Button } from "../components/ui/Button";
import { FormBanner } from "../components/ui/FormBanner";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import styles from "./ProjectSettingsPage.module.css";

type InfoFormValues = { info: string };

export function ProjectSettingsPage() {
  const { project, membership } = useOutletContext<ProjectOutletContext>();
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { values, errors, formError, isSubmitting, handleChange, handleBlur, handleSubmit } =
    useForm<InfoFormValues>({
      initialValues: { info: project.info },
      validators: {
        info: (value) =>
          value.trim().length === 0 ? "Info is required" : value.length > 500 ? "Info must be 500 characters or fewer" : undefined,
      },
      async onSubmit(formValues) {
        await updateProject(project.id, formValues.info.trim());
      },
    });

  async function handleDeleteProject(): Promise<void> {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteProject(project.id);
      navigate("/", { replace: true });
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setIsDeleting(false);
    }
  }

  if (membership.role !== "OWNER") {
    return <Navigate to={`/projects/${project.id}/tasks`} replace />;
  }

  return (
    <div className={styles.page}>
      <form onSubmit={handleSubmit} className={styles.form}>
        {formError && <FormBanner variant="error">{formError}</FormBanner>}
        <TextArea
          label="Project info"
          value={values.info}
          error={errors.info}
          onChange={(event) => handleChange("info", event.target.value)}
          onBlur={() => handleBlur("info")}
        />
        <Button type="submit" variant="primary" isLoading={isSubmitting}>
          Save changes
        </Button>
      </form>

      <div className={styles.dangerZone}>
        <h2 className={styles.dangerTitle}>Danger zone</h2>
        {deleteError && <FormBanner variant="error">{deleteError}</FormBanner>}
        <Button variant="secondary" onClick={() => setShowDeleteConfirm(true)}>
          Delete project
        </Button>
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete this project?"
          description="This permanently deletes the project and all its tasks. This cannot be undone."
          confirmLabel="Delete"
          isConfirming={isDeleting}
          onConfirm={() => void handleDeleteProject()}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
```

Create `frontend/src/pages/ProjectSettingsPage.module.css`:

```css
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  max-width: 480px;
}

.dangerZone {
  padding: var(--space-4);
  border: 1px solid rgba(220, 38, 38, 0.3);
  border-radius: var(--radius-md);
}

.dangerTitle {
  margin: 0 0 var(--space-3);
  font-size: var(--text-md);
  color: var(--danger);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/pages/ProjectSettingsPage.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ProjectSettingsPage.tsx frontend/src/pages/ProjectSettingsPage.module.css frontend/src/pages/ProjectSettingsPage.test.tsx
git commit -m "feat: add project settings page with edit and delete"
```

---

## Task 14: ProjectRow + DashboardPage rewrite

**Files:**
- Create: `frontend/src/components/ProjectRow.tsx`, `frontend/src/components/ProjectRow.module.css`
- Modify: `frontend/src/pages/DashboardPage.tsx`, `frontend/src/pages/DashboardPage.module.css`
- Modify (rewrite): `frontend/src/pages/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: `listProjects`, `createProject` (Task 2), `TextArea` (Task 6), `useForm`, `useAuth`.
- Produces: the real dashboard — replaces the placeholder at `/`.

The old test's assertions ("Welcome, Ana", "Projects aren't available yet.") no longer apply — the placeholder copy is gone, replaced by a real project list. This is a full rewrite of the test file, not an addition.

- [ ] **Step 1: Write the failing tests**

Rewrite `frontend/src/pages/DashboardPage.test.tsx`:

```tsx
import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const realAuthContext = { ...(await import("../auth/AuthContext")) };
const useAuthMock = mock(() => ({
  status: "authenticated" as const,
  user: { id: "u1", name: "Ana", email: "ana@example.com", role: "USER" as const, status: "ACTIVE" as const, createdAt: "2026-01-01T00:00:00Z" },
  login: mock(async () => {}),
  logout: mock(async () => {}),
  clearSession: mock(() => {}),
}));
mock.module("../auth/AuthContext", () => ({ ...realAuthContext, useAuth: useAuthMock }));

const projectsApiMock = {
  listProjects: mock(async () => ({ projects: [] as unknown[] })),
  createProject: mock(async () => ({ project: {}, membership: {} })),
};
mock.module("../api/projects", () => projectsApiMock);

const { DashboardPage } = await import("./DashboardPage");

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  projectsApiMock.listProjects = mock(async () => ({ projects: [] }));
});

describe("DashboardPage", () => {
  test("shows an honest empty state when the user has no projects", async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText("You don't have any projects yet.")).toBeInTheDocument());
  });

  test("lists projects and marks the ones the user created", async () => {
    projectsApiMock.listProjects = mock(async () => ({
      projects: [
        { id: "p1", creatorId: "u1", info: "Launch plan", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
        { id: "p2", creatorId: "u2", info: "Someone else's project", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      ],
    }));
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Launch plan")).toBeInTheDocument());
    expect(screen.getByText("Created by you")).toBeInTheDocument();
    expect(screen.getByText("Shared with you")).toBeInTheDocument();
  });

  test("creating a project adds it to the list", async () => {
    projectsApiMock.createProject = mock(async () => ({
      project: { id: "p3", creatorId: "u1", info: "Brand new project", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      membership: { id: "m1", userId: "u1", projectId: "p3", role: "OWNER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
    }));
    renderDashboard();
    await waitFor(() => expect(screen.getByText("You don't have any projects yet.")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "New project" }));
    fireEvent.change(screen.getByLabelText("What's this project about?"), { target: { value: "Brand new project" } });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() => expect(screen.getByText("Brand new project")).toBeInTheDocument());
  });
});

afterAll(() => {
  mock.module("../auth/AuthContext", () => realAuthContext);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/pages/DashboardPage.test.tsx`
Expected: FAIL — old assertions ("Welcome, Ana") don't match; `listProjects` mock is unused by the current placeholder implementation.

- [ ] **Step 3: Implement `ProjectRow`**

Create `frontend/src/components/ProjectRow.tsx`:

```tsx
import { Link } from "react-router";
import type { Project } from "../types/project";
import styles from "./ProjectRow.module.css";

type ProjectRowProps = {
  project: Project;
  isCreator: boolean;
};

export function ProjectRow({ project, isCreator }: ProjectRowProps) {
  return (
    <Link to={`/projects/${project.id}`} className={styles.row}>
      <div className={styles.info}>
        <p className={styles.excerpt}>{project.info}</p>
        <span className={styles.meta}>
          {isCreator ? "Created by you" : "Shared with you"} · {new Date(project.createdAt).toLocaleDateString()}
        </span>
      </div>
      <span className={styles.chevron} aria-hidden="true">
        ›
      </span>
    </Link>
  );
}
```

Create `frontend/src/components/ProjectRow.module.css`:

```css
.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  text-decoration: none;
  color: inherit;
  transition: background-color var(--duration-micro) var(--ease-out);
}

.row:hover {
  background: rgba(23, 23, 26, 0.02);
}

.info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.excerpt {
  margin: 0;
  color: var(--text-primary);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.meta {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.chevron {
  color: var(--text-muted);
  font-size: var(--text-lg);
}
```

- [ ] **Step 4: Rewrite `DashboardPage`**

Replace the contents of `frontend/src/pages/DashboardPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../auth/AuthContext";
import { useForm } from "../hooks/useForm";
import { TextArea } from "../components/ui/TextArea";
import { Button } from "../components/ui/Button";
import { FormBanner } from "../components/ui/FormBanner";
import { Spinner } from "../components/ui/Spinner";
import { ProjectRow } from "../components/ProjectRow";
import { createProject, listProjects } from "../api/projects";
import type { Project } from "../types/project";
import styles from "./DashboardPage.module.css";

type CreateFormValues = { info: string };
type LoadState = "loading" | "loaded" | "error";

export function DashboardPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [isCreating, setIsCreating] = useState(false);

  async function load(): Promise<void> {
    setState("loading");
    try {
      const result = await listProjects();
      setProjects(result.projects);
      setState("loaded");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const { values, errors, formError, isSubmitting, handleChange, handleBlur, handleSubmit } =
    useForm<CreateFormValues>({
      initialValues: { info: "" },
      validators: {
        info: (value) =>
          value.trim().length === 0 ? "Info is required" : value.length > 500 ? "Info must be 500 characters or fewer" : undefined,
      },
      async onSubmit(formValues) {
        const result = await createProject(formValues.info.trim());
        setProjects((prev) => [result.project, ...prev]);
        setIsCreating(false);
      },
    });

  return (
    <AppShell>
      <div className={styles.toolbar}>
        <h1 className={styles.heading}>Your projects</h1>
        {!isCreating && (
          <Button variant="primary" onClick={() => setIsCreating(true)}>
            New project
          </Button>
        )}
      </div>

      {isCreating && (
        <form onSubmit={handleSubmit} className={styles.createForm}>
          {formError && <FormBanner variant="error">{formError}</FormBanner>}
          <TextArea
            label="What's this project about?"
            value={values.info}
            error={errors.info}
            onChange={(event) => handleChange("info", event.target.value)}
            onBlur={() => handleBlur("info")}
          />
          <div className={styles.createActions}>
            <Button type="button" variant="secondary" onClick={() => setIsCreating(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Create project
            </Button>
          </div>
        </form>
      )}

      {state === "loading" && <Spinner label="Loading projects" />}

      {state === "error" && (
        <div>
          <FormBanner variant="error">Something went wrong loading your projects.</FormBanner>
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      {state === "loaded" && projects.length === 0 && (
        <div className={styles.empty}>
          <p>You don't have any projects yet.</p>
          <p className={styles.detail}>Create one to start tracking tasks with your team.</p>
        </div>
      )}

      {state === "loaded" && projects.length > 0 && (
        <div className={styles.list}>
          {projects.map((project) => (
            <ProjectRow key={project.id} project={project} isCreator={project.creatorId === user?.id} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
```

- [ ] **Step 5: Update `DashboardPage.module.css`**

Replace the contents of `frontend/src/pages/DashboardPage.module.css`:

```css
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-6);
}

.heading {
  font-size: var(--text-xl);
  margin: 0;
}

.createForm {
  max-width: 480px;
  margin-bottom: var(--space-6);
}

.createActions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
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

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun test src/pages/DashboardPage.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ProjectRow.tsx frontend/src/components/ProjectRow.module.css frontend/src/pages/DashboardPage.tsx frontend/src/pages/DashboardPage.module.css frontend/src/pages/DashboardPage.test.tsx
git commit -m "feat: rewrite dashboard as a real project list with create flow"
```

---

## Task 15: Routing + AppShell wordmark link

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/components/AppShell.tsx`, `frontend/src/components/AppShell.module.css`
- Test: `frontend/src/components/AppShell.test.tsx` (new)

**Interfaces:**
- Consumes: `ProjectPage` (9), `ProjectTasksPage` (11), `ProjectMembersPage` (12), `ProjectSettingsPage` (13), `DashboardPage` (14).
- Produces: the live, wired routes — this is the task where the whole feature becomes reachable end-to-end.

- [ ] **Step 1: Write the failing `AppShell` test**

Create `frontend/src/components/AppShell.test.tsx`:

```tsx
import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const realAuthContext = { ...(await import("../auth/AuthContext")) };
mock.module("../auth/AuthContext", () => ({
  ...realAuthContext,
  useAuth: mock(() => ({
    status: "authenticated" as const,
    user: { id: "u1", name: "Ana", email: "ana@example.com", role: "USER" as const, status: "ACTIVE" as const, createdAt: "2026-01-01T00:00:00Z" },
    login: mock(async () => {}),
    logout: mock(async () => {}),
    clearSession: mock(() => {}),
  })),
}));

const { AppShell } = await import("./AppShell");

describe("AppShell", () => {
  test("the wordmark links back to the dashboard", () => {
    render(
      <MemoryRouter>
        <AppShell>
          <p>content</p>
        </AppShell>
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "docket" })).toHaveAttribute("href", "/");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/AppShell.test.tsx`
Expected: FAIL — wordmark is currently a `<span>`, not a link.

- [ ] **Step 3: Make the wordmark a link**

In `frontend/src/components/AppShell.tsx`, change the import and the wordmark element:

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
        <Link to="/" className={styles.wordmark}>
          docket
        </Link>
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

In `frontend/src/components/AppShell.module.css`, add to `.wordmark`:

```css
.wordmark {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-muted);
  text-decoration: none;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/components/AppShell.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Wire the new routes into `App.tsx`**

Replace the contents of `frontend/src/App.tsx`:

```tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import { RequireGuest } from "./auth/RequireGuest";
import { RegisterPage } from "./pages/RegisterPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";
import { LoginPage } from "./pages/LoginPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ProjectPage } from "./pages/ProjectPage";
import { ProjectTasksPage } from "./pages/ProjectTasksPage";
import { ProjectMembersPage } from "./pages/ProjectMembersPage";
import { ProjectSettingsPage } from "./pages/ProjectSettingsPage";
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
            path="/projects/:id"
            element={
              <RequireAuth>
                <ProjectPage />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="tasks" replace />} />
            <Route path="tasks" element={<ProjectTasksPage />} />
            <Route path="members" element={<ProjectMembersPage />} />
            <Route path="settings" element={<ProjectSettingsPage />} />
          </Route>
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

- [ ] **Step 6: Write the failing routing-integration test**

Add to `frontend/src/App.test.tsx` (keep the existing two tests, add this one inside the same `describe` block):

```tsx
  test("index-redirects /projects/:id to the tasks tab and renders the empty state", async () => {
    window.history.pushState({}, "", "/projects/11111111-1111-1111-1111-111111111111");
    const responses = [
      jsonResponse(200, { accessToken: "abc123" }), // boot refresh
      jsonResponse(200, {
        user: { id: "u1", name: "Ana", email: "ana@example.com", role: "USER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z" },
      }), // me
      jsonResponse(200, {
        project: { id: "11111111-1111-1111-1111-111111111111", creatorId: "u1", info: "Launch plan", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      }), // getProject
      jsonResponse(200, {
        members: [
          { id: "m1", userId: "u1", projectId: "11111111-1111-1111-1111-111111111111", role: "OWNER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Ana", email: "ana@example.com" },
        ],
      }), // listMembers
      jsonResponse(200, { tasks: [] }), // listTasks (ProjectTasksPage)
    ];
    globalThis.fetch = mock(async () => responses.shift()!) as unknown as typeof fetch;
    const { default: App } = await import("./App");

    render(<App />);
    await waitFor(() => expect(screen.getByText(/No tasks yet/)).toBeInTheDocument());
    expect(window.location.pathname).toBe("/projects/11111111-1111-1111-1111-111111111111/tasks");
  });
```

- [ ] **Step 7: Run all the `App.test.tsx` tests to verify they pass**

Run: `bun test src/App.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx frontend/src/components/AppShell.tsx frontend/src/components/AppShell.module.css frontend/src/components/AppShell.test.tsx
git commit -m "feat: wire projects/tasks routes and link the wordmark to the dashboard"
```

---

## Task 16: Final integration pass & PROJECT_MAP update

**Files:**
- Modify: `frontend/docs/PROJECT_MAP.md`

**Interfaces:**
- Consumes: nothing new — this task verifies everything built in Tasks 1–15 together and brings the project map back in sync with reality, per CLAUDE.md §1G.

- [ ] **Step 1: Run the full test suite**

Run: `bun test`
Expected: PASS, 0 fail, 0 errors, across every file (the existing ~56 auth tests plus every test added in Tasks 2–15).

- [ ] **Step 2: Run the type-checked build**

Run: `bun run build`
Expected: zero TypeScript errors, zero build errors.

- [ ] **Step 3: Run the linter**

Run: `bun run lint`
Expected: zero errors.

- [ ] **Step 4: Sweep for leftover TODO/FIXME markers**

Run: `grep -rn "TODO\|FIXME" frontend/src`
Expected: no matches (or only pre-existing matches unrelated to this feature — investigate and resolve any new ones before proceeding).

- [ ] **Step 5: Update `docs/PROJECT_MAP.md`**

Update these sections to match the now-implemented reality (verified against `backend/src/modules/projects/*` and `backend/src/modules/tasks/*`, and this plan's spec):

- **§2 Backend Capabilities:** add `projects`, `tasks` to the list of implemented modules (alongside `health`, `auth`); note the `member` sub-resource lives under the projects module.
- **§4 API Map:** add the `/api/v1/projects` and `/api/v1/projects/:id/tasks` tables from this plan's spec §1 (method/path/auth/body/response/notes), matching the verified auth-table format already there.
- **§6 User Roles & Permissions:** replace "no role/permission checks exist anywhere yet" with the verified reality — `members.role` (OWNER/MEMBER) is enforced per-project, `users.role` ADMIN gating exists only for the (unreachable-from-UI) reactivate endpoint.
- **§7 User Journeys:** add the create-project → invite member → create/assign/update task journey, now backend-supported.
- **§8 Routes / Screens:** replace the "proposed, not yet built" project/task routes with the actual implemented list from this plan's spec §3.
- **§9 Component Map:** list the new components (`StatusPill`, `PriorityPill`, `TextArea`, `ConfirmDialog`, `Tabs`, `TaskDrawer`, `TaskRow`, `MemberRow`, `ProjectRow`) alongside the existing auth-era ones.
- **§10 State Map:** note that dashboard/tasks/members screens now implement the Loading/Loaded/Empty/Error/Not-Found states described in this plan's spec §7.
- **§11 Frontend ↔ Backend Dependencies:** add the projects/members/tasks rows (mirroring the existing auth rows' format).
- **§14 Implementation Status:** check off `Post-login dashboard`, `Projects workflow`, `Tasks workflow`; leave `Members workflow` checked for invite/list/remove but add a note that reactivate is intentionally not built (see §15 update below); leave `Responsive refinement`/`Accessibility audit` unchecked if not separately verified.
- **§15 Known Backend Limitations:** replace the stale "no projects/members/tasks API" entry with the real remaining gap — `GET /:id/members` never returns INACTIVE members, so `POST /:id/members/:memberId/reactivate` has no frontend-reachable id (spec §9). Remove the now-resolved `006_add_task_status.sql`/typo entries (both fixed).
- **§16 Open Questions:** resolve the "when the projects/tasks backend module lands" question — it landed, this plan is the answer.
- **§17 Deferred Work:** replace "everything under Projects, Members, Tasks" with what's still actually deferred — reactivate-member UI, real-time updates, task comments/attachments, the sidebar project-switcher considered and declined during brainstorming.
- **§18 Completed Work:** append an entry for this feature (mirroring the existing 2026-09-25 auth entry's format) — what was built, how it was verified, and any manual-smoke-test caveat (see Step 6).

- [ ] **Step 6: Manual smoke test (requires a running backend + Postgres)**

If a real backend instance is reachable in this environment, walk: register two users → verify both → log in as user A → create a project → invite user B by email → log out → log in as user B → see the project on the dashboard → create a task, assign it to user A → log out → log in as user A → edit that task's status → log out → log in as user B → delete the task (should fail, not the creator/not owner) → log in as user A (creator) → delete it (should succeed). If no backend instance is available in this environment, record that explicitly in §18's new entry (mirroring how the auth feature's Task 18 recorded the same gap) rather than claiming it was verified.

- [ ] **Step 7: Commit**

```bash
git add frontend/docs/PROJECT_MAP.md
git commit -m "docs: update PROJECT_MAP for the projects/members/tasks frontend"
```
