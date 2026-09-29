# Lesson: Pagination (database & API)

**Standalone ✓** — You do not need any other doc to design stable, scalable list endpoints and matching SQL.

**After this file you can:** choose offset vs keyset pagination, write cursor SQL for this app’s task lists, pair pagination with indexes, and answer interview questions.

---

## 1. First principles

**Pagination** returns a **bounded page** of results plus a way to fetch the **next** page. Unbounded `SELECT *` lists fail on memory, timeouts, and UX as tables grow.

**Why it exists:** Real lists grow without limit (tasks per project, audit events). Clients and servers need predictable cost per request.

**The problem it solves:** “Serve large collections as small, repeatable chunks without scanning the whole table every time.”

---

## 2. Mental model

### Analogy

Reading a dictionary: you don’t memorize every word — you open to a **bookmark** (cursor) and read **one page** (limit), then move the bookmark forward.

### Diagram

```text
Offset pagination (page 1000):
  DB must walk/skip 1000 * limit rows  ──► slow, unstable if rows inserted

Keyset pagination (cursor = last created_at):
  WHERE project_id = P AND created_at < cursor
  ORDER BY created_at DESC LIMIT 20
  ──► index seek, stable order for append-heavy feeds
```

---

## 3. Core rules (must / must-not)

1. **MUST** cap `limit` server-side (max 50–100).  
2. **MUST** use **keyset/cursor** for large, frequently deep lists.  
3. **MUST** align `ORDER BY` with index column order.  
4. **MUST NOT** expose raw internal offsets as the only strategy at scale.  
5. **MUST NOT** return unbounded lists in production APIs — even if fine in learning code.  
6. **MUST** document cursor encoding (opaque token vs ISO timestamp).

---

## 4. How it works (mechanics)

### Offset (`LIMIT` / `OFFSET`)

```sql
SELECT * FROM tasks
WHERE project_id = $1
ORDER BY created_at DESC
LIMIT $limit OFFSET $offset;
```

Simple; **cost grows with offset** (Postgres still must find/skip rows). Rows inserted/deleted between pages → **duplicates or skips**.

### Keyset (cursor)

Use last seen sort key from previous page:

```sql
SELECT … FROM tasks
WHERE project_id = $1
  AND (created_at, id) < ($cursor_ts, $cursor_id)
ORDER BY created_at DESC, id DESC
LIMIT $limit;
```

Tie-breaker `id` avoids ambiguity when `created_at` duplicates.

### Cursor in API

Response: `{ items, nextCursor }`. `nextCursor` null when page not full.

Query: `?limit=20&cursor=<encoded>`.

### Index requirement

For `(project_id, created_at DESC)` filter+sort, index `(project_id, created_at DESC, id DESC)` avoids sort + seq scan.

---

## 5. When to use / when not to use

| Situation | Approach |
|-----------|----------|
| Admin list, always page 1, small table | Offset OK |
| Infinite scroll tasks | Keyset |
| Arbitrary sort (multi-column user choice) | Keyset on chosen sort key or search engine |
| Export all rows | Batch keyset job, not one HTTP response |
| GraphQL “give me everything” | Forbidden at scale — paginate |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Pick stable sort (usually `created_at DESC` + id).  
2. Choose cursor fields; encode safely (base64url JSON or ISO+uuid).  
3. Define max limit and empty cursor = first page.

### Implement

1. Repository method: optional cursor args.  
2. Controller validates query params.  
3. Migration index if EXPLAIN shows sort/seq scan.

### Verify

1. Walk entire list via cursors — no duplicates, no gaps under static data.  
2. Load test page 1 vs deep offset — keyset flat latency.  
3. Insert row while paginating — document acceptable behavior.

---

## 7. Worked example A — this project

### Current state (learning scale)

`TaskRepository.listByProjectId` in `backend/src/modules/tasks/task.repository.ts`:

```ts
FROM tasks
WHERE project_id = ${projectId}
ORDER BY created_at DESC
```

