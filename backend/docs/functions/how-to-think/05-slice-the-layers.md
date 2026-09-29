# Step 5 — Slice the layers

**Standalone ✓** — You do not need other how-to-think steps or lessons to *place every responsibility* in route / controller / service / repository the way this codebase already does.

**After this file you can:** run the placement test, wire a composition root, reuse `authenticate` / `requireActiveMember` / `AppError`, split Zod schemas vs DTOs, list files and method names, and defend the layering in an interview.

---

## 1. Why this step exists

Steps 01–04 decided *what* to build. Layering decides *where each line lives* so two engineers don’t collide and policy doesn’t leak into SQL.

If you skip this step you ship:

- fat controllers with SQL  
- repositories throwing `ForbiddenError` (policy leak into persistence)  
- services calling `res.status`  
- copy-pasted membership checks with slightly different messages (IDOR oracles)  
- new architecture fashion (random “use cases” folder) with no reason  

**Artifact you leave with:** file list + method names + shared reuse list — enough to split service vs repo work without ownership fights.

---

## 2. Mental model

### Analogy

Think **restaurant stations**: host (routes) seats you, waiter (controller) takes the order ticket, kitchen lead (service) enforces house rules and coordinates, pantry (repository) fetches ingredients. The pantry doesn’t refuse customers for dress code; the waiter doesn’t sauté.

### Where this sits

```text
01 brief → 02 invariants → 03 API → 04 schema
                                         │
                                         ▼
                              05 slice the layers  ← you are here
                                         │
                                         ▼
                              06 concurrency → 07 tests → 08/09 ship
```

### Inputs → outputs

| In | Out |
|----|-----|
| Route matrix (03) | `*.routes.ts` + controller methods |
| Schema + repo list (04) | `*.repository.ts` methods + `map` |
| Invariants / authz (02) | Service helpers (`requireActiveMember`, allow-lists) |
| Existing modules | Composition root pattern + `api/v1.ts` mount |

---

## 3. Core rules (must / must-not)

1. **MUST** put URL mapping + middleware mount in **routes**.  
2. **MUST** put Zod, status codes, cookies, `next(err)` in **controllers**.  
3. **MUST** put authz, invariants, `sql.begin`, multi-repo orchestration in **services**.  
4. **MUST** put SQL + row mapping (+ lock helpers) in **repositories**.  
5. **MUST** reuse `authenticate`, shared `AppError` subclasses, and existing membership helpers before inventing new ones.  
6. **MUST NOT** run SQL in controllers or set HTTP status in services/repos.  
7. **MUST NOT** let repositories decide 403 vs 404 policy messages.  
8. **MUST NOT** invent a parallel composition style — match `task.routes.ts` / `project.routes.ts`.

---

## 4. Decision questions — with how to answer

### Q1. Where does this code go? (placement test)

| If the code… | Put it in… |
|--------------|------------|
| Maps URL → handler, mounts `authenticate`, limiters | **routes** |
| Parses HTTP, Zod, status codes, cookies, `next(err)` | **controller** |
| Enforces authz, invariants, starts transactions, orchestrates repos | **service** |
| Runs SQL, maps rows, optional `FOR UPDATE` helpers | **repository** |
| JWT verify, request id, error JSON | **shared** middleware / errors |

**Bad:** `controller.create` does `sql\`INSERT …\``.  
**Good:** Controller parses → `service.create` → `repo.create(…, tx)`.

### Q2. How do we wire the composition root?

**Why:** Construction belongs in one place per module (routes file here).

**How — match existing modules:**

```ts
// task.routes.ts pattern
const taskRepo = new TaskRepository(sql);
const memberRepo = new MemberRepository(sql);
const service = new TaskService(sql, taskRepo, memberRepo);
const controller = new TaskController(service);

const taskRouter = Router({ mergeParams: true });
taskRouter.use(authenticate);
taskRouter.post("/", (req, res, next) => controller.create(req, res, next));
```

New module: same pattern; mount in `api/v1.ts` (e.g. tasks already at `/projects/:id/tasks`).

**Bad:** Controllers `new` repositories inside each method.  
**Good:** One graph at module edge; controller only receives the service.

### Q3. Why does the service get `sql` as well as repos?

**Why:** Transactions are orchestration, not a single-repo detail.

**How:** `this.sql.begin(async (tx) => { … })` then pass `tx` into every repo call in that unit (`requireActiveMemberLocked`, `taskRepo.update`, …). Repos accept `Sql | TransactionSql`. Signing JWTs / sending email stays **outside** the transaction (step 06).

**Bad:** `begin` in the repo that only wraps one INSERT.  
**Good:** Service owns boundaries that span member lock + task write.

