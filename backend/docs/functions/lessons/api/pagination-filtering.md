# Lesson: Pagination and filtering

**Standalone ✓** — You do not need any other doc to design list endpoints with stable paging and safe filters.

**After this file you can:** choose offset vs cursor pagination, validate query params at the boundary, avoid unbounded list queries, and extend this project’s list endpoints consistently.

---

## 1. First principles

**List endpoints** return subsets of large collections. Without **pagination**, a project with 50,000 tasks returns a huge JSON blob — slow, memory-heavy, and unfair to other users.

**Filtering** narrows which rows match (status, assignee, search). **Sorting** orders them. Both must be **validated** like body input — query strings are untrusted.

**The problem it solves:** Predictable performance and stable client UX when collections grow.

---

## 2. Mental model

### Analogy

Book index: read **page 3 of 20** (offset/limit) or “continue from bookmark on page 117” (cursor) — not the entire encyclopedia in one gulp.

### Diagram

```text
GET /projects/:id/tasks?status=IN_PROGRESS&limit=20&cursor=eyJ...
        │
        ▼
Zod query schema ──► service ──► SQL WHERE + ORDER + LIMIT
        │
        ▼
{ items: [...], nextCursor: "..." }   or   { items, page, total }
```

---

## 3. Core rules (must / must-not)

1. **MUST** cap **`limit`** with a server maximum (e.g. 100).  
2. **MUST** validate enums in query (status, priority) — reject unknown values with **400**.  
3. **MUST NOT** expose unbounded `SELECT *` on user-facing lists.  
4. **SHOULD** prefer **cursor pagination** for large, frequently appended lists (tasks).  
5. **MAY** use **offset** for small admin tables with stable counts.  
6. **MUST** use **indexed columns** for filter/sort fields — or queries degrade ([indexing lesson optional]).  
7. **MUST NOT** pass raw query strings into SQL — parameterized queries only.

---

## 4. How it works (mechanics)

### Offset pagination

```sql
SELECT * FROM tasks
WHERE project_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;
```

**Pros:** Jump to page N. **Cons:** Slow on large offsets; duplicates/skips if rows inserted during paging.

### Cursor pagination

Encode last seen `(created_at, id)` tuple; next page:

```sql
WHERE (created_at, id) < ($cursorTime, $cursorId)
ORDER BY created_at DESC, id DESC
LIMIT $limit;
```

**Pros:** Stable under inserts. **Cons:** No random page jump without scanning.

### Filtering

Map allowed filters explicitly:

```ts
const listTasksQuery = z.object({
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", ...]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
```

---

## 5. When to use / when not to use

| Situation | Pattern |
|-----------|---------|
| Task list in busy project | Cursor + filters |
| Project list for one user (small) | Offset OK initially |
| Export all rows | Separate job/stream, not one GET |
| Full-text search | Dedicated search index / `tsvector` |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Default sort (e.g. `updated_at DESC`).  
2. Max page size.  
3. Filter set aligned with UI.  
4. Response shape: items + pagination metadata.

### Implement

1. Add `listQuerySchema` in `*.schema.ts`.  
2. Controller: `safeParse(req.query)`.  
3. Repository: build WHERE from allowed filters only.  
4. Index `(project_id, updated_at)` or similar.

### Verify

1. `limit=1000` → clamped or 400.  
2. Invalid enum → 400.  
3. Load test list with 100k rows — cursor stays fast.

---

## 7. Worked example A — this project

**Current state:** `GET /api/v1/projects/:id/tasks` lists tasks for a project with **membership authz** in the service — collection is **scoped** by nested URL (`task.routes.ts` + `TaskService.list`).

**Boundary pattern to extend** (not yet full cursor in all handlers — add when scaling):

```ts
// task.controller.ts (pattern)
const parsed = listTasksQuerySchema.safeParse(req.query);
if (!parsed.success) {
  res.status(400).json({
    message: "Validation failed",
    errors: parsed.error.flatten().fieldErrors,
  });
  return;
}
const result = await this.service.list(projectId, userId, parsed.data);
res.status(200).json(result);
```

**Why nested URL matters for lists:** `projectId` from `req.params.id` (with `mergeParams`) ensures list queries always include `WHERE project_id = $1` — filters cannot escape to other tenants.

**Project list:** `GET /api/v1/projects` returns projects for authenticated user — natural filter `WHERE user is member` in repository, not client-supplied `userId`.

---

## 8. Worked example B — mini scenario (self-contained)

```ts
const query = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

// SQL
const offset = (page - 1) * pageSize;
```

Response:

```json
{
  "items": [ ... ],
  "page": 2,
  "pageSize": 20,
  "hasMore": true
}
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| No limit | OOM / timeout |
| Client sends raw SQL sort `?sort=;drop` | Injection if concatenated |
| Offset page 5000 on huge table | Full scan |
| Filter by unindexed column | Slow lists |
| Return `totalCount` every request | Expensive `COUNT(*)` |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Duplicate rows across pages | Offset + inserts | Pagination mode | Switch to cursor |
| Slow list API | Missing index | EXPLAIN | Add composite index |
| 400 on valid filter | Enum drift | Schema vs DB | Sync enums |
| Empty list wrong project | Params | `mergeParams` | Fix router |

---

## 11. Interview Q&A (with strong answers)

**Q: Cursor vs offset?**  
**A:** Offset is simple but degrades and can skip/duplicate under churn. Cursor uses an opaque bookmark — stable for feeds and task lists.

**Q: Where validate query params?**  
**A:** Same HTTP boundary as body — Zod on `req.query` with coercion for numbers.

**Q: How prevent filter injection?**  
**A:** Allowlist fields and operators; never interpolate user input into SQL fragments.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Cursor | Opaque token marking position in sorted stream |
| Offset | Number of rows to skip |
| Allowlist | Explicit set of permitted filter fields |
| `z.coerce.number()` | Parse query string digits to number |

---

## 13. Teach pointer

> “Lists are queries — cap them, index them, and validate every knob the client can turn.”

---

## 14. Optional further reading (not required)

- DB pagination: [../database/pagination.md](../database/pagination.md)  
- Indexing: [../database/indexing.md](../database/indexing.md)