Returns **all** tasks — acceptable for demos; **not** production-safe unbounded.

Project member/task listing similarly returns full sets.

### How you would extend (faithful pattern)

**Repository sketch:**

```ts
public async listByProjectIdPage(
  projectId: string,
  limit: number,
  cursor?: { createdAt: Date; id: string },
): Promise<{ tasks: Task[]; nextCursor: typeof cursor | null }> {
  const rows = cursor
    ? await this.sql`
        SELECT … FROM tasks
        WHERE project_id = ${projectId}
          AND (created_at, id) < (${cursor.createdAt}, ${cursor.id})
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit}
      `
    : await this.sql`
        SELECT … FROM tasks
        WHERE project_id = ${projectId}
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit}
      `;
  const tasks = rows.map(this.map);
  const last = tasks.at(-1);
  const nextCursor =
    tasks.length === limit && last
      ? { createdAt: last.createdAt, id: last.id }
      : null;
  return { tasks, nextCursor };
}
```

**API:** `GET /projects/:id/tasks?limit=20&cursor=...`

**Index:** `(project_id, created_at DESC, id DESC)` — see [indexing](./indexing.md).

---

## 8. Worked example B — mini scenario (self-contained)

**Feed:** `posts` ordered by `(published_at DESC, id DESC)`.

```sql
CREATE INDEX posts_feed_idx ON posts (published_at DESC, id DESC);

-- page 1
SELECT id, title FROM posts
ORDER BY published_at DESC, id DESC
LIMIT 10;

-- page 2 (cursor from last row)
SELECT id, title FROM posts
WHERE (published_at, id) < ('2026-03-01T12:00:00Z'::timestamptz, 'uuid-last')
ORDER BY published_at DESC, id DESC
LIMIT 10;
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| `limit=1000000` | OOM, timeout |
| Offset page 5000 on tasks | Slow; DB skips millions of rows |
| Cursor only `created_at` | Duplicate timestamps → skipped/duplicate rows |
| No index on sort key | Each page sorts whole project’s tasks |
| Client caches offset pages forever | Stale UI after deletes |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| List timeout | Unbounded query | Row count, EXPLAIN | Pagination + index |
| Duplicate items in UI | Offset + concurrent inserts | Pagination mode | Switch to keyset |
| Missing items | Cursor typo / wrong sort | Decode cursor, ORDER BY | Tie-break id; test |
| Slow “next page” | Deep offset | Query uses OFFSET | Keyset |
| Empty page 2 | Cursor direction wrong | Comparator `<` vs `>` | Match ORDER BY direction |

---

## 11. Interview Q&A (with strong answers)

**Q: Offset vs cursor pagination?**  
**A:** Offset is simple but slow for deep pages and unstable under writes. Keyset uses last seen sort keys — stable and index-friendly for feeds.

**Q: Why is deep OFFSET slow?**  
**A:** Database must still traverse and discard all skipped rows to find the page start.

**Q: Stable cursors with updates/deletes?**  
**A:** Keyset avoids re-numbering issues of offset; deleted rows may disappear from future pages — usually acceptable. Use tombstones or `updated_at` filters if product requires otherwise.

**Q: What does this app do today?**  
**A:** Full list returns in `TaskRepository.listByProjectId` — pagination is the natural next production hardening step with keyset on `(project_id, created_at, id)`.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Keyset pagination | Cursor based on sort column values |
| Offset pagination | LIMIT/OFFSET skip N rows |
| Cursor | Opaque or structured bookmark for next page |
| Tie-breaker | Secondary sort key (id) for uniqueness |
| Stable sort | Deterministic ordering across pages |

---

## 13. Teach pointer

> “If a list can grow without bound, pagination is not optional — it’s a reliability feature.”

---

## 14. Optional further reading (not required)

- Indexes for list queries: [indexing](./indexing.md)  
- API query design: [../api/pagination-filtering.md](../api/pagination-filtering.md)
