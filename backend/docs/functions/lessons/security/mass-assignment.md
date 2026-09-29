# Lesson: Mass assignment

**Standalone ✓** — You do not need any other doc to stop clients from setting privileged fields via JSON bodies.

**After this file you can:** define mass assignment, use allowlists (Zod + explicit DTOs), implement field-level update rules, spot `...req.body` bugs, and interview on unsafe ORM patterns.

---

## 1. First principles

**Mass assignment** is when a server copies client JSON **directly** into a model/database update, letting attackers set fields they should not (`role`, `isAdmin`, `status`, `creatorMemberId`).

Defense: **allowlists** — only declared fields pass validation and reach persistence.

**Problem it removes:** “Change my task and sneak `role: OWNER` in the body.”

---

## 2. Mental model

### Analogy

Hotel registration form: guest may write name and dates, not “room key master code.” Staff copies only approved fields to the system.

### Diagram

```text
JSON body ──► Zod schema (allowlist) ──► service rules ──► repo UPDATE columns
                  │                           │
                  └── strips unknown keys       └── role-based field caps
```

---

## 3. Core rules (must / must-not)

1. **MUST** validate input with explicit schemas (Zod), not trust raw `req.body`.  
2. **MUST** never spread `req.body` into ORM `update()` without picking fields.  
3. **MUST** enforce role-based **field** allowlists on partial updates.  
4. **MUST NOT** accept server-owned ids from client when server can derive them (`creatorMemberId`).  
5. **MUST** reject forbidden keys in body even if schema strips them — for partial updates, compare sent keys vs allowed.

---

## 4. How it works (mechanics)

### Registration/login

Schemas only expose `name`, `email`, `password` — no `role` or `status` on register.

### Task updates

`assertCanUpdateTask`:

- OWNER/CREATOR: title, description, priority, status, assigneeMemberId.  
- ASSIGNEE: **only** `status`.  
- Any other sent key → `ForbiddenError`.

Server sets `creatorMemberId` from membership on create, not from client.

### Projects

Create/update schemas in `project.schema.ts` — only business fields, not internal ids.

---

## 5. When to use / when not to use

| Allowlist + role caps | Blocklist only |
|----------------------|----------------|
| All user-controlled writes | Never sufficient alone |

| Separate admin DTO | Same endpoint for user/admin |
|--------------------|------------------------------|
| Clearer authz | Higher risk |

---

## 6. Step-by-step: design → implement → verify

1. List columns client may never set.  
2. Zod object per endpoint (no `.passthrough()` on untrusted input).  
3. Service: derive ownership fields from auth context.  
4. Partial PATCH: compute `sent` keys vs `allowed`.  
5. Test: assignee POSTs `title` → 403.

---

## 7. Worked example A — this project

### A1. Register allowlist

```ts
export const registerSchema = z.object({
  name: z.string().trim().min(3),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8).max(72),
});
```

**Where:** `backend/src/modules/auth/auth.schema.ts` — no `role`, `status`.

### A2. Task create — server-owned fields

```ts
const task = await this.taskRepo.create(
  {
    projectId,
    creatorMemberId: membership.id,
    assigneeMemberId: input.assigneeMemberId ?? null,
    title: input.title,
    description: input.description ?? null,
    priority: input.priority,
    status: input.status ?? "NOT_STARTED",
  },
  tx,
);
```

**Where:** `backend/src/modules/tasks/task.service.ts` — `creatorMemberId` from membership, not body.

### A3. Field-level update guard

```ts
const allowed: readonly (keyof UpdateTaskInput)[] =
  isOwner || isCreator
    ? (["title", "description", "priority", "status", "assigneeMemberId"] as const)
    : (["status"] as const);

const sent = (Object.keys(input) as (keyof UpdateTaskInput)[]).filter(
  (key) => input[key] !== undefined && key !== "expectedUpdatedAt",
);
const forbidden = sent.filter((key) => !allowed.includes(key));
if (forbidden.length > 0) {
  throw new ForbiddenError("You cannot update one or more of these fields");
}
```

**Where:** `backend/src/modules/tasks/task.service.ts` — `assertCanUpdateTask`.

---

## 8. Worked example B — mini scenario (self-contained)

**User profile PATCH**

```ts
const patchSchema = z.object({
  displayName: z.string().max(80).optional(),
  bio: z.string().max(500).optional(),
});
// repo.update picks ONLY displayName, bio — never isAdmin
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Outcome |
|--------------|---------|
| `User.update(req.body)` | Privilege escalation |
| Mongoose `{ strict: false }` on user input | Silent extra fields |
| GraphQL `updateUser(input: JSON)` | Same issue |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| User became OWNER | Body field accepted | Controller/service | Remove from schema; DB CHECK |
| Assignee changed title | Missing field guard | `assertCanUpdateTask` | Enforce allowed keys |
| Extra JSON ignored but OK | Zod strips silently | Log forbidden keys | Explicit reject unknown |

---

## 11. Interview Q&A (with strong answers)

**Q: What is mass assignment?**  
**A:** Applying untrusted client fields to a server model, allowing setting of privileged attributes.

**Q: Fix in REST APIs?**  
**A:** DTO allowlists, validation libraries, never blind spread into updates; derive sensitive fields server-side.

**Q: PATCH vs PUT here?**  
**A:** Partial updates need per-role allowed key sets, not just schema presence.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Mass assignment | Unsafe bulk binding of client input |
| Allowlist | Explicit permitted fields |
| DTO | Data transfer object for one operation |
| Privilege escalation | Gaining unauthorized capabilities |

---

## 13. Teach pointer

> “The client suggests; the server decides which columns move.”

---

## 14. Optional further reading (not required)

- Authz: [authn-vs-authz](./authn-vs-authz.md) · [least-privilege](./least-privilege.md)  
- Validation boundary: [../api/validation-boundary.md](../api/validation-boundary.md)
