# Lesson: Audit tables

**Standalone ✓** — You do not need any other doc to design append-only audit logs for who changed what, when, and why.

**After this file you can:** schema audit rows, choose trigger vs app logging, balance JSON snapshots with compliance, and answer interview questions.

---

## 1. First principles

An **audit table** append-only records **events**: actor, action, entity, timestamp, optional before/after payload.

**Why it exists:** Security investigations, compliance, debugging “who deleted project X?”, non-repudiation.

**The problem it solves:** “Reconstruct history after the fact when live tables only show current state.”

---

## 2. Mental model

### Analogy

**Security camera log** — not the furniture layout (current row), but timestamped clips of changes.

### Diagram

```text
UPDATE tasks SET status = 'COMPLETED'
        │
        ├──► tasks row (current truth)
        └──► audit_log INSERT (actor, task_id, before, after)
```

---

## 3. Core rules (must / must-not)

1. **MUST** make audit inserts **append-only** — no UPDATE/DELETE on audit rows (or restricted).  
2. **MUST** capture **actor identity** (user id, service name) and **time**.  
3. **MUST NOT** store secrets (passwords, raw tokens) in audit JSON.  
4. **MUST** decide sync DB trigger vs app-level audit — both have tradeoffs.  
5. **MUST** index by entity id + time for investigations.

---

## 4. How it works (mechanics)

### Typical columns

- `id`, `occurred_at`  
- `actor_user_id`  
- `action` (`task.updated`, `member.deactivated`)  
- `entity_type`, `entity_id`  
- `before JSONB`, `after JSONB` or delta  
- `request_id` / IP (policy-dependent)

### Capture mechanisms

| Mechanism | Pros | Cons |
|-----------|------|------|
| App service | Rich context | Miss direct DB changes |
| Trigger | All SQL paths | Harder actor context |
| Event outbox | Async consumers | Delay |

### PII

Redact or hash sensitive fields in snapshots.

---

## 5. When to use / when not to use

| Situation | Audit? |
|-----------|--------|
| Role changes, deletes | Yes |
| High-volume read list | No |
| GDPR erasure | Audit may need retention policy |
| Every SELECT | Usually no — too noisy |

---

## 6. Step-by-step: design → implement → verify

### Design

1. List regulated actions (project delete, role change).  
2. Schema + retention.  
3. Actor propagation from JWT middleware.

### Implement

1. Migration create `audit_events`.  
2. Service helper `recordAudit({ … })` after successful commit.  
3. Or trigger on critical tables.

### Verify

1. Action produces row with correct diff.  
2. Failed tx does not audit (audit after commit).

---

## 7. Worked example A — this project

### Current state

No dedicated `audit_events` table in migrations under `backend/src/db/migrations/`. Changes are visible via `updated_at` columns and **hard deletes** remove history unless logged elsewhere.

### Operations worth auditing (design target)

- `ProjectService` delete project — `23503` or success  
- Member role updates / deactivation in `project.service.ts`  
- Task delete in `task.repository.ts` `DELETE FROM tasks`

### Faithful app-level pattern (post-commit)

```ts
await this.sql.begin(async (tx) => {
  await this.taskRepo.delete(taskId, tx);
});
await this.auditRepo.insert({
  actorUserId: userId,
  action: "task.deleted",
  entityType: "task",
  entityId: taskId,
  metadata: { projectId },
});
```

Insert audit **after** successful transaction so rollback doesn’t leave false audit entries.

### DB triggers already partial

`010_member_assignee_invariants.sql` enforces rules but does not log — complement with audit if compliance requires.

---

## 8. Worked example B — mini scenario (self-contained)

```sql
CREATE TABLE audit_events (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  before JSONB,
  after JSONB
);
CREATE INDEX audit_entity_idx ON audit_events (entity_type, entity_id, occurred_at DESC);
```

Trigger sketch on `members` status change populates `before`/`after`.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Audit inside failed tx | Misleading log |
| Store password hash in after | Leak amplification |
| Mutable audit rows | Tampering |
| No index on entity_id | Slow investigations |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Missing audit row | Only app path audited | Direct SQL | Triggers or restrict SQL |
| Audit but no change | Logged before commit | Order | After commit |
| Huge table | Log every field | Payload size | Delta or changed keys only |
| GDPR conflict | Infinite retention | Policy | TTL job |

---

## 11. Interview Q&A (with strong answers)

**Q: Why audit tables?**  
**A:** Immutable history of who changed what for security, compliance, and forensics.

**Q: App vs trigger audit?**  
**A:** App has user/request context; triggers catch all DB mutations but lack HTTP context unless session vars set.

**Q: Does this app have audit tables?**  
**A:** Not in current schema — `updated_at` and delete endpoints are places to add structured audit if required.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Append-only | Insert-only log |
| Before/after snapshot | Row state capture |
| Actor | Who performed action |
| Non-repudiation | Hard to deny action |
| Retention | How long logs kept |

---

## 13. Teach pointer

> “Live tables tell you what is true now; audit tables tell you how you got here.”

---

## 14. Optional further reading (not required)

- Soft delete history: [soft-delete-and-invariants](./soft-delete-and-invariants.md)  
- Security audit logging: [../security/audit-logging.md](../security/audit-logging.md)  
- Outbox events: [../architecture/outbox-events.md](../architecture/outbox-events.md)
