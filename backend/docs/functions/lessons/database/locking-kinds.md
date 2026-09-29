# Lesson: Locking kinds (Postgres)

**Standalone ✓** — You do not need any other doc to understand row vs table locks, `FOR UPDATE` vs `FOR SHARE`, and when each applies in this stack.

**After this file you can:** pick the right lock mode, read lock-related waits in Postgres, connect locks to transactions, and answer interview questions.

---

## 1. First principles

**Locks** coordinate concurrent transactions so incompatible operations don’t corrupt shared rows or schema objects.

Postgres locks range from **row-level** (common in OLTP) to **table-level** (DDL, some bulk ops).

**Why they exist:** MVCC lets readers proceed without blocking writers, but **writers** still need exclusion when two transactions mutate the same logical resource.

**The problem they solve:** “Serialize access to resources that cannot be safely updated in parallel.”

---

## 2. Mental model

### Analogy

**Row lock:** one person editing a spreadsheet cell — others wait or get a conflict.  
**Table lock:** closing the whole sheet for restructuring (DDL).

### Diagram

```text
Transaction A                    Transaction B
SELECT … FOR UPDATE  (row lock)
                                 UPDATE same row …
                                 ► waits (or timeout)
COMMIT ──► releases lock
                                 ► proceeds or deadlocks elsewhere
```

---

## 3. Core rules (must / must-not)

1. **MUST** take row locks **inside** the same transaction that mutates (`sql.begin` + `tx`).  
2. **MUST** lock **before** relying on read values for write decisions (assignee active, member role).  
3. **MUST** lock rows in **consistent order** when locking multiple rows ([deadlocks-deep](./deadlocks-deep.md)).  
4. **MUST NOT** hold locks across HTTP/external calls.  
5. **MUST NOT** use table locks in app CRUD — use row locks or constraints.

---

## 4. How it works (mechanics)

### Row-level lock modes (SELECT variants)

| Clause | Intent |
|--------|--------|
| `FOR UPDATE` | Exclusive row lock for upcoming UPDATE/DELETE |
| `FOR NO KEY UPDATE` | Weaker exclusive (FK-safe cases) |
| `FOR SHARE` | Prevent writers, allow other readers |
| `FOR KEY SHARE` | Weakest row lock |

App code in this repo uses **`FOR UPDATE`** via repository helpers.

### Implicit locks

`UPDATE` / `DELETE` lock target rows automatically. Explicit `SELECT … FOR UPDATE` locks **before** you decide to update.

### DDL locks

`ALTER TABLE` takes stronger locks — migrations can block traffic; use concurrent index builds where needed.

### Lock duration

Held until **COMMIT** or **ROLLBACK** of the transaction.

---

## 5. When to use / when not to use

| Situation | Lock |
|-----------|------|
| Read-modify-write on same row | `FOR UPDATE` in tx |
| Prevent concurrent role change + task write | Lock membership row |
| Pure read list | No lock |
| Global counter | Row lock on counter row or atomic UPDATE |
| Cross-row invariant | Multiple locks ordered + constraints |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Identify contended rows (membership, wallet, session).  
2. Choose earliest lock point in flow.  
3. Order multi-row locks.

### Implement

1. Repository method with `FOR UPDATE` on `tx`.  
2. Service calls lock then mutate in same `begin`.

### Verify

1. Parallel tests — one wins, other waits or gets business error.  
2. `pg_locks` during stress (optional).

---

## 7. Worked example A — this project

### Member repository locks

`backend/src/modules/projects/member.repository.ts`:

```ts
public async lockById(memberId: string, db: Db = this.sql) {
  const [row] = await db`
    SELECT … FROM members WHERE id = ${memberId}
    FOR UPDATE
  `;
  …
}

public async lockByUserAndProject(userId, projectId, db) {
  … WHERE user_id = ${userId} AND project_id = ${projectId}
  FOR UPDATE
}
```

### Task service usage

`TaskService.create` / `update` in `backend/src/modules/tasks/task.service.ts`:

- `sql.begin`  
- `lockByUserAndProject` for caller’s membership  
- `lockById` for assignee when setting assignee  
- then INSERT/UPDATE task

**Why:** Authorization and assignee validity are tied to locked membership state at write time.

### Project service

Role changes and member removal use transactions with `FOR UPDATE` on relevant membership rows (`project.service.ts`).

---

## 8. Worked example B — mini scenario (self-contained)

**Inventory:** decrement stock only if enough units.

```ts
await sql.begin(async (tx) => {
  const [item] = await tx`
    SELECT qty FROM inventory WHERE sku = ${sku} FOR UPDATE
  `;
  if (item.qty < amount) throw new ConflictError("out of stock");
  await tx`UPDATE inventory SET qty = qty - ${amount} WHERE sku = ${sku}`;
});
```

Without `FOR UPDATE`, two txs could both read qty=1 and oversell.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Lock after UPDATE | Too late — race window |
| `FOR UPDATE` outside transaction | Lock released immediately (autocommit) |
| Lock whole table for one row | Throughput collapse |
| Different lock order in two code paths | Deadlock |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Requests hang | Lock wait | `pg_stat_activity.wait_event` | Shorten tx; kill blocker |
| Deadlock detected | Cycle of locks | Logs `40P01` | Stable lock ordering |
| Slow under load | Hot row lock | One counter row | Shard counters or atomic UPDATE |
| Lock not held | Used `sql` not `tx` | Client passed | Pass `tx` |

---

## 11. Interview Q&A (with strong answers)

**Q: Row vs table lock?**  
**A:** Row locks serialize access to individual rows; table locks affect entire table — typical OLTP uses row locks.

**Q: FOR UPDATE vs FOR SHARE?**  
**A:** FOR UPDATE blocks other writers on the row; FOR SHARE allows reads but blocks writers — used when you need stable read without immediate update.

**Q: When release locks?**  
**A:** On commit or rollback of the transaction.

**Q: Where does this app use FOR UPDATE?**  
**A:** `MemberRepository.lockById` / `lockByUserAndProject`, called from task and project services inside `sql.begin`.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Row lock | Lock on heap tuple |
| Exclusive lock | Blocks conflicting writers |
| Lock wait | Transaction blocked on lock |
| Hot row | High contention single row |
| MVCC | Readers/writers versioning |

---

## 13. Teach pointer

> “Lock the row you’re about to bet your invariant on — inside the same transaction as the bet.”

---

## 14. Optional further reading (not required)

- Deadlocks: [deadlocks-deep](./deadlocks-deep.md)  
- Pessimistic pattern: [pessimistic-locking](./pessimistic-locking.md)  
- Isolation: [isolation-levels](./isolation-levels.md)