### Q4. What shared policy helpers do we reuse?

**Why:** Divergent messages create oracles and review noise.

Search before writing `if (!member)`:

- `requireActiveMember` / `requireOwner` / `requireOwnerLocked`  
- `assertCanUpdateTask`-style field allow-lists  
- `ForbiddenError`, `NotFoundError`, `ConflictError`, `BadRequestError`, `UnauthorizedError`, `ServiceUnavailableError`  

Prefer **one** access-denied message for project non-members (`"You do not have access to this project"`) when hiding detail matters.

**Bad:** Repo throws `"forbidden"` string; controller maps inconsistently.  
**Good:** Service throws `ForbiddenError`; `errorHandler` formats JSON.

### Q5. How do types & schemas split?

| File | Holds |
|------|--------|
| `x.schema.ts` | Zod schemas + inferred input types |
| `x.types.ts` | Domain DTOs / row input types (`Public*` free of secrets) |
| `x.repository.ts` | SQL + `map` to DTO |
| `x.service.ts` | Policy + orchestration |
| `x.controller.ts` | HTTP adapter |
| `x.routes.ts` | Composition + verbs |

**Bad:** Export `hashPassword` on the same type you JSON.stringify to clients.  
**Good:** `PublicUser` vs `UserAuthRow` (auth module pattern).

---

## 5. Worked example A — this project

### Request: `PATCH /api/v1/projects/:id/tasks/:taskId`

Walk the layers:

```text
authenticate          → req.user = { id, email } or 401
task.routes           → controller.update
TaskController        → Zod taskParamsSchema + updateTaskSchema
                      → service.update(userId, projectId, taskId, input)
TaskService           → sql.begin
                      → requireActiveMemberLocked (memberRepo FOR UPDATE)
                      → taskRepo.findById (bind projectId or NotFoundError)
                      → assertCanUpdateTask (field allow-list)
                      → assertAssigneeInProject if needed
                      → taskRepo.update (OCC on updated_at)
                      → 0 rows → NotFound vs ConflictError
errorHandler          → AppError status + body
```

**Files:** `task.routes` (DI + `authenticate`); `task.controller` (Zod + statuses); `task.service` (membership, allow-list, tx); `task.repository` (OCC UPDATE + map); `task.schema` / `task.types`; `member.repository` locks; shared `authenticate` + `AppError` family.

**Composition:** `TaskService(sql, taskRepo, memberRepo)` — `sql` for `begin`, repos for data.

---

## 6. Worked example B — mini greenfield: task comments

**Files to add/touch:**

```text
modules/comments/comment.routes.ts
modules/comments/comment.controller.ts
modules/comments/comment.service.ts
modules/comments/comment.repository.ts
modules/comments/comment.schema.ts
modules/comments/comment.types.ts
api/v1.ts                          # mount
# reuse: MemberRepository, TaskRepository (find task for bind), authenticate, AppError
```

**Shared reuse:**

- `authenticate` on router  
- `requireActiveMember` (copy pattern from `TaskService` or extract shared helper later — don’t fork messages)  
- `NotFoundError` for task/comment parent mismatch  
- `ForbiddenError` for non-author delete (unless OWNER)  

**Service methods:**

```text
create(userId, projectId, taskId, { body })
list(userId, projectId, taskId)
remove(userId, projectId, taskId, commentId)
```

**Repo methods:**

```text
create({ taskId, authorMemberId, body }, db?)
listByTaskId(taskId)
findById(id)
delete(id)
map(row)
```

**Controller methods:** `create`, `list`, `remove` — Zod only; no SQL.

**Routes sketch:**

```ts
const commentRouter = Router({ mergeParams: true });
commentRouter.use(authenticate);
commentRouter.post("/", (req, res, next) => controller.create(req, res, next));
commentRouter.get("/", (req, res, next) => controller.list(req, res, next));
commentRouter.delete("/:commentId", (req, res, next) =>
  controller.remove(req, res, next),
);
// v1.ts: use("/projects/:id/tasks/:taskId/comments", commentRouter)
```

**Placement of policy:** “author or OWNER may delete” lives in **service** after loading membership + comment; repository only deletes by id when told.

---

## 7. Decision template

### Blank

```text
Files to add/touch:
- x.routes.ts
- x.controller.ts
- x.service.ts
- x.repository.ts
- x.schema.ts
- x.types.ts
- api/v1.ts (mount?)
Shared reuse:
Service methods (names):
Repo methods (names):
Tx boundaries owned by service (list):
```

### Filled (comments — excerpt)

