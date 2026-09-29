# Lesson: Constraints and foreign keys

**Standalone ✓** — You do not need any other doc to enforce business laws in Postgres and map violations to API errors in this stack.

**After this file you can:** choose UNIQUE vs FK vs CHECK vs triggers, explain why app-only checks lose under concurrency, read SQLSTATE codes used here, and answer interview questions.

---

## 1. First principles

**Constraints** are rules the database enforces on **every** insert/update/delete, regardless of which app server or bug sent the SQL.

| Kind | Guarantees |
|------|------------|
| PRIMARY KEY / UNIQUE | One row per key; no duplicates |
| FOREIGN KEY (FK) | Referenced row exists; optional ON DELETE behavior |
| CHECK | Row satisfies a predicate |
| NOT NULL | Column has a value |

**Why they exist:** Application `if` checks are **not atomic** with writes. Two requests can both pass a check and both insert — unless the database says no.

**The problem they solve:** “This law must hold even under races, retries, and future code paths.”

---

## 2. Mental model

### Analogy

Constraints are **building codes**: the inspector (Postgres) rejects the work even if the contractor (app) forgot a step.

### Diagram

```text
App layer          DB layer
─────────          ────────
validate email ──► UNIQUE(email) ──► 23505 if duplicate
check assignee ──► FK + TRIGGER ──► 23514 if inactive assignee on open task
delete project ──► FK RESTRICT ──► 23503 if members/tasks remain
```

App checks improve UX (early 400). Constraints guarantee **correctness**.

---

## 3. Core rules (must / must-not)

1. **MUST** encode absolute business laws as constraints when Postgres can express them.  
2. **MUST** map SQLSTATE to domain HTTP errors in services — never leak raw driver messages.  
3. **MUST** use FK for referential integrity between entities (user → project → member → task).  
4. **MUST** combine constraints with **transactions** for multi-row invariants ([transactions](./transactions.md)).  
5. **MUST NOT** rely on SELECT-then-INSERT alone for uniqueness (TOCTOU).  
6. **MUST NOT** CASCADE delete without understanding orphan blast radius.

---

## 4. How it works (mechanics)

### Common SQLSTATE codes (Postgres)

| Code | Meaning | Typical HTTP mapping here |
|------|---------|---------------------------|
| `23505` | unique_violation | 409 Conflict |
| `23503` | foreign_key_violation | 409 Conflict |
| `23514` | check_violation | 400 Bad Request / 409 |

### FK actions

- **RESTRICT / NO ACTION:** block delete/update of parent if children exist  
- **CASCADE:** delete children with parent — use deliberately  
- **SET NULL:** nullable FK cleared

### Composite FK (this project)

`tasks` reference `members(id, project_id)` so assignee cannot be a member row from another project:

```sql
FOREIGN KEY (assignee_member_id, project_id)
  REFERENCES members (id, project_id)
```

Requires `UNIQUE (id, project_id)` on `members`.

### Triggers as constraints

When rules need subqueries (open tasks, active status), triggers raise exceptions with `ERRCODE = '23514'` — still a constraint-like failure the app catches.

---

## 5. When to use / when not to use

| Situation | Mechanism |
|-----------|-----------|
| Unique email | `UNIQUE` on `users.email` |
| One membership per user per project | `UNIQUE (user_id, project_id)` |
| Assignee in same project | Composite FK |
| “No open tasks if member deactivated” | Trigger + EXISTS |
| Format validation (email regex) | App + optional CHECK |
| Cross-table rule too complex for FK | Transaction + locks + trigger |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Write invariant in one sentence.  
2. Ask: can UNIQUE/FK/CHECK express it?  
3. If not, trigger or serialized transaction + lock.  
4. Decide user-visible error for violation.

### Implement

1. Add to migration SQL.  
2. In service `catch`, detect `err.code` and throw `ConflictError` / `BadRequestError`.  
3. Keep app validation for friendly messages.

