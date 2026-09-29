# Lesson: Soft delete and invariants

**Standalone ✓** — You do not need any other doc to choose hard vs soft delete, keep queries correct, and relate to this app’s status fields and hard deletes.

**After this file you can:** design `deleted_at` or status-based deactivation, prevent unique constraint bugs, preserve invariants, and answer interview questions.

---

## 1. First principles

**Soft delete** marks rows as **inactive/deleted** without `DELETE` — data remains for audit/recovery.

**Hard delete** removes rows — FK CASCADE/RESTRICT applies.

**Why soft delete exists:** Compliance, undo, analytics, avoiding broken FK references.

**The problem it solves:** “Hide data from users while retaining history — without orphaning references accidentally.”

---

## 2. Mental model

### Analogy

Library book **withdrawn from circulation** (soft) vs **pulped** (hard). Withdrawn still occupies a catalog slot unless you handle barcode reuse.

### Diagram

```text
Hard delete project:
  DELETE projects ──► FK RESTRICT if members exist (this app)

Soft delete member:
  status INACTIVE ──► row remains ──► queries must filter ACTIVE
                      triggers block if open tasks assigned
```

---

## 3. Core rules (must / must-not)

1. **MUST** apply **consistent filter** (`status = 'ACTIVE'` or `deleted_at IS NULL`) in every query path.  
2. **MUST** enforce business rules on deactivation (triggers) not only on DELETE.  
3. **MUST** design UNIQUE with soft delete (partial unique index).  
4. **MUST NOT** soft-delete without plan for FK semantics — references still point to row.  
5. **MUST NOT** expose inactive rows in list APIs by forgetting WHERE.

---

## 4. How it works (mechanics)

### Patterns

| Pattern | Column | Query filter |
|---------|--------|--------------|
| Status enum | `member_status INACTIVE` | `status = 'ACTIVE'` |
| Timestamp | `deleted_at` | `deleted_at IS NULL` |
| Boolean | `is_deleted` | `NOT is_deleted` |

### Partial unique index

“One active email per user” when emails can repeat historically:

```sql
CREATE UNIQUE INDEX users_email_active_idx ON users (email)
WHERE deleted_at IS NULL;
```

### This app’s style

**Members** use `status ACTIVE/INACTIVE` — soft deactivation, not row delete.  
**Projects/tasks** use **hard** `DELETE` in repositories when API allows delete.

---

## 5. When to use / when not to use

| Situation | Choice |
|-----------|--------|
| User account GDPR erase | Hard delete or anonymize |
| Remove member from project | Status INACTIVE (this app) |
| Undo within 30 days | Soft delete |
| High-churn join table | Often hard delete + audit log |
| Legal hold | Soft + block purge |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Define “visible” predicate.  
2. Map UNIQUE constraints with partial indexes if needed.  
3. Triggers on deactivation same as delete rules.

### Implement

1. Repository methods default filter ACTIVE.  
2. Admin/report queries explicitly include inactive.

### Verify

1. Lists never show inactive unless intended.  
2. Deactivate blocked when open tasks (trigger 23514).

---

## 7. Worked example A — this project

### Member deactivation (soft)

`members.status` transitions to `INACTIVE` instead of DELETE — preserves history and FK references from tasks.

Trigger `enforce_no_open_tasks_on_deactivate` in `010_member_assignee_invariants.sql` prevents deactivation when assignee has non-COMPLETED tasks.

`MemberRepository.updateRole` / queries often filter `status = 'ACTIVE'`.

### Task assignee rules

Trigger ensures open tasks cannot reference inactive assignee — soft delete of membership interacts with task invariants.

### Hard delete paths

`task.repository.ts`: `DELETE FROM tasks WHERE id = …`  
`project.repository.ts`: `DELETE FROM projects …` — may fail with `23503` if dependents exist (`project.service.ts` mapping).

**Contrast:** Tasks/projects **removed** from DB; members **deactivated** in place.

---

## 8. Worked example B — mini scenario (self-contained)

**Soft-delete users with unique email reuse blocked for active only:**

```sql
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;
CREATE UNIQUE INDEX users_email_live ON users (email) WHERE deleted_at IS NULL;

-- "delete"
UPDATE users SET deleted_at = NOW() WHERE id = $1;

-- login
SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL;
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Soft delete but no WHERE filter | Zombie rows in UI |
| UNIQUE(email) with soft delete | Cannot re-register same email |
| Soft delete parent, hard FK children | Confusion — children still reference “deleted” |
| Two meanings of deleted | status + deleted_at diverge |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| User “deleted” still logs in | Filter missing | Auth query | `deleted_at IS NULL` |
| Cannot re-register email | Full UNIQUE | Index partial | Partial unique |
| Inactive member in list | Query bug | Repository SQL | Add ACTIVE filter |
| 23514 on deactivate | Open tasks | Expected | Reassign/complete tasks |

---

## 11. Interview Q&A (with strong answers)

**Q: Soft vs hard delete?**  
**A:** Soft marks row inactive保留 row; hard removes it. Soft aids recovery/audit; hard simplifies queries and storage.

**Q: UNIQUE with soft delete?**  
**A:** Use partial unique index on active rows only so deleted emails can be reused if policy allows.

**Q: How does this app handle member removal?**  
**A:** Sets `members.status` to INACTIVE with triggers preventing deactivation when open tasks assigned; projects/tasks may be hard-deleted with FK checks.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Soft delete | Logical removal flag |
| Hard delete | Physical DELETE |
| Partial index | Index with WHERE clause |
| Deactivate | Status transition to inactive |
| Tombstone | Marker row deleted |

---

## 13. Teach pointer

> “Soft delete means the row still exists — your queries must agree on what ‘exists’ means.”

---

## 14. Optional further reading (not required)

- Constraints/triggers: [constraints-and-fk](./constraints-and-fk.md)  
- Audit history: [audit-tables](./audit-tables.md)
