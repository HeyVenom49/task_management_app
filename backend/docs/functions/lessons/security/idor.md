# Lesson: IDOR (Insecure Direct Object Reference)

**Standalone ✓** — You do not need any other doc to understand, prevent, test, and interview on IDOR.

**After this file you can:** define IDOR, design nested-resource authorization, implement membership + parent-child checks like this API, choose 403 vs 404 deliberately, write IDOR tests, and debug “wrong user sees data” reports.

---

## 1. First principles

**IDOR** happens when a client changes an identifier (UUID, integer id, slug) in a URL or body and the server performs the operation **without proving the authenticated actor may access that specific row in that context**.

The identifier is only a **lookup key**, not proof of permission. UUIDs are hard to guess but trivial to **copy from another response** or leak in logs. Security comes from **authorization**: membership, ownership, role, and **binding child resources to a parent** (e.g. task belongs to project in the path).

**Problem it removes:** “Anyone with a valid login can read or change any row if they know its id.”

---

## 2. Mental model

### Analogy

A hotel key card opens **your room**, not every room whose number you type into the elevator panel. Knowing room 1204’s number is not a key.

### Diagram

```text
Request: GET /projects/{projectId}/tasks/{taskId}
              │                    │
              │                    └── child row
              └── claimed parent context

Checks:
  1) JWT user ──ACTIVE member──► projectId     (403 if not)
  2) task.projectId === projectId               (404 if mismatch)
```

Two locks: **who** (membership) and **what** (row belongs to parent).

---

## 3. Core rules (must / must-not)

1. **MUST** authorize every id taken from URL, query, or body against the authenticated principal.  
2. **MUST** for nested routes verify the child’s foreign key matches the parent in the path.  
3. **MUST NOT** rely on UUID obscurity, client-side hiding, or “users won’t guess.”  
4. **MUST** use consistent status codes (see mechanics) so you do not leak existence across tenants.  
5. **MUST** test with **two users, two projects**, and cross-id swaps.  
6. **MUST NOT** expose `findById(id)` on a service without a membership gate.

---

## 4. How it works (mechanics)

### Horizontal vs vertical

| Type | Meaning | Example |
|------|---------|---------|
| Horizontal | Same role, wrong peer’s data | Alice reads Bob’s project |
| Vertical | Escalate role | Member deletes as if owner |

This repo focuses on **horizontal IDOR** on projects/tasks and **field-level** restrictions (assignee-only updates).

### Status code strategy (this API)

| Situation | Code | Why |
|-----------|------|-----|
| Not a member of `projectId` | **403** | Actor is known; access denied to resource class |
| Member but `taskId` not in this project | **404** | Do not confirm task exists elsewhere |

Same pattern for assignee from another project: **400** invalid assignee (business rule), not silent acceptance.

### Where checks live

- **Authentication** (`authenticate` middleware): who is calling.  
- **Authorization** (services): may this user touch this row.  
Never skip the second because JWT is valid.

---

## 5. When to use / when not to use

| Approach | Use when |
|----------|----------|
| Membership check on parent id | Every project-scoped route |
| Child `projectId === :projectId` | Nested task (or comment, file) routes |
| Row-level locks inside transactions | Concurrent member removal + task write |
| Signed capability URLs | Public share links (not in this app) |
| Global admin bypass | Internal ops only, audited |

| Avoid | Why |
|-------|-----|
| Only `SELECT * FROM tasks WHERE id = $1` | Ignores project boundary |
| Trust client to send correct `projectId` in body | Attacker sends victim’s project id |

---

## 6. Step-by-step: design → implement → verify

### Design

1. List every id in the API surface.  
2. For each, write: “Actor must be … in relation to row …”  
3. For nested resources, add parent-child invariant.  
4. Pick 403 vs 404 per row.

### Implement

1. Apply `authenticate` on protected routers.  
2. In service entrypoints, call `requireActiveMember(userId, projectId)` first.  
3. Load child; compare `child.projectId` to path `projectId`.  
4. For writes, lock membership in the same transaction as the mutation when races matter.

### Verify

1. `tasks.idor.test.ts` pattern: Alice, Bob, two projects, swap ids.  
2. Negative: member cannot access own project with wrong nested id.  
3. Positive: member can access own data.

---

## 7. Worked example A — this project

### A1. Project gate

```ts
private async requireActiveMember(userId: string, projectId: string) {
  const membership = await this.memberRepo.findByUserAndProject(
    userId,
    projectId,
  );
  if (!membership || membership.status !== "ACTIVE") {
    throw new ForbiddenError("You do not have access to this project");
  }
  const project = await this.repo.findById(projectId);
  if (!project) {
    throw new ForbiddenError("You do not have access to this project");
  }
  return { project, membership };
}
```

