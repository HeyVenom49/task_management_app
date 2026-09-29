# Lesson: CQRS (lite)

**Standalone ✓** — Command Query Responsibility Segregation without enterprise ceremony, mapped to this API.

**After this file you can:** split reads vs writes intentionally, know when CQRS helps, avoid over-splitting, and interview with examples.

---

## 1. First principles

**CQRS** separates the **model for changing state** (commands) from the **model for reading state** (queries). They may share one database or use different stores (read replicas, materialized views).

The problem it solves: one entity class serving both complex writes (transactions, invariants) and heavy reads (dashboards, joins) becomes tangled and slow. CQRS lets you optimize each path—**lite** CQRS keeps one DB but distinct code paths; **full** CQRS adds separate read databases fed by events.

---

## 2. Mental model

### Analogy

Restaurant: **kitchen** accepts orders and changes inventory (commands); **display board** shows ready dishes (queries). Board is not the ledger—eventually consistent with kitchen, but formatted for fast reading.

### Diagram

```text
  HTTP POST/PATCH/DELETE          HTTP GET
         │                            │
         ▼                            ▼
    Command side                  Query side
    (services + tx)               (read models / joins)
         │                            │
         └──────────► Postgres ◄──────┘
                    (same DB in lite CQRS)
```

---

## 3. Core rules (must / must-not)

1. **MUST** keep write invariants in command handlers (services).  
2. **MUST NOT** mutate state in query handlers—GET idempotent, no side effects.  
3. **SHOULD** name use cases explicitly (`CreateTask`, `ListProjectTasks`).  
4. **MUST NOT** skip authz on “read models” if data is protected.  
5. **FULL CQRS:** only when read scale or shape truly diverges—accept eventual consistency.  
6. **LITE:** same tables, different methods/repos OK.

---

## 4. How it works (mechanics)

**Command:** validates input, authz, transaction, emits domain result or events.

**Query:** optimized SELECT, may denormalize, no business mutations.

**This repo (lite):**

- Commands: `ProjectServices.create`, `TaskService.update`, `AuthService.register`.  
- Queries: `list`, `getById`, `listMember`—read-only repository methods.

Not separate databases; distinction is **architectural clarity** in services/controllers.

**Full CQRS example (not here):** `task_search` table updated by worker consuming `TaskUpdated` events; API search reads only that table.

---

## 5. When to use / when not to use

| Situation | CQRS level |
|-----------|------------|
| CRUD API, moderate traffic | Lite — separate methods, maybe read repos |
| Complex reporting dashboards | Read models / materialized views |
| Same shape read/write | **Skip** CQRS — YAGNI |
| Event sourcing paired | Often full CQRS on read side |

---

## 6. Step-by-step: design → implement → verify

1. List commands vs queries for feature.  
2. Ensure commands use transactions where needed.  
3. Optimize queries with indexes/views—no rule changes on GET.  
4. If read load dominates, consider replica or cache.  
5. Verify GET never writes sessions/audit accidentally.

---

## 7. Worked example A — this project

**Command — create task:** `TaskService.create` → membership check, `sql.begin`, assignee validation, insert.

**Query — list tasks:** `TaskRepository.listByProject` (read-only), service may filter by authz before returning.

**Command — transfer ownership:** `ProjectServices.transferOwnership` — multi-row updates, invariants.

**Query — get project:** `ProjectRepository.findById` — no side effects.

Separation is in **service methods** and repo read vs write naming—not separate microservices.

---

## 8. Worked example B — self-contained mini scenario

**Lite CQRS in one service:**

```ts
class TaskApplication {
  // commands
  async create(cmd: CreateTaskCommand) {
    await this.sql.begin(async (tx) => { /* writes */ });
  }

  // queries
  async listBoard(q: ListTasksQuery) {
    return this.readRepo.listForKanban(q.projectId); // tuned JOIN
  }
}
```

**Full CQRS add-on:** After `create`, publish `TaskCreated`; projector updates `kanban_cards` table; `listBoard` reads only `kanban_cards`.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| GET triggers side effect | Breaks caching, CDNs, retries |
| Two models without sync story | Read side permanently wrong |
| CQRS for 3 endpoints | Complexity tax |
| Skipping authz on “read model” | IDOR |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Dashboard stale | Event lag | Projector lag | Monitor consumer |
| Write OK, read wrong | Different code paths | Query repo SQL | Align or rebuild projection |
| Duplicate command effect | Retries | Idempotency | Command id keys |

---

## 11. Interview Q&A (with strong answers)

**Q: What is CQRS?**  
**A:** Separate paths for changing state vs reading state; may share or split storage.

**Q: Lite vs full?**  
**A:** Lite: same DB, different handlers. Full: separate read store, often eventual consistency via events.

**Q: Example command vs query here?**  
**A:** `TaskService.update` command with transaction; list tasks query with read-only SQL.

**Q: CQRS vs CRUD?**  
**A:** CRUD colocates; CQRS splits intentionally when read/write needs diverge.

**Q: Relation to event sourcing?**  
**A:** Often paired—events feed read models; not required for lite CQRS.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Command | Intent to change state |
| Query | Read without mutation |
| Read model | Denormalized view for queries |
| Projection | Builds read model from events |
| Lite CQRS | Same database, split code |
| Eventual consistency | Reads lag writes |

---

## 13. Teach pointer

> “CQRS is not two databases—it’s two questions: ‘What changes?’ and ‘What do we show?’”

---

## 14. Optional further reading (not required)

- [event-sourcing](./event-sourcing.md) · [layered-architecture](./layered-architecture.md)  
- [../database/transactions.md](../database/transactions.md)

Repo paths: `backend/src/modules/tasks/task.service.ts`, `task.repository.ts`.
