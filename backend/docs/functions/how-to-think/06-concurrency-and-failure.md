# Step 6 — Concurrency and failure

**Standalone ✓** — You do not need other how-to-think steps or lessons to *decide* races, locks, OCC, transactions, and fail-closed behavior for a feature.

**After this file you can:** draw a dangerous interleaving, pick the right concurrency tool, draw a transaction boundary, map conflicts to HTTP statuses, choose fail-closed vs degrade, and defend the design in an interview.

---

## 1. Why this step exists

Steps 01–05 named *who*, *threats*, *API*, *tables*, and *layers*. None of that survives contact with **two requests at once** or a **dead Redis**.

If you skip this step you ship:

- check-then-act bugs (TOCTOU): “member was active when I looked” → deactivate succeeds while they still own the last open assignment edge case  
- half-applied writes: token marked used, user still `INACTIVE`  
- silent abuse when rate-limit storage is down (fail-open)  
- 500s that should have been 409s

**Artifact you leave with:** a short race plan + transaction map + status map + dependency-failure policy — filled template at the end.

---

## 2. Mental model

### Analogy

Two cashiers updating the same bank account without a booth → money invents or vanishes.  
A transaction is the **booth**. A lock is **who holds the pen**. OCC is **“rewrite only if the paper still looks like when I copied it.”** Fail-closed rate limits are **“door stays locked if the bouncer’s radio dies.”**

### Where this sits

```text
01 brief → 02 invariants → 03 API → 04 schema → 05 layers
                              │
                              ▼
                    06 concurrency & failure  ← you are here
                              │
                              ▼
                    07 name the proof tests → 08/09 ship
```

### Inputs → outputs

| In | Out |
|----|-----|
| Invariants from step 02 | Each invariant has a concurrency story |
| Write paths from step 05 | Tx boundary + lock/OCC/constraint choice |
| External deps (Redis, mail) | Fail-closed / degrade / retry policy |
| Client contract | Which fields carry versions (`expectedUpdatedAt`) |

---

## 3. Core rules (must / must-not)

1. **MUST** write at least one dangerous interleaving in plain text before coding.  
2. **MUST** pick a mechanism: `UNIQUE` / conditional update / `FOR UPDATE` / OCC / reuse detection — not “hope.”  
3. **MUST** put multi-write invariants in one `sql.begin` and pass **`tx`** into every repo call in that unit.  
4. **MUST** map conflict → HTTP (`409` conflict, `404` IDOR-shaped miss, `503` safety dependency down).  
5. **MUST** decide fail-open vs fail-closed for each safety dependency (auth rate limit = closed here).  
6. **MUST NOT** SELECT then UPDATE on shared state without lock, version check, or constraint.  
7. **MUST NOT** call HTTP / sleep / send email inside a transaction.  
8. **MUST NOT** catch-and-continue inside a tx unless you *want* a partial commit (almost never).

---

## 4. Decision questions — with how to answer

### Q1. What is the dangerous interleaving?

**Why:** If you cannot write it, you have not designed concurrency.

**How:** Name two actors (or one user, two tabs) and the sequence:

```text
T1: read state S
T2: change S → S'
T1: write based on old S
Bad world if both commit: ________
```

**Bad:** “Maybe two people edit at once.”  
**Good:** “T1 and T2 both PATCH the same task with the same `expectedUpdatedAt`; without OCC both titles stick and last writer wins silently — or worse, one overwrites without the client knowing.”

### Q2. What tool fits?

| Situation | Prefer | Why |
|-----------|--------|-----|
| Uniqueness of a natural key | `UNIQUE` + map `23505` → 409 | DB is the final referee under race |
| Serialize many checks on one row | `SELECT … FOR UPDATE` in a tx | Holds the row until commit |
| Collaborative edits, clients have a copy | OCC (`expectedUpdatedAt` / version) | Avoids long locks; client retries |
| One-time redeem (verify/reset) | conditional `UPDATE … WHERE used_at IS NULL` | Second redeem affects 0 rows |
| Stolen refresh used after rotation | reuse detection → revoke all | Security > convenience |

**Bad:** “Always use FOR UPDATE.”  
**Good:** “Task PATCH is collaborative → OCC; ownership transfer is rare and must be serial → `FOR UPDATE`.”

### Q3. What is the transaction boundary?

**Why:** Atomicity is per-tx, not per-request.

**How:** List writes that are meaningless alone. Those share one `begin`. Reads that authorize the write often belong inside too (with lock).

**Bad:** “The whole HTTP handler is a transaction.”  
**Good:** “Revoke old session row + insert new session row = one tx. Signing the JWT stays outside.”

### Q4. How do conflicts show up on the wire?

| Internal | Typical status | Message style |
|----------|----------------|---------------|
| Stale OCC | 409 | Ask client to reload |
| Last owner / open tasks | 400 or 409 | Domain rule |
| Missing under IDOR policy | 404 | Don’t confirm existence |
| Redis down on login limiter | 503 | Retry later |
| Unknown throw | 500 generic | Log stack server-side |

### Q5. Fail-closed or degrade?