### Verify

1. Integration test duplicate register → 409.  
2. Concurrent duplicate inserts → one succeeds, one `23505`.  
3. Illegal assignee → trigger `23514`.

---

## 7. Worked example A — this project

### A1. Schema constraints (`001_initial_schema.sql`)

- `users.email` **UNIQUE**  
- `members`: **UNIQUE (user_id, project_id)**, **UNIQUE (id, project_id)**  
- Task FKs to members with matching `project_id`

### A2. Auth register (`auth.service.ts`)

On insert user, duplicate email → Postgres `23505` → caught and mapped to conflict response (register path checks `err.code === "23505"`).

### A3. Project delete (`project.service.ts`)

Deleting project with dependent rows → `23503` → message like project cannot be deleted while related data exists.

### A4. Triggers (`010_member_assignee_invariants.sql`)

- Deactivate member with open assigned tasks → exception `23514`  
- Open task with inactive assignee → `23514`  

`TaskService` uses `isCheckViolation` for `23514` on updates.

### A5. Assignee validation + lock

`TaskService.assertAssigneeInProject` locks assignee row (`lockById` → `FOR UPDATE`) before insert/update — coordinates with triggers under concurrency.

---

## 8. Worked example B — mini scenario (self-contained)

**Rule:** Wallet balance never negative.

```sql
CREATE TABLE wallets (
  user_id UUID PRIMARY KEY,
  balance INT NOT NULL CHECK (balance >= 0)
);
```

App UPDATE without check still safe:

```sql
UPDATE wallets SET balance = balance - 100
WHERE user_id = $1 AND balance >= 100;
-- 0 rows → insufficient funds
```

CHECK catches bugs that subtract too much in one statement.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| “We check duplicate email in controller” | Race → two users same email |
| ON DELETE CASCADE everywhere | Accidental mass delete |
| No FK “for flexibility” | Orphan tasks, broken reports |
| Swallow DB error | Client sees 500, data wrong |
| CHECK that references other tables | Not allowed — use trigger |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| 409 on register | Duplicate email | `23505`, email value | Expected; UX message |
| 409 on project delete | FK children | members/tasks | Delete dependents or soft-archive flow |
| 400 Invalid assignee | Trigger or app check | Member status, project_id match | Fix assignee or reactivate member |
| FK violation on insert | Wrong id or order | FK column values | Create parent first; use transaction |
| Constraint exists but race still wins | Only app check | Missing UNIQUE | Add constraint |

---

## 11. Interview Q&A (with strong answers)

**Q: CASCADE vs RESTRICT?**  
**A:** CASCADE deletes dependent rows automatically; RESTRICT blocks parent delete if children exist. RESTRICT is safer default for user-visible data.

**Q: Why map 23505 in the app?**  
**A:** Turn database signal into stable API contract (409 Conflict) without exposing internal errors.

**Q: Deferrable constraints?**  
**A:** FK checks deferred until commit — useful for cyclic inserts in one transaction; rare in simple CRUD APIs.

**Q: App vs DB validation?**  
**A:** App for UX and early exit; DB for laws that must hold under all concurrency and code paths.

**Q: Example composite FK in this app?**  
**A:** Tasks reference `(assignee_member_id, project_id)` to members so assignee belongs to the task’s project.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| FK | Foreign key |
| SQLSTATE | Standardized error code |
| TOCTOU | Time-of-check/time-of-use race |
| Composite key | Key spanning multiple columns |
| Trigger | User-defined function on table events |
| Referential integrity | FK ensures valid references |

---

## 13. Teach pointer

> “If the business law is absolute, put it where cheaters and races can’t bypass it — the database.”

---

## 14. Optional further reading (not required)

- Races: [toctou](./toctou.md)  
- Multi-row atomicity: [transactions](./transactions.md)  
- Member locks: [pessimistic-locking](./pessimistic-locking.md)
