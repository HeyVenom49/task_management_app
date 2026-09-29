# Step 4 — Data model first

**Standalone ✓** — You do not need other how-to-think steps or lessons to *sketch tables, keys, constraints, and migrations* that encode this feature’s invariants.

**After this file you can:** choose entities and member-vs-user identity, design columns/FKs/UNIQUEs/CHECKs, plan soft-delete and cascade policy, name a migration file, plan repo `map(row)` + `tx`-capable methods, and defend the schema in an interview.

---

## 1. Why this step exists

Steps 01–03 named *who*, *laws*, and *HTTP*. The database is where laws become durable under concurrency and bugs.

If you skip this step you ship:

- code first, “add unique index later” → production duplicates  
- `users.id` where **member id** is the project-scoped identity (tasks use `creator_member_id` / `assignee_member_id` for a reason)  
- soft delete only in app memory with no status column  
- migrations edited after apply → drift across environments  
- repos that can’t accept `TransactionSql` when step 06 needs `sql.begin`  

**Artifact you leave with:** schema sketch + constraint list mapped to invariants + migration plan + repo method list.

---

## 2. Mental model

### Analogy

The schema is the **constitution**; services are the **police**. Police can be wrong or late; the constitution still blocks illegal states (`UNIQUE`, `FK`, triggers). If the invariant isn’t in the schema, it’s a hope — hopes fail under load.

### Where this sits

```text
01 brief → 02 invariants → 03 API
                              │
                              ▼
                    04 data model first  ← you are here
                              │
                              ▼
                    05 layers → 06 concurrency → 07 tests
```

### Inputs → outputs

| In | Out |
|----|-----|
| Invariants from 02 | Columns + constraints / triggers |
| API resources from 03 | Tables and FK parents |
| OCC / soft-delete needs | `updated_at`, status enums |
| Write paths | Repo methods with `db: Sql \| TransactionSql` |

---

## 3. Core rules (must / must-not)

1. **MUST** name the primary entity, its parent, and whether FKs point at `users.id` or `members.id`.  
2. **MUST** encode cross-request invariants with `UNIQUE` / `FK` / `CHECK` / triggers — not comments.  
3. **MUST** plan timestamps (`created_at`, `updated_at`) when OCC or auditing matters.  
4. **MUST** add a new migration file (`00N_description.sql`); never edit an already-applied migration.  
5. **MUST** plan `map(row)` snake_case → camelCase and which methods take optional `tx`.  
6. **MUST NOT** store password or opaque token plaintext — hashes only.  
7. **MUST NOT** use `users.id` for in-project role/assignment when membership is the identity (creators/assignees).  
8. **MUST NOT** rely on app-only soft delete without a durable status (or equivalent) column.

---

## 4. Decision questions — with how to answer

### Q1. What is the entity and identity?

**Why:** Wrong FK target creates impossible joins and authz bugs.

**How:**

| Question | Guidance in this app |
|----------|----------------------|
| Primary entity? | `tasks`, `members`, `sessions`, … |
| Parent? | Usually `projects` or `tasks` or `users` |
| `users.id` vs `members.id`? | Cross-project identity → **user**. In-project role/assignment → **member** |

Tasks store `creator_member_id` and `assignee_member_id` because “who in *this* project” matters for owner/creator/assignee policy.

**Bad:** `assignee_user_id` with a hope they belong to the project.  
**Good:** `assignee_member_id` FK-related to `members`, plus trigger that open tasks require active member in the same project.

### Q2. What columns, nullability, indexes?

**Why:** Nullability and indexes are part of the contract with queries.

**How:** For each field: type, null?, default, indexed?

- Enums: prefer PG enums / CHECKs consistent with `001_initial_schema.sql` (`task_status`, `member_role`, …)  
- Timestamps: `TIMESTAMPTZ` defaults `NOW()`; OCC compares `updated_at` (tasks truncate to milliseconds in SQL)  
- List filters: index foreign keys you filter by (`project_id`, `task_id`)

**Bad:** `TEXT` status with typos (`inProgress`).  
**Good:** `task_status` enum; Zod mirrors the same strings.

### Q3. How do invariants become SQL?

| Invariant idea | Typical SQL tool |
|----------------|------------------|
| One email per user | `UNIQUE (email)` |
| One membership per user/project | `UNIQUE (user_id, project_id)` |
| Child belongs to parent | `FOREIGN KEY` |
| Composite bind (member in project) | `UNIQUE (id, project_id)` + FK pair patterns |
| Soft delete | `status` enum/`INACTIVE`, not physical delete |
| One-time token | `used_at` null until set; conditional UPDATE |
| No open tasks on deactivate | Trigger raising `23514` (`010_member_assignee_invariants.sql`) |
| Active assignee on open tasks | Trigger on `tasks` assignee/status |

