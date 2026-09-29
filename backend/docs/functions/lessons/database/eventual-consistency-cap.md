# Lesson: Eventual consistency and CAP (working view)

**Standalone ✓** — You do not need any other doc to reason about consistency tradeoffs when you leave single-Postgres transactions.

**After this file you can:** explain CAP at a practitioner level, name eventual consistency symptoms, relate to replicas/cache/queues, and answer interview questions.

---

## 1. First principles

In distributed systems you often cannot simultaneously maximize **Consistency**, **Availability**, and **Partition tolerance** (CAP theorem framing).

**Eventual consistency:** replicas/consumers **converge** to the same state if no new writes — but readers may see **stale** data temporarily.

**Why it matters:** This task app uses **strong consistency inside one Postgres** transaction; adding cache, read replicas, or message queues introduces weaker guarantees unless you design carefully.

**The problem it solves (awareness):** “Know when ‘read your own write’ fails and how to fix UX.”

---

## 2. Mental model

### Analogy

Social media **like count** — might lag seconds; bank **balance after transfer** must not lag incorrectly on primary path.

### Diagram

```text
Strong (single DB tx):
  write ──► commit ──► read same connection ──► sees write

Eventual (cache/replica/queue):
  write ──► primary OK
  read  ──► replica/cache ──► maybe stale ► eventually matches
```

---

## 3. Core rules (must / must-not)

1. **MUST** default to **Postgres transactions** for invariants in this monolith.  
2. **MUST** document consistency level per read path when adding cache/replica.  
3. **MUST NOT** cache auth/session validation without TTL + invalidation plan.  
4. **MUST** use **idempotency** on async consumers ([../api/idempotency.md](../api/idempotency.md)).  
5. **MUST NOT** assume queue delivery is exactly-once without design.

---

## 4. How it works (mechanics)

### Single DB (this app)

ACID transactions — **linearizable** for data accessed through that DB (modulo isolation level nuances).

### Read replica lag

Async replication → **eventual** on replica ([replication](./replication.md)).

### Cache

Redis cache-aside: invalidate on write or accept stale reads with TTL.

### Outbox + consumer

Write row + outbox in one tx; worker publishes later — downstream **eventually** consistent with DB.

### CAP shorthand (interview)

During **network partition**, choose **CP** (refuse some requests, stay consistent) vs **AP** (stay up, risk stale/conflict). Real systems tune per operation.

---

## 5. When to use / when not to use

| Situation | Consistency |
|-----------|-------------|
| Create project + owner membership | Single DB tx — strong |
| Email after register | Outbox/eventual |
| Task list from Redis cache | Eventual unless invalidate |
| Payment + ledger | Strong in ledger DB or careful saga |
| Global CDN static assets | Eventual OK |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Classify data: strong vs OK-stale.  
2. Draw write/read paths.  
3. Add invalidation or primary-read rules.

### Implement

1. Keep laws in Postgres constraints.  
2. Queue side effects after commit.  
3. Monitor lag/TTL.

### Verify

1. Chaos: pause consumer — system still consistent on primary reads.  
2. Test read-after-write UX paths.

---

## 7. Worked example A — this project

### Strong paths (single Postgres)

- `ProjectService.create` — project + OWNER membership in `sql.begin`  
- `AuthService.register` — user + verification token same tx  
- `AuthService.refresh` — revoke + new session same tx  

All use `backend/src/db/client.ts` single primary — **no cross-region eventual story inside those txs**.

### Eventual-adjacent (outside DB commit)

- **Email/console** verification token delivery after register — if email fails, user row still exists (dual-write concern; token in DB, channel best-effort).  
- Future **search index** or **analytics** fed by CDC — would lag primary.

### Not present

Redis cache layer for tasks in current codebase — lists hit Postgres directly (`TaskRepository.listByProjectId`).

---

## 8. Worked example B — mini scenario (self-contained)

**Cache project member count:**

```text
1. READ count from Redis → 5
2. Another service adds member → DB 6, cache stale 5
3. UI shows 5 until TTL or invalidation
```

Fix: invalidate cache key `project:{id}:member_count` on member INSERT/UPDATE.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Cache membership without invalidation | Unauthorized access appearance |
| Read replica for session check | Stale “logged out” |
| Two-phase commit across Stripe+PG | Impractical — use saga |
| “Eventually” for money invariant | Financial bugs |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Stale list after update | Cache/replica | Which data source | Invalidate / primary read |
| Duplicate side effect | At-least-once queue | Consumer idempotency | Idempotency keys |
| User sees old task status | Client cache | HTTP caching headers | No-store on API |
| Inconsistent aggregates | Async projection | Worker lag | Monitor lag |

---

## 11. Interview Q&A (with strong answers)

**Q: What is eventual consistency?**  
**A:** Updates propagate asynchronously; without new writes, all replicas/consumers converge, but reads may be stale temporarily.

**Q: CAP theorem in one sentence?**  
**A:** During a partition, you trade off availability vs strong consistency — partition tolerance is required in distributed systems.

**Q: Where is this app strongly consistent?**  
**A:** Within Postgres transactions for core entities — project/member/task/auth flows using `sql.begin` on a single primary.

**Q: When would you accept eventual consistency here?**  
**A:** Search indexes, analytics, email delivery notifications, or read replicas — not for membership authorization decisions without primary read.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Strong consistency | Reads see latest committed write |
| Eventual consistency | Convergence after delay |
| Partition | Network split between nodes |
| Cache-aside | App manages cache + DB |
| Saga | Multi-step compensating workflow |
| Linearizable | Strongest single-object ordering |

---

## 13. Teach pointer

> “Pick consistency per feature — money and membership gates are not ‘eventually maybe’.”

---

## 14. Optional further reading (not required)

- Replication lag: [replication](./replication.md)  
- Outbox: [../architecture/outbox-events.md](../architecture/outbox-events.md)  
- Sagas: [two-phase-commit-and-sagas-data](./two-phase-commit-and-sagas-data.md)
