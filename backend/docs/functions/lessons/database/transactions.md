# Lesson: Database transactions

**Standalone ✓** — You do not need any other doc to understand and use transactions.

**After this file you can:** explain ACID, decide when a feature needs a transaction, write one correctly in this stack, debug a half-applied write, and answer interview questions with confidence.

---

## 1. First principles

A **database transaction** is a bundle of one or more SQL statements that the database treats as a **single unit of work**.

Either:

- **all** of the statements permanently succeed together (**commit**), or  
- **none** of them remain (**rollback**).

That property is called **atomicity**. It exists because real systems crash, throw errors, and run concurrent requests. Without transactions, you get **half-updated** data: a user row without its verification token, a project without an owner membership, a revoked refresh session without a replacement.

**The problem it solves:** “These N writes are only meaningful together. The world must never observe them halfway.”

---

## 2. Mental model

### Analogy

Think of a bank transfer as moving a pile of cash from envelope A to envelope B **inside a locked booth**:

1. Enter booth (BEGIN)  
2. Take money from A  
3. Put money in B  
4. If anything goes wrong, put everything back as it was (ROLLBACK)  
5. Leave booth; cameras outside only see the final result (COMMIT)

Observers (other transactions / API readers) should not see “A already empty but B not filled yet.”

### Diagram

```text
BEGIN ───────────────────────────────────────────── COMMIT
   │                                              │
   │  statement 1                                 │
   │  statement 2                                 │
   │  statement 3                                 │
   │                                              ▼
   │                                         durable together
   │
   └── on error / throw ─────────────────────► ROLLBACK
                                              (as if nothing happened)
```

### In application code (this stack)

This backend uses the `postgres` (postgres.js) client:

```ts
await sql.begin(async (tx) => {
  // all queries that must succeed together use `tx`, not `sql`
  await tx`INSERT ...`;
  await tx`UPDATE ...`;
});
// if the callback throws → rollback
// if it returns → commit
```

**Critical detail:** every query inside the unit must use the **same** `tx` handle. If you insert with `tx` but update with the outer `sql`, that update is a **different** transaction and can commit even when the inner one rolls back (or vice versa). That silently destroys atomicity.

---

## 3. Core rules (must / must-not)

1. **MUST** put all writes that define one business invariant in one transaction.  
2. **MUST** pass the transaction client (`tx`) into repositories for those writes.  
3. **MUST** throw (or otherwise abort) on business-rule failure so the transaction rolls back.  
4. **MUST** keep transactions **short** — no HTTP calls, no email, no “wait for user” inside.  
5. **MUST NOT** assume “I already SELECTed it, so it’s still true” without locking or a constraint (that’s a race; see optional TOCTOU lesson later).  
6. **MUST NOT** catch errors inside the transaction and “continue anyway” unless you intentionally want a partial commit (almost never).  
7. **MUST** still enforce important laws with **constraints** (UNIQUE, FK, CHECK) so races can’t bypass app logic.

---

## 4. How it works (mechanics)

### BEGIN / COMMIT / ROLLBACK

| Step | Meaning |
|------|---------|
| BEGIN | Start a private workspace of changes |
| SQL statements | Apply changes visible inside the transaction (visibility to others depends on isolation) |
| COMMIT | Make changes durable and visible per isolation rules |
| ROLLBACK | Discard all changes from this transaction |

In `sql.begin(fn)`: successful `fn` completion → commit; thrown error → rollback; the library wires this for you.

### ACID (working definition)

| Letter | Meaning | Practical takeaway |
|--------|---------|-------------------|
| **A**tomicity | All or nothing | Bundle related writes |
| **C**onsistency | DB moves from one valid state to another valid state | Constraints + correct app rules |
| **I**solation | Concurrent transactions don’t step on each other unchecked | Default isolation + locks when needed |
| **D**urability | After commit, data survives crash | Trust the DB’s commit; don’t “commit in app memory” |

You do **not** need to memorize every isolation anomaly to use transactions daily. You **do** need: atomic bundles, short duration, and constraints for laws that must always hold.

### What rolls back?

- Inserts/updates/deletes done on that `tx`  
- Row locks taken in that transaction (released on end)

What does **not** roll back:

- Work already committed in a previous transaction  
- Side effects outside the DB (emails already sent, logs already written, HTTP calls already made)  
- That’s why email/payment belong in patterns like outbox *after* or *with* a DB outbox row — not as a hopeful call after commit without a plan

### Errors and HTTP

Typical pattern in this codebase:

1. Service starts `sql.begin`  
2. Something invalid → `throw new ConflictError(...)` (or similar)  
3. Transaction rolls back  
4. Express `errorHandler` turns `AppError` into JSON status  

So: **throwing domain errors is how you abort the transaction.** Returning a normal value commits.

### Migrations

Schema migrations in this project also wrap each file in a transaction: apply SQL + record version, or neither. Same atomic idea at the schema level.

---

## 5. When to use / when not to use

