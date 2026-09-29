# Lesson: Hexagonal architecture (ports & adapters)

**Standalone ✓** — Ports/adapters explained and mapped to this Express + repository stack.

**After this file you can:** draw hexagons for a feature, place ports on domain/core, swap adapters (Postgres → fake), and compare to layered architecture.

---

## 1. First principles

**Hexagonal architecture** (ports and adapters) puts **business logic at the center** and treats everything external (HTTP, SQL, email, clock) as **adapters** plugged into **ports** (interfaces the core defines).

The problem it solves: when infrastructure leaks into rules, you cannot test “assignee must be active member” without Postgres. Ports invert dependency: core says “I need a `TaskStore`”; adapter implements with SQL.

This repo uses **layered** folders (controller/service/repository) which **aligns** with hexagonal ideas: repositories are outbound adapters; controllers are inbound HTTP adapters.

---

## 2. Mental model

### Analogy

A power strip (core) with standardized sockets (ports). US plug adapter (HTTP), EU adapter (CLI), DB cable (Postgres)—core device unchanged.

### Diagram

```text
         HTTP adapter                CLI adapter
      (TaskController)            (hypothetical)
              │                         │
              └────────► IN PORT ◄──────┘
                         │
                    TaskService
                   (application core)
                         │
              OUT PORT (repos as interfaces)
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   TaskRepository   MemberRepository   EmailPort (future)
   (Postgres)       (Postgres)         (SMTP adapter)
```

---

## 3. Core rules (must / must-not)

1. **MUST** define port interfaces at boundaries the core depends on (`TaskRepository` methods).  
2. **MUST** keep domain rules in core (`TaskService`), not in Express handlers.  
3. **MUST NOT** let adapters import Express types into services.  
4. **SHOULD** name outbound ports by capability (`MemberLookup`), not technology (`PostgresMember`).  
5. **MAY** use concrete classes without interfaces until you need a second adapter (tests).  
6. **MUST** wire adapters only in composition root.

---

## 4. How it works (mechanics)

**Inbound port:** use case API—`TaskService.create(userId, projectId, input)`.

**Inbound adapter:** `TaskController` translates JSON → input type, calls port, maps errors to HTTP.

**Outbound port:** persistence operations—`taskRepo.insert(...)`, `memberRepo.lockById(...)`.

**Outbound adapter:** `TaskRepository` using postgres.js.

**Difference from “pure” hexagonal:** Types are concrete classes, not always explicit `interface ITaskStore`—still adapter pattern in practice.

---

## 5. When to use / when not to use

| Situation | Hexagonal emphasis |
|-----------|-------------------|
| Multiple entrypoints (HTTP + worker) | **High** — shared core |
| One CRUD API, one DB | **Medium** — layered is enough |
| Frequent infra swaps | **High** — explicit ports |
| 500-line app | Low — YAGNI interfaces |

---

## 6. Step-by-step: design → implement → verify

1. Write use case in plain language.  
2. List inbound triggers (HTTP routes).  
3. List outbound needs (DB, email, clock).  
4. Implement core service depending on repo **types**.  
5. Implement adapters (controller, repository).  
6. Wire in routes file.  
7. Test core with in-memory fake adapter implementing same methods.

---

## 7. Worked example A — this project

**Use case:** Create task with valid assignee.

**Core (`TaskService.create`):** require active member; transaction; validate assignee via `memberRepo.lockById`; insert task.

**Inbound adapter:** `TaskController.create` + Zod schema.

**Outbound adapters:** `TaskRepository`, `MemberRepository` (projects module)—Postgres implementations.

**Shared adapter:** `authenticate` middleware attaches `req.user`—HTTP-specific, stays outside service.

---

## 8. Worked example B — self-contained mini scenario

```ts
// port
interface WalletStore {
  debit(user: string, amount: number): Promise<void>;
}

// core
class TransferService {
  constructor(private readonly wallets: WalletStore) {}
  async transfer(from: string, to: string, amount: number) { /* rules */ }
}

// adapters
class PgWalletStore implements WalletStore { /* sql */ }
class MemoryWalletStore implements WalletStore { /* Map */ }
```

Swap adapter in composition root for tests—no HTTP involved.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Core imports `express` | Cannot run from worker |
| Port per table CRUD only | Anemic domain; port should match use cases |
| Adapter calls adapter skipping core | Business rules bypassed |
| 50 one-method interfaces | Ceremony without benefit |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Rules diverge HTTP vs CLI | Logic in controller | Duplicate code paths | Move to service |
| Test needs real DB | No outbound fake | Repository seam | In-memory adapter |
| Leaky abstraction | SQL types in service | Imports in service | DTOs at repo boundary |

---

## 11. Interview Q&A (with strong answers)

**Q: Ports vs adapters?**  
**A:** Port is interface/API core uses; adapter is concrete implementation (HTTP, Postgres).

**Q: Hexagonal vs layered?**  
**A:** Layered is horizontal slices; hexagonal emphasizes dependency direction inward and plugable infrastructure. Compatible in practice.

**Q: Where is the hexagon here?**  
**A:** `TaskService` center; controllers and repositories are adapters; routes file is composition.

**Q: Why not interface every repo?**  
**A:** Cost/benefit—add when second implementation (tests, alternate store) appears.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Port | Interface between core and outside |
| Adapter | Implementation of a port |
| Inbound | Driving side (HTTP, CLI) |
| Outbound | Driven side (DB, email) |
| Core | Domain/application rules |
| Composition root | Adapter wiring location |

---

## 13. Teach pointer

> “The domain calls the shots; infrastructure is replaceable plumbing.”

---

## 14. Optional further reading (not required)

- [layered-architecture](./layered-architecture.md) · [composition-root-di](./composition-root-di.md)  
- [solid-in-backends](./solid-in-backends.md)

Repo paths: `backend/src/modules/tasks/task.service.ts`, `task.controller.ts`, `task.repository.ts`.
