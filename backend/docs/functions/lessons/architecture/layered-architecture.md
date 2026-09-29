# Lesson: Layered architecture

**Standalone ✓** — You do not need any other doc to understand layered backends or map this stack’s layers.

**After this file you can:** name each layer’s job, place new code correctly, trace a request through auth/projects/tasks, avoid layer violations, and answer interview questions with concrete examples.

---

## 1. First principles

**Layered architecture** splits a backend into horizontal slices, each with one responsibility and a strict **call direction**: outer layers talk to inner layers, not the reverse.

The problem it solves: without boundaries, HTTP parsing, business rules, and SQL get tangled. You cannot test “can this member update this task?” without spinning HTTP. You duplicate authz in three places. One schema change breaks controllers.

When layers are clear, you change **how** data is stored (repository) without rewriting **who** may update a task (service), and you reuse services from a CLI or worker later.

---

## 2. Mental model

### Analogy

A restaurant: **waiter** (controller) takes the order and brings plates; **chef** (service) decides recipes and rejects invalid orders; **pantry** (repository) fetches ingredients from storage. Patrons do not walk into the pantry. The chef does not decide table numbers—that is the waiter’s HTTP job.

### Diagram

```text
  HTTP request
       │
       ▼
┌──────────────┐     validates shape, status codes, cookies
│  Controller  │
└──────┬───────┘
       │ DTO / domain input
       ▼
┌──────────────┐     authz, invariants, transactions
│   Service    │
└──────┬───────┘
       │ SQL via tx when needed
       ▼
┌──────────────┐     queries, no business policy
│ Repository   │
└──────┬───────┘
       ▼
   Postgres / Redis

Cross-cutting (wrap all routes): authenticate, errorHandler, requestId, rate limits
```

### In this stack

```text
Route → Controller → Service → Repository → DB/Redis
```

Routes wire dependencies; controllers stay thin; services own `sql.begin` for multi-write invariants.

---

## 3. Core rules (must / must-not)

1. **MUST** keep HTTP concerns (status, headers, `res.json`) in controllers (or route-level middleware).  
2. **MUST** enforce project/task membership rules in **services**, not middleware alone.  
3. **MUST** keep SQL in repositories (or a dedicated persistence module), not controllers.  
4. **MUST** validate request **shape** at the boundary (Zod in controller or route) before calling services.  
5. **MUST** start multi-statement business transactions in the **service** layer.  
6. **MUST NOT** call `res.status` from a service.  
7. **MUST NOT** embed “is user owner?” only in a repository—services orchestrate authz using repo data.  
8. **MUST NOT** let repositories throw raw driver errors to clients—map in service or `errorHandler`.

---

## 4. How it works (mechanics)

| Layer | Responsibility | Knows about |
|-------|----------------|-------------|
| **Route** | Path, method, middleware chain, DI wiring | Express, which controller method |
| **Controller** | Parse body/params, Zod, call service, map result → HTTP | HTTP, service public methods |
| **Service** | Business rules, authz, transactions, domain errors | Repos, other services’ repos sparingly |
| **Repository** | CRUD, locks (`FOR UPDATE`), no product policy | SQL, table shapes |
| **Shared middleware** | Authn (JWT), logging, rate limits, global errors | Tokens, Redis |

**Dependency direction:** Controller → Service → Repository → DB. Shared code is imported by many layers but must not import feature modules upward.

**Errors:** Services throw `AppError` subclasses (`ForbiddenError`, `ConflictError`). `errorHandler` converts them to JSON + status.

**Testing:** API tests hit HTTP and exercise the full stack; unit tests (if added) mock repositories at the service boundary.

---

## 5. When to use / when not to use

| Situation | Layered stack like this? |
|-----------|---------------------------|
| CRUD API with clear HTTP boundary | **Yes** — default sweet spot |
| Tiny script (<200 LOC) | Optional — layers may be overkill |
| Complex domain with many rules | **Yes** — consider richer domain objects inside service layer |
| Real-time game server with shared in-memory state | Different shape (actors), not classic CRUD layers |
| Need swap DB for in-memory in tests | **Yes** — repositories are the seam |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Name the use case (“create task in project”).  
2. List HTTP method/path and response code.  
3. Write invariants (“only ACTIVE members”; “assignee must be ACTIVE member of project”).  
4. List DB reads/writes; mark which need one transaction.  
5. Decide where Zod lives (controller + schema file).

### Implement

1. Add/extend `*.schema.ts` (Zod).  
2. Repository methods for new queries—no authz.  
3. Service method: `requireActiveMember`, then writes inside `sql.begin` if multi-step.  
4. Controller: parse, call service, `201`/`200`/`204`.  
5. Register route in `*.routes.ts` with `authenticate` if needed.

### Verify

1. Trace mentally: route → controller → service → repo.  
2. Force forbidden user → `403` from service, not controller string checks.  
3. Break invariant mid-transaction in dev → no partial rows.  
4. Grep for `sql\`` in controllers — should be empty.

---

## 7. Worked example A — this project

### A1. `POST /api/v1/auth/login`

1. **Route** (`auth.routes.ts`): `loginLimiter`, POST `/login` → `AuthController.login`.  
2. **Controller:** Zod `loginSchema`, call `authService.login(email, password)`.  
3. **Service:** verify password hash, issue access JWT + refresh session in DB (rotation rules on refresh).  
4. **Repository:** `AuthRepository`, `SessionRepository` — SQL only.  
5. **Controller:** set refresh cookie, return access token JSON.

Authn succeeds here; **project** authz happens later on project/task routes via `authenticate` + service checks.

### A2. `PATCH /api/v1/projects/:projectId/tasks/:taskId`

