# Lesson: Monolith vs microservices

**Standalone ✓** — Decision framework and how this task-management backend fits.

**After this file you can:** choose monolith/modular monolith/microservices for a scenario, list tradeoffs without slogans, and interview with this repo as a monolith example.

---

## 1. First principles

A **monolith** is one deployable unit running most of the application. **Microservices** split the system into many deployables, each owning a slice of business capability, communicating over the network.

Neither is “morally better.” The problem microservices try to solve is **organizational and scaling isolation**—independent teams, independent release, independent failure domains. The cost is **distributed systems complexity**: latency, partial failures, data consistency across services, observability, and deployment sprawl.

This project is a **modular monolith**: one API process, modules for auth/projects/tasks—monolith deployment with service-like boundaries.

---

## 2. Mental model

### Analogy

**Monolith:** one kitchen prepares all dishes—fast coordination, shared fridge, one health inspection.  
**Microservices:** food court stalls—each stall scales independently, but delivering one meal may walk between stalls (network calls) and one stall closed ruins the combo.

### Diagram

```text
Monolith (this repo):
[ Express API ] ──► Postgres
     │
     ├── auth module
     ├── projects module
     └── tasks module

Microservices (hypothetical):
[ Auth Svc ]──HTTP──►[ Projects Svc ]──► DB_A
      │                      │
      └──────events──────────┴──►[ Tasks Svc ]──► DB_B
```

---

## 3. Core rules (must / must-not)

1. **MUST NOT** split into microservices to “look modern” before pain is real.  
2. **MUST** start with clear module boundaries in one deployable (modular monolith).  
3. **MUST** accept network fallacies if you split: latency, retries, idempotency.  
4. **MUST** define data ownership per service—no shared mutable DB across services without a plan.  
5. **SHOULD** extract a service when team size, scale, or release cadence force isolation.  
6. **MUST NOT** duplicate authz rules in every service without a shared policy or token claims strategy.

---

## 4. How it works (mechanics)

| Dimension | Monolith (here) | Microservices |
|-----------|-----------------|---------------|
| Deploy | One Docker image | Many images/pipelines |
| Calls | In-process method | HTTP/gRPC/messages |
| Transactions | `sql.begin` across tables | Sagas/outbox per service |
| Auth | Shared middleware + services | Gateway + per-service JWT validation |
| Debugging | Single stack trace | Distributed tracing required |
| Testing | API tests one app | Contract tests + integration |

**When this app might split:** Notifications/email worker first (async). Auth rarely splits early—everyone needs it.

---

## 5. When to use / when not to use

| Signal | Prefer |
|--------|--------|
| <10 engineers, one product | Monolith / modular monolith |
| Different scale profiles (video transcode vs API) | Separate service for heavy worker |
| Regulatory boundary between domains | Separate deploy + data store |
| Frequent cross-feature transactions | Stay monolith longer |
| Org wants autonomous teams per domain | Microservices **after** bounded contexts clear |

---

## 6. Step-by-step: design → implement → verify

1. Draw capabilities (auth, projects, tasks).  
2. Ask: do they need one DB transaction together? (project + owner membership → yes today).  
3. If yes, keep monolith or use saga with accepted inconsistency windows.  
4. If splitting, choose integration: sync API vs events.  
5. Verify: failure of one part does not undefined the whole product without design.

---

## 7. Worked example A — this project

**Single Postgres schema:** users, projects, members, tasks, sessions—foreign keys enforce integrity in one transaction.

**Cross-module calls:** `ProjectServices` uses `TaskRepository` count in-process—no HTTP chattiness.

**Scaling story:** Run N identical API containers behind LB; state in Postgres/Redis ([stateless-services](./stateless-services.md)).

**Hypothetical split pain:** “Create project + owner membership” becomes two services → need saga or duplicate validation; refresh token service coupling to all APIs.

---

## 8. Worked example B — self-contained mini scenario

**E-commerce split:**

- `CatalogService` — products read-heavy  
- `OrderService` — writes orders  
- Checkout calls catalog price via HTTP; on failure, order service retries with idempotency key `checkout-{cartId}`.

Without idempotency, retry creates double orders—microservice tax visible immediately.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Distributed monolith | Many services, must deploy together |
| Shared database anti-pattern | Two services write same tables—worse than monolith |
| Nano-services | Ops overhead dominates |
| No observability after split | Cannot trace login → task create |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Cascading outages | Sync chain A→B→C | Timeouts/retries | Circuit breakers, async |
| Data mismatch across svc | No single transaction | Eventual consistency | Saga + compensations |
| Slow pages | N+1 HTTP internal calls | Trace spans | Batch API or merge services |
| Duplicate side effects | Retries without idempotency | POST handlers | Idempotency keys |

---

## 11. Interview Q&A (with strong answers)

**Q: Why monolith first?**  
**A:** Fast iteration, ACID across features, simple ops—extract when boundaries and pain justify distribution cost.

**Q: What triggers a split?**  
**A:** Independent scaling, team autonomy, fault isolation, polyglot need—not folder count.

**Q: How is this repo classified?**  
**A:** Modular monolith: one deploy, modules auth/projects/tasks, shared Postgres.

**Q: Monolith vs modular monolith?**  
**A:** Both one deploy; modular enforces boundaries inside the codebase for future extraction.

**Q: Biggest microservices mistake?**  
**A:** Splitting before domain boundaries and ending with distributed monolith + shared DB.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Monolith | Single deployable application |
| Microservice | Independently deployable service |
| Modular monolith | Monolith with strict modules |
| Distributed monolith | Many services, coupled releases |
| Bounded context | Domain area with its own model |
| Network fallacy | Remote calls are not free/local |

---

## 13. Teach pointer

> “Buy microservices with problems you actually have—not problems you hope to have.”

---

## 14. Optional further reading (not required)

- [modular-monolith](./modular-monolith.md) · [saga-orchestration](./saga-orchestration.md)  
- [outbox-events](./outbox-events.md) · [../database/transactions.md](../database/transactions.md)

Repo path: `backend/src/modules/`.
