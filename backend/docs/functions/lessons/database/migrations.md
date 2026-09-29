# Lesson: Database migrations

**Standalone ✓** — You do not need any other doc to version, apply, and safely evolve this app’s Postgres schema.

**After this file you can:** explain why migrations beat hand-editing prod, follow this repo’s migrate runner, add a new migration file correctly, plan expand/contract rollouts, and answer interview questions.

---

## 1. First principles

A **migration** is a **versioned, ordered** change to database schema (and sometimes data). Each file applies once; the database records which versions ran.

**Why it exists:** Schema is part of the product. Teams need reproducible environments (dev, CI, prod), auditable history, and coordinated deploys with application code. Editing production by hand breaks parity and loses rollback forensics.

**The problem it solves:** “Everyone and every environment applies the same schema evolution in the same order, exactly once.”

---

## 2. Mental model

### Analogy

Migrations are **Git commits for the database**: immutable history forward. You add new commits (files); you don’t rewrite old commits that already shipped.

### Diagram

```text
migrations/
  001_initial_schema.sql  ──► applied ──► schema_migrations.version = '001'
  002_....sql               ──► applied ──► '002'
  011_new_feature.sql       ──► pending ──► (next deploy runs this once)

migrate.ts:
  for each file in order:
    if version not in schema_migrations:
      BEGIN → run SQL file → INSERT version → COMMIT
```

---

## 3. Core rules (must / must-not)

1. **MUST** add **new** numbered files; never edit migrations already applied in shared environments.  
2. **MUST** encode invariants in DDL: FK, UNIQUE, CHECK, indexes — not only in app code.  
3. **MUST** run migrations in CI/deploy before or with code that depends on new schema.  
4. **MUST** wrap each file in a transaction when the runner supports it (this repo does).  
5. **MUST NOT** drop columns/tables in one step while old app versions still read them (use expand/contract).  
6. **MUST NOT** store secrets in migration SQL.

---

## 4. How it works (mechanics)

### Tracking table

This project creates `schema_migrations (version TEXT PRIMARY KEY, name TEXT, applied_at ...)`.

### File naming

Pattern `NNN_description.sql` — e.g. `010_member_assignee_invariants.sql`. Runner extracts `NNN` as version.

### Transaction per file

In `backend/src/db/migrate.ts`:

```ts
await sql.begin(async (transaction) => {
  await transaction.unsafe(migrationSql);
  await transaction`
    INSERT INTO schema_migrations (version, name)
    VALUES (${version}, ${file})
  `;
});
```

If any statement fails → rollback → version row not inserted → fix forward with a new migration or corrected file **only if never applied anywhere**.

### Expand / contract (zero-downtime pattern)

| Phase | Action |
|-------|--------|
| Expand | Add nullable column / new table |
| Deploy | App writes to both or new column |
| Backfill | Job fills data |
| Contract | Deploy app reading new only; drop old |

### Down migrations

This repo does **not** auto-run downs. Production teams often prefer forward-only fixes. Interview answer: downs are optional tooling; forward repair migrations are common.

---

## 5. When to use / when not to use

| Situation | Migration? |
|-----------|------------|
| New table, column, index, constraint | **Yes** — new `.sql` file |
| One-time prod hotfix | Prefer migration + deploy; emergency manual only with follow-up migration |
| Seed demo data in dev | Seed scripts or test fixtures — not always migrations |
| Rewriting history on main | **No** — add new file instead |
| Long data backfill | Separate job; migration may add column only |

---

## 6. Step-by-step: design → implement → verify

### Design

1. State invariant (“assignee must be ACTIVE member in same project”).  
2. Choose DDL: FK, CHECK, trigger — match Postgres capabilities.  
3. Plan deploy order: migration before code or feature-flagged code paths.

### Implement

1. Create `backend/src/db/migrations/0XX_descriptive_name.sql`.  
2. Include indexes for new FKs and list queries.  
3. Run locally: `bun`/`node` migrate entry (see `backend/src/db/migrate.ts`).