Ask: *If this dependency is wrong/down, is it safer to refuse traffic or to let it through?*

- Auth login rate limit store down → **fail-closed** (503) — abuse risk  
- Optional “related tasks” cache down → **degrade** (skip cache, hit DB)  
- Never fail-open a security control “to keep the site up”

### Q6. How will we prove it?

Name the test style *now* (step 07 will flesh it out): parallel refresh, stale `expectedUpdatedAt`, double verify token, remove member while assigned, etc.

---

## 5. Worked example A — this project

### A1. Remove member (pessimistic + invariants)

**Invariant:** cannot leave a project with zero owners; cannot soft-remove a member who still has open assigned tasks; membership row must be the one in *this* project.

**Dangerous interleaving:**

```text
T1: read member ACTIVE, role MEMBER, open tasks = 0
T2: assign open task to that member, commit
T1: deactivate member  → orphaned assignee / broken invariant
```

**Mitigation in code** (`ProjectService.removeMember`): one transaction, lock the member row, re-check, count owners / open tasks, then deactivate:

```ts
await this.sql.begin(async (tx) => {
  const [locked] = await tx`
    SELECT id, role, status, project_id
    FROM members
    WHERE id = ${memberId}
    FOR UPDATE
  `;
  // re-validate project_id, ACTIVE, last-owner, open tasks — then deactivate
});
```

**Why `FOR UPDATE`:** the decision depends on *current* row + related counts; OCC on the member row alone wouldn’t serialize the open-task check.

**HTTP map:** not found / wrong project → `NotFoundError` (404); last owner → 400; open tasks → 409 (`ConflictError`), plus DB `CHECK` as defense in depth.

### A2. Task PATCH (optimistic concurrency)

**Invariant:** clients must not silently overwrite each other’s edits.

**Contract:** body requires `expectedUpdatedAt` (ISO datetime from last read).

**Mechanic** (`TaskRepository.update`): `UPDATE … WHERE id = $id AND date_trunc('milliseconds', updated_at) = $expected`. Zero rows → conflict path in service.

**Dangerous interleaving:**

```text
T1 GET task (updatedAt = t0)
T2 GET task (updatedAt = t0)
T1 PATCH title=A, expected=t0 → ok, updatedAt=t1
T2 PATCH title=B, expected=t0 → 0 rows → 409
```

**Why not `FOR UPDATE` for every PATCH:** interactive edits; holding row locks across user think-time is wrong. OCC pushes retry to the client.

### A3. Refresh rotation (conditional revoke + reuse)

**Invariant:** one refresh redeemable once; presenting a *revoked* refresh means possible theft → revoke **all** sessions for that user.

```ts
if (session.revokedAt) {
  await this.sessionRepo.revokeAllForUser(session.userId);
  throw new UnauthorizedError("Invalid refresh token");
}
await this.sql.begin(async (tx) => {
  const revoked = await this.sessionRepo.revoke(session.id, tx);
  if (!revoked) throw new UnauthorizedError("Invalid refresh token");
  await this.sessionRepo.createSession({ ... }, tx);
});
```

Parallel double-refresh: one wins revoke, one sees `!revoked` → 401. Expected.

### A4. Login rate limit (fail-closed)

```ts
// RedisStore sendCommand catch → throw ServiceUnavailableError
// → 503 "Rate limiting unavailable. Try again later."
```

Redis down during login does **not** skip the limiter.

---

## 6. Worked example B — mini greenfield: task comments

Assume new resource `comments` under a task.

**Dangerous interleavings to write in the design doc:**

1. **IDOR race (authz, not DB lock):** T1 member of project A uses task id from project B → must 404 regardless of timing.  
2. **Soft-deleted member posts:** T1 was ACTIVE; T2 owner removes member; T1 POST comment → must fail membership check inside the write path (re-check membership in service, not only at middleware cached state).  
3. **Double-submit create:** client retries POST → without idempotency key you may get two comments (acceptable for v1 comments; document it). If “exactly one welcome comment,” need idempotency or UNIQUE.

**Chosen plan for v1 comments:**

| Concern | Choice |
|---------|--------|
| Authz | Re-load active membership for `projectId` on every write (same as tasks) |
| Task must exist in project | SELECT task by id+projectId; else 404 |
| Edits to comment body | OCC on `comments.updated_at` if edit exists in v1 |
| Create | Single INSERT; no tx unless you also bump task `comment_count` |
| If denormalized count | `BEGIN` → insert comment → update count on task with `FOR UPDATE` on task row |
| Rate limit | Optional `authWriteLimiter` if anonymous abuse vector; members already authenticated |
| Redis down | Only matters if you attach a limiter — then fail-closed |

**Transaction boundary (if counting):**

```text
BEGIN
  lock task FOR UPDATE (same project)
  INSERT comment
  UPDATE tasks SET comment_count = comment_count + 1
COMMIT
```

---

## 7. Decision template

### Blank

```text
Feature:
Dangerous interleavings:
  1)
  2)
Chosen mitigations (UNIQUE / FOR UPDATE / OCC / conditional / reuse):
Transaction boundaries (list writes per begin):
HTTP mapping (conflict / not found / unavailable):
Fail-closed dependencies:
Degrade-OK dependencies:
Proof tests to name in step 07:
```