Map driver errors later in services: `23505` → conflict, `23514` → bad request/conflict, `23503` → conflict (e.g. project delete with dependents).

**Bad:** “Service will remember to check.”  
**Good:** “Trigger + service check; race still safe.”

### Q4. Cascade vs restrict?

**Why:** Parent delete policy is an invariant.

**How:** Prefer **RESTRICT** when children must be cleaned up deliberately (project with members/tasks). Use `ON DELETE CASCADE` only when child lifetime is strictly owned and you intend auto-cleanup (often tokens under user). Document the choice in the brief.

### Q5. Migration discipline?

**Why:** Edited history breaks other environments.

**How (`db/migrate.ts`):**

- Files in `src/db/migrations/`, sorted by name  
- Tracked in `schema_migrations`  
- Each new file applied in a transaction  
- Additive, reviewed; new file for changes — don’t rewrite `001_…` after ship  

**Bad:** Alter `001_initial_schema.sql` on disk after prod applied it.  
**Good:** `012_create_task_comments.sql`.

### Q6. Repository mapping?

**Why:** Controllers speak camelCase DTOs; Postgres speaks snake_case.

**How:** Every repo in this app `map(row)` early. Methods that participate in transactions take `db: Sql | TransactionSql = this.sql` (or required `db` inside locked paths) so `sql.begin` can pass `tx`.

---

## 5. Worked example A — this project

### Tasks + member invariants (faithful to repo)

**Tables (core):**

```text
users (id, email UNIQUE, hash_password, role, status, …)
projects (id, creator_id → users, info, …)
members (id, user_id, project_id, role, status, UNIQUE(user_id, project_id), UNIQUE(id, project_id))
tasks (id, project_id, creator_member_id, assignee_member_id NULL, title, …, status, priority, created_at, updated_at)
```

**Why member ids on tasks:** `assertCanUpdateTask` compares `membership.id` to `creatorMemberId` / `assigneeMemberId`. Using `users.id` would break role-in-project semantics and soft-remove edges.

**Hard laws already present:**

- Email uniqueness on `users`  
- Membership uniqueness per user/project  
- Triggers: cannot deactivate member with open assignments; open task assignee must be active member in same project (`010_…`)  
- Owner constraints via later migrations (`009_…`, repairs `011_…`)  

**OCC column:** `tasks.updated_at` — repository update:

```sql
UPDATE tasks SET …, updated_at = NOW()
WHERE id = $id
  AND date_trunc('milliseconds', updated_at) = $expected
```

Zero rows → service distinguishes miss (404) vs conflict (409).

**Repo methods (illustrative):** `create`, `listByProjectId`, `findById`, `update` (with `expectedUpdatedAt`), `delete`, plus helpers that accept `tx`.

**Error mapping personality:** `ProjectServices` / `TaskService` catch `23505` / `23514` / FK violations and throw `ConflictError` / `BadRequestError` instead of raw 500s.

---

## 6. Worked example B — mini greenfield: task comments

**Table sketch:**

```sql
CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  author_member_id UUID NOT NULL REFERENCES members (id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT task_comments_body_len CHECK (char_length(body) >= 1 AND char_length(body) <= 2000)
);

CREATE INDEX task_comments_task_id_created_at_idx
  ON task_comments (task_id, created_at DESC);
```

**Choices:** `author_member_id` (project-scoped like task creator); `ON DELETE CASCADE` from task (v1); no soft-delete column yet; keep `updated_at` for future OCC; optional denormalized `project_id` only if you want DB same-project author binds.

**Invariant → SQL:** FK `task_id` + FK `author_member_id`; same-project author enforced in **app** (and optional composite FK); body length via Zod + `CHECK`.

**Migration:** `012_create_task_comments.sql`. **Repo:** `create`, `listByTaskId`, `findById`, `delete`, `map` — all `tx`-capable.

---

## 7. Decision template

### Blank

```text
Tables:
Columns:
FKs:
UNIQUEs / CHECKs / triggers:
Indexes:
Soft delete?:
Cascade vs restrict on parent delete:
Migration file name:
Repo methods (list):
Invariant → SQL map:
```

### Filled (comments — excerpt)

```text
Tables: task_comments
Columns: id, task_id, author_member_id, body, created_at, updated_at
FKs: task_id → tasks(CASCADE); author_member_id → members
CHECKs: body length 1..2000
Indexes: (task_id, created_at DESC)
Soft delete?: no (v1 hard delete)
Cascade: comments cascade with task
Migration: 012_create_task_comments.sql
Repo: create, listByTaskId, findById, delete, map; all tx-capable
Invariant map: FK parents; app ensures author.project_id == task.project_id
```

