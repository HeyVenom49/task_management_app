# Step 3 — Shape the API

**Standalone ✓** — You do not need other how-to-think steps or lessons to *design the HTTP contract* (resources, auth matrix, validation, statuses) for a feature in this app’s style.

**After this file you can:** nest resources under the right parent, build an authn/authz matrix, place Zod at the controller boundary, choose status codes, sketch JSON DTOs, and defend the contract in an interview.

---

## 1. Why this step exists

Steps 01–02 said *who* and *what must never happen*. The API is how clients meet those laws.

If you skip this step you ship:

- RPC soup: `POST /doCommentThings`  
- Flat `/comments/:id` with no project context → easier IDOR  
- Authz only in a Notion doc, not in the route table  
- Validation in the service (or not at all) with inconsistent 400 shapes  
- Breaking changes with no `/api/v1` discipline  

**Artifact you leave with:** route table + authn/authz matrix + Zod field list + example JSON + OpenAPI touch note.

---

## 2. Mental model

### Analogy

The route table is a **building directory and badge policy**: which doors exist, who may swipe, what you get when denied. If authz isn’t on the directory, it isn’t designed — it’s improvised in the handler.

### Where this sits

```text
01 brief → 02 threats & invariants
                │
                ▼
         03 shape the API  ← you are here
                │
                ▼
         04 data model → 05 layers → 06 concurrency → 07 tests
```

### Inputs → outputs

| In | Out |
|----|-----|
| Actors + invariants (01–02) | Method/path rows with authn/authz |
| Existing URL style | Nested resources under `/api/v1` |
| Denial strategy (403/404) | Per-route failure statuses |
| Public DTO sketch | Request/response JSON examples |

---

## 3. Core rules (must / must-not)

1. **MUST** identify the noun (resource) and its parent before inventing paths.  
2. **MUST** put new HTTP under `/api/v1` and match nesting style of projects/tasks.  
3. **MUST** fill an authn/authz matrix row per method (Bearer? member? owner? author?).  
4. **MUST** validate path params and bodies with Zod in the **controller** (`safeParse` → 400 `fieldErrors`).  
5. **MUST** return public DTOs only (`{ project }`, `{ task }`, `{ user }` / `PublicUser` style).  
6. **MUST NOT** encode authz only in comments or frontend guards.  
7. **MUST NOT** accept unbounded strings (DoS + UX) — trim + max lengths.  
8. **MUST NOT** forget `mergeParams: true` on routers mounted at `/:id/...` (tasks pattern).

---

## 4. Decision questions — with how to answer

### Q1. What is the resource and parent?

**Why:** Nesting carries authorization context and matches how this app prevents cross-project access.

**How:** Follow existing shapes:

```text
/api/v1/auth/...
/api/v1/projects
/api/v1/projects/:id
/api/v1/projects/:id/members
/api/v1/projects/:id/tasks
/api/v1/projects/:id/tasks/:taskId
```

Comments would naturally be:

```text
/api/v1/projects/:id/tasks/:taskId/comments
/api/v1/projects/:id/tasks/:taskId/comments/:commentId
```

Mount like tasks: `v1Router.use("/projects/:id/tasks", taskRouter)` with `Router({ mergeParams: true })` so `:id` is visible to the child.

**Bad:** `POST /api/v1/comments` with `projectId` only in the body.  
**Good:** Nest under project (and task) so URL context must match DB parent or 404.

### Q2. What does the authn/authz matrix look like?

**Why:** The matrix *is* the security document for the contract.

**How:** One row per operation before coding:

| Method | Path | Authn | Authz | Success | Failures |
|--------|------|-------|-------|---------|----------|
| POST | `.../tasks` | Bearer | active member | 201 | 401, 403, 400 |
| GET | `.../tasks/:taskId` | Bearer | active member | 200 | 401, 403, 404 |
| PATCH | `.../tasks/:taskId` | Bearer | owner/creator/assignee + field allow-list | 200 | 401, 403, 404, 409 |
| DELETE | `.../tasks/:taskId` | Bearer | owner or creator | 200 | 401, 403, 404 |

Authn = `authenticate` middleware. Authz = service (`requireActiveMember`, `assertCanUpdateTask`, …).

**Bad:** “All routes need login.”  
**Good:** “Login ≠ member; PATCH assignee may only send `status`; delete is owner/creator.”

### Q3. Where does validation run?

**Why:** Keep HTTP parsing at the edge; services receive typed input only.

**How (this app):**

```ts
const params = taskParamsSchema.safeParse(req.params);
if (!params.success) {
  res.status(400).json({
    message: "Validation failed",
    errors: params.error.flatten().fieldErrors,
  });
  return;
}
const parsed = updateTaskSchema.safeParse(req.body);
// …
await this.service.update(req.user.id, params.data.id, params.data.taskId, parsed.data);
```

