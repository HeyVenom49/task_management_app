# Lesson: Full-text search (Postgres)

**Standalone ✓** — You do not need any other doc to implement basic FTS with `tsvector`, GIN indexes, and rank queries.

**After this file you can:** explain FTS vs `LIKE`, build search vectors, query with `@@`, choose index strategy, and answer interview questions.

---

## 1. First principles

**Full-text search (FTS)** tokenizes text into **lexemes** (stemmed words), indexes them, and matches queries by relevance — not byte-by-byte `LIKE '%foo%'`.

**Why it exists:** User-facing search on titles/descriptions needs speed and linguistic matching (stemming, stop words) at scale.

**The problem it solves:** “Find rows whose text meaning matches a query without scanning every row with leading-wildcard LIKE.”

---

## 2. Mental model

### Analogy

FTS is a **book index** at the back — terms point to pages. `LIKE '%term%'` is reading every page aloud.

### Diagram

```text
task.title + task.description
        │
        ▼ to_tsvector('english', …)
   tsvector 'develop':1 'task':2 …
        │
        ▼ GIN index
   query: to_tsquery('develop & api') @@ search_vector
```

---

## 3. Core rules (must / must-not)

1. **MUST** use **`tsvector` + GIN** (or GiST) for production search columns.  
2. **MUST** keep search vector **updated** (generated column, trigger, or app write).  
3. **MUST NOT** use `%leading` LIKE on large tables for search.  
4. **MUST** pick a **text search config** (`english`, etc.) consistently.  
5. **MUST** paginate search results.

---

## 4. How it works (mechanics)

### Building vector

```sql
to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))
```

### Query

```sql
to_tsquery('english', 'payment & fail')
-- or plainto_tsquery for user input
WHERE search_vector @@ plainto_tsquery('english', $q)
ORDER BY ts_rank(search_vector, plainto_tsquery('english', $q)) DESC
```

### Index

```sql
CREATE INDEX tasks_search_idx ON tasks USING GIN (search_vector);
```

### Generated column (PG 12+)

```sql
search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || coalesce(description,''))) STORED;
```

---

## 5. When to use / when not to use

| Situation | Approach |
|-----------|----------|
| Search task title/description | FTS |
| Exact email lookup | btree on email |
| Prefix autocomplete | `LIKE 'foo%'` or trigram `pg_trgm` |
| Heavy relevance/facets | Elasticsearch/OpenSearch optional |
| Small table <10k | ILIKE may suffice temporarily |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Fields in scope (title, description).  
2. Language config.  
3. API `?q=` + pagination.

### Implement

1. Migration add `search_vector` + GIN.  
2. Repository query with `plainto_tsquery`.  
3. Rank + limit.

### Verify

1. EXPLAIN shows Bitmap Index Scan on GIN.  
2. Injection-safe parameter binding for `$q`.

---

## 7. Worked example A — this project

### Current behavior

Tasks store `title TEXT`, `description TEXT` in `001_initial_schema.sql`. Listing is by `project_id` order `created_at` — **no FTS** implemented.

### Natural addition

```sql
-- migration sketch
ALTER TABLE tasks ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', title || ' ' || coalesce(description, ''))
  ) STORED;
CREATE INDEX idx_tasks_search ON tasks USING GIN (search_vector);
```

Repository method in `backend/src/modules/tasks/task.repository.ts`:

```ts
const rows = await this.sql`
  SELECT … FROM tasks
  WHERE project_id = ${projectId}
    AND search_vector @@ plainto_tsquery('english', ${query})
  ORDER BY ts_rank(search_vector, plainto_tsquery('english', ${query})) DESC
  LIMIT ${limit}
`;
```

Pair with keyset pagination from [pagination](./pagination.md) if result sets grow.

---

## 8. Worked example B — mini scenario (self-contained)

```sql
CREATE TABLE articles (
  id serial PRIMARY KEY,
  body text,
  fts tsvector GENERATED ALWAYS AS (to_tsvector('english', body)) STORED
);
CREATE INDEX ON articles USING GIN (fts);

SELECT id FROM articles
WHERE fts @@ plainto_tsquery('english', 'database indexing');
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| `WHERE description ILIKE '%' || q || '%'` | Seq scan |
| No index on tsvector | Slow |
| User raw string in to_tsquery | Syntax errors — use plainto_tsquery |
| Stale vector if manual | Missing updates |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| No results expected | Stemming/config | Try plainto_tsquery | Adjust config |
| Slow search | Seq scan | EXPLAIN | GIN index |
| Rank odd | Short docs | ts_rank_cd | Tune weights |
| Special chars break | to_tsquery | Input helper | plainto_tsquery |

---

## 11. Interview Q&A (with strong answers)

**Q: FTS vs LIKE?**  
**A:** FTS tokenizes and indexes lexemes for linguistic match and speed; LIKE scans patterns, bad with leading wildcards at scale.

**Q: tsvector vs tsquery?**  
**A:** tsvector is indexed document terms; tsquery is search expression matched with `@@`.

**Q: This app search today?**  
**A:** Filter lists by project, not full-text; FTS would be added via generated column + GIN on tasks.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| tsvector | Indexed lexeme set |
| tsquery | Search expression |
| GIN | Index type for FTS |
| Stemming | Reduce words to root form |
| ts_rank | Relevance score |

---

## 13. Teach pointer

> “Search users type words, not SQL patterns — index words, not substring scans.”

---

## 14. Optional further reading (not required)

- Indexing: [indexing](./indexing.md)  
- Pagination: [pagination](./pagination.md)
