# Lesson: Modular monolith

**Standalone ✓** — You do not need any other doc to understand modular monoliths or how this repo splits auth, projects, and tasks.

**After this file you can:** explain modular monolith vs big ball of mud vs microservices, set dependency rules for new code, plan module extraction, and interview on boundaries with this codebase as proof.

---

## 1. First principles

A **modular monolith** is one deployable application (one process, one database) organized into **modules** with explicit boundaries—folders, ownership, and import rules—so each module feels like a mini-service without network overhead.

The problem it solves: classic monoliths devolve into “import anything from anywhere,” shared tables mutated by strangers, and circular dependencies. Microservices fix boundaries with a **network tax** (latency, distributed failures, ops). Modular monoliths practice service boundaries **in-process** so you can extract a module to its own service later without rewriting business logic.

---

## 2. Mental model

### Analogy

An apartment building (one address = one deployment) with **separate locked units** (modules). Residents share utilities (`shared/`—logging, errors, auth middleware) but do not rearrange each other’s furniture (private repositories). You can later move a unit to its own house (microservice) because it already has clear walls.

### Diagram

```text
                    ┌─────────────────────────────────┐
                    │     Single Node / Docker image   │
                    │  ┌─────────┐ ┌─────────┐ ┌──────┐ │
                    │  │  auth   │ │projects │ │tasks │ │
                    │  │ module  │ │ module  │ │module│ │
                    │  └───┬─────┘ └────┬────┘ └──┬───┘ │
                    │      │            │         │     │
                    │      └────────────┼─────────┘     │
                    │                   ▼               │
                    │            shared/ (kernel)         │
                    │         errors, middleware, redis │
                    └───────────────────┬─────────────────┘
                                        ▼
                                   Postgres (+ Redis)
```

---

## 3. Core rules (must / must-not)

1. **MUST** treat each module’s **service** as its public API for business operations.  
2. **MUST** keep each module’s tables primarily owned by that module’s repositories.  
3. **MUST** avoid circular imports between modules (auth ↔ projects ↔ tasks).  
4. **MUST** put cross-cutting infra in `shared/`, not duplicated per module.  
5. **SHOULD** prefer calling another module’s **repository** only for read lookups or tightly justified cases—document coupling.  
6. **MUST NOT** let `tasks` run arbitrary writes against auth tables without going through auth services.  
7. **MUST NOT** share “private” SQL helpers across modules without a named contract (interface/event).  
8. **SHOULD** colocate routes, controller, service, repo, schema per module.

---

## 4. How it works (mechanics)

**Module layout in this repo:**

```text
backend/src/modules/
  auth/       — users, sessions, verification, password reset
  projects/   — projects, memberships, ownership transfer
  tasks/      — tasks nested under projects
  health/     — liveness/readiness
shared/       — middleware, errors, token helpers, redis, logger
```

**Allowed dependency patterns:**

- Any feature module → `shared/`  
- `projects` → `auth` repository (e.g. email lookup for invites)  
- `projects` → `tasks` repository (e.g. open task counts on delete guards)  
- `tasks` → `projects` `MemberRepository` (membership + locks for authz)

**Discouraged:** `tasks` importing `AuthService` for unrelated side effects; direct cross-module table updates bypassing the owning repo.

**Extraction path:** If `notifications` grows, create `modules/notifications` with its own service; later deploy as worker reading outbox—module boundary already exists.

---

## 5. When to use / when not to use

| Situation | Modular monolith? |
|-----------|-------------------|
| Small team, one product, shared DB | **Yes** — default |
| Need strong boundaries before split | **Yes** |
| 50 teams, independent release cycles per feature | Consider **microservices** for mature domains only |
| Prototype throwaway | Simple monolith OK; refactor to modules when pain appears |
| Strict regulatory isolation between domains | Separate services + DB may be required |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Name the bounded capability (e.g. “task lifecycle within a project”).  
2. List tables owned; list foreign keys to other modules.  
3. Define public operations (service methods).  
4. List cross-module reads/writes; justify each.  
5. Plan events/outbox if async coupling needed later.

### Implement

1. Create folder under `modules/<name>/`.  
2. Add routes mounted from `api/v1.ts`.  
3. Wire DI in `*.routes.ts` only.  
4. Keep cross-module imports one-directional where possible.

### Verify