### Filled (remove member — excerpt)

```text
Feature: remove project member
Dangerous interleavings:
  1) assign open task after open-count check
  2) two owners remove each other / last owner
Mitigations: FOR UPDATE on member row; count owners; count open tasks; CHECK constraint backup
Tx: lock → validate → deactivate
HTTP: 404 wrong/missing; 400 last owner; 409 open tasks
Fail-closed: n/a (no Redis on this path)
Proof: members.removal.test.ts parallel-ish + open-task conflict
```

---

## 8. Wrong world / anti-patterns

| Anti-pattern | What breaks |
|--------------|-------------|
| Check membership, then write without re-check/lock | Removed member still writes |
| `begin` but repos use outer `sql` | Fake atomicity |
| OCC without client-supplied version | Silent overwrite or always-409 |
| Fail-open rate limit “so login works” | Credential stuffing when Redis dies |
| Long tx while calling email provider | Lock pileups, timeouts |
| 500 on expected conflict | Clients can’t retry correctly |
| “We’ll add tests later” for races | You never reproduce the bug in CI |

---

## 9. Exit criteria

You may go to step 07 when:

- [ ] ≥1 interleaving written per risky write path  
- [ ] Every step-02 invariant has a concurrency or constraint story  
- [ ] Every multi-write unit lists a `begin` boundary  
- [ ] Status codes chosen for conflict / miss / dependency down  
- [ ] Fail-closed called out for any safety dependency  
- [ ] At least one race/conflict test name is on the list  

---

## 10. Interview Q&A

**Q: What is TOCTOU on member removal, and how is it fixed here?**  
**A:** Time-of-check time-of-use: you observe “safe to remove,” then state changes before the write. Fix: in one transaction, `FOR UPDATE` the member row, re-validate project/status/role, re-count open tasks and owners, then deactivate. A DB `CHECK`/trigger can still defend if app logic regresses.

**Q: OCC vs `FOR UPDATE` for editing a comment — which and why?**  
**A:** Prefer OCC if clients load, think, then save — pass `expectedUpdatedAt`, update only if unchanged, return 409 on clash. Use `FOR UPDATE` when the server must run several dependent checks/writes with no useful client version (ownership transfer, “remove if no open work”).

**Q: Redis is down during login. What should happen and why?**  
**A:** In this app, the Redis-backed limiter throws `ServiceUnavailableError` → 503. Fail-closed: better to refuse logins briefly than to allow unlimited password guesses.

**Q: How does refresh reuse detection work?**  
**A:** Refresh tokens are hashed at rest. On refresh, if the session row is already `revokedAt`, treat as reuse (stolen or parallel), `revokeAllForUser`, return 401. Normal refresh revokes the old row and inserts a new one in one transaction; a parallel refresh loses the revoke race and gets 401.

**Q: Design a race test that doesn’t assert a flaky winner.**  
**A:** Fire two parallel requests; assert *invariant outcomes*: e.g. exactly one 200 and one 401 on double refresh; or final DB state has ≤1 active session chain; or OCC yields one 200 and one 409. Never `expect(order[0]).toBe(200)` without fixing scheduling.

**Q: Why map unique violations to 409 instead of letting them 500?**  
**A:** Under concurrency, two registers with the same email can both pass the app-level “exists?” check; only `UNIQUE` catches it. That’s an expected conflict, not an internal error — clients and monitors should see 409.

---

## 11. Glossary

| Term | Meaning |
|------|---------|
| **TOCTOU** | Time-of-check/time-of-use gap between read and write |
| **Pessimistic lock** | `FOR UPDATE` — block others until tx ends |
| **OCC** | Optimistic concurrency control — write if version matches |
| **Fail-closed** | Dependency down → deny the action |
| **Fail-open** | Dependency down → allow (dangerous for security controls) |
| **Conditional update** | `UPDATE … WHERE predicate`; 0 rows = lost race |
| **Reuse detection** | Using a revoked refresh triggers global session revoke |
| **Interleaving** | Concrete order of steps from concurrent requests |

---

## 12. Optional further reading

- Previous: [05-slice-the-layers.md](./05-slice-the-layers.md) · Next: [07-prove-it-with-tests.md](./07-prove-it-with-tests.md)  
- Lessons (optional depth): [toctou](../lessons/database/toctou.md), [pessimistic-locking](../lessons/database/pessimistic-locking.md), [optimistic-concurrency](../lessons/database/optimistic-concurrency.md), [transactions](../lessons/database/transactions.md), [fail-closed-rate-limits](../lessons/security/fail-closed-rate-limits.md), [refresh-rotation-and-reuse](../lessons/security/refresh-rotation-and-reuse.md), [idempotency](../lessons/api/idempotency.md)  
- Code citations: `project.service.ts` `removeMember`, `task.repository.ts` `update`, `auth.service.ts` `refresh` / `login`, `shared/auth/rate-limit.ts`

---

## Teach pointer

> “Draw the race on paper. If you can’t, you haven’t designed concurrency — you’ve hoped.”
