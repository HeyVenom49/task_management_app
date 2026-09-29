# Lesson: TOCTOU (time-of-check to time-of-use)

**Standalone ✓** — You do not need any other doc to recognize check-then-act races and fix them with constraints, locks, and atomic SQL.

**After this file you can:** explain TOCTOU, spot it in services, choose the right fix tier, and answer interview questions.

---

## 1. First principles

**TOCTOU** bug: you **check** a condition at time T1, then **act** at T2, but the world **changed between** T1 and T2 so the act is invalid even though the check passed.

Classic in concurrent APIs: “email not taken” → insert duplicate.

**Why it matters:** Single-threaded reasoning fails under parallel HTTP requests.

**The problem it solves (when fixed):** “Make check and act **one atomic step** from the database’s point of view.”

---

## 2. Mental model

### Analogy

Security guard checks your ticket **at the door**, you go get coffee, someone steals your seat — **check was true, use was false**.

### Diagram

```text
Request A                    Request B
CHECK email free ✓
                             CHECK email free ✓
INSERT email A
                             INSERT email B  ──► one must fail (UNIQUE)
```

Without UNIQUE, both succeed → corrupt.

---

## 3. Core rules (must / must-not)

1. **MUST** treat check-then-write as suspicious in code review.  
2. **MUST** enforce absolute rules with **UNIQUE/FK/CHECK/triggers**.  
3. **MUST** use **transaction + lock** when rule needs read of row state before write.  
4. **MUST NOT** assume SELECT result stays true until UPDATE without lock or version check.  
5. **MUST** map constraint violations to clear API errors.

---

## 4. How it works (mechanics)

### Fix tiers (strongest last line of defense at DB)

| Tier | Mechanism |
|------|-----------|
| 1 | Single atomic SQL (`UPDATE … WHERE balance >= x`) |
| 2 | UNIQUE / FK / CHECK |
| 3 | Trigger raising on invalid transition |
| 4 | `SELECT … FOR UPDATE` then act in same tx |
| 5 | Optimistic version on UPDATE |

App-only `if` is **UX**, not correctness alone.

---

## 5. When to use / when not to use

| Situation | Fix |
|-----------|-----|
| Unique email register | UNIQUE + catch 23505 |
| Assignee active | Lock member + trigger on tasks |
| “Is owner?” before delete | Lock membership or FK cascade rules |
| Read-only display | TOCTOU irrelevant |
| Cross-service payment | Idempotency + outbox — not local TOCTOU only |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Write check-then-act story in two steps.  
2. Ask: can another request run between steps?  
3. Pick DB-backed fix.

### Implement

1. Add constraint or lock path.  
2. Keep check for friendly early error.

### Verify

1. Parallel integration test hammering same invariant.  
2. Exactly one success where applicable.

---

## 7. Worked example A — this project

### Register duplicate email

**Check:** might query email exists.  
**Act:** INSERT user.  
**Defense:** `users.email UNIQUE` — second insert `23505` → `AuthService.register` maps to conflict.

### Assignee validity

**Check:** assignee is ACTIVE in project (app).  
**Act:** INSERT task.  
**Race:** member deactivated between check and insert.  
**Defense:** trigger `enforce_open_tasks_assignee_active` + `TaskService` locks assignee with `FOR UPDATE` inside `sql.begin`.

### Member deactivate with open tasks

**Check:** no open tasks (app could check).  
**Act:** UPDATE member status INACTIVE.  
**Defense:** trigger `enforce_no_open_tasks_on_deactivate` raises `23514`.

### Refresh token rotation

Revoke then create must be one transaction — otherwise TOCTOU on session validity ([transactions](./transactions.md)).

---

## 8. Worked example B — mini scenario (self-contained)

**Promo code once per user:**

```sql
CREATE UNIQUE INDEX promo_once ON redemptions (promo_id, user_id);
```

```ts
try {
  await sql`INSERT INTO redemptions (promo_id, user_id) VALUES (${p}, ${u})`;
} catch (e) {
  if (e.code === "23505") throw new ConflictError("already redeemed");
}
```

No separate SELECT needed for correctness.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| if (!exists) insert | Duplicate rows |
| Cache “is member” then write | Stale cache TOCTOU |
| Separate microservice check | Dual system race |
| Retry insert without unique | Duplicates multiply |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Rare duplicate | TOCTOU | UNIQUE missing | Add constraint |
| Illegal assignee row | Check/act gap | Triggers, locks | lockById in tx |
| “Flaky” test | Parallelism | Test hammers | Expected after fix |
| 409 only under load | Race | SQLSTATE logs | DB enforcement |

---

## 11. Interview Q&A (with strong answers)

**Q: What is TOCTOU?**  
**A:** Time-of-check to time-of-use — validity at check time doesn’t guarantee validity at action time under concurrency.

**Q: Fix?**  
**A:** Atomic operations, database constraints, transactional locks, or conditional updates — not app-only if statements alone.

**Q: Example in auth?**  
**A:** Duplicate registration prevented by UNIQUE on email even if two requests pass a read check.

**Q: Example in tasks?**  
**A:** Assignee must be active member — triggers plus pessimistic lock on member row during task write.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| TOCTOU | Check/act time gap race |
| Atomic | Indivisible from observer view |
| UNIQUE violation | 23505 duplicate |
| Check-then-act | Non-atomic two-step pattern |
| Serialization | Ordering concurrent effects |

---

## 13. Teach pointer

> “If another request could run in the gap between your check and your write, your check is a guess — make the database enforce the truth.”

---

## 14. Optional further reading (not required)

- Constraints: [constraints-and-fk](./constraints-and-fk.md)  
- Locks: [pessimistic-locking](./pessimistic-locking.md)  
- Transactions: [transactions](./transactions.md)
