# Lesson: Pessimistic locking

**Standalone ✓** — You do not need any other doc to implement read-lock-then-write flows safely in this task-management backend.

**After this file you can:** explain pessimistic vs optimistic concurrency, use `FOR UPDATE` correctly in services, avoid lock duration pitfalls, and answer interview questions.

---

## 1. First principles

**Pessimistic locking** assumes **conflicts will happen** and **blocks** other writers upfront by taking locks before modifying data.

Opposite: **optimistic** — assume conflicts rare; detect at commit with a version check.

**Why it exists:** Some invariants (assignee must be active member **at write time**) fail if two transactions interleave without coordination.

**The problem it solves:** “Prevent lost updates and illegal states by serializing writers on contested rows early.”

---

## 2. Mental model

### Analogy

Restroom door **locks from inside** before you use it — others wait. Optimistic is “try to enter; if occupied, retry.”

### Diagram

```text
Pessimistic path (this app — tasks):
  BEGIN
    SELECT member … FOR UPDATE     ◄── block peers
    validate status / project
    INSERT/UPDATE task
  COMMIT                           ◄── release lock
```

---

## 3. Core rules (must / must-not)

1. **MUST** lock inside `sql.begin` with the same `tx` handle.  
2. **MUST** lock **all** rows whose state you rely on for the write.  
3. **MUST** keep locked sections **short**.  
4. **MUST** order locks consistently when touching multiple rows.  
5. **MUST NOT** call external APIs while holding row locks.  
6. **MUST NOT** use pessimistic locks for read-mostly data without contention evidence.

---

## 4. How it works (mechanics)

### Pattern

1. `BEGIN`  
2. `SELECT … FOR UPDATE` — acquire row-level exclusive lock  
3. Validate business rules on locked snapshot  
4. `INSERT`/`UPDATE`/`DELETE`  
5. `COMMIT`

Other transactions attempting `FOR UPDATE` or conflicting `UPDATE` on same row **block** until release.

### vs optimistic

| | Pessimistic | Optimistic |
|---|-------------|------------|
| Conflict handling | Wait or deadlock | Fail update if version mismatch |
| Best when | High contention, strict invariant | Low contention, read-heavy |

This project uses pessimistic membership locks; it does **not** use `version` columns on tasks yet.

### Interaction with triggers

Locks don’t replace triggers — DB still enforces assignee rules on INSERT even if app bug skips lock.

---

## 5. When to use / when not to use

| Situation | Approach |
|-----------|----------|
| Task create with assignee check | Pessimistic lock assignee + caller membership |
| Member deactivate vs task assign | Lock + triggers |
| Profile name change | Single UPDATE — no extra lock |
| Inventory / wallet | Pessimistic standard |
| Collaborative doc editing | OT/CRDT or optimistic versioning |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Name contended entities (member rows).  
2. Map API operation → rows to lock.  
3. Define failure modes (inactive member → 400).

### Implement

1. Service `sql.begin`.  
2. Call `memberRepo.lockByUserAndProject` / `lockById` with `tx`.  
3. Assert status/project; proceed to task repo.

### Verify

1. Parallel create task + deactivate member — one outcome legal.  
2. No lock calls using global `sql` inside begin.

---

## 7. Worked example A — this project

### Task create flow

`backend/src/modules/tasks/task.service.ts` (conceptual sequence):

```ts
return await this.sql.begin(async (tx) => {
  const membership = await this.memberRepo.lockByUserAndProject(
    userId,
    projectId,
    tx,
  );
  if (!membership || membership.status !== "ACTIVE") {
    throw new ForbiddenError("…");
  }
  await this.assertAssigneeInProject(projectId, input.assigneeMemberId, tx);
  return await this.taskRepo.create({ … }, tx);
});
```

`assertAssigneeInProject` calls `lockById(assigneeMemberId, tx)` and verifies `projectId` and `ACTIVE`.

### Project member operations

`project.service.ts` transactions lock memberships before role updates or removals so concurrent task writes serialize.

---

## 8. Worked example B — mini scenario (self-contained)

**Seat booking:** only one buyer gets seat 12A.

```ts
await sql.begin(async (tx) => {
  const [seat] = await tx`
    SELECT status FROM seats WHERE flight = ${f} AND code = ${'12A'}
    FOR UPDATE
  `;
  if (seat.status !== 'AVAILABLE') throw new ConflictError('taken');
  await tx`UPDATE seats SET status = 'SOLD', buyer = ${userId} WHERE …`;
});
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Check assignee without lock | Member deactivated between check and insert |
| Long work under lock | Timeouts, deadlocks |
| Lock user row but update task | Wrong granularity — still races on member |
| Pessimistic everywhere | needless waits |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Illegal assignee slipped through | No lock on assignee | `assertAssigneeInProject` | Ensure lockById in tx |
| Timeouts | Lock queue | Active tx duration | Shorten begin callback |
| Deadlocks | Lock order | Two members locked A then B vs B then A | Sort ids before lock |
| Lock ineffective | Autocommit SELECT FOR UPDATE | Wrapped in begin? | Use sql.begin |

---

## 11. Interview Q&A (with strong answers)

**Q: Pessimistic vs optimistic locking?**  
**A:** Pessimistic takes locks before write to prevent conflicts; optimistic allows parallel writes and detects conflict at commit via version/timestamp.

**Q: When pessimistic in web APIs?**  
**A:** Short transactions on hot rows where lost update is unacceptable — inventory, seats, membership-gated writes.

**Q: Downside?**  
**A:** Reduced concurrency, deadlocks, latency under contention.

**Q: Example in this codebase?**  
**A:** Task service locks caller and assignee member rows with `FOR UPDATE` inside `sql.begin` before creating/updating tasks.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Pessimistic lock | Lock before write assuming conflict |
| FOR UPDATE | Row exclusive lock clause |
| Contention | Many txs competing for same row |
| Lost update | Overwritten concurrent change |
| Critical section | Code between lock and commit |

---

## 13. Teach pointer

> “Pessimism here means: assume someone else is editing the same row — lock first, then decide.”

---

## 14. Optional further reading (not required)

- Lock modes: [locking-kinds](./locking-kinds.md)  
- Optimistic alternative: [optimistic-concurrency](./optimistic-concurrency.md)  
- Deadlocks: [deadlocks-deep](./deadlocks-deep.md)
