# Lesson: Database indexing

**Standalone ✓** — You do not need any other doc to design, add, and debug indexes in Postgres for this stack.

**After this file you can:** explain what an index buys you, pick btree vs partial vs composite indexes, read a basic `EXPLAIN`, tie indexes to this app’s hot queries, and answer interview questions with confidence.

---

## 1. First principles

An **index** is an auxiliary data structure the database maintains alongside the table. It lets the engine find rows (or sort/join) without scanning every row on disk (**sequential scan**).

**Why it exists:** Tables grow. `WHERE email = $1` on millions of rows without an index means reading the whole table every login. Indexes trade **extra storage** and **slower writes** (each insert/update may touch index pages) for **predictable read latency**.

**The problem it solves:** “Find or order rows matching this predicate quickly, repeatedly, at scale.”

---

## 2. Mental model

### Analogy

A table is a novel printed in random order. An index is the **back-of-book index**: alphabetized pointers to page numbers. You still have the novel; you pay shelf space for the index pages and a little time updating the index when the story changes.

### Diagram

```text
Query: WHERE project_id = ? ORDER BY created_at DESC

Without index on (project_id, created_at):
  TABLE tasks ──► scan all rows ──► filter ──► sort ──► slow

With index tasks_project_created_idx (project_id, created_at DESC):
  INDEX ──► jump to project’s slice ──► already sorted ──► fast
```

---

## 3. Core rules (must / must-not)

1. **MUST** index columns (or composites) that appear in **high-volume** filters, joins, or sort keys.  
2. **MUST** put **equality** columns first in composite indexes, then range/sort columns.  
3. **MUST** measure with `EXPLAIN (ANALYZE, BUFFERS)` before and after — don’t guess.  
4. **MUST NOT** index every column “just in case” — write amplification and planner noise.  
5. **MUST NOT** assume a small dev DB proves index need; design for production access paths.  
6. **MUST** keep unique business keys backed by **UNIQUE** constraints (which create indexes automatically).

---

## 4. How it works (mechanics)

### B-tree (default in Postgres)

Balanced tree ordered by key. Supports `=`, `<`, `>`, `BETWEEN`, `ORDER BY` on the indexed prefix. Most app indexes are btree.

### Composite index column order

Index `(project_id, created_at DESC)` helps:

- `WHERE project_id = $1 ORDER BY created_at DESC` — excellent  
- `WHERE project_id = $1 AND created_at < $2` — excellent  
- `WHERE created_at < $2` alone — **cannot** use the index efficiently (leading column missing)

### Partial indexes

Index only rows matching a predicate, e.g. `WHERE status = 'ACTIVE'`. Smaller, cheaper when queries always filter that way.

### `CREATE INDEX CONCURRENTLY`

Builds without blocking writes as long as a normal `CREATE INDEX` would block. Use in production DDL; migrations in dev can use plain `CREATE INDEX`.

### Write cost

Each index on a table is updated on insert/update/delete of indexed columns. More indexes → slower writes, more disk.

### Unique constraints

`UNIQUE (user_id, project_id)` creates a unique btree index — duplicates fail with SQLSTATE `23505`.

---

## 5. When to use / when not to use

| Situation | Index? |
|-----------|--------|
| Login by email, token lookup by hash | **Yes** — point lookups at scale |
| List tasks by `project_id` | **Yes** — filter on FK-like column |
| Filter + sort `(project_id, status)` | **Yes** — composite (see migration `006`) |
| Column never in WHERE/JOIN/ORDER BY | **No** |
| Low-cardinality column alone (e.g. boolean) | Usually **no** unless partial |
| One-off admin query | **No** — fix query or accept seq scan |
| Full-text search on body text | **GIN** + FTS, not plain btree (see optional FTS lesson) |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Write the exact SQL (or repository query) that will run at high QPS.  
2. List predicates and sort order.  
3. Check existing constraints (UNIQUE already indexes).  
4. Propose smallest index: single column vs composite vs partial.

### Implement

1. Add index in a numbered migration under `backend/src/db/migrations/`.  
2. Name clearly: `idx_tasks_project_id`, `idx_tasks_projects_status`.  
3. In production, prefer `CONCURRENTLY` in a manual runbook if zero-downtime matters.

### Verify

1. `EXPLAIN (ANALYZE, BUFFERS)` on the query — expect **Index Scan** or **Index Only Scan**, not **Seq Scan** on large tables.  
2. Run integration tests / list endpoints — latency stable.  
3. Watch insert/update paths — no surprise slowdown from index bloat.

---

## 7. Worked example A — this project

### A1. Initial schema indexes

Migration `backend/src/db/migrations/001_initial_schema.sql`:

```sql
CREATE INDEX idx_members_project_id ON members (project_id);
CREATE INDEX idx_tasks_project_id ON tasks (project_id);
```

