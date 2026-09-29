# Lesson: Composition root & dependency injection

**Standalone ✓** — Complete guide to manual DI and composition roots in this Express app.

**After this file you can:** wire new modules correctly, explain DI without a framework, test with swapped dependencies, and answer interview questions on composition roots.

---

## 1. First principles

**Dependency injection (DI)** means a class receives its collaborators (repositories, clients) through its constructor or parameters instead of creating them internally or importing global singletons.

The **composition root** is the one place in the application that knows concrete implementations: “use `ProjectRepository` with this `sql` client.”

The problem it solves: hidden `new AuthRepository()` inside business logic makes tests impossible, hides the dependency graph, and scatters configuration. DI moves **construction** to the edge and keeps **behavior** in the core.

---

## 2. Mental model

### Analogy

A theater: actors (services) receive props (repos) from stage crew at the **wing** (composition root), not by running to the warehouse mid-scene. The audience sees the play, not how props were sourced.

### Diagram

```text
  project.routes.ts  ← composition root for projects feature
         │
         │ new ProjectRepository(sql)
         │ new MemberRepository(sql)
         │ new ProjectServices(sql, repo, memberRepo, …)
         │ new ProjectController(service)
         ▼
  HTTP handlers call controller methods
         │
         ▼
  ProjectServices ──uses──► interfaces / concrete repos
  (never constructs repos inside methods)
```

---

## 3. Core rules (must / must-not)

1. **MUST** construct feature graphs in `*.routes.ts` (or a dedicated bootstrap), not inside services.  
2. **MUST** inject `sql` into services that start transactions.  
3. **MUST** type constructor params as classes/interfaces repos implement.  
4. **MUST NOT** import `sql` in services **only** to construct repos—receive repos instead.  
5. **MUST NOT** create a new repository per HTTP request unless you need request scope (rare here).  
6. **SHOULD** use module-level singletons wired once at load time (current pattern).  
7. **MAY** use a DI container when the graph exceeds ~20 manual wires—optional upgrade path.

---

## 4. How it works (mechanics)

**Manual DI (this repo):** No NestJS/Spring container. Route files run at import time:

```ts
const repo = new ProjectRepository(sql);
const memberRepo = new MemberRepository(sql);
const authRepo = new AuthRepository(sql);
const taskRepo = new TaskRepository(sql);
const service = new ProjectServices(sql, repo, memberRepo, authRepo, taskRepo);
const controller = new ProjectController(service);
```

**Lifetime:** One graph per process (Node module cache). Tests set `NODE_ENV=test` and use real HTTP against `app` with test DB.

**Transaction client:** Repositories accept optional `db: Sql | TransactionSql` per call—DI injects the long-lived `sql`; services pass `tx` into methods during `sql.begin`.

**Alternative (container):** Register `ProjectRepository` → `ProjectServices` → `ProjectController`; resolve per request. Same graph, automated wiring.

---

## 5. When to use / when not to use

| Situation | Manual DI in routes? |
|-----------|----------------------|
| Small/medium Express app | **Yes** — clear and explicit |
| 100+ services | Consider container or factory module |
| Serverless per-request cold start | Factory function per invocation may construct graph |
| Library published for others | Export factory `createProjectModule(deps)` |

---

## 6. Step-by-step: design → implement → verify

1. List constructor dependencies for new service.  
2. Add parameters to service class—store as `private readonly`.  
3. In `*.routes.ts`, instantiate dependencies bottom-up.  
4. Pass controller to route handlers via closure.  
5. Verify: no `new XRepository` inside service methods.  
6. Optional unit test: `new TaskService(fakeSql, fakeTaskRepo, fakeMemberRepo)`.

---

## 7. Worked example A — this project

**Auth module** (`auth.routes.ts`): wires `AuthRepository`, session/email/password repos, `AuthService`, `AuthController`, attaches rate limiters.

**Tasks module:** `TaskService(sql, taskRepo, memberRepo)`—membership from projects module injected as repository, not full `ProjectServices` (avoids circular service calls).

**Why `sql` in both service and repo:** Service calls `this.sql.begin`; repositories default to `this.sql` but accept `tx` for atomic operations.

**App entry:** `app.ts` mounts `apiRouter`; does not wire feature repos—keeps root thin. Feature composition roots stay in module route files.

---

## 8. Worked example B — self-contained mini scenario

```ts
interface Clock { now(): Date; }

class OrderService {
  constructor(
    private readonly orders: OrderRepo,
    private readonly clock: Clock,
  ) {}

  async cancel(id: string) {
    const o = await this.orders.find(id);
    if (this.clock.now() > o.shipDeadline) throw new Error("too late");
    await this.orders.markCancelled(id);
  }
}

// composition root (main.ts)
const service = new OrderService(new PgOrderRepo(sql), { now: () => new Date() });

// test
const service = new OrderService(fakeRepo, { now: () => new Date("2030-01-01") });
```

Clock injected for testability—same DI idea without a container.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| `new Repo()` inside every controller method | Wasted connections; hard to mock |
| Global `export const repo = …` imported everywhere | Hidden graph; test pollution |
| Service locators (`getBean("repo")`) | Dependencies invisible in constructor |
| Circular construction in root | Runtime undefined imports |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Test uses wrong DB | Shared singleton sql | Test preload / env | Isolate `sql` per test suite |
| Undefined service in handler | Wire order / typo in routes | Route file top | Fix construction |
| Transaction not shared | Repo not getting `tx` | Service `begin` block | Pass `tx` argument |
| Memory leak in dev | Hot reload duplicates listeners | Rare with route singletons | Restart process |

---

## 11. Interview Q&A (with strong answers)

**Q: What is a composition root?**  
**A:** The single place that chooses concrete implementations and wires the object graph—here, module route files.

**Q: Manual DI vs IoC container?**  
**A:** Manual is explicit and fine for small graphs; containers help when wiring is large or you need scoped lifetimes.

**Q: How does DI help testing?**  
**A:** Pass fakes/stubs via constructor instead of hitting Postgres; or run API tests with real wired graph against test DB (this repo’s preference).

**Q: Where is the composition root in Express apps?**  
**A:** Often `routes.ts`, `app.ts`, or `server.ts`—wherever `new Service(new Repo())` happens once.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| DI | Supply dependencies from outside |
| Composition root | Wiring location for concrete types |
| IoC | Inversion of control—infrastructure supplied to domain |
| Constructor injection | Dependencies via `constructor(...)` |
| Service locator | Anti-pattern: global registry lookup |
| Lifetime | How long an instance lives (singleton vs per-request) |

---

## 13. Teach pointer

> “Wire at the edge; keep the core free of `new` for infrastructure.”

---

## 14. Optional further reading (not required)

- [layered-architecture](./layered-architecture.md) · [modular-monolith](./modular-monolith.md)  
- [hexagonal-ports-adapters](./hexagonal-ports-adapters.md) for port interfaces at DI boundaries

Repo paths: `backend/src/modules/*/*.routes.ts`, `backend/src/db/client.ts`.