---

## 8. Wrong world / anti-patterns

| Anti-pattern | What breaks |
|--------------|-------------|
| Code first, unique later | Duplicate emails/memberships in prod |
| `assignee_user_id` without membership | Cross-project assignment / inactive users |
| Edit applied migrations | Environments diverge; migrate lies |
| Repo methods closed over `this.sql` only | Fake transactions in services |
| Soft delete = omit from SELECT only | Rows resurrect via direct id access |
| Unbounded `TEXT` with no CHECK/Zod | Storage / payload abuse |
| Storing raw refresh/verify tokens | DB leak = session theft |

---

## 9. Exit criteria

You may go to step 05 when:

- [ ] Tables/columns sketched with nullability and types  
- [ ] Every step-02 invariant maps to app and/or DB enforcement  
- [ ] Member vs user identity decided for each FK  
- [ ] Cascade/restrict choice written  
- [ ] Migration file name planned (additive)  
- [ ] Repo methods listed, including `tx` capability and `map(row)`  

---

## 10. Interview Q&A

**Q: Why is assignee a member id not a user id?**  
**A:** Assignment is a project-scoped relationship. Members carry `project_id`, `role`, and `status`. Pointing at `users.id` would allow assigning someone who isn’t in the project or is inactive unless every write re-joins membership correctly. Member ids make `assertCanUpdateTask` and open-task triggers natural.

**Q: Soft delete vs hard delete tradeoffs?**  
**A:** Soft delete (`INACTIVE`) preserves history and lets you block reactivation paths (platform ADMIN reactivate). Hard delete frees storage and simplifies reads but breaks audit and FKs. This app soft-deletes members; project delete is a hard remove after owner lock, with FK restrict behavior surfacing as conflict if children remain.

**Q: How do migrations work in this repo?**  
**A:** `migrate.ts` ensures `schema_migrations`, reads sorted `*.sql` files from `src/db/migrations`, skips versions already applied, and runs each new file inside `sql.begin` while recording the version. Never edit an applied file; add `00N_….sql`.

**Q: What does ON DELETE RESTRICT buy you?**  
**A:** The database refuses to delete a parent while children exist, forcing an explicit cleanup order. That prevents accidentally wiping members/tasks by deleting a project without a deliberate service path — and maps cleanly to a 409-style conflict when the app catches `23503`.

**Q: Design schema for comments with author member id.**  
**A:** `task_comments(id, task_id → tasks, author_member_id → members, body, timestamps)` with body length CHECK and index on `(task_id, created_at DESC)`. Service verifies task’s `project_id` matches URL and author membership is ACTIVE in that project before insert. Optional denormalized `project_id` with composite FKs if you want DB-enforced same-project author.

**Q: How do you map UNIQUE violations to HTTP?**  
**A:** Catch Postgres error code `23505` in the service (see `isUniqueViolation` on projects) and throw `ConflictError`. Under concurrency, UNIQUE is the source of truth; the HTTP layer should expose conflict, not 500.

---

## 11. Glossary

| Term | Meaning |
|------|---------|
| **FK** | Foreign key — child must reference existing parent |
| **UNIQUE** | At most one row for a key (final referee under races) |
| **CHECK / trigger** | Row-level laws enforced by Postgres |
| **Soft delete** | Status/tombstone instead of DELETE |
| **OCC column** | Version field (often `updated_at`) for conditional UPDATE |
| **Migration** | Versioned SQL file applied once per environment |
| **TransactionSql** | `tx` handle from `sql.begin` passed into repos |
| **map(row)** | snake_case DB row → camelCase domain DTO |

---

## 12. Optional further reading

- Previous: [03-shape-the-api.md](./03-shape-the-api.md) · Next: [05-slice-the-layers.md](./05-slice-the-layers.md)  
- Lessons (optional): [constraints-and-fk](../lessons/database/constraints-and-fk.md), [migrations](../lessons/database/migrations.md), [soft-delete-and-invariants](../lessons/database/soft-delete-and-invariants.md), [optimistic-concurrency](../lessons/database/optimistic-concurrency.md), [defense-in-depth](../lessons/security/defense-in-depth.md)  
- Code citations: `001_initial_schema.sql`, `010_member_assignee_invariants.sql`, `task.repository.ts`, `db/migrate.ts`, `project.service.ts` unique/check mappers

---

## Teach pointer

> “If the invariant isn’t in the schema, it’s a hope. Hopes fail under load.”