```text
Files: comment.{routes,controller,service,repository,schema,types}.ts; mount in api/v1.ts
Shared reuse: authenticate, requireActiveMember pattern, TaskRepository.findById bind, AppError family
Service: create, list, remove
Repo: create, listByTaskId, findById, delete, map (tx-capable)
Tx: create may begin if bumping denormalized counts; remove single delete OK without tx unless cascading extras
```

---

## 8. Wrong world / anti-patterns

| Anti-pattern | What breaks |
|--------------|-------------|
| SQL in controllers | Untestable HTTP layer; no tx reuse |
| Repo throws `ForbiddenError` | Persistence coupled to HTTP policy |
| Service uses `res.status` | Can’t call use-case from jobs/tests cleanly |
| New DI framework for one module | Inconsistent boot; review pain |
| Divergent “no access” strings | Existence oracles / client fragility |
| `begin` but repos ignore `tx` | Fake atomicity |
| Mass-assign from `req.body` in repo | Privilege escalation |

---

## 9. Exit criteria

You may go to step 06 when:

- [ ] Every responsibility has a layer (placement test passed)  
- [ ] File list + service/repo method names agreed  
- [ ] Composition root matches existing `*.routes.ts` style  
- [ ] Shared authn/authz/errors listed for reuse  
- [ ] Service owns `sql.begin` boundaries; repos accept `tx`  
- [ ] Schemas vs public DTOs split (no secrets on public types)  

---

## 10. Interview Q&A

**Q: Walk a request through the layers.**  
**A:** `authenticate` verifies JWT and sets `req.user`. The route dispatches to a controller method. The controller Zod-parses params/body and calls the service with typed data. The service checks membership/authz, may open `sql.begin`, and calls repositories with `tx`. Repositories run SQL and map rows to DTOs. Thrown `AppError`s hit `errorHandler` for status JSON; validation failures return 400 from the controller directly.

**Q: Why does the service get `sql` as well as repos?**  
**A:** Multi-step invariants need one transaction spanning several repo calls (lock member, update task, insert session). The service owns that boundary and passes `tx`. Repositories stay SQL-focused and don’t start nested business transactions ad hoc.

**Q: Where do transactions start?**  
**A:** In the service (`this.sql.begin`), never in the controller. Repo helpers like `lockByUserAndProject(userId, projectId, db)` receive the `tx`. Side effects (JWT sign, email) stay outside the `begin` block.

**Q: Should repositories know HTTP status codes?**  
**A:** No. Repos return data/null/row counts or throw driver errors. Services translate “0 rows on OCC update” into `ConflictError` vs `NotFoundError`, and translate `23505` into `ConflictError`. Controllers/errorHandler map `AppError` to HTTP.

**Q: How would you share `requireActiveMember` across modules?**  
**A:** Today both `ProjectServices` and `TaskService` implement a private helper with the same message — acceptable duplication at small scale. If comments add a third copy, extract a small shared helper or domain service that takes `MemberRepository` and throws the same `ForbiddenError`. Don’t put it in the repository.

**Q: What’s wrong with a fat controller that “just this once” runs SQL?**  
**A:** You lose reuse from tests and other entrypoints, can’t share transactions with related writes, and authz tends to be skipped or copy-pasted. This codebase’s rule is controller = HTTP adapter only.

---

## 11. Glossary

| Term | Meaning |
|------|---------|
| **Route** | URL → middleware → controller wiring |
| **Controller** | HTTP adapter (Zod, status, `next`) |
| **Service** | Authz, invariants, transactions, orchestration |
| **Repository** | SQL + mapping (+ locks) |
| **Composition root** | Where constructors are wired (here: `*.routes.ts`) |
| **AppError** | Base typed HTTP-ish error hierarchy |
| **Placement test** | Ask whether code is HTTP, policy, or SQL |
| **Public DTO** | Client-safe type (`PublicUser`, task DTO) |

---

## 12. Optional further reading

- Previous: [04-data-model-first.md](./04-data-model-first.md) · Next: [06-concurrency-and-failure.md](./06-concurrency-and-failure.md)  
- Lessons (optional): [layered-architecture](../lessons/architecture/layered-architecture.md), [composition-root-di](../lessons/architecture/composition-root-di.md), [validation-boundary](../lessons/api/validation-boundary.md)  
- Code citations: `task.routes.ts`, `task.controller.ts`, `task.service.ts`, `task.repository.ts`, `project.routes.ts`, `project.service.ts`, `api/v1.ts`, `shared/middleware/authenticate.ts`, `shared/errors/*`

---

## Teach pointer

> “Ask ‘is this HTTP, policy, or SQL?’ — three different folders.”