**Why:** Without ACTIVE membership, no project metadata or tasks leak. Missing project still returns 403 (same message) to avoid id oracle on projects for non-members.

**Where:** `backend/src/modules/projects/project.service.ts` — `ProjectServices.requireActiveMember`.

### A2. Task read with parent binding

```ts
public async getById(userId: string, projectId: string, taskId: string) {
  await this.requireActiveMember(userId, projectId);
  const task = await this.taskRepo.findById(taskId);
  if (!task || task.projectId !== projectId) {
    throw new NotFoundError("Task not found");
  }
  return { task };
}
```

**Why:** Alice may be member of project A but pass Bob’s `taskId` under `/projects/A/tasks/{bobTask}`. Membership passes; **404** because task is not in A.

**Where:** `backend/src/modules/tasks/task.service.ts` — `getById`.

### A3. Assignee from another project

```ts
private async assertAssigneeInProject(
  projectId: string,
  assigneeMemberId: string | null | undefined,
  db: Db,
) {
  if (assigneeMemberId == null) return;
  const assignee = await this.memberRepo.lockById(assigneeMemberId, db);
  if (
    !assignee ||
    assignee.projectId !== projectId ||
    assignee.status !== "ACTIVE"
  ) {
    throw new BadRequestError("Invalid assignee");
  }
}
```

**Why:** Prevents assigning a member id copied from another project (IDOR via reference).

**Where:** `backend/src/modules/tasks/task.service.ts`.

### A4. Authentication layer (identity only)

```ts
const payload = await verifyAccessToken(token);
req.user = { id: payload.sub, email: payload.email };
```

**Where:** `backend/src/shared/middleware/authenticate.ts` — proves **who**, not **what they may access**.

---

## 8. Worked example B — mini scenario (self-contained)

**API:** `PATCH /orgs/{orgId}/invoices/{invoiceId}`

**Rules:** User must be ACTIVE member of org; invoice must belong to org.

```ts
async function patchInvoice(userId: string, orgId: string, invoiceId: string, body: Patch) {
  await requireOrgMember(userId, orgId); // 403
  const invoice = await db.invoices.find(invoiceId);
  if (!invoice || invoice.orgId !== orgId) {
    throw notFound("Invoice not found");
  }
  return db.invoices.update(invoiceId, body);
}
```

Attacker swaps `invoiceId` from another org → 404, no invoice body returned.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Failure |
|--------------|---------|
| `GET /tasks/:id` without project | Any member reads any task globally |
| Hide delete button in UI only | Direct API call still works |
| Return 200 with empty list instead of 403 | Hides bug; list endpoints still leak if mis-filtered |
| “Admin” flag in JWT without server check | Forged or stale role in token |
| Sequential ids without authz | Trivial enumeration |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| User sees another project’s name | Missing membership check on GET project | Service method entry | Add `requireActiveMember` |
| 200 on wrong task id | No `projectId` match | `getById` / update paths | Compare `task.projectId` |
| Assignee accepts foreign member id | No assignee validation | create/update task | `assertAssigneeInProject` |
| Flaky 403 after invite | Stale membership cache (if added later) | Cache keys include user+project | Invalidate or skip cache |
| Test passes alone, fails in suite | Shared seed ids | Test isolation | Two users, two projects fixtures |

---

## 11. Interview Q&A (with strong answers)

**Q: Define IDOR in one sentence.**  
**A:** Accessing or modifying an object by manipulating its identifier without the server verifying the caller’s authorization to that object.

**Q: Do UUIDs prevent IDOR?**  
**A:** No. They reduce casual guessing but not leakage, sharing, or authenticated cross-tenant access.

**Q: Why 404 for wrong task in project?**  
**A:** To avoid confirming that a task id exists in another project while still denying access.

**Q: Where should authorization live?**  
**A:** In the service/domain layer (and DB constraints as backstop), not only in the UI or optional middleware, so every code path enforces it.

**Q: How do you test IDOR?**  
**A:** Two principals, two scopes, swap ids in nested routes, assert 403/404/400; include positive control for legitimate access.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| IDOR | Insecure Direct Object Reference |
| Object reference | Id pointing to a row or resource |
| Authorization (authz) | Whether this identity may perform this action on this resource |
| Authentication (authn) | Proving identity (JWT here) |
| Horizontal escalation | Access peer data at same privilege level |
| Nested resource | Child identified under parent path (task under project) |

---

## 13. Teach pointer

> “Knowing a UUID is not permission. Membership is permission. Matching parent id is the second lock on the door.”

---

## 14. Optional further reading (not required)

- Auth layers: [authn-vs-authz](./authn-vs-authz.md)  
- Mass assignment on updates: [mass-assignment](./mass-assignment.md)  
- Tests: `backend/src/test/tasks.idor.test.ts`