**Why:** Listing members or tasks for a project filters on `project_id`. Without these, every list is a full table scan as data grows.

### A2. Token and session lookups

Later migrations add:

- `idx_email_verification_tokens_user_id` — invalidate/list tokens per user  
- `idx_password_reset_tokens_user_id`  
- `idx_sessions_user_id` — revoke sessions on password reset  

Auth repos use `WHERE token_hash = $1 LIMIT 1` — hashes are unique in schema; unique constraint + index is mandatory for O(log n) lookup.

### A3. Composite for filtered task lists

`backend/src/db/migrations/006_add_task_status.sql`:

```sql
CREATE INDEX idx_tasks_projects_status ON tasks (project_id, status);
```

**Why:** “Tasks in project X with status Y” matches equality on both columns in index order.

### A4. Repository query to optimize next

`TaskRepository.listByProjectId` in `backend/src/modules/tasks/task.repository.ts`:

```ts
FROM tasks
WHERE project_id = ${projectId}
ORDER BY created_at DESC
```

**Index gap at learning scale:** `(project_id, created_at DESC)` would match filter + sort without a separate sort step. Add when lists get large or EXPLAIN shows sort on big sets.

---

## 8. Worked example B — mini scenario (self-contained)

**Table:** `events(user_id, created_at)` — append-only activity log.

**Hot query:** last 50 events for a user, newest first.

```sql
CREATE INDEX events_user_created_idx
  ON events (user_id, created_at DESC);

SELECT id, kind, payload
FROM events
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 50;
```

**Partial variant** if you only ever query non-archived rows:

```sql
CREATE INDEX events_active_user_created_idx
  ON events (user_id, created_at DESC)
  WHERE archived_at IS NULL;
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| No index on `users.email` with UNIQUE | UNIQUE fixes correctness; at huge scale ensure stats/planner use it |
| Index `(created_at)` only for `WHERE project_id = ?` | Planner seq-scans or uses wrong index |
| 15 indexes on one table | Slow writes, vacuum overhead |
| Index column wrapped in function `WHERE lower(email) =` | Plain index on `email` unused — need expression index |
| Never `ANALYZE` after bulk load | Planner chooses seq scan wrongly |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| List endpoint slow as data grows | Seq scan + sort | `EXPLAIN ANALYZE` | Composite index matching WHERE + ORDER BY |
| Index exists but seq scan anyway | Low row count, stale stats, wrong predicate | `pg_stat_user_tables`, run `ANALYZE` | Fix query shape; update stats |
| Inserts suddenly slow | Too many indexes | `\d table` index list | Drop unused indexes |
| Duplicate key errors | UNIQUE index doing its job | Which constraint | App maps `23505` to Conflict (see constraints lesson) |
| Migration lock timeout | `CREATE INDEX` not concurrent | Production traffic | `CREATE INDEX CONCURRENTLY` |

---

## 11. Interview Q&A (with strong answers)

**Q: What is a database index?**  
**A:** A structured shortcut (usually btree) from key values to row locations so queries avoid full table scans.

**Q: Why does composite column order matter?**  
**A:** B-tree indexes are ordered by a prefix. `(a, b)` helps `WHERE a = ?` and `WHERE a = ? AND b < ?`, not `WHERE b = ?` alone.

**Q: What is a covering index?**  
**A:** An index that contains all columns the query needs, enabling index-only scans without heap fetches.

**Q: Tradeoffs of more indexes?**  
**A:** Faster reads on matching queries; slower writes, more disk, more vacuum/maintenance.

**Q: When use `CREATE INDEX CONCURRENTLY`?**  
**A:** Online production DDL when you cannot take write locks during index build.

**Q: How does this task app use indexes?**  
**A:** FK/list columns like `project_id`, token `user_id` lookups, and `(project_id, status)` for filtered task lists — defined in SQL migrations under `backend/src/db/migrations/`.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Sequential scan | Read all table rows |
| Index scan | Traverse index to find matching rows |
| B-tree | Default balanced-tree index type |
| Composite index | Index on multiple columns |
| Partial index | Index subset of rows via `WHERE` |
| Selectivity | Fraction of rows matching a predicate |
| Write amplification | Extra I/O updating indexes on writes |
| `EXPLAIN ANALYZE` | Run query with planner + timing |

---

## 13. Teach pointer

> “Index for the query you run a million times, not for imaginary queries.”

---

## 14. Optional further reading (not required)

- Pagination + sort: [pagination](./pagination.md)  
- N+1 query patterns: [n-plus-one](./n-plus-one.md)  
- Schema changes: [migrations](./migrations.md)  
- Repo paths: `backend/src/db/migrations/`, `backend/src/modules/tasks/task.repository.ts`
