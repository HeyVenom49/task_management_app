# Lesson: JSONB / document fields in SQL

**Standalone ✓** — You do not need any other doc to decide when JSONB fits in Postgres, index it, and query it safely.

**After this file you can:** contrast JSON vs JSONB, model flexible attributes, use GIN indexes, avoid JSONB anti-patterns, and answer interview questions.

---

## 1. First principles

**JSONB** is Postgres’s **binary JSON** type — parsed on insert, efficient to query with operators (`->`, `->>`, `@>`, `?`).

**Why it exists:** Some attributes evolve quickly or vary per row (metadata, plugin config) without a migration per key.

**The problem it solves:** “Store semi-structured data with SQL queries and optional indexing — without a NoSQL second database.”

---

## 2. Mental model

### Analogy

JSONB is a **labeled drawer** inside each row — good for misc items; keep daily essentials in labeled columns upfront.

### Diagram

```text
Row: tasks
  title TEXT          ◄── hot filter/sort → column + btree index
  custom JSONB        ◄── rare filters → GIN index on keys you query
```

---

## 3. Core rules (must / must-not)

1. **MUST** put **frequently filtered/sorted/joined** fields in real columns with constraints.  
2. **MUST** validate JSON shape at API boundary (schema/zod).  
3. **MUST** index only JSON paths you query (`jsonb_path_ops` GIN).  
4. **MUST NOT** store FK targets only inside JSON without integrity plan.  
5. **MUST NOT** replace normalized core model with one JSON blob.

---

## 4. How it works (mechanics)

### JSON vs JSONB

| | JSON | JSONB |
|---|------|-------|
| Storage | text-preserving | decomposed binary |
| Index | limited | GIN supported |
| Use | audit exact text | app queries |

### Operators

- `data->'key'` → json  
- `data->>'key'` → text  
- `data @> '{"a":1}'` → containment  
- `data ? 'key'` → key exists

### Index

```sql
CREATE INDEX tasks_custom_gin ON tasks USING GIN (custom jsonb_path_ops);
```

### Defaults

`DEFAULT '{}'::jsonb` avoids NULL handling sprawl.

---

## 5. When to use / when not to use

| Situation | JSONB? |
|-----------|--------|
| User preferences, UI flags | Yes |
| Task title, status, assignee FK | **Columns** (this app) |
| Vendor webhook payload archive | Yes (or separate table) |
| Full-text search on body | TEXT + FTS, not JSONB |
| Analytics on one key | Promote key to column |

---

## 6. Step-by-step: design → implement → verify

### Design

1. List query patterns — any need JSON?  
2. Define JSON schema version field inside document.  
3. Plan migration to column if key becomes hot.

### Implement

1. Migration `ADD COLUMN meta JSONB NOT NULL DEFAULT '{}'`.  
2. Repository reads/writes object; validate in service.  
3. GIN if filtering on keys.

### Verify

1. EXPLAIN on `@>` queries uses GIN.  
2. Invalid shapes rejected at API.

---

## 7. Worked example A — this project

### Current schema

Core entities (`users`, `projects`, `members`, `tasks`) use **normalized columns** and enums — no JSONB columns in `001_initial_schema.sql`.

**Why appropriate:** Task status, assignee FK, priorities are queried on every list — belong in typed columns with indexes and triggers (`010_member_assignee_invariants.sql`).

### Hypothetical extension

Per-task **custom fields** for integrations:

```sql
-- future migration sketch
ALTER TABLE tasks ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}';
CREATE INDEX tasks_metadata_gin ON tasks USING GIN (metadata jsonb_path_ops);
```

Service validates `metadata` keys against allowlist before insert in `task.repository.ts` pattern.

---

## 8. Worked example B — mini scenario (self-contained)

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL
);

INSERT INTO events (kind, payload)
VALUES ('task.updated', '{"taskId":"…","fields":["status"]}');

SELECT id FROM events
WHERE payload @> '{"taskId":"abc"}';
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| All data in JSONB | No FK, slow reports |
| Unindexed `@>` on huge table | Seq scan |
| Trust client JSON shape | Injection of huge docs / wrong types |
| Duplicate column + JSON same field | Drift |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Slow JSON filter | No GIN | EXPLAIN | Add GIN on path |
| Wrong types in JSON | No validation | API logs | Zod/schema |
| Disk bloat | Huge payloads | Row size | Limit size; external object store |
| Migration pain | Hot key in JSON | Query freq | Promote to column |

---

## 11. Interview Q&A (with strong answers)

**Q: JSON vs JSONB in Postgres?**  
**A:** JSON stores exact text; JSONB is parsed binary format optimized for indexing and operators.

**Q: When not to use JSONB?**  
**A:** When fields need FK integrity, frequent joins, or strict reporting — use columns.

**Q: Does this task app use JSONB?**  
**A:** Not in current migrations — normalized schema for tasks/members; JSONB would suit optional metadata extensions.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| JSONB | Binary JSON in Postgres |
| GIN | Generalized inverted index |
| Containment `@>` | JSONB contains object |
| jsonb_path_ops | GIN operator class |
| Semi-structured | Flexible schema per row |

---

## 13. Teach pointer

> “JSONB for flexible edges; columns for the laws and the indexes you query every time.”

---

## 14. Optional further reading (not required)

- Indexing: [indexing](./indexing.md)  
- Validation: [../api/validation-boundary.md](../api/validation-boundary.md)
