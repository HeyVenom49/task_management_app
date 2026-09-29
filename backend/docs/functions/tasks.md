# Tasks — every function, thinking, and interview bank

Covers `modules/tasks/**`.

**Core product problem:** Project-scoped work items with **membership authz**, **field-level update permissions**, **optimistic concurrency**, and **IDOR resistance** (task ids are not secrets across projects).

---

## Architecture map

```
v1: /projects/:id/tasks  → task.routes (mergeParams + authenticate)
  → TaskController
    → TaskService
        → TaskRepository
        → MemberRepository (membership + assignee locks)
```

**Developer thinking:** A task id alone is never enough. Every read/write checks: (1) caller is active member of URL project, (2) task.projectId === URL project id, (3) role/relationship allows the specific mutation.

---

# `task.routes.ts`

1. **What:** `Router({ mergeParams: true })` so `:id` from parent `/projects/:id/tasks` is visible; all routes authenticated.  
2. **Problem:** Nested routers drop parent params unless `mergeParams`.  
3. **Interview bank:**  
   - What is `mergeParams`? What breaks without it?  
   - REST nesting vs flat resources.  
   - Why authenticate at router level.

---

# Schemas (`task.schema.ts`)

## `createTaskSchema`

1. **What:** title 1..200; optional description; priority enum; optional status enum; optional nullable assignee UUID.  
2. **Problem:** Validate shape before service/DB.  
3. **Interview:** Default status in service/repo; nullable assignee meaning unassigned; enum evolution.

## `updateTaskSchema`

1. **What:** Partial of create fields **plus required** `expectedUpdatedAt` ISO datetime.  
2. **Problem:** Force clients to participate in optimistic locking.  
3. **Interview:** Why required on every PATCH; datetime string vs number; timezone.

## `taskParamsSchema`

1. **What:** `id` (project) + `taskId` UUIDs.  
2. **Interview:** Naming `id` vs `projectId` consistency with project schemas.

---

# Types (`task.types.ts`)

## `TaskStatus` / `TaskPriority` / `Task` / `CreateTaskInput` / `UpdateTaskInput`

1. **What:** Domain enums and entities; update input always includes `expectedUpdatedAt`.  
2. **Interview:** String enums vs Postgres enums; assignee is **member id** not user id — why (membership-scoped identity).

---

# `TaskController`

Methods: `create` (201), `list` (200), `getById` (200), `update` (200), `remove` (200).

1. **What:** Parse project/task params + body; call service.  
2. **Interview:** Same controller patterns as projects; why project id from params not body for create.

---

# `TaskService`

## `requireActiveMember` (private)

1. **What:** Active membership or Forbidden.  
2. **Interview:** Same message as projects module — consistency; duplicate logic vs shared policy helper (refactor interview).

## Commented `requireOwner`

1. **What:** Future stricter delete policy stub.  
2. **Interview:** Dead code comments — when to delete vs keep; current delete allows creator OR owner.

## `assertAssigneeInProject` (private)

1. **What:** If assignee set, `lockById` and require same project + ACTIVE.  
2. **Problem:** Cannot assign random member ids from other projects (IDOR-ish assignment).  
3. **Interview:** Why lock assignee row; null assignee skip; DB check constraint backup (`23514` → BadRequest).

## `assertCanUpdateTask` (private)

1. **What:**  
   - Who may update: OWNER, creator, or assignee.  
   - Owner/creator: any update fields.  
   - Assignee: **only `status`**.  
   - Reject entire request if any forbidden field present (including mixed status+priority).  
2. **Problem:** Least privilege on PATCH; prevent privilege escalation via extra fields.  
3. **How to think like that:** *Authorization is not only “can call endpoint” — it’s “can change these columns.”*  
4. **Teach pointer:** “Field-level authz is how assignees stay helpers, not editors.”  
5. **Interview bank:**  
   - Why reject whole request vs stripping fields.  
   - `expectedUpdatedAt` excluded from “sent” field checks.  
   - Creator leaves project? (membership inactive → cannot update.)  
   - Owner who is not creator.  
   - Test coverage in `tasks.authz.test.ts`.

## `isCheckViolation` (private)

