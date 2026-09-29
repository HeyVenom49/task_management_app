# Lesson: REST resource design

**Standalone ✓** — You do not need any other doc to design resource-oriented HTTP routes like this project.

**After this file you can:** model nouns and collections, nest routes under authz boundaries, wire Express routers with `mergeParams`, and defend nesting vs RPC tradeoffs in interviews.

---

## 1. First principles

A **REST-ish HTTP API** treats URLs as **resources** (nouns), uses a small set of **HTTP methods** as verbs, and uses **status codes** as part of the contract.

Resources often form **trees**: a task belongs to a project; membership belongs to a project. The URL hierarchy should mirror **ownership and authorization scope**.

**The problem it solves:** Flat URLs like `/tasks/:taskId` without project context force every handler to guess scope and invite **IDOR** bugs (accessing another tenant’s id by enumeration).

**RPC style** (`POST /doTransferOwnership`) is fine for rare actions — this project still uses explicit subpaths for operations like `transfer-ownership` when they’re not simple CRUD.

---

## 2. Mental model

### Analogy

Folders on disk: `/projects/acme/tasks/report.pdf` tells you the file lives under `acme`. You list `tasks` inside a project, not all tasks on the whole machine unless you have a deliberate global index.

### Diagram

```text
/api/v1/projects                    GET list, POST create
/api/v1/projects/:id                GET one, PATCH, DELETE
/api/v1/projects/:id/members        GET list, POST add
/api/v1/projects/:id/tasks          GET list, POST create   ← nested router
/api/v1/projects/:id/tasks/:taskId  GET, PATCH, DELETE
```

---

## 3. Core rules (must / must-not)

1. **MUST** name URLs after **resources**, not after server function names (`createTask` → `POST .../tasks`).  
2. **MUST** nest child resources under the **parent that defines authz** (project id in path for tasks).  
3. **MUST** use **plural collection** segments for lists (`/projects`, `/tasks`).  
4. **MUST** keep **UUIDs** in path segments for stable identifiers (validated at boundary).  
5. **MUST** use `Router({ mergeParams: true })` on child routers so `:id` from parent is visible.  
6. **MUST NOT** expose a global `/tasks/:id` if tasks are always project-scoped in the domain.  
7. **SHOULD** prefer **PATCH** for partial updates, **POST** for create and non-idempotent actions, **DELETE** for removal.

---

## 4. How it works (mechanics)

| Method | Typical use | Idempotent? |
|--------|-------------|-------------|
| GET | Read collection or item | Yes (safe) |
| POST | Create sub-resource, actions | Often no |
| PATCH | Partial update | Can be |
| DELETE | Remove resource | Yes |

**Express wiring:**

1. `v1Router.use("/projects", projectRouter)`  
2. `v1Router.use("/projects/:id/tasks", taskRouter)` — parent param `:id` is project id  
3. `taskRouter` defines `/` and `/:taskId` relative to mount path  

**Auth:** `projectRouter.use(authenticate)` and `taskRouter.use(authenticate)` apply JWT (or session) before handlers.

---

## 5. When to use / when not to use

| Situation | Approach |
|-----------|----------|
| CRUD on owned entities | REST collection + item URLs |
| Search across all projects for admin | Separate **admin** namespace or query on collection with strict authz |
| Complex workflow (checkout) | RPC POST or state machine resource |
| Nesting depth > 3–4 levels | Consider flattening with explicit parent ids in body **only if** authz stays explicit |
| GraphQL internal admin | Different style — see optional graphql lesson |

---

## 6. Step-by-step: design → implement → verify

### Design

1. List resources: Project, Member, Task, User (auth).  
2. Draw ownership: Task → Project; Member → Project.  
3. Auth matrix: which roles on which methods.  
4. Choose status codes per outcome (404 vs 403 — consistent policy).

### Implement

1. One router module per aggregate (`project.routes.ts`, `task.routes.ts`).  
2. Mount nested router in `api/v1.ts`.  
3. Controllers parse `req.params` with Zod (project `id`, task `taskId`).

