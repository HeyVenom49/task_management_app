# Lesson: N+1 query problem

**Standalone ✓** — You do not need any other doc to spot, fix, and prevent N+1 database access patterns in API code.

**After this file you can:** define N+1, recognize it in services/repositories, fix with JOIN/batch IN, measure query count, and answer interview questions.

---

## 1. First principles

**N+1** means: **1 query** loads a collection of N parent rows, then **N additional queries** load related data **one row at a time** (often in a loop).

**Why it matters:** Latency becomes `N × round-trip time`. At N=200 tasks, you pay 201 DB round trips per HTTP request.

**The problem it solves (once fixed):** “Load a graph of related data with O(1) or O(k) queries, not O(N).”

---

## 2. Mental model

### Analogy

Teacher asks for **one class roster** (1 query), then calls each student to the office **individually** to read their grade (N queries). Better: print **one grades sheet** for the whole class.

### Diagram

```text
Bad:
  SELECT * FROM tasks WHERE project_id = P     ──► 100 rows
  for each task:
    SELECT * FROM members WHERE id = assignee  ──► 100 queries

Good:
  SELECT t.*, m.name FROM tasks t
  LEFT JOIN members m ON m.id = t.assignee_member_id
  WHERE t.project_id = P                       ──► 1 query
```

---

## 3. Core rules (must / must-not)

1. **MUST** count queries per endpoint in tests or logging when adding list+expand features.  
2. **MUST** batch related loads: `WHERE id = ANY($1::uuid[])` or JOIN.  
3. **MUST NOT** call repository `findById` inside a loop over list results without batching.  
4. **MUST NOT** hide N+1 inside ORM lazy loading without awareness.  
5. **MUST** paginate large lists so even batched queries stay bounded.

---

## 4. How it works (mechanics)

### Detection

- Log `query` count middleware in dev  
- Integration test: spy on `sql` call count  
- APM trace: repeated identical query shape

### Fixes

| Pattern | When |
|---------|------|
| JOIN | Fixed relation on list view |
| IN / ANY batch | Need map id → entity after list |
| DataLoader | GraphQL-style per-request batching cache |
| Denormalize | Read-heavy display fields (careful) |

### N+1 vs legitimate N

Sometimes N statements are **intentional** (bulk independent updates) — different from accidental read amplification.

---

## 5. When to use / when not to use

| Situation | Approach |
|-----------|----------|
| List tasks + assignee display name | JOIN or batch members |
| Single task detail | 2–3 queries OK |
| List 10k rows each with child | Paginate + batch per page |
| Report across tables | One SQL or warehouse |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Sketch API response shape.  
2. List entities and relations.  
3. Plan query count target (e.g. ≤ 3 per request).

### Implement

1. Add repository method returning joined rows or batch helper.  
2. Map to DTO in service once.

### Verify

1. Assert query count in test.  
2. Load test list endpoint — flat latency vs N.

---

## 7. Worked example A — this project

### Current list endpoints (low N today)

`TaskRepository.listByProjectId` — **one query** returns all tasks for a project. No per-task loop in repository.

If a future controller added:

```ts
for (const task of tasks) {
  assignee = await memberRepo.findById(task.assigneeMemberId);
}
```

that would be classic N+1 when returning assignee details for each task.

### Safer extension in this codebase

**Batch:**

```ts
const ids = [...new Set(tasks.map(t => t.assigneeMemberId).filter(Boolean))];
const members = await sql`
  SELECT id, user_id, project_id, role, status
  FROM members
  WHERE id = ANY(${ids}::uuid[])
`;
const byId = new Map(members.map(m => [m.id, m]));
```

**Or JOIN** in `listByProjectId` when API always needs assignee.

### Project + members

If listing projects then loading each project’s member count in a loop — same anti-pattern. Prefer `SELECT project_id, count(*) FROM members GROUP BY project_id`.

---

## 8. Worked example B — mini scenario (self-contained)

**API:** `/authors` returns 50 authors with book titles.

**N+1:**

```ts
const authors = await sql`SELECT * FROM authors LIMIT 50`;
for (const a of authors) {
  a.books = await sql`SELECT title FROM books WHERE author_id = ${a.id}`;
}
```

**Fix:**

```ts
const authors = await sql`SELECT * FROM authors LIMIT 50`;
const ids = authors.map(a => a.id);
const books = await sql`
  SELECT author_id, title FROM books WHERE author_id = ANY(${ids}::int[])
`;
// group books by author_id in memory
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Lazy load in loop | N+1 |
| GraphQL resolvers without DataLoader | N+1 per field |
| “It’s fine, DB is local” | Fails in prod latency |
| Giant JOIN without pagination | Huge row payload |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| List endpoint slow, DB CPU low | Round-trip bound N+1 | Query log count | Batch/JOIN |
| Same query 100× in trace | Loop fetch | Stack trace | Batch |
| Memory spike | Huge JOIN cartesian | JOIN keys | Fix relation or paginate |
| ORM “magic” slow | Lazy loading | ORM debug log | Eager fetch |

---

## 11. Interview Q&A (with strong answers)

**Q: What is N+1?**  
**A:** One query for a list plus one query per row for related data — total 1+N queries.

**Q: How fix?**  
**A:** JOIN, batch IN/ANY, or DataLoader pattern; paginate lists.

**Q: JOIN vs batch?**  
**A:** JOIN when you always need columns together; batch when optional expansion or heterogeneous relations.

**Q: This task app risk?**  
**A:** Today’s task list is single-query; N+1 appears if enrich loops call `memberRepo.findById` per task without batching.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| N+1 | One list query + N per-row queries |
| Eager load | Fetch relations upfront |
| DataLoader | Batch + cache per request |
| Round trip | Client ↔ DB latency per query |
| Cartesian product | JOIN row explosion |

---

## 13. Teach pointer

> “One HTTP request should not mean hundreds of identical SQL trips.”

---

## 14. Optional further reading (not required)

- Pagination: [pagination](./pagination.md)  
- Indexes for JOINs: [indexing](./indexing.md)
