# Lesson: Prepared statements

**Standalone ✓** — You do not need any other doc to understand parameterized queries, plan caching, and how postgres.js handles them in this stack.

**After this file you can:** explain SQL injection defense via parameters, contrast prepared vs ad-hoc SQL, know pooling interactions, and answer interview questions.

---

## 1. First principles

A **prepared statement** is SQL sent to the database **once** with placeholders; executions only send **parameter values**. The parser/planner can cache work for repeated shapes.

**Why it exists:** Safety (no string concatenation of user input) and efficiency for hot repeated queries.

**The problem it solves:** “Run the same query shape many times with different values — safely and efficiently.”

---

## 2. Mental model

### Analogy

A **form letter** with blanks (`$1`, `$2`) — you print the template once, fill names each time. You don’t rewrite the whole letter from scratch per recipient.

### Diagram

```text
App                           Postgres
───                           ────────
PREPARE sel AS SELECT … WHERE email = $1
EXECUTE sel('a@x.com')  ──►  plan cache (optional)
EXECUTE sel('b@y.com')  ──►  bind new values only
```

---

## 3. Core rules (must / must-not)

1. **MUST** pass user input only as **parameters**, never interpolate into SQL strings.  
2. **MUST** use tagged templates (`sql`…``) or explicit placeholders in this codebase.  
3. **MUST NOT** build `WHERE id = '${userId}'` from request strings.  
4. **MUST NOT** use `unsafe()` for user-controlled fragments except migrations with no user input.  
5. **MUST** understand poolers in **transaction mode** may disable session-scoped prepared plans — still safe, may replan.

---

## 4. How it works (mechanics)

### postgres.js tagged templates

```ts
await sql`SELECT * FROM users WHERE email = ${email}`;
```

Driver sends parameterized query; `${email}` is not string-concatenated into SQL text on the wire.

### Plan cache

Postgres may genericize plans for prepared statements. Very different data distributions can cause generic vs custom plan tradeoffs — usually fine for OLTP equality lookups.

### `unsafe()` in migrations

`migrate.ts` uses `transaction.unsafe(migrationSql)` for whole migration files — static SQL only, no user parameters.

### ORMs

Often generate parameterized SQL automatically; raw SQL repos (this app) rely on `postgres` tagging.

---

## 5. When to use / when not to use

| Situation | Approach |
|-----------|----------|
| All repository queries | Tagged template parameters |
| Dynamic column names from user | Allowlist columns in app code — never raw inject |
| One-off migration DDL | `unsafe` static file OK |
| Dynamic IN lists | Driver expansion or `= ANY($1::uuid[])` |
| Literals for enums in dev only | Still prefer parameters |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Write SQL with `$n` placeholders mentally.  
2. Identify all external inputs → parameters.  
3. Dynamic identifiers → whitelist map.

### Implement

1. Repository methods use `` db`...${var}...` ``.  
2. Pass `Sql | TransactionSql` through transactions unchanged.

### Verify

1. Security review: no string SQL concat from req.body.  
2. Logged queries show parameters separate (if logging enabled).

---

## 7. Worked example A — this project

### Auth lookup

`auth.repository.ts` pattern:

```ts
await db`
  SELECT id, name, email, …
  FROM users
  WHERE email = ${email}
  LIMIT 1
`;
```

Email from HTTP body → bound parameter → immune to classic `' OR 1=1 --` injection in the email field.

### Task insert

`task.repository.ts` INSERT lists columns with `${input.title}`, `${input.projectId}`, etc. — all values parameterized.

### Migration runner

`backend/src/db/migrate.ts`:

```ts
await transaction.unsafe(migrationSql);
```

File content is developer-authored, not user input.

---

## 8. Worked example B — mini scenario (self-contained)

**Wrong:**

```ts
const q = `SELECT * FROM users WHERE email = '${req.body.email}'`;
await sql.unsafe(q);
```

**Right:**

```ts
await sql`SELECT * FROM users WHERE email = ${req.body.email}`;
```

**Dynamic sort (allowlist):**

```ts
const sort = { created_at: "created_at", title: "title" }[req.query.sort] ?? "created_at";
// still cannot parameterize identifier — use map to fixed SQL fragments only
await sql`SELECT * FROM tasks ORDER BY ${sql(sort)}`; // if driver supports safe identifier helper
```

In this repo, prefer fixed ORDER BY in code paths.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| String concat SQL | SQL injection |
| `unsafe` with user filter | Injection |
| Copy-paste literals for IDs in prod scripts | Typo + no plan reuse |
| Millions of unique SQL strings | Plan cache bloat |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Syntax error near `$1` | Wrong placeholder count | Query vs params | Match placeholders |
| Injection reported | Concat SQL | Code search `` `SELECT` + `` | Use tagged template |
| Slow after pooler | Transaction pooling + named prepares | PgBouncer mode | Session pool or disable named prepares |
| Type error on array param | Wrong PG type cast | `::uuid[]` | Cast explicitly |

---

## 11. Interview Q&A (with strong answers)

**Q: How do prepared statements prevent SQL injection?**  
**A:** User data is sent as bound values, not parsed as SQL syntax, so malicious input cannot alter query structure.

**Q: JSON vs JSONB?** (if conflated in interviews about binding)  
**A:** Separate topic — binding works for both as parameters.

**Q: postgres.js vs manual PREPARE?**  
**A:** Driver handles parameterization and protocol details; you write tagged templates.

**Q: Does this project use parameterized queries?**  
**A:** Yes — repositories use `` sql`…${}` `` throughout modules under `backend/src/modules/`.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Placeholder | `$1`, `$2` bind slots |
| Tagged template | `` sql`…` `` API |
| Plan cache | Reuse of query plans |
| SQL injection | Attacker alters query via input |
| unsafe | Execute raw string (non-parameterized) |

---

## 13. Teach pointer

> “If it came from the user, it is a parameter — never part of the SQL sentence.”

---

## 14. Optional further reading (not required)

- Pooling modes: [connection-pooling](./connection-pooling.md)  
- Input validation boundary: [../api/validation-boundary.md](../api/validation-boundary.md)