### Verify

1. Call task under wrong project id → 404 (IDOR-safe) in this app’s policy.  
2. Confirm OpenAPI/docs paths match mount paths.  
3. Integration tests hit full paths `/api/v1/projects/:id/tasks`.

---

## 7. Worked example A — this project

**Version + mount** (`backend/src/api/index.ts`, `v1.ts`):

```ts
const apiRouter = Router();
apiRouter.use("/v1", v1Router);

// v1.ts
v1Router.use("/projects", projectRouter);
v1Router.use("/projects/:id/tasks", taskRouter);
```

**App entry** (`app.ts`):

```ts
app.use("/api", apiRouter);
```

Full task create path: `POST /api/v1/projects/:id/tasks`.

**Task router** (`task.routes.ts`):

```ts
const taskRouter = Router({ mergeParams: true });
taskRouter.use(authenticate);
taskRouter.post("/", (req, res, next) => controller.create(req, res, next));
taskRouter.get("/:taskId", (req, res, next) => controller.getById(req, res, next));
```

**Why `mergeParams: true`:** Without it, `req.params.id` from the parent mount may be missing inside task handlers — project id is required for authz and queries.

**Project actions** (not pure CRUD):

```text
POST /projects/:id/members
POST /projects/:id/transfer-ownership
POST /projects/:id/members/:memberId/reactivate
```

Subpaths express **domain operations** while keeping project scope in the URL.

---

## 8. Worked example B — mini scenario (self-contained)

**Feature:** Comments on tasks.

**Good:**

```text
GET  /projects/:projectId/tasks/:taskId/comments
POST /projects/:projectId/tasks/:taskId/comments
```

**Risky:**

```text
GET /comments/:commentId   # no project/task scope in URL
```

Service must then verify comment belongs to a task the caller can access — easy to forget on one endpoint.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| `POST /api/runJob` for everything | No cacheable reads; unclear contract |
| Global `/tasks/:id` | IDOR unless every query joins membership |
| Deep nest `/a/:id/b/:id/c/:id/d/:id` | Painful clients; consider flattening |
| PUT for partial updates | Clients overwrite fields they didn’t mean to |
| Wrong HTTP method semantics | Caches/proxies behave badly on unsafe GET |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| `req.params.id` undefined in task handler | Missing `mergeParams` | task router config | `Router({ mergeParams: true })` |
| 404 on valid task | Wrong project id in path | URL vs DB `project_id` | Client uses nested URL |
| Route never hits | Mount order / typo | `v1.ts` mount path | Align path prefix |
| Duplicate route params | Merge conflicts | Param names | Rename consistently (`id`, `taskId`) |

---

## 11. Interview Q&A (with strong answers)

**Q: When is nesting too deep?**  
**A:** When intermediate segments don’t add authz or data locality — or when clients repeat long paths error-prone. Often 2–3 levels (project → tasks → comments) is enough.

**Q: REST vs RPC?**  
**A:** REST shines for CRUD and cacheable reads; RPC-style POST actions are fine for verbs that aren’t natural resource state changes. Many production APIs mix both deliberately.

**Q: How does nesting help IDOR?**  
**A:** Handlers load the parent scope from the URL and verify membership before using child ids — wrong project id yields “not found here” without leaking cross-tenant existence.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Resource | Noun exposed by the API (project, task) |
| Collection | Plural URL segment listing members |
| IDOR | Insecure direct object reference — accessing ids outside your scope |
| `mergeParams` | Express option to inherit parent route parameters |
| CRUD | Create Read Update Delete |

---

## 13. Teach pointer

> “Put the security boundary in the URL when the resource only makes sense inside that boundary.”

---

## 14. Optional further reading (not required)

- IDOR: [../security/idor.md](../security/idor.md)  
- Status choices: [./http-status-semantics.md](./http-status-semantics.md)  
- Version prefix: [./api-versioning.md](./api-versioning.md)
