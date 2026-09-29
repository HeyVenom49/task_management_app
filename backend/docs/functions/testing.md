# Testing — helpers, every test file, thinking, and interview bank

Covers `src/test/**`.

**Core problem tests solve:** Prove security and concurrency invariants with **real HTTP + real DB**, not mocks of your own code. If a refactor breaks IDOR or refresh rotation, CI should scream.

---

## Mental model

```
preload.ts sets env (NODE_ENV=test, secrets, DB URL)
  → bun test loads app via helpers
    → resetDb() truncates tables before cases
      → registerVerifiedUser / seedAliceBobProjects
        → api() supertest against Express `app`
```

**Developer thinking:** Prefer **black-box API tests** for authz and races. Unit-testing repositories alone won’t catch “Alice can read Bob’s project.”

**Teach pointer:** “The test file name is the threat or property under test.”

---

# `preload.ts`

1. **Where:** `src/test/preload.ts`  
2. **What it does:** Forces `NODE_ENV=test` and default env vars (DB, JWT, refresh, frontend, `COOKIE_SECURE=false`) if missing.  
3. **Problem it solves:** Importing `config/env` would crash without env; rate limiters see `test` and become passthrough.  
4. **Why this shape:** Preload hook runs before modules evaluate — critical for Zod parse at import.  
5. **How to think like that:** *What is the earliest code that reads process.env?*  
6. **Teach pointer:** “Test env is part of the harness, not an afterthought.”  
7. **Fits where:** Bun/test runner preload config (project tooling).  
8. **Interview bank:**  
   - **What/How:** Why set NODE_ENV before other imports.  
   - **Why:** Why defaults with `??` instead of always overwriting.  
   - **Failure modes:** Pointing tests at production DB — how prevent?  
   - **Security:** Weak JWT secret in test OK?  
   - **Data:** Shared local DB + TRUNCATE — parallel test workers risk?  
   - **Ops:** CI service containers for Postgres.  
   - **Testing:** Difference between preload and `beforeEach`.  
   - **Tradeoffs:** Testcontainers vs local Postgres.

---

# Helpers

## `helper/http.ts` — `api`

1. **What:** `request(app)` from supertest.  
2. **Problem:** Hit middleware+routes without listening on a port.  
3. **Interview:** Supertest vs fetch against running server; why export factory `api()` not singleton (fresh agent?).

## `helper/http.ts` — `authHeader`

1. **What:** `{ Authorization: Bearer … }`.  
2. **Problem:** DRY auth header construction.  
3. **Interview:** Why not set cookies for access token (access is Bearer-only by design).

## `helper/db.ts` — `resetDb`

1. **What:** `TRUNCATE` tasks, members, projects, sessions, email_verification_tokens, password_reset_tokens, users — `RESTART IDENTITY CASCADE`.  
2. **Problem:** Isolation between tests; predictable empty world.  
3. **Interview bank:**  
   - Why truncate order / CASCADE.  
   - TRUNCATE vs DELETE.  
   - Transactions per test rollback alternative.  
   - Missing table in list → flaky FK failures.  
   - Parallelism safety.

## `helper/auth.ts` — `registerVerifiedUser`

1. **What:** POST register; **SQL update** user to ACTIVE + email_verified_at; POST login; return user + accessToken.  
2. **Problem:** Bypass email inbox in tests while still exercising HTTP register/login.  
3. **Why SQL verify:** Product verify-email is link/token based; tests need speed and determinism.  
4. **Interview bank:**  
   - Is bypassing verification realistic? What bugs can it miss?  
   - Why not call `AuthService.verifyEmail` directly?  
   - Unused import `log` / `loginLimiter` in file — dead imports as review smell.  
   - Password conventions in tests.  
   - Does it return refresh token? (No — cookie side; mobile header not set.)

## `helper/seed.ts` — `seedAliceBobProjects`

1. **What:** Two verified users; each creates a project; returns tokens, project ids, membership ids.  
2. **Problem:** Standard fixture for IDOR scenarios.  
3. **Interview:** Fixture libraries; builder pattern; why Alice/Bob naming classic in security tests.

---

# `auth.api.test.ts`

## Suite setup `beforeEach(resetDb)`

Interview: isolation guarantee.

## Test: `register + login + GET /me`

1. **What it proves:** Happy path identity: verified user can authenticate and `/me` returns email.  
2. **Problem it catches:** Broken register/login JWT wiring; authenticate middleware regression.  
3. **Interview bank:**  
   - What layers does this traverse?  
   - Why assert email specifically?  
   - What’s not covered (refresh, logout, verify-email endpoint)?  
   - How expand to cookie refresh assertions?

## Test: `GET /projects without token → 401`

1. **What it proves:** Project router’s `authenticate` rejects anonymous.  
2. **Problem it catches:** Accidentally removing auth middleware.  
3. **Interview:** Why this lives in auth test file; smoke vs dedicated authz suite.

---

# `failures.test.ts`

## `unknown route does not leak internals`

1. **What:** 404 body must not contain `postgres` or stack-like `at /`.  
2. **Problem:** Error responses as information disclosure.  
3. **Interview:** Security regression tests; false positives; should assert exact JSON shape from `notFound`.

