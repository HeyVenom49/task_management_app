# Lesson: Optimistic concurrency control

**Standalone ✓** — You do not need any other doc to design version-based updates, handle conflicts, and compare with this app’s pessimistic membership locks.

**After this file you can:** implement `updated_at` or version column checks, return 409 on stale writes, choose optimistic vs pessimistic, and answer interview questions.

---

## 1. First principles

**Optimistic concurrency** assumes conflicts are **rare**. Reads don’t lock rows; writes include a **condition** that the row hasn’t changed since read (version, `updated_at`, hash).

If zero rows updated → **conflict** — client refreshes and retries.

**Why it exists:** Avoid lock waits on read-heavy resources; scale concurrent readers.

**The problem it solves:** “Detect stale updates without holding locks during user think time.”

---

## 2. Mental model

### Analogy

Wiki **edit conflict** page: “Someone else saved since you opened the editor — merge or overwrite consciously.”

### Diagram

```text
Client A: GET task (updated_at = T1)
Client B: GET task (updated_at = T1)
Client B: PUT … WHERE updated_at = T1  ──► OK → T2
Client A: PUT … WHERE updated_at = T1  ──► 0 rows → 409 Conflict
```

---

## 3. Core rules (must / must-not)

1. **MUST** use a monotonic **version** or **updated_at** updated on every successful write.  
2. **MUST** include expected version in UPDATE `WHERE` clause atomically.  
3. **MUST** map zero-row update to **409 Conflict** (or 412 Precondition Failed).  
4. **MUST NOT** rely on optimistic check in app memory without SQL condition — race remains.  
5. **MUST NOT** use optimistic alone when invariant spans **multiple rows** without transaction + constraints.

---

## 4. How it works (mechanics)

### Single-row pattern

```sql
UPDATE tasks
SET title = $1, updated_at = NOW()
WHERE id = $2 AND updated_at = $3
RETURNING *;
```

If `RETURNING` empty → stale.

### Version integer

```sql
UPDATE tasks SET …, version = version + 1
WHERE id = $1 AND version = $2;
```

Clearer than timestamps (no clock issues).

### Client contract

Request body: `expectedUpdatedAt` or `If-Match: "version-5"` header.

### vs pessimistic

Optimistic: no `FOR UPDATE` during edit form. Pessimistic: lock at save time only — this app locks at save for members/tasks.

---

## 5. When to use / when not to use

| Situation | Approach |
|-----------|----------|
| User edits task title over 30s | Optimistic on task row |
| Assignee + member status invariant | Pessimistic + triggers (this app) |
| High contention wallet | Pessimistic or atomic UPDATE |
| CMS document | Optimistic / ETag |
| Multi-row aggregate | Transaction + constraints, not lone version column |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Pick version field (`updated_at` exists on tasks).  
2. API accepts expected timestamp.  
3. Define 409 response body.

### Implement

1. Repository UPDATE with `AND updated_at = ${expected}`.  
2. Service throws Conflict if null return.

### Verify

1. Two parallel PUTs — one wins, one 409.  
2. Happy path increments `updated_at`.

---

## 7. Worked example A — this project

### Schema readiness

`tasks` and `projects` have `updated_at TIMESTAMPTZ` in `001_initial_schema.sql`.

### Partial API hook

`TaskService.assertCanUpdateTask` filters sent fields including awareness of `expectedUpdatedAt` key in update input types — foundation for optimistic checks even if not all paths enforce yet.

### Current concurrency style

Task **authorization** uses **pessimistic** `lockByUserAndProject` in `task.service.ts` rather than optimistic version checks on membership.

**Design takeaway:** This app prioritizes **membership correctness** via locks + DB triggers; adding optimistic **`expectedUpdatedAt`** on task UPDATE would complement title/status edits without long locks during UI editing.

### Faithful extension sketch

```ts
const row = await db`
  UPDATE tasks
  SET title = ${title}, updated_at = NOW()
  WHERE id = ${taskId}
    AND updated_at = ${expectedUpdatedAt}
  RETURNING …
`;
if (!row) throw new ConflictError("Task was modified; refresh and retry");
```

Place in `TaskRepository.update` when API exposes precondition.

---

## 8. Worked example B — mini scenario (self-contained)

**Document with version column:**

```sql
ALTER TABLE docs ADD COLUMN version INT NOT NULL DEFAULT 1;
```

```ts
const [doc] = await sql`
  UPDATE docs
  SET body = ${body}, version = version + 1
  WHERE id = ${id} AND version = ${clientVersion}
  RETURNING id, version
`;
if (!doc) throw new ConflictError("stale version");
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Read updated_at, later UPDATE without WHERE on it | Lost update |
| Client ignores 409 | Data overwrite perception |
| Use wall clock ms without DB round-trip | Skew issues — prefer version int |
| Optimistic on multi-table invariant only | Partial illegal states |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| 409 spikes | Real concurrent edits | UX merge | Expected |
| Never 409 | WHERE missing version | Repository UPDATE | Add condition |
| updated_at unchanged | Trigger missing | UPDATE sets NOW() | Set in SQL |
| False conflicts | Precision truncation | ISO ms in JSON | Use version int |

---

## 11. Interview Q&A (with strong answers)

**Q: Optimistic concurrency control?**  
**A:** Detect conflicts at write time by conditioning UPDATE on unchanged version; fail if another writer committed first.

**Q: vs pessimistic?**  
**A:** Optimistic avoids locks during read/edit; pessimistic locks before write. Optimistic better for low contention; pessimistic for hot financial rows.

**Q: HTTP status for stale write?**  
**A:** Often 409 Conflict or 412 Precondition Failed with current entity version.

**Q: Does this app use optimistic task updates?**  
**A:** Schema has `updated_at`; task updates use transactions with pessimistic membership locks — optimistic precondition on task row is a natural additive feature.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Stale write | Update based on outdated state |
| Version column | Monotonic counter per row |
| Precondition | Expected version in request |
| Lost update | Overwrite without detecting conflict |
| 409 Conflict | Resource state conflict |

---

## 13. Teach pointer

> “Optimistic locking trusts the happy path — but the database must be the referee on the final save.”

---

## 14. Optional further reading (not required)

- Pessimistic pattern in app: [pessimistic-locking](./pessimistic-locking.md)  
- ETags at API layer: [../api/etags-conditional-requests.md](../api/etags-conditional-requests.md)