| Situation | Transaction? |
|-----------|----------------|
| Create project **and** create OWNER membership | **Yes** — project without owner is illegal |
| Register user **and** create email-verification token | **Yes** |
| Revoke old refresh session **and** create new one | **Yes** |
| Mark reset token used **and** update password **and** revoke sessions | **Yes** |
| Single `UPDATE users SET name = $1` | Optional (one statement is already atomic alone) |
| Read-only `SELECT` list | Usually no write transaction needed |
| Call Stripe + write DB together | **Not one DB transaction across Stripe** — need saga/outbox style design |
| Send email inside `begin` | **No** — if email hangs, you hold DB locks |

**Rule of thumb:** If either write alone leaves data that your product considers corrupt, they share one transaction.

---

## 6. Step-by-step: design → implement → verify

### Design

1. Write the invariant in one sentence: “A project always has ≥1 active owner membership at creation.”  
2. List every SQL write that upholds it.  
3. List checks that must happen before commit (authz, validation).  
4. Decide locks if concurrent writers can break the invariant (e.g. `FOR UPDATE` on a membership row).  
5. Decide which DB constraints backstop the invariant (UNIQUE, FK, CHECK).

### Implement (this codebase’s shape)

1. In the **service**, call `await this.sql.begin(async (tx) => { ... })`.  
2. Pass `tx` into repository methods (`create(..., tx)`, `revoke(..., tx)`).  
3. Repositories default to `this.sql` but accept `db: Sql | TransactionSql`.  
4. On rule failure, `throw` an `AppError` subclass.  
5. Map unique violations (`23505`) etc. in `catch` **outside** or carefully so rollback still happened.

### Verify

1. Happy path: both rows exist.  
2. Force failure after first write (temporary throw) → **no** partial rows.  
3. Concurrency test if two requests can interleave.  
4. Confirm you never used outer `sql` for a write that belonged in `tx`.

---

## 7. Worked example A — this project

### A1. Create project + owner (invariant: no ownerless project)

**Invariant:** Creating a project always creates an ACTIVE OWNER membership for the creator in the same commit.

**Pattern (faithful to `ProjectServices.create`):**

```ts
return await this.sql.begin(async (tx) => {
  const project = await this.repo.create(
    { creatorId: userId, info },
    tx, // ← same transaction
  );
  const membership = await this.memberRepo.create(
    { userId, projectId: project.id, role: "OWNER" },
    tx, // ← same transaction
  );
  return { project, membership };
});
```

**Why this shape:**

- If `memberRepo.create` throws, the project insert is rolled back → no orphan project.  
- If the process crashes after both succeed but before HTTP response, data is still consistent (both committed).  
- Unique conflicts on project name are caught and turned into `ConflictError` in the service’s `catch`.

**Where it lives:** `backend/src/modules/projects/project.service.ts` method `create`.

### A2. Register user + verification token

**Invariant:** New users are created INACTIVE with a verification token row in the same commit (token raw value returned only in-memory for email/console — DB stores **hash**).

```ts
const { user, rawToken } = await this.sql.begin(async (tx) => {
  const user = await this.repo.createUser(
    { name, email, passwordHash },
    tx,
  );
  const rawToken = await this.issueVerificationToken(user.id, tx);
  return { user, rawToken };
});
```

`issueVerificationToken` also receives `tx` so invalidate-old-tokens + insert new token participate in the same commit.

**Where:** `backend/src/modules/auth/auth.service.ts` method `register`.

### A3. Refresh token rotation

**Invariant:** The old session is revoked and the new session is created together; you must not leave “two valid refresh hashes” or “zero valid sessions” from a half-finished rotation.

```ts
await this.sql.begin(async (tx) => {
  const revoked = await this.sessionRepo.revoke(session.id, tx);
  if (!revoked) {
    throw new UnauthorizedError("Invalid refresh token");
  }
  await this.sessionRepo.createSession(
    { userId: user.id, tokenHash, expiresAt },
    tx,
  );
});
```

If `revoke` didn’t update any row (already revoked), throw → rollback → no new session from a replay race without careful handling.

**Where:** `AuthService.refresh`.

### A4. Task write with membership lock

Task create/update runs inside `begin`, locks the caller’s membership with `FOR UPDATE` via `tx`, then writes the task. That ties **authorization state** to the write so a concurrent “remove member” is serialized with the task mutation.

**Where:** `TaskService.create` / `update`.

---

## 8. Worked example B — mini scenario (self-contained)

**Feature:** “Transfer 100 points from Alice to Bob in a `wallets` table.”  
**Invariant:** Total points across all wallets never change due to a transfer; no negative balances.

```sql
-- setup
CREATE TABLE wallets (
  user_id UUID PRIMARY KEY,
  balance INT NOT NULL CHECK (balance >= 0)
);
```