1. **What:** Map Postgres check failures to BadRequest invalid assignee.  
2. **Interview:** Defense in depth with app checks.

## `requireActiveMemberLocked` (private)

1. **What:** FOR UPDATE membership inside transaction for create/update.  
2. **Problem:** Membership can’t vanish mid-write without serialization.  
3. **Interview:** Lock scope; remove path uses unlocked require — discuss inconsistency.

## `create`

1. **What:** Tx: lock membership; assert assignee; insert with creatorMemberId = caller’s membership id; default status NOT_STARTED.  
2. **Interview:** Why creator is member id; any active member can create (not owner-only).

## `list`

1. **What:** Membership gate; list all tasks in project.  
2. **Interview:** No pagination; assignee privacy within project OK.

## `getById`

1. **What:** Membership gate; find task; if missing **or projectId mismatch → NotFound**.  
2. **Problem:** Cross-project task id under wrong project URL must not reveal task (404 not 403).  
3. **Teach pointer:** “Same task UUID in another project’s path is still not yours — 404.”  
4. **Interview:** IDOR classic; Alice using Bob’s taskId under Project A (`tasks.idor.test.ts`).

## `update`

1. **What:** Tx: lock membership; load task; project match; assertCanUpdateTask; maybe assert assignee; repo.update with expectedUpdatedAt; if null row → either gone (404) or conflict “modified; reload”.  
2. **Problem:** Lost-update prevention + authz.  
3. **Interview:** Optimistic vs pessimistic locking; HTTP 409; client retry UX; `date_trunc` milliseconds comparison.

## `remove`

1. **What:** Tx-ish begin: require member; load task; project match; only OWNER or creator; delete.  
2. **Note:** Uses `requireActiveMember` not locked; delete without expectedUpdatedAt.  
3. **Interview:** Delete races; should delete be owner-only; assignee cannot delete — why.

---

# `TaskRepository`

## `map` (private)

snake_case → Task.

## `create` / `findById` / `listByProjectId` / `delete`

Straightforward persistence. Interview: ordering by created_at DESC; delete RETURNING.

## `update` (optimistic concurrency)

1. **What:** Read current; merge patch fields; UPDATE … WHERE id AND `date_trunc('milliseconds', updated_at) = expectedUpdatedAt`; return null if no row.  
2. **Problem:** Two clients editing same task — second gets conflict.  
3. **Why date_trunc ms:** Align JS/JSON timestamp precision with Postgres timestamptz.  
4. **Interview bank:**  
   - Explain optimistic concurrency control (OCC).  
   - ETag/If-Match alternative.  
   - What if client sends stale expectedUpdatedAt.  
   - Clock issues? (Uses row version timestamp, not wall clock compare across machines for authority — still DB column.)  
   - Partial update merge logic for null vs undefined description.

## `countOpenAssignedTo`

1. **What:** Count tasks for member where status ≠ COMPLETED.  
2. **Problem:** Used by project `removeMember`.  
3. **Interview:** Define “open”; BLOCKED counts as open; index (assignee, status).

---

# File-level interview set — tasks

### Junior
- How do you create a task under a project?  
- What statuses/priorities exist?  
- Who can delete a task?

### Mid
- Explain assignee-only status updates.  
- Why expectedUpdatedAt on PATCH.  
- Why task.projectId must match URL.  
- Member id vs user id for assignee.

### Senior
- Full IDOR threat model for nested task routes.  
- OCC design and failure modes.  
- Field-level authz vs separate endpoints (`PATCH .../status`).  
- Concurrency: assign while member removed (locks + check constraints).  
- mergeParams and gateway path rewriting.

### Testing tie-ins
- `tasks.idor.test.ts` — cross-user project/task access.  
- `tasks.authz.test.ts` — assignee/mixed/other/owner PATCH matrix.  
- `members.removal.test.ts` — open assignment interaction.  
- `concurrency.test.ts` — related ownership races (projects) affecting task world.

---

# Teach script (tasks)

1. Draw Project A / Project B; Alice / Bob.  
2. Show stealing Bob’s task UUID into Alice’s project path → 404.  
3. Show assignee PATCH status OK, priority → 403.  
4. Two tabs edit same title → second 409; explain expectedUpdatedAt.