1. Dependency graph: no cycles (manual review or dep-cruiser).  
2. Grep other modules for table names they should not write.  
3. API tests per module boundary (`auth.api.test.ts`, `tasks.authz.test.ts`).

---

## 7. Worked example A — this project

### Coupling: `ProjectServices` uses auth + task repos

`project.routes.ts` wires:

```ts
const authRepo = new AuthRepository(sql);
const taskRepo = new TaskRepository(sql);
const service = new ProjectServices(sql, repo, memberRepo, authRepo, taskRepo);
```

**Why:** Listing members may need user emails (`auth` read). Removing a project may need open-task counts (`tasks` read). Writes still flow through each module’s repositories; project service orchestrates **policy** (“cannot delete with open tasks”).

### Coupling: `TaskService` uses `MemberRepository`

Tasks never authenticate users themselves—they assume `req.user` from middleware, then **`MemberRepository`** proves ACTIVE membership and locks rows inside transactions for updates.

**Boundary lesson:** Tasks module **depends on projects’ membership model** but does not own the `project_members` table—that stays in projects’ repository.

### Shared kernel

`authenticate` middleware, `AppError` hierarchy, JWT helpers live in `shared/`. All modules depend on shared; shared must **not** depend on feature modules.

---

## 8. Worked example B — self-contained mini scenario

**Three modules in one app:** `billing`, `catalog`, `orders`.

Rules:

- `orders` may call `catalog.getPrice(sku)` via **interface** `CatalogReader`.  
- `billing` listens to `OrderPlaced` events (future outbox)—no `orders` → `billing` SQL.  
- `catalog` never imports `orders`.

```ts
// orders/order.service.ts
async place(orderId: string) {
  const price = await this.catalog.getPrice(orderId);
  await this.sql.begin(async (tx) => {
    await this.orderRepo.markPlaced(orderId, price, tx);
    await this.outboxRepo.enqueue("OrderPlaced", { orderId }, tx);
  });
}
```

Same modular monolith ideas—without needing this repo’s tables.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| `tasks` runs `UPDATE users SET …` | Auth invariants bypassed |
| Circular imports auth ↔ projects | Build/tooling pain; hidden init order bugs |
| “Util” folder with business rules | Second monolith inside monolith |
| Everything in `shared/` | No modules left; boundaries erased |
| Premature microservice split | Ops cost before domain is stable |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Bug fix needs 6 modules touched | Missing owner module | Who owns the table? | Move write path to owner service |
| Flaky imports on startup | Circular dependency | Import graph | Extract interface to `shared/types` or invert dependency |
| IDOR across projects | Authz not in owning service | Task vs project checks | Centralize membership helpers |
| Cannot extract service | Logic spread in controllers | Layer violations | Push orchestration to services |

---

## 11. Interview Q&A (with strong answers)

**Q: Modular monolith vs microservices?**  
**A:** Same deployable unit vs many; modules use function calls, microservices use network. Modular monolith defers distribution cost until boundaries are proven.

**Q: Dependency rules?**  
**A:** Feature modules depend on shared kernel; cross-feature deps should be narrow (read interfaces, events), not “reach into any repository.”

**Q: Extraction strategy?**  
**A:** Choose a module with clear data ownership, replace in-process calls with HTTP/events, move its tables or use anti-corruption layer—boundary already matches folder structure.

**Q: Example from this task app?**  
**A:** `auth`, `projects`, `tasks` modules in one Express app; tasks depend on project membership repo but own `tasks` table writes.

**Q: When is cross-module repo use OK?**  
**A:** Read-only lookups or enforced orchestration with clear comments/tests—prefer events as coupling grows.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Modular monolith | One deployment, many bounded modules |
| Module | Cohesive feature folder with service as API |
| Shared kernel | Cross-cutting code used by all modules |
| Bounded context | DDD term: model boundary (auth vs projects) |
| Extraction | Moving a module to its own service |
| Coupling | How much one module depends on another’s internals |

---

## 13. Teach pointer

> “Modules are practice for services — without the network tax.”

---

## 14. Optional further reading (not required)

- [layered-architecture](./layered-architecture.md) · [monolith-vs-microservices](./monolith-vs-microservices.md)  
- [ddd-aggregates-bounded-context](./ddd-aggregates-bounded-context.md)  
- [outbox-events](./outbox-events.md) for async module coupling

Repo paths: `backend/src/modules/`, `backend/src/api/v1.ts`.