Path UUIDs via Zod; bodies trim + enums + max lengths; OCC field `expectedUpdatedAt` is part of the **contract** for PATCH tasks.

**Bad:** `service.create(req.body as any)`.  
**Good:** Controller `safeParse`; service trusts typed `CreateTaskInput`.

### Q4. What statuses and error shapes?

| Outcome | Status | Mechanism |
|---------|--------|-----------|
| Created | 201 | `res.status(201).json(...)` |
| OK | 200 | list/get/patch/delete |
| Validation | 400 | Zod fieldErrors |
| Unauthenticated | 401 | `UnauthorizedError` / missing `req.user` |
| Not allowed on project / field | 403 | `ForbiddenError` |
| Missing / wrong parent (IDOR policy) | 404 | `NotFoundError` |
| OCC / domain conflict | 409 | `ConflictError` |
| Safety dep down | 503 | `ServiceUnavailableError` (auth limiter) |

Errors flow `next(err)` → `errorHandler` for `AppError`.

### Q5. Response shape and versioning?

**Why:** Clients depend on envelopes; secrets must never leak.

**How:** `{ task }`, `{ tasks }`, `{ project }`, `{ user: PublicUser }`. No password hashes, no refresh token hashes. New routes stay on `/api/v1`; breaking changes → `/api/v2` later. Update `docs/openapi.yaml` when the contract stabilizes; Swagger non-prod only (`app.ts`).

**Bad:** Return `UserAuthRow` including `hashPassword`.  
**Good:** Map to `PublicUser` in the repository/service boundary.

---

## 5. Worked example A — this project

### Tasks API (as implemented)

**Parent resource:** project (`:id`).  
**Resource:** task (`:taskId`).

**Routes** (`task.routes.ts` + `api/v1.ts`):

| Method | Path | Middleware |
|--------|------|------------|
| POST | `/api/v1/projects/:id/tasks` | `authenticate` |
| GET | `/api/v1/projects/:id/tasks` | `authenticate` |
| GET | `/api/v1/projects/:id/tasks/:taskId` | `authenticate` |
| PATCH | `/api/v1/projects/:id/tasks/:taskId` | `authenticate` |
| DELETE | `/api/v1/projects/:id/tasks/:taskId` | `authenticate` |

**Authz (service, not route):**

- All: `requireActiveMember`  
- PATCH: `assertCanUpdateTask` (owner/creator any fields; assignee `status` only)  
- DELETE: owner or creator  
- Get/update miss: `!task || task.projectId !== projectId` → `NotFoundError`

**Zod (field list):**

- Create: `title`, `description?`, `priority`, `status?`, `assigneeMemberId?`  
- Update: partial create fields + required `expectedUpdatedAt` datetime  
- Params: `id` + `taskId` UUIDs  

**Example PATCH body:**

```json
{
  "title": "Ship API brief",
  "expectedUpdatedAt": "2026-09-29T10:00:00.000Z"
}
```

**Example success:**

```json
{ "task": { "id": "…", "projectId": "…", "title": "Ship API brief", "updatedAt": "…" } }
```

**OpenAPI:** touch when contract changes; keep aligned with controllers.

---

## 6. Worked example B — mini greenfield: task comments

**Parent:** task under project.  
**Resource:** comment.

**Routes:**

```text
POST   /api/v1/projects/:id/tasks/:taskId/comments
GET    /api/v1/projects/:id/tasks/:taskId/comments
DELETE /api/v1/projects/:id/tasks/:taskId/comments/:commentId
```

(Optional v1: PATCH with `expectedUpdatedAt` if edits exist.)

**Matrix:**

| Method | Authn | Authz | Success | Failures |
|--------|-------|-------|---------|----------|
| POST | Bearer | active member + task in project | 201 | 401, 403, 400, 404 |
| GET | Bearer | active member + task in project | 200 | 401, 403, 404 |
| DELETE | Bearer | author **or** OWNER + comment in task/project | 200 | 401, 403, 404 |

**Zod sketch:** params `id` / `taskId` / `commentId` UUIDs; body `{ body }` trim 1..2000. Never accept `authorMemberId` from the client — set from membership.

**Example:** `POST { "body": "Let's move the due date." }` → `{ "comment": { "id", "taskId", "authorMemberId", "body", "createdAt", "updatedAt" } }`.

**IDOR:** after `requireActiveMember`, task must match `projectId` else 404; comment must match `taskId` else 404. Mount with `mergeParams: true`.

---

## 7. Decision template

### Blank

```text
Parent resource:
New resource:
Routes:
Authn/authz matrix:
Zod schemas (field list):
Example JSON request/response:
OpenAPI touched: yes/no
mergeParams needed: yes/no
```

### Filled (tasks — excerpt)

