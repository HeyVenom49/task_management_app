# Lesson: Change data capture (CDC)

**Standalone ✓** — You do not need any other doc to understand log-based CDC, use cases, and how it differs from app-level audit.

**After this file you can:** explain CDC vs triggers, name consumers (search, warehouse, cache), handle ordering and duplicates, and answer interview questions.

---

## 1. First principles

**Change data capture (CDC)** streams **row-level changes** (insert/update/delete) from the database log to external systems **without** modifying every app query.

**Why it exists:** Analytics, search indexes, cache invalidation, and integrations need **near-real-time** copies — polling `updated_at` is fragile and load-heavy.

**The problem it solves:** “Propagate database truth to downstream systems reliably as data changes.”

---

## 2. Mental model

### Analogy

CDC is a **radio broadcast of the WAL** (translated to events) — subscribers tune in; the app doesn’t call each subscriber manually.

### Diagram

```text
Postgres WAL ──► Debezium / logical slot ──► Kafka ──► search indexer
                                              └──► warehouse
                                              └──► cache invalidator
```

---

## 3. Core rules (must / must-not)

1. **MUST** treat CDC events as **at-least-once** — consumers **idempotent**.  
2. **MUST** preserve **ordering per key** (partition by `task_id`) where order matters.  
3. **MUST NOT** use CDC as only audit trail without retention/legal design.  
4. **MUST** monitor replication slot lag — slots hold WAL; can fill disk.  
5. **MUST** schema-evolve with compatible event contracts (Avro/JSON schema).

---

## 4. How it works (mechanics)

### Log-based CDC

Read Postgres **logical decoding** from WAL — captures all commits, including bulk SQL and triggers.

### vs polling

`SELECT * WHERE updated_at > $cursor` misses deletes unless soft-delete; misses direct SQL fixes.

### vs app events

App emits after commit — misses ad-hoc DBA changes; CDC catches everything on DB.

### Event shape (typical)

```json
{ "op": "u", "table": "tasks", "before": {…}, "after": {…}, "ts_ms": … }
```

### Initial snapshot

Connector may snapshot table then stream changes.

---

## 5. When to use / when not to use

| Situation | CDC |
|-----------|-----|
| Sync tasks to Elasticsearch | Yes |
| Invalidate Redis on task update | Yes |
| Simple monolith, no downstream | Skip |
| Compliance audit only | Audit table or CDC to immutable store |
| Two-way sync | Hard — avoid |

---

## 6. Step-by-step: design → implement → verify

### Design

1. List consumers and required fields.  
2. Partition key = entity id.  
3. Idempotency strategy (upsert by id + version).

### Implement

1. Enable logical replication (managed often built-in).  
2. Deploy connector (Debezium, etc.).  
3. Consumer upserts to target.

### Verify

1. Update row in SQL shell — event arrives.  
2. Kill consumer — lag grows; recovery replays without corrupting target.

---

## 7. Worked example A — this project

### Current architecture

Monolith writes tasks/projects/members via repositories under `backend/src/modules/` — **no CDC pipeline** in repo.

Downstream sync today would require **application-level** hooks or polling — not implemented.

### Hypothetical: search index for tasks

When task title changes in `TaskRepository.update`, search cluster should update.

**CDC approach:**

1. Logical publication on `tasks` table.  
2. Stream to indexer consuming `{ op, after }`.  
3. Indexer `PUT /tasks/{id}` with `after.title`, `after.project_id`.

**Benefit:** Bulk admin SQL updates still propagate.  
**Contrast:** Calling search API inside `TaskService.update` misses DBA fixes and adds dual-write failure modes.

### Relation to migrations

Schema changes (`backend/src/db/migrations/`) must update consumer schemas when columns rename — coordinate expand/contract.

---

## 8. Worked example B — mini scenario (self-contained)

Consumer pseudocode:

```ts
async function onTaskEvent(ev) {
  if (ev.op === "d") {
    await search.delete(ev.before.id);
    return;
  }
  await search.upsert(ev.after.id, ev.after);
}
```

Use `updated_at` or LSN sequence for stale event drop if needed.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Unbounded replication slot | Disk full |
| Non-idempotent consumer | Duplicate index rows |
| CDC + app double publish | Duplicate events |
| Ignore DELETE events | Ghost search hits |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Disk full on DB | Slot lag | `pg_replication_slots` | Consumer catch-up or drop slot |
| Stale search | Consumer down | Lag metric | Restart consumer |
| Duplicate downstream | At-least-once | Idempotency key | Upsert by PK |
| Missing columns | Schema drift | Migration vs consumer | Version events |

---

## 11. Interview Q&A (with strong answers)

**Q: What is CDC?**  
**A:** Capturing database changes from the transaction log and streaming them to external systems.

**Q: CDC vs application events?**  
**A:** CDC sees all DB commits including ad-hoc SQL; app events only fire where code emits them.

**Q: Delivery guarantee?**  
**A:** Typically at-least-once — consumers must dedupe/idempotent apply.

**Q: This project?**  
**A:** No CDC wired; monolith reads/writes Postgres directly — CDC would be a future integration pattern for search/analytics.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| WAL | Write-ahead log |
| Logical decoding | WAL → row events |
| Replication slot | Consumer WAL cursor |
| Debezium | Common CDC connector |
| At-least-once | May duplicate deliveries |
| Idempotent consumer | Safe to replay events |

---

## 13. Teach pointer

> “Let the database log be the newsletter of truth — if you can consume it safely.”

---

## 14. Optional further reading (not required)

- Audit rows: [audit-tables](./audit-tables.md)  
- Outbox pattern: [../architecture/outbox-events.md](../architecture/outbox-events.md)  
- Replication: [replication](./replication.md)