### Verify

1. Fresh DB: all files apply cleanly.  
2. Existing DB: only new file runs.  
3. App tests pass against new schema.  
4. Rollback test: forced failure mid-file leaves no partial version row (transaction).

---

## 7. Worked example A — this project

### A1. Runner behavior

**File:** `backend/src/db/migrate.ts`

- Ensures `schema_migrations` exists  
- Reads applied versions  
- Sorts `migrations/*.sql`  
- Skips applied  
- Applies each inside `sql.begin` + records version  
- Exits non-zero on failure; closes pool with `sql.end()`

**Server boot:** migrations typically run before listen (see project bootstrap docs).

### A2. Initial schema

`001_initial_schema.sql` — enums, `users`, `projects`, `members`, `tasks`, FKs including composite `(assignee_member_id, project_id) → members(id, project_id)`, indexes on `project_id`.

### A3. Invariant via trigger (migration 010)

`010_member_assignee_invariants.sql` adds triggers:

- Block deactivating member with open assigned tasks (`23514`)  
- Block open tasks with inactive assignee (`23514`)

App maps `23514` in `TaskService` / `ProjectService` to HTTP errors — migration enforces law under races.

---

## 8. Worked example B — mini scenario (self-contained)

**Feature:** Add `comments` on tasks.

```sql
-- 012_create_comments.sql
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_member_id UUID NOT NULL REFERENCES members(id),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX comments_task_created_idx ON comments (task_id, created_at DESC);
```

Deploy: run migration → deploy API that INSERTs into `comments`.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Edit `001_initial_schema.sql` after prod applied | Drift; new envs differ from prod |
| Manual `ALTER` on prod only | Staging/prod mismatch |
| Giant migration locks table for hours | Outage — batch or concurrent index |
| Migration depends on manual step not in file | CI fails; teammates broken |
| Drop column same deploy as code stop using it | Old pods crash |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Migrate exits 1 | SQL error in file | Stack trace, Postgres log | Fix SQL; re-run if tx rolled back |
| Version in table but schema wrong | Manual edit / partial apply outside runner | `schema_migrations`, `\d table` | Forward repair migration |
| App error `column does not exist` | Code deployed before migrate | Deploy order | Run migrate first |
| Duplicate version | Two files same prefix | Filenames | Rename to next number |
| Trigger fails in test | Order of migrations | Fresh migrate from empty | Fix trigger SQL |

---

## 11. Interview Q&A (with strong answers)

**Q: What is a database migration?**  
**A:** A versioned, ordered schema change script applied once per environment, tracked so state is reproducible.

**Q: Why one transaction per migration file?**  
**A:** Atomicity — either the whole file’s DDL applies and version is recorded, or nothing persists, avoiding half-applied schema.

**Q: Expand/contract?**  
**A:** Add new schema compatible with old code, deploy, backfill, then remove old schema after all code uses the new path — avoids downtime breaks.

**Q: Down migrations?**  
**A:** Optional; many teams use forward-only repair migrations because downs are untested and dangerous in prod.

**Q: How does this repo track migrations?**  
**A:** `schema_migrations` table + numbered SQL files in `backend/src/db/migrations/`, applied by `backend/src/db/migrate.ts` inside `sql.begin`.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| DDL | Data definition language (CREATE, ALTER, DROP) |
| Expand/contract | Safe multi-phase schema change |
| schema_migrations | Applied version ledger |
| Forward-only | Fix with new migration, not revert |
| Trigger | DB function on row change |
| SQLSTATE | Postgres error code (e.g. 23514) |

---

## 13. Teach pointer

> “Schema is product history. Migrations are the git log of the database.”

---

## 14. Optional further reading (not required)

- Constraints in DDL: [constraints-and-fk](./constraints-and-fk.md)  
- Transactions in runner: [transactions](./transactions.md)  
- Indexes in new tables: [indexing](./indexing.md)
