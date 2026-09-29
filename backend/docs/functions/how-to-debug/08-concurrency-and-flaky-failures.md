# 08 — Concurrency and flaky failures

**Standalone ✓** — You do not need toctou.md / optimistic-concurrency.md or other how-to-debug guides to hunt OCC 409s, refresh reuse races, transfer races, or “works once” flakes in this backend.

**After this file you can:** recognize race vs OCC vs flaky harness, reproduce with `Promise.all`, open the right transaction/lock site, and explain invariants in interview language.

---

## 1. Why this habit exists

Single-threaded manual clicks hide races. Two tabs, double-submit, or `Promise.all` in tests surface them. Juniors add `sleep` or blame “flaky CI.” Seniors write the **interleaving**, find the missing UNIQUE / `FOR UPDATE` / conditional UPDATE, and assert an **invariant** (not which request “won”).

Wrong first open: random controller. Right first open: the service method that checks-then-writes without a lock, or `TaskRepository.update`’s `expectedUpdatedAt` clause.

---

## 2. Mental model

### Analogy

Concurrency bugs are **two people editing the same whiteboard**. Optimistic concurrency (OCC) is “bring the version you last saw — if the board changed, retry.” Pessimistic locking is “take the marker (`FOR UPDATE`) before you write.” Refresh rotation is “one ticket stub at a time — reuse of an old stub burns **all** tickets.”

```text
Client A + Client B same resource
  → no lock / no version     → lost update or torn invariant
  → OCC (expectedUpdatedAt)  → second writer 409 Conflict
  → FOR UPDATE in tx         → second waits; first commits; second re-checks
  → UNIQUE / 23505           → one 201, one 409 (register)
  → refresh reuse            → revoked row seen again → revoke-all + 401
```

### Neighborhood → house → room

| Signal neighborhood | House (file) | Room (function) |
|---------------------|--------------|-----------------|
| Task PATCH 409 “modified” | `task.repository.ts` + `task.service.ts` | `update` WHERE + ConflictError |
| Double register 409 | `auth.service.ts` | `register` + unique email |
| Parallel refresh one 401 | `auth.service.ts` | `refresh` + session revoke |
| Transfer ends wrong | `project.service.ts` | `transferOwnership` locks |
| Remove vs assign flake | `project.service.ts` | `removeMember` FOR UPDATE |
| Test only flakes under parallel | matching test + service | missing lock/constraint |

---

## 3. Core rules (must / must-not)

1. **MUST** reproduce with deterministic parallelism (`Promise.all`) before calling it “heisenbug.”  
2. **MUST** assert **invariants** (one owner; never inactive member with open assignment; at most one refresh success) — not which request finished first.  
3. **MUST** distinguish **OCC 409** (stale `expectedUpdatedAt`) from **authz 403** and **unique 409**.  
4. **MUST** check whether the write path uses a transaction + lock or conditional UPDATE.  
5. **MUST NOT** “fix” flakes with `sleep` / retry loops that hide the race.  
6. **MUST NOT** disable OCC by omitting `expectedUpdatedAt` validation to make the UI “just work.”  
7. **MUST NOT** treat refresh parallel 401 as a random auth bug — rotation + reuse detection are intentional.

---

## 4. Signal taxonomy (this app)

### OCC conflict

```json
{ "message": "Task was modified; reload and try again", "requestId": "…" }
```

Status **409**. `TaskRepository.update` matched 0 rows on:

```sql
AND date_trunc('milliseconds', updated_at) = $expectedUpdatedAt
```

Service maps null return → `ConflictError` (after re-check that task still exists in project).

### Unique race (register)

One request **201**, sibling **409** email taken (`23505` → Conflict). Expected under `Promise.all` duplicate register (`concurrency.test.ts`).

### Refresh parallel / reuse

- Parallel same raw refresh → **at most one** 200; other **401**.  
- Sequential: refresh RT0 → RT1; replay RT0 → 401 and **all** sessions revoked (`revokedAt` path → `revokeAllForUser`).

### Member removal conflict / race

```json
{ "message": "Cannot remove a member who is assigned to open tasks", "requestId": "…" }
```

`removeMember` locks member row `FOR UPDATE`, counts open assignments, then deactivates. Parallel assign vs remove must never leave INACTIVE + open assignment (`members.removal.test.ts`).

---

## 5. Symptom → first open