## `invalid JWT → 401 with safe message`

1. **What:** Bearer garbage → 401; message present; no `JsonWebToken` string leak.  
2. **Problem:** Library error messages leaking to clients.  
3. **Interview:** Tie to `authenticate` catch → `UnauthorizedError` → `errorHandler`; jose vs jsonwebtoken naming.

---

# `tasks.idor.test.ts`

**IDOR = Insecure Direct Object Reference** — attacker supplies another object’s id.

## `Alice cannot GET Bob's project`

1. **Proves:** `requireActiveMember` → 403.  
2. **Interview:** Why 403 not 404 here; enumeration of project UUIDs.

## `Alice cannot list Bob's project` (tasks)

1. **Proves:** Task list gated by project membership.  
2. **Interview:** Setup creates Bob’s task first — why.

## `Alice cannot access Bob's taskId under Project A`

1. **Proves:** Cross-project task id → **404** on GET and PATCH (projectId mismatch).  
2. **Problem:** Classic nested-resource IDOR.  
3. **Interview bank:**  
   - Explain attack step-by-step.  
   - Why 404 instead of 403.  
   - Would DELETE need same assert? (Yes — service checks.)  
   - UUID predictability.

---

# `tasks.authz.test.ts`

## `assignee status-only; mixed PATCH rejected; other member blocked`

1. **Proves:**  
   - Assignee can PATCH status only → 200.  
   - Assignee status+priority → 403.  
   - Unrelated member status → 403.  
   - Owner can change title/priority → 200.  
2. **Problem:** Field-level authorization regressions.  
3. **Interview bank:**  
   - Walk `assertCanUpdateTask`.  
   - Why update `expectedUpdatedAt` between calls.  
   - Matrix testing approach (roles × fields).  
   - Missing cases: creator who is not owner; assignee clearing title; null assignee.

---

# `members.removal.test.ts`

## `cannot remove member assigned to open task → 409; ok after complete`

1. **Proves:** Business rule + conflict status; completion unlocks removal.  
2. **Interview:** Soft delete; definition of open; owner performing patches.

## `parallel remove vs assign → never inactive with open assignment`

1. **Proves:** Under race, invariant holds: if member not active in list, no open tasks assigned to them.  
2. **Problem:** TOCTOU between assign and deactivate.  
3. **How to think like that:** *Don’t assert which request wins — assert the invariant.*  
4. **Teach pointer:** “Concurrency tests assert safety properties, not winners.”  
5. **Interview bank:**  
   - Why `Promise.all` both operations.  
   - Locks and DB check constraints.  
   - Flaky tests — how stabilize.  
   - Linearizability vs application invariants.

---

# `concurrency.test.ts`

## `parallel duplicate register → one success, one conflict`

1. **Proves:** Unique email under race → `{201,409}` sorted.  
2. **Interview:** Unique constraint as source of truth; app-level findByEmail insufficient alone.

## `parallel refresh with same token → at most one success`

1. **Proves:** Refresh rotation: exactly one 200, other 401; uses `X-Client: mobile` to read refresh from body.  
2. **Interview bank:**  
   - Why mobile header required in test.  
   - Reuse detection / revoke semantics.  
   - Flakes if revoke not conditional.  
   - Session family revocation on reuse (deeper than this test).

## `parallel transferOwnership to two members → one owner left active`

1. **Proves:** Ownership transfer race leaves a single ACTIVE OWNER; old owner becomes MEMBER.  
2. **Interview:** Locking in `transferOwnership`; asserting via member list.

## `transfer then former owner transfer again → 403 and still one owner`

1. **Proves:** After successful transfer, former owner cannot transfer; ownership stable.  
2. **Interview:** Authorization after role change; stale tokens still identify user but membership role changed.

---

# Cross-cutting interview set — testing strategy

### Junior
- What is supertest?  
- Why reset DB between tests?  
- Difference between 401 and 403 in these tests.

### Mid
- Why integration tests over mocked repositories for authz?  
- How does preload interact with rate limiters?  
- Design a test for logout + refresh failure.  
- Design a test for password change revoking sessions.

### Senior
- Property-based / invariant testing for membership.  
- Quarantining flaky concurrency tests.  
- Test data builders vs seed helpers.  
- Coverage vs risk-based test selection.  
- Contract tests vs OpenAPI.  
- How you’d test Redis fail-closed rate limit (503) without flaking CI.

### Gaps worth discussing in interviews (honest)

- Limited direct tests for verify-email / forgot-reset HTTP flows.  
- Limited cookie-based refresh tests (mobile body path used).  
- No explicit test that reuse of revoked refresh revokes all sessions.  
- `registerVerifiedUser` skips real token email path.

Knowing gaps is a **senior** signal — mention what you’d add next.

---

# Teach script (testing)

1. Name the threat: IDOR, authz matrix, race, info leak.  
2. Show how fixture builds Alice/Bob.  
3. Run one test mentally; predict status codes.  
4. Ask: “If we removed `task.projectId !== projectId` check, which test fails?”