```ts
async function transfer(sql, fromId, toId, amount: number) {
  if (amount <= 0) throw new BadRequestError("amount must be positive");

  await sql.begin(async (tx) => {
    // lock rows in stable order to avoid deadlocks
    const ids = [fromId, toId].sort();
    for (const id of ids) {
      await tx`SELECT balance FROM wallets WHERE user_id = ${id} FOR UPDATE`;
    }

    const [from] = await tx`
      UPDATE wallets SET balance = balance - ${amount}
      WHERE user_id = ${fromId} AND balance >= ${amount}
      RETURNING balance
    `;
    if (!from) throw new ConflictError("insufficient funds");

    await tx`
      UPDATE wallets SET balance = balance + ${amount}
      WHERE user_id = ${toId}
    `;
  });
}
```

**Why CHECK + conditional UPDATE:** even if app logic bugs, the DB refuses negative balances; conditional update makes “insufficient funds” an atomic check-and-write.

You could implement this tomorrow without reading any other lesson file.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Two commits: insert project, then insert member | Crash between → ownerless project |
| Use `sql` for second write inside `begin` | Second write not in the transaction |
| `try { await tx... } catch { /* ignore */ }` | Partial logic continues; may commit bad state |
| Call `fetch(emailApi)` inside `begin` | Holds DB locks during network; timeouts; still dual-write risk |
| Huge transaction updating millions of rows | Long locks, timeouts, outages |
| “Transaction” only in the service memory (array push) | Not durable; crash loses “transaction” |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Project exists, no membership | Writes not in one `begin`, or second used `sql` | Repo calls: do they receive `tx`? | Pass `tx`; wrap both creates |
| Duplicate email sometimes | Race without UNIQUE + transaction-friendly handling | DB unique on email; catch `23505` | Add UNIQUE; map to Conflict |
| Refresh sometimes creates two sessions | Rotation not transactional / revoke not conditional | `refresh` method body | `begin` + revoke then create; check revoke result |
| Requests hang under load | Long transactions or lock waits | Duration of `begin` callback; external I/O inside | Shorten; remove HTTP from tx |
| Error returned but data still written | Error thrown **after** commit, or wrong client | Was throw inside `begin`? | Throw before commit; use `tx` only inside |
| Migration half-applied | Migration runner not transactional per file | Migration tooling | One transaction per migration file (this repo does) |

**Quick verification SQL mindset:** After a forced failure test, `SELECT` both tables — either both new rows exist or neither does.

---

## 11. Interview Q&A (with strong answers)

**Q: What is a database transaction?**  
**A:** A unit of work with all-or-nothing semantics (atomicity). Statements commit together or roll back together so the database never permanently shows a partial business update.

**Q: Explain ACID briefly.**  
**A:** Atomicity = all-or-nothing; Consistency = constraints/rules kept; Isolation = concurrent tx don’t corrupt each other unchecked; Durability = committed data survives crashes.

**Q: Why pass `tx` into repositories instead of using a global `sql`?**  
**A:** So every statement joins the same transaction. Using the global client creates a separate transaction that can commit independently and break atomicity.

**Q: What should never run inside a transaction?**  
**A:** Slow external I/O (HTTP, SMTP), interactive waits, or unrelated work that enlarges lock duration. Keep the critical DB writes only.

**Q: Is one INSERT already a transaction?**  
**A:** A single statement is atomic by itself. You open an explicit multi-statement transaction when **multiple** statements must succeed together.

**Q: How do you abort in application code?**  
**A:** Throw an error from inside the `begin` callback so the driver rolls back, then map that error to an HTTP status in the API layer.

**Q: Transactions vs sagas?**  
**A:** Transactions work inside one database (or systems supporting real distributed tx, rare). Across services (pay + email + DB), use sagas/outbox with compensations — you cannot wrap Stripe and Postgres in one local `BEGIN`.

**Q: Give an example from a task/project app.**  
**A:** Creating a project must also create the creator’s OWNER membership in one transaction; otherwise a crash leaves a project nobody owns.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| BEGIN | Start transaction |
| COMMIT | Permanently apply transaction changes |
| ROLLBACK | Discard transaction changes |
| Atomicity | All-or-nothing behavior |
| Isolation | How concurrent transactions interact |
| Durability | Committed data survives failure |
| Constraint | DB-enforced rule (UNIQUE, FK, CHECK) |
| `tx` / transaction client | Handle that runs statements inside the open transaction |
| Dual-write | Updating two systems without one atomic commit (risk) |
| Lock (`FOR UPDATE`) | Prevents other transactions from changing a row until commit/rollback |

---

## 13. Teach pointer

> “A transaction is a promise: the database will not remember a half-truth.”

---

## 14. Optional further reading (not required)

Only if you want neighboring concepts next:

- Isolation details: [isolation-levels](./isolation-levels.md)  
- Races despite checks: [toctou](./toctou.md)  
- Row locks: [pessimistic-locking](./pessimistic-locking.md) · [locking-kinds](./locking-kinds.md)  
- Cross-service workflows: [../architecture/outbox-events.md](../architecture/outbox-events.md) · [../architecture/saga-orchestration.md](../architecture/saga-orchestration.md)  

Repo paths cited above (optional to open):  
`backend/src/modules/projects/project.service.ts`, `backend/src/modules/auth/auth.service.ts`, `backend/src/modules/tasks/task.service.ts`, `backend/src/db/migrate.ts`.