| Symptom | First open | Why | If wrong, next |
|---------|------------|-----|----------------|
| Two tabs save task; second 409 | `TaskRepository.update` WHERE | OCC working or clock skew | Client stale timestamp; ms truncation |
| OCC 409 but timestamps “equal” | serialization of `updatedAt` | ISO/ms mismatch | `date_trunc('milliseconds', …)` |
| Double-click register; one 409 | `AuthService.register` | Unique race expected | Constraint missing → both 201 (bug) |
| Double refresh; one 401 | `AuthService.refresh` | Rotation / conditional revoke | Session hash; mobile body channel |
| Replay old refresh after rotate | same `revokedAt` branch | Reuse detection | `revokeAllForUser` |
| Ownership “wrong” after dual transfer | `transferOwnership` | Lock + role re-check | `concurrency.test.ts` transfer case |
| Member removed but still open task | `removeMember` | Lost TOCTOU | FOR UPDATE / CHECK |
| Flaky only with `Promise.all` | matching service | Missing serialization | DB constraint |
| Flaky only in CI workers | test harness | Shared DB / no `resetDb` | [09](./09-test-failures.md) |

---

## 6. Reproduce recipes

### OCC 409

1. Create task; capture `updatedAt`.  
2. PATCH with that `expectedUpdatedAt` → 200; note new `updatedAt`.  
3. PATCH again with the **old** timestamp → **409**.

```bash
curl -s -X PATCH "$BASE/api/v1/projects/$PID/tasks/$TID" \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d "{\"status\":\"IN_PROGRESS\",\"expectedUpdatedAt\":\"$STALE\"}"
```

### Parallel register

From `concurrency.test.ts`: two identical `POST /auth/register` via `Promise.all` → statuses `{201, 409}`.

### Parallel refresh

Login with `X-Client: mobile`, capture `refreshToken`, fire two refreshes with the same body → exactly one 200, one 401.

### Remove vs assign race

`members.removal.test.ts` — `Promise.all` delete-member vs assign-open-task; assert never inactive membership with open assignment.

---

## 7. Hypothesis ladder

1. **Harness flake?** — `beforeEach(resetDb)`? unique emails? single DB shared by workers?  
2. **OCC stale client?** — Did UI send last-seen `updatedAt`?  
3. **Server not bumping `updated_at`?** — UPDATE path must set `updated_at = NOW()`.  
4. **Missing lock between check and write?** — Sketch T1 check → T2 write → T1 write.  
5. **Unique constraint present?** — Dual insert without 23505 handling.  
6. **Refresh reuse vs network retry?** — Second use of revoked refresh is security path.  
7. **Isolation / ordering?** — Prefer explicit `FOR UPDATE` over hoping on default isolation.

---

## 8. Worked failure A — “Second tab always loses task edits”

**Signal:** User opens task in two browsers. Tab A saves status. Tab B saves title with older `expectedUpdatedAt` → 409 `Task was modified; reload and try again`.

**Reproduce:** Two PATCHes; second uses first response’s pre-update timestamp.

**Hypothesis ladder:**

1. Authz — would be 403 → kill.  
2. OCC — UPDATE 0 rows → ConflictError.  
3. Clock/TZ — if even fresh timestamps 409, check ms truncation / string format (`task.schema` `z.string().datetime()`).

**Root cause:** Working as designed. Tab B must GET (or use 409 handler) and retry with new `updatedAt`.

**Critical code:**

```ts
// task.repository.ts
WHERE id = ${taskId}
  AND date_trunc('milliseconds', updated_at) = ${new Date(input.expectedUpdatedAt)}

// task.service.ts — when update returns null
throw new ConflictError("Task was modified; reload and try again");
```

**Fix (client):** reload + retry. **Fix (server)** only if timestamps don’t round-trip (serialization bug) or `updated_at` not bumped.

**Prove:** Fresh `expectedUpdatedAt` PATCH → 200; stale → 409; authz tests still pass.

---

## 9. Worked failure B — mini invented: “Logout all devices after one double-refresh”

**Signal:** Mobile client retries refresh twice with same RT (timeout + retry). User suddenly must re-login everywhere.

**False lead:** “Redis wiped sessions” / “JWT_SECRET rotated.”

**Actual:** First refresh rotates (revokes old session, inserts new). Retry presents **revoked** refresh → `AuthService.refresh` sees `session.revokedAt` → `revokeAllForUser` → 401. By design for theft detection; aggressive retries without idempotency look like reuse.

**Confirm:** `concurrency.test.ts` parallel refresh; session table all revoked for user.

**Mitigation (product):** client must not replay old refresh after a successful rotate; store new RT before retry; or accept rare revoke-all on ambiguous retries.

**Prove:** Single refresh OK; deliberate replay of RT0 after RT1 → 401 + all sessions cleared.

---

## 10. False leads / anti-patterns

