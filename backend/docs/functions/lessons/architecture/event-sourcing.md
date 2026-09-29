# Lesson: Event sourcing

**Standalone ✓** — Store events as source of truth, rebuild state, snapshots, and why this task app uses state-based CRUD instead.

**After this file you can:** explain event sourcing vs current row model, design event stores, handle projections, and know when not to use it.

---

## 1. First principles

**Event sourcing** persists **state changes as an append-only sequence of events** rather than overwriting current row values. Current state is derived by **replaying** events (or reading a **snapshot** + recent events).

The problem it solves: auditability, temporal queries (“what did this task look like Tuesday?”), and reliable integration (publish from event stream). The cost: **complexity**—schema evolution, projections, debugging non-intuitive state rebuild.

This project uses **traditional CRUD** tables (`tasks`, `projects`)—current state in rows—not event sourcing.

---

## 2. Mental model

### Analogy

Bank **ledger of transactions** vs single balance field. Balance = sum(transactions)—ledger is truth; balance cache is projection.

### Diagram

```text
  Command: UpdateTaskStatus
        │
        ▼
  Append event: TaskStatusChanged { taskId, from, to, at }
        │
        ├──► Event store (append-only)
        │
        └──► Projector updates read model `tasks.status`
```

---

## 3. Core rules (must / must-not)

1. **MUST** treat events as **immutable**—correct mistakes with compensating events, not edits.  
2. **MUST** version event schemas for upcasters.  
3. **MUST** make command handlers idempotent where retries happen.  
4. **MUST NOT** use event sourcing for simple CRUD without clear benefit.  
5. **SHOULD** separate **write model** (commands) from **read model** (queries)—often with CQRS.  
6. **MUST** plan snapshot strategy for long streams.

---

## 4. How it works (mechanics)

**Event store table:**

```sql
CREATE TABLE task_events (
  id BIGSERIAL PRIMARY KEY,
  aggregate_id UUID NOT NULL,
  version INT NOT NULL,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (aggregate_id, version)
);
```

**Load aggregate:** read events `WHERE aggregate_id = ? ORDER BY version`, fold into state.

**Concurrency:** optimistic on `version`—reject command if version mismatch.

**Projections:** worker consumes events → updates `tasks` table for fast reads.

**This repo:** Task status changes would be `UPDATE tasks SET status = $1`—state stored directly. Audit could add `task_audit` table without full ES.

---

## 5. When to use / when not to use

| Situation | Event sourcing? |
|-----------|-----------------|
| Task CRUD app | **No** — CRUD + optional audit log |
| Financial ledger | **Often yes** |
| Need complete audit timeline | Consider ES or audit tables |
| Team new to DDD | **Defer** |
| Many read patterns | ES + projections |

---

## 6. Step-by-step: design → implement → verify

1. Identify aggregate (Task).  
2. Define events (`TaskCreated`, `TaskAssigned`, `TaskStatusChanged`).  
3. Implement command handler appending event with next version.  
4. Build projector to SQL read model used by API.  
5. Replay test: empty DB + all events = expected state.  
6. Snapshot every N events for performance.

---

## 7. Worked example A — this project (contrast + audit middle ground)

**Current task update (`TaskService.update`):** validates membership, applies field rules, `UPDATE` row in Postgres—**state-based**.

**If event-sourced (hypothetical):**

```ts
await this.eventStore.append(taskId, expectedVersion, {
  type: "TaskStatusChanged",
  payload: { from: task.status, to: input.status, byMemberId: membership.id },
});
// projector async or sync updates tasks.status for list endpoints
```

**Middle ground without ES:** `task_audit` table written in same transaction as update—audit trail without replay-only storage.

**Auth sessions:** rotation history could be event log—still likely overkill vs `sessions` table with `revoked_at`.

---

## 8. Worked example B — self-contained mini scenario

```ts
type TaskState = { title: string; status: string };

function fold(events: { type: string; payload: any }[]): TaskState {
  return events.reduce(
    (s, e) => {
      if (e.type === "TaskCreated") return { title: e.payload.title, status: "OPEN" };
      if (e.type === "TaskStatusChanged") return { ...s, status: e.payload.to };
      return s;
    },
    { title: "", status: "" },
  );
}

async function handle(cmd: { taskId: string; to: string; version: number }) {
  const stream = await loadEvents(cmd.taskId);
  if (stream.length !== cmd.version) throw new ConflictError("version");
  await append(cmd.taskId, cmd.version + 1, {
    type: "TaskStatusChanged",
    payload: { to: cmd.to },
  });
}
```

Replay `fold(stream)` equals read model if projector correct.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| ES for 3-table app | Massive ops burden |
| Mutable event log | Audit lie |
| No projections | Every read replays 10k events |
| Events without schema version | Breaking changes |
| ES without idempotent commands | Duplicate events on retry |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Read model wrong | Projector bug | Replay in test | Fix projector |
| Version conflicts | Concurrent updates | Expected | Retry command |
| Slow load | Long stream | Snapshot | Snapshot job |
| Missing events | Append failed | Transaction | Outbox/ES tx |

---

## 11. Interview Q&A (with strong answers)

**Q: Event sourcing vs CRUD?**  
**A:** CRUD stores current state; ES stores history of changes and derives state.

**Q: Benefits?**  
**A:** Audit, temporal queries, integration from stream.

**Q: Downsides?**  
**A:** Complexity, projections, schema migration, steeper debugging.

**Q: Snapshots?**  
**A:** Periodic cached state to avoid full replay.

**Q: This task app?**  
**A:** State in rows; ES not used—audit table alternative if needed.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Event | Immutable record of a change |
| Aggregate | Stream of events for one entity |
| Projection | Read model built from events |
| Replay | Recompute state from events |
| Snapshot | Saved state at a version |
| Upcaster | Migrates old event schemas |

---

## 13. Teach pointer

> “Event sourcing trades simple tables for a time machine—only buy the time machine if you’ll ride it daily.”

---

## 14. Optional further reading (not required)

- [cqrs-lite](./cqrs-lite.md) · [pub-sub](./pub-sub.md)  
- [../database/audit-tables.md](../database/audit-tables.md)

Repo path: `backend/src/modules/tasks/task.service.ts`, `backend/src/modules/tasks/task.repository.ts`.