1. **Route** (`task.routes.ts`): nested under projects, `authenticate`.  
2. **Controller:** `updateTaskSchema`, IDs from params.  
3. **Service** (`TaskService.update`):  
   - `requireActiveMember(userId, projectId)`  
   - `sql.begin`: lock membership, load task, `assertCanUpdateTask` (owner/creator vs assignee field rules)  
   - `assertAssigneeInProject` if assignee changes  
   - repo update on `tx`  
4. **Repository:** `TaskRepository`, `MemberRepository.lockById`.

**Why service owns authz:** Middleware only proves *who* you are (JWT). Whether you may change *this* task’s title is membership + role + assignee logic—product rules belong in `TaskService`.

### A3. Layer map (quick reference)

| Layer | auth | projects | tasks |
|-------|------|----------|-------|
| Routes | `auth.routes.ts` | `project.routes.ts` | `task.routes.ts` |
| Controller | `AuthController` | `ProjectController` | `TaskController` |
| Service | `AuthService` | `ProjectServices` | `TaskService` |
| Repository | `AuthRepository`, sessions, tokens | `ProjectRepository`, `MemberRepository` | `TaskRepository` |

Composition wiring example (`project.routes.ts`): construct repos → `ProjectServices` → `ProjectController` → bind routes.

---

## 8. Worked example B — self-contained mini scenario

**Feature:** “Ban user” API without mixing layers.

```ts
// controller — HTTP only
async ban(req, res, next) {
  const { userId } = banSchema.parse(req.body);
  await this.userService.ban(userId);
  res.status(204).send();
}

// service — policy + transaction
async ban(targetId: string) {
  await this.sql.begin(async (tx) => {
    await this.userRepo.setBanned(targetId, true, tx);
    await this.sessionRepo.revokeAllForUser(targetId, tx);
  });
}

// repository — SQL only
async setBanned(id: string, banned: boolean, db: Db) {
  await db`UPDATE users SET banned = ${banned} WHERE id = ${id}`;
}
```

If you put `UPDATE users` in the controller, a future admin CLI could not reuse the ban logic. If you put “revoke all sessions” only in middleware, it would never run for CLI jobs.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| SQL in controller | Duplicated queries; untestable rules |
| `res.json` in service | Cannot reuse from workers; tests need mock Response |
| Authz only in middleware | Project-specific rules (task assignee) do not fit JWT middleware |
| Fat repository with `if (role !== OWNER)` | Same rule copy-pasted for tasks vs members |
| Two services with different “active member” checks | IDOR-style bugs for edge roles |
| Controller starts `sql.begin` | Transaction boundaries unclear; hard to compose |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| 500 with Postgres text to client | Raw error bubbled | Repository throws? | Map to `AppError`; use `errorHandler` |
| 403 for owner | Rule in wrong layer or stale membership | `TaskService` assert methods | Centralize `requireActiveMember` |
| Duplicate validation | Zod in controller **and** service | Grep schema names | Shape at boundary; business rules in service |
| Partial project+member create | Transaction not in service | `ProjectServices.create` | `sql.begin` + pass `tx` |
| “Works in Postman, not in test” | Skipped middleware chain | Test helper vs prod routes | Align `app` mounting |

**Trace technique:** Pick one endpoint; open route file → controller method → service method → repo calls. If you skip a file, you likely missed where the bug lives.

---

## 11. Interview Q&A (with strong answers)

**Q: Name the layers and one responsibility each.**  
**A:** Route wiring and HTTP path; controller request/response mapping; service business rules and transactions; repository persistence; cross-cutting middleware for authn and errors.

**Q: Where does authentication vs authorization live?**  
**A:** Authentication (valid JWT) in middleware like `authenticate`. Authorization (project membership, task update rights) in services such as `TaskService` and `ProjectServices`.

**Q: Why inject repositories into services?**  
**A:** Services depend on abstractions/seams for testing and to keep SQL out of policy code. Wiring happens once in route modules (composition root).

**Q: Who picks 201 vs 200?**  
**A:** Controller, based on REST semantics after a successful service call (create → 201, update → 200).

**Q: Where should `sql.begin` start?**  
**A:** Service layer, when multiple repository writes must commit atomically (e.g. create project + owner membership).

**Q: When add a “use case” layer?**  
**A:** When services grow huge or multiple entrypoints (HTTP, CLI, queue) share identical orchestration—extract an application service; keep repositories unchanged.

**Q: Trace PATCH task in this app.**  
**A:** Authenticated route → `TaskController.update` → Zod → `TaskService.update` with member check, transaction, field-level authz → repositories on `tx`.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Layer | Horizontal slice with a single primary job |
| Controller | HTTP adapter |
| Service | Business logic and orchestration |
| Repository | Database access |
| Cross-cutting | Middleware/logger/errors affecting all routes |
| Authn | Proving identity |
| Authz | Proving permission for an action |
| DTO / input type | Data passed from controller to service |
| Composition root | Where concrete classes are wired (route files) |

---

## 13. Teach pointer

> “Controllers translate HTTP. Services decide truth. Repositories move bytes to Postgres.”

---

## 14. Optional further reading (not required)

- Module boundaries: [modular-monolith](./modular-monolith.md)  
- Wiring dependencies: [composition-root-di](./composition-root-di.md)  
- Ports/adapters variant: [hexagonal-ports-adapters](./hexagonal-ports-adapters.md)  
- Transactions in services: [../database/transactions.md](../database/transactions.md)

Repo paths (optional): `backend/src/modules/{auth,projects,tasks}/*.ts`, `backend/src/app.ts`, `backend/src/shared/middleware/authenticate.ts`.