```text
Parent resource: project :id
New resource: task :taskId
Routes: POST/GET/PATCH/DELETE under /api/v1/projects/:id/tasks
Authn/authz: authenticate; requireActiveMember; PATCH field allow-list; DELETE owner|creator; wrong parent 404
Zod: createTaskSchema, updateTaskSchema (+ expectedUpdatedAt), taskParamsSchema
Example: PATCH { title, expectedUpdatedAt } → { task }
OpenAPI: yes when stable
mergeParams: yes on taskRouter
```

---

## 8. Wrong world / anti-patterns

| Anti-pattern | What breaks |
|--------------|-------------|
| RPC verbs in paths | Uncacheable, unguessable REST, hard to authz consistently |
| Flat resources without parent | IDOR by UUID swap |
| Authz “documented” only | Reviewers can’t see denials in the contract |
| Validate in repo with SQL casts | Inconsistent 400s; HTTP leaks into persistence |
| Client-supplied `authorMemberId` / `creatorMemberId` | Privilege escalation / mass assignment |
| Skipping `mergeParams` | `req.params.id` undefined; wrong project bind |
| Returning hashes | Credential leak |

---

## 9. Exit criteria

You may go to step 04 when:

- [ ] Resource + parent chosen; paths nested under `/api/v1` like existing modules  
- [ ] Full method matrix with authn, authz, success, failures  
- [ ] Zod field lists for params + bodies (incl. OCC fields if collaborative)  
- [ ] Example request/response JSON without secrets  
- [ ] `mergeParams` / mount path decided  
- [ ] OpenAPI touch planned yes/no  

---

## 10. Interview Q&A

**Q: Why nest tasks under projects?**  
**A:** A task is meaningless outside a project in this product. Nesting makes the project id part of the URL contract, forces services to bind `task.projectId === projectId`, and matches membership checks (`requireActiveMember(userId, projectId)`). Flat `/tasks/:id` invites cross-project IDOR unless every handler re-derives project context carefully.

**Q: Design comment routes for this app.**  
**A:** ` /api/v1/projects/:id/tasks/:taskId/comments` and `.../comments/:commentId`. All routes `authenticate` + active member; create/list require task in project (else 404); delete author or OWNER. Body only `body` string; server sets `authorMemberId`. Optional PATCH with `expectedUpdatedAt` if edits ship in v1.

**Q: Where does validation run and why?**  
**A:** In the controller with Zod `safeParse`. That keeps HTTP concerns (400 fieldErrors, params) at the edge and lets the service assume typed input. Repos speak SQL; they should not parse Express bodies.

**Q: What does `mergeParams` fix?**  
**A:** When `taskRouter` is mounted at `/projects/:id/tasks`, Express does not pass parent params into the child router unless `Router({ mergeParams: true })`. Without it, `req.params.id` is missing and you cannot bind the project for authz/IDOR checks.

**Q: How do you document breaking changes (`v2`)?**  
**A:** Keep `/api/v1` stable for existing clients; introduce `/api/v2` for breaking response/field/auth changes; update OpenAPI per major; avoid silently changing 403/404 semantics or required OCC fields on v1.

**Q: Why is `expectedUpdatedAt` on the PATCH contract instead of only in the DB?**  
**A:** OCC needs the client to send the version it read. Putting it in `updateTaskSchema` makes the wire contract explicit; the repository’s conditional `UPDATE … WHERE updated_at = …` enforces it. Missing it from the API would force silent last-write-wins or awkward headers nobody documents.

---

## 11. Glossary

| Term | Meaning |
|------|---------|
| **Resource** | The noun in the URL (`projects`, `tasks`, `comments`) |
| **Authn/authz matrix** | Table of method → who may call → statuses |
| **Validation boundary** | Where untrusted input becomes typed data (controller + Zod) |
| **DTO / public shape** | Client-safe JSON (e.g. `PublicUser`) |
| **mergeParams** | Express option to inherit parent route params |
| **OCC field** | Client-supplied version (`expectedUpdatedAt`) for conditional update |
| **IDOR-aware path** | Nesting + parent bind so wrong ids 404 |

---

## 12. Optional further reading

- Previous: [02-threats-and-invariants.md](./02-threats-and-invariants.md) · Next: [04-data-model-first.md](./04-data-model-first.md)  
- Lessons (optional): [rest-resource-design](../lessons/api/rest-resource-design.md), [http-status-semantics](../lessons/api/http-status-semantics.md), [validation-boundary](../lessons/api/validation-boundary.md), [api-versioning](../lessons/api/api-versioning.md), [mass-assignment](../lessons/security/mass-assignment.md)  
- Code citations: `api/v1.ts`, `task.routes.ts`, `task.controller.ts`, `task.schema.ts`, `project.routes.ts`, `authenticate.ts`, `errorHandler.ts`

---

## Teach pointer

> “The route table is a security document. If authz isn’t in the table, it isn’t designed.”
