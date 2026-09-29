# Lesson: Transaction isolation levels

**Standalone ✓** — You do not need any other doc to understand Postgres isolation, common anomalies, and defaults for this API stack.

**After this file you can:** name isolation levels, explain dirty/non-repeatable/phantom reads, relate isolation to locks and MVCC, choose when to raise isolation, and answer interview questions.

---

## 1. First principles

**Isolation** defines how much one transaction sees of other transactions’ **in-progress** or **committed** changes.

Postgres uses **MVCC** (multi-version concurrency control): readers generally don’t block writers; each transaction sees a **snapshot** of committed rows as of a point in time.

**Why levels exist:** Stronger isolation prevents more anomalies but increases blocking/retries. Weaker isolation is faster but allows subtle bugs.

**The problem it solves:** “Define what ‘consistent read’ means when many requests write concurrently.”

---

## 2. Mental model

### Analogy

Parallel editors on a shared doc:

- **Read uncommitted** — see typos before they’re “saved” (Postgres effectively doesn’t expose dirty reads).  
- **Read committed** — see only saved paragraphs; re-read a paragraph may change if someone else saved.  
- **Repeatable read** — your chapter snapshot frozen for the transaction.  
- **Serializable** — as if transactions ran one-at-a-time.

### Diagram

```text
Tx A (default READ COMMITTED)          Tx B
─────────────────────────────          ────
SELECT balance → 100
                                       UPDATE balance → 50; COMMIT
SELECT balance → 50   ← non-repeatable read (allowed)
```

---

## 3. Core rules (must / must-not)

1. **MUST** know Postgres default is **READ COMMITTED** for each statement snapshot.  
2. **MUST** enforce business invariants with **constraints + transactions + locks** — not hope isolation alone fixes logic bugs.  
3. **MUST** use `FOR UPDATE` or serializable when read-then-write must be atomic ([pessimistic-locking](./pessimistic-locking.md)).  
4. **MUST NOT** assume repeatable reads on default level across multiple SELECTs.  
5. **MUST NOT** raise to SERIALIZABLE everywhere — expect **serialization failures** and retries.

---

## 4. How it works (mechanics)

### Postgres levels (SQL standard mapping)

| Level | Dirty read | Non-repeatable read | Phantom read |
|-------|------------|---------------------|--------------|
| READ UNCOMMITTED | Not possible in PG | Possible | Possible |
| READ COMMITTED | No | Yes | Yes |
| REPEATABLE READ | No | No | No (PG snapshot) |
| SERIALIZABLE | No | No | No (SSI) |

Postgres **REPEATABLE READ** and **SERIALIZABLE** use snapshot isolation / serializable snapshot isolation (SSI) — phantoms handled stricter than standard minimum.

### Setting level

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ;
-- or per session: SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
```

In app: usually default; escalate only for specific operations.

### Anomalies in apps

- **Lost update:** two txs read same value, both write — need optimistic version or pessimistic lock.  
- **Double spend:** two transfers based on stale balance — lock rows or conditional UPDATE.

This project uses **explicit row locks** (`FOR UPDATE`) inside `sql.begin` for membership/task paths rather than global SERIALIZABLE.

---

## 5. When to use / when not to use

| Situation | Isolation / tool |
|-----------|------------------|
| Typical CRUD API | Default READ COMMITTED + constraints |
| Financial transfer in one DB | Transaction + `FOR UPDATE` |
| Rare complex invariant across reads | SERIALIZABLE + retry on `40001` |
| Read-only report | READ COMMITTED or RR snapshot |
| Cross-service payment | Not one isolation level — saga/outbox |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Identify read-modify-write sequences.  
2. Ask: stale read breaks invariant?  
3. Choose lock, version column, or SERIALIZABLE.

### Implement

1. Wrap in `sql.begin`.  
2. Lock rows early in stable order ([deadlocks-deep](./deadlocks-deep.md)).  
3. Retry serialization failures if using SERIALIZABLE.

### Verify

1. Concurrent integration tests.  
2. No invariant violations under parallel requests.

---

## 7. Worked example A — this project

### Default isolation

All `sql.begin` callbacks use Postgres default **READ COMMITTED** unless session altered.

### Serialization via locks (not higher isolation)

`TaskService.create` / `update` — inside transaction, `memberRepo.lockByUserAndProject` or `lockById` uses `SELECT … FOR UPDATE` so concurrent membership changes serialize with task writes.

`ProjectService` uses `FOR UPDATE` on membership rows when changing roles or removing members (see `project.service.ts` transaction blocks).

**Lesson:** You don’t always raise isolation level — **row locks** give predictable serialization for specific rows.

### Constraints still required

Triggers on assignee/member status (`010_member_assignee_invariants.sql`) catch cases app checks miss — isolation doesn’t replace constraints.

---

## 8. Worked example B — mini scenario (self-contained)

**Bug on READ COMMITTED:** coupon “single use” via read-then-write without lock.

```ts
// BAD
const row = await sql`SELECT used FROM coupons WHERE id = ${id}`;
if (!row.used) await sql`UPDATE coupons SET used = true WHERE id = ${id}`;
```

Two requests both see `used=false`.

**Fix:**

```ts
await sql.begin(async (tx) => {
  const [c] = await tx`
    SELECT used FROM coupons WHERE id = ${id} FOR UPDATE
  `;
  if (c.used) throw new ConflictError("already used");
  await tx`UPDATE coupons SET used = true WHERE id = ${id}`;
});
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Assume stable reads across tx on RC | Logic breaks |
| SERIALIZABLE without retry | Random 40001 to users |
| Ignore MVCC — “SELECT for fun then UPDATE later” | Lost updates |
| Long RR snapshot holding old view | Unexpected business decisions |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Intermittent wrong balance | Lost update | Two parallel updates | FOR UPDATE or version check |
| `could not serialize` | SERIALIZABLE conflict | Isolation level | Retry tx |
| Phantom rows in report | RC | Expected | RR snapshot or accept |
| Tests pass solo, fail parallel | Race | Isolation + locks | Lock or constraint |

---

## 11. Interview Q&A (with strong answers)

**Q: Default isolation in Postgres?**  
**A:** READ COMMITTED — each statement sees committed data as of statement start.

**Q: Difference RR vs RC?**  
**A:** RR keeps one snapshot for the whole transaction; RC can see new commits on subsequent statements.

**Q: Serializable in Postgres?**  
**A:** Uses SSI to detect conflicts; may abort with serialization failure — apps should retry.

**Q: How does this app handle concurrency?**  
**A:** Mostly READ COMMITTED with explicit `FOR UPDATE` locks in task/project services plus DB constraints/triggers.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| MVCC | Multi-version concurrency control |
| Snapshot | Consistent view of row versions |
| Phantom read | New rows appear on re-query |
| Non-repeatable read | Same row different value on re-read |
| SSI | Serializable Snapshot Isolation |
| `40001` | serialization_failure SQLSTATE |

---

## 13. Teach pointer

> “Isolation tells you what you’re allowed to see; locks and constraints tell you what’s allowed to be true.”

---

## 14. Optional further reading (not required)

- Row locks: [locking-kinds](./locking-kinds.md), [pessimistic-locking](./pessimistic-locking.md)  
- Atomic bundles: [transactions](./transactions.md)  
- TOCTOU: [toctou](./toctou.md)
