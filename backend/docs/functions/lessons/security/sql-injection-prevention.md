# Lesson: SQL injection prevention

**Standalone ✓** — You do not need any other doc to write safe SQL in Node/Postgres and spot injection footguns.

**After this file you can:** explain injection mechanics, use parameterized queries (postgres.js tagged templates), avoid dynamic SQL mistakes, review repositories, and debug suspicious query logs.

---

## 1. First principles

**SQL injection** is when attacker-controlled text is **concatenated** into SQL and interpreted as code (`' OR 1=1 --`), not as data.

**Fix:** **Parameterization** — send SQL structure and values separately so user input is always bound as a literal.

**Problem it removes:** Full database read/write bypass via a search box or JSON field.

---

## 2. Mental model

### Analogy

A form with separate boxes for “command” and “value.” Injection mixes them so the value box contains instructions. Parameterization locks the command template; values only fill slots.

### Diagram

```text
UNSAFE:
  "SELECT * FROM users WHERE email = '" + input + "'"

SAFE (postgres.js):
  sql`SELECT * FROM users WHERE email = ${input}`
       └── driver binds input as parameter, not SQL text
```

---

## 3. Core rules (must / must-not)

1. **MUST** use parameterized queries for all dynamic values.  
2. **MUST** use tagged template `sql`/`tx` from postgres.js in repositories.  
3. **MUST NOT** build SQL with string concatenation from user input.  
4. **MUST** whitelist dynamic **identifiers** (column/table names) — separate from values.  
5. **MUST NOT** trust ORM/raw escape alone without binding.  
6. **SHOULD** keep SQL in repositories, not scattered in controllers.

---

## 4. How it works (mechanics)

### postgres.js

```ts
await this.sql`SELECT * FROM users WHERE email = ${email}`;
```

Each `${}` becomes a bound parameter.

### Transactions

Same rule inside `tx`:

```ts
await tx`INSERT INTO tasks (...) VALUES (${title}, ...)`;
```

### Dynamic ORDER BY

Never:

```ts
`ORDER BY ${req.query.sort}` // injection
```

Use map:

```ts
const sort = sortWhitelist[req.query.sort] ?? "created_at";
await sql`SELECT ... ORDER BY ${sql(sort)}`; // only if library supports safe identifier helper — or fixed enum in SQL text
```

This repo mostly uses fixed queries.

---

## 5. When to use / when not to use

| Parameterized sql`` | String concat |
|---------------------|---------------|
| All user-derived values | Never for values |
| Fixed migrations | Migrations (controlled files) |

| ORM query builder | Raw SQL |
|-------------------|---------|
| Also safe when binding | Fine with parameters |

---

## 6. Step-by-step: design → implement → verify

1. Repository methods accept typed params.  
2. Write SQL only as tagged templates.  
3. Code review grep for `` `SELECT `` + `+`.  
4. Integration tests with malicious strings (`'; DROP--`) — should fail safely as bad data, not execute.

---

## 7. Worked example A — this project

Repositories under `backend/src/modules/**/**.repository.ts` use `sql` from `backend/src/db/client.ts`.

Typical pattern (conceptual):

```ts
async findByEmail(email: string) {
  const rows = await this.sql`
    SELECT id, email, hash_password, status, role, name, created_at
    FROM users
    WHERE email = ${email}
    LIMIT 1
  `;
  return rows[0] ?? null;
}
```

**Why:** Email string never breaks out of string literal context.

Auth service passes **validated** email from Zod — defense in depth, not a substitute for binding.

**Where:** `backend/src/modules/auth/auth.repository.ts` (same pattern across project/task repos).

Controllers parse with Zod first (`auth.schema.ts`), then services, then repos — validation + parameterization.

---

## 8. Worked example B — mini scenario (self-contained)

**Search filter**

```ts
const q = input.q; // user text
await sql`
  SELECT id, title FROM tasks
  WHERE project_id = ${projectId}
    AND title ILIKE ${"%" + q + "%"}
`;
```

`%` wrapping is still a **single bound parameter value**, not SQL structure.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Result |
|--------------|--------|
| `"WHERE id = " + id` | Classic injection |
| `$queryRawUnsafe` with interpolation | Same |
| Second-order injection in stored proc | Rare but real |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Syntax error on search | Broken concat | Repository SQL | Parameterize |
| Full table returned | Injection succeeded | Emergency audit | Fix query; rotate creds |
| Works in ORM, fails raw | Mixed styles | Grep `+` in SQL strings | Standardize repos |

---

## 11. Interview Q&A (with strong answers)

**Q: How do you prevent SQL injection in Node?**  
**A:** Use parameterized queries / prepared statements; never concatenate user input into SQL; whitelist dynamic identifiers.

**Q: Is escaping enough?**  
**A:** No — easy to get wrong; binding is the standard fix.

**Q: Does Zod validation prevent injection?**  
**A:** It reduces bad shapes but is not a SQL defense; parameterization is.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| SQL injection | Executing attacker SQL via input |
| Parameter binding | Value sent separate from query plan |
| Tagged template | `` sql`...${v}` `` postgres.js API |
| Second-order injection | Payload stored then executed later |

---

## 13. Teach pointer

> “User input is always data, never syntax — bind it.”

---

## 14. Optional further reading (not required)

- Validation: [../api/validation-boundary.md](../api/validation-boundary.md)  
- DB client: `backend/src/db/client.ts`