| False lead | Reality |
|------------|---------|
| Adding `await sleep(100)` in tests | Hides race; CI will still flake |
| Dropping `expectedUpdatedAt` from schema | Silent lost updates |
| Treating refresh 401 under parallel as infra | Rotation invariant |
| “Postgres is slow” for OCC 409 | Version mismatch, not latency |
| Fixing transfer by removing FOR UPDATE | Re-introduces dual-owner risk |
| Blaming bun:test for `Promise.all` red | Often the product race finally showing |

---

## 11. Fix + prove checklist

- [ ] Failing interleaving reproduced without sleeps  
- [ ] Invariant asserted (counts/roles/statuses), not winner identity  
- [ ] Transaction + lock or conditional UPDATE or UNIQUE in place  
- [ ] OCC: stale → 409; fresh → 200  
- [ ] Refresh: parallel ≤1 success; reuse → revoke-all  
- [ ] `members.removal` / `concurrency.test.ts` green  

---

## 12. Interview Q&A

**Q: How do you reproduce a refresh race?**  
**A:** Register/verify/login with `X-Client: mobile` so refresh is in the JSON body. Fire two `POST /auth/refresh` with the same raw token via `Promise.all`. Expect exactly one 200 and a 401. Then replay the original token after a successful rotate and expect 401 with all user sessions revoked — that’s reuse detection, not flakiness.

**Q: What should a concurrency test assert?**  
**A:** A safety invariant that must hold after any interleaving: e.g. one ACTIVE OWNER, never an INACTIVE member still assigned to open tasks, at most one successful refresh, one 201 and one 409 on duplicate register. Avoid asserting which goroutine/request “should win.”

**Q: OCC 409 — client or server bug?**  
**A:** Usually client (stale `expectedUpdatedAt`) or correct conflict under dual writers. Server bug only if `updated_at` isn’t updated, comparison truncates differently than serialization, or the Conflict is thrown when the row was deleted (should be 404 after re-fetch) — this app re-checks existence before Conflict.

**Q: TOCTOU in member removal — what’s the check/use?**  
**A:** Check: count open assignments / role. Use: deactivate member. Without locking the member row, another txn can assign a task between check and deactivate. `removeMember` uses `FOR UPDATE` on the member row inside a transaction; tests race remove vs assign.

**Q: Why `date_trunc('milliseconds', updated_at)`?**  
**A:** JS/JSON timestamps are ms-precision; Postgres `timestamptz` may hold more. Truncating aligns the OCC compare with what clients round-trip in `expectedUpdatedAt`.

**Q: Flaky tests vs flaky prod?**  
**A:** Flaky tests often share DB state, skip `resetDb`, or rely on timing. Flaky prod usually means missing locks/constraints under real concurrent users. Same root skill: make the race reliable, then fix the invariant.

---

## 13. Glossary

| Term | Meaning |
|------|---------|
| **OCC** | Optimistic concurrency control via version/timestamp compare-and-swap |
| **`expectedUpdatedAt`** | Client-supplied prior `updatedAt` required on task PATCH |
| **TOCTOU** | Time-of-check to time-of-use gap between read and write |
| **`FOR UPDATE`** | Row lock until transaction ends |
| **Refresh rotation** | Revoke old refresh session; issue new raw token |
| **Reuse detection** | Presenting already-revoked refresh → revoke all sessions |
| **Invariant** | Property that must hold after every interleaving |

---

## 14. Optional further reading

- Decision tree: [README.md](./README.md) · Auth refresh detail: [06-auth-and-token-failures.md](./06-auth-and-token-failures.md) · Authz: [07-authz-idor-and-unexpected-403-404.md](./07-authz-idor-and-unexpected-403-404.md) · Tests: [09-test-failures.md](./09-test-failures.md) · Fix loop: [10-fix-protocol.md](./10-fix-protocol.md)  
- Lessons (optional): [toctou](../lessons/database/toctou.md), [optimistic-concurrency](../lessons/database/optimistic-concurrency.md), [pessimistic-locking](../lessons/database/pessimistic-locking.md), [locking-kinds](../lessons/database/locking-kinds.md), [isolation-levels](../lessons/database/isolation-levels.md), [refresh-rotation-and-reuse](../lessons/security/refresh-rotation-and-reuse.md)  
- Code: `task.service.ts`, `task.repository.ts`, `project.service.ts` (`removeMember`, `transferOwnership`), `auth.service.ts` (`refresh`), `concurrency.test.ts`, `members.removal.test.ts`

---

## Teach pointer

> “If timing changes the result, you don’t have a heisenbug — you have an unlocked invariant.”
