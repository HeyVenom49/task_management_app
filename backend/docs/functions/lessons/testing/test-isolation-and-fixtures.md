# Lesson: Test isolation and fixtures

**Standalone ✓** — You do not need any other doc to write reliable integration tests for this API with bun:test.

**After this file you can:** reset the database between tests, use helpers under `backend/src/test`, understand rate-limit passthrough in test env, avoid cross-test pollution, and interview on isolation.

---

## 1. First principles

**Test isolation** means test A’s data and side effects do not change test B’s result — order-independent, repeatable.

**Fixtures** are reusable setup helpers (users, projects, HTTP clients) so each test starts from a known world instead of copy-pasting registration flows.

**The problem it solves:** Flaky suites (“passes alone, fails in CI”), mysterious 409s from leftover rows, and rate limits blocking login spam in tests.

---

## 2. Mental model

### Analogy

Hotel rooms: after each guest, housekeeping resets the room. If you skip cleaning, the next guest finds dirty towels (leftover DB rows) and complains about “random” bugs.

Rate limits in test: turn off the bouncer so QA can enter repeatedly; production keeps the bouncer.

### Diagram

```text
bun test --preload ./src/test/preload.ts
        │  NODE_ENV=test, JWT secrets, DATABASE_URL defaults
        ▼
describe(...)
  beforeEach → resetDb()   TRUNCATE ... CASCADE
  test → helpers (registerVerifiedUser, seedAliceBobProjects, api())
        │
        └── rate-limit modules export passthrough when NODE_ENV=test
```

---

## 3. Core rules (must / must-not)

1. **MUST** reset shared mutable state between tests that hit the DB (`resetDb` in `beforeEach` or equivalent).  
2. **MUST** set `NODE_ENV=test` before app modules that branch on env load (preload).  
3. **MUST** use helpers for auth/project setup instead of fragile duplication.  
4. **MUST NOT** depend on test order.  
5. **MUST NOT** leave rate limits on in unit/integration login storms unless testing limits themselves.  
6. **MUST** point tests at a disposable database (local/CI), never production.  
7. **MUST NOT** share mutable in-memory singletons without reset (cookies/agent state — prefer fresh `supertest` calls).

---

## 4. How it works (mechanics)

### Preload

`backend/package.json`:

```json
"test": "bun test --preload ./src/test/preload.ts"
```

`backend/src/test/preload.ts` sets:

- `NODE_ENV=test`  
- `DATABASE_URL` default  
- `JWT_SECRET`, `JWT_EXPIRES_IN`, `REFRESH_EXPIRES_IN`  
- `FRONTEND_URL`, `COOKIE_SECURE=false`

Preload runs **before** imports that read env — critical for limiters and logger.

### Rate-limit passthrough

`backend/src/shared/auth/rate-limit.ts`:

```ts
const isTest = process.env.NODE_ENV === "test";
const passthrough: RequestHandler = (_req, _res, next) => next();

export const loginLimiter = isTest ? passthrough : buildLimiter(...);
export const authWriteLimiter = isTest ? passthrough : buildLimiter(...);
```

Production uses Redis store and **fail-closed** 503 if Redis is down. Tests skip Redis for these limiters.

### DB reset

`backend/src/test/helper/db.ts`:

```ts
await sql`
  TRUNCATE TABLE
    tasks, members, projects, sessions,
    email_verification_tokens, password_reset_tokens, users
  RESTART IDENTITY CASCADE
`;
```

Order is handled by `CASCADE`; empties FK graph safely.

### HTTP + auth fixtures

- `helper/http.ts` — `api()` → `supertest(app)`; `authHeader(token)`.  
- `helper/auth.ts` — `registerVerifiedUser`: register → SQL force `ACTIVE` + `email_verified_at` → login → tokens.  
- `helper/seed.ts` — `seedAliceBobProjects`: two users + two projects for IDOR/authz tests.

### Example test

`backend/src/test/auth.api.test.ts`:

```ts
beforeEach(async () => {
  await resetDb();
});

test("register + login + GET /me", async () => {
  const { accessToken, user } = await registerVerifiedUser({ ... });
  const me = await api().get("/api/v1/auth/me").set(authHeader(accessToken));
  expect(me.status).toBe(200);
});
```

---

## 5. When to use / when not to use

| Situation | Approach |
|-----------|----------|
| API integration proving authz/IDOR | `resetDb` + seed helpers |
| Pure function unit test | No DB; no fixtures needed |
| Testing rate limits themselves | Don’t use passthrough — dedicated env or inject store |
| Parallel tests same DB | Risky without separate DBs / schemas per worker |
| Production smoke | Not `resetDb` — read-only checks |

---

## 6. Step-by-step: design → implement → verify

### Design

1. What invariant does the test prove?  
2. Minimum fixture graph (user? membership? task?).  
3. Cleanup strategy (truncate vs transaction rollback).

### Implement

1. `beforeEach(resetDb)`.  
2. Build state via helpers or HTTP.  
3. Act + assert status/body.  
4. Assert **absence** of secrets when relevant.

### Verify

1. Run test file twice — same result.  
2. Run full suite — no order flakes.  
3. Temporarily comment `resetDb` — watch collisions; restore it.

---

## 7. Worked example A — this project

### A1. Isolation via truncate

Every auth/tasks IDOR file uses `beforeEach(resetDb)` so Alice’s project cannot linger into Bob’s case.

### A2. Verified user without email round-trip

`registerVerifiedUser` bypasses inbox by updating `users` directly after register — fixture speed, still exercises real register+login HTTP.

**Where:** `backend/src/test/helper/auth.ts`.

### A3. IDOR seed

`seedAliceBobProjects` gives two isolated ownership graphs for `tasks.idor.test.ts` / authz tests.

**Where:** `backend/src/test/helper/seed.ts`.

### A4. Why passthrough matters

Without test passthrough, dozens of login attempts in one file trip Redis limiter → 429 noise unrelated to the assertion.

---

## 8. Worked example B — mini scenario (self-contained)

**Flaky test:** “create project” expects 201; sometimes 409 name conflict.

**Cause:** No truncate; previous run’s project `info` remains; unique constraint fires.

**Fix:**

```ts
beforeEach(async () => {
  await resetDb();
});
```

**Alternative:** per-test unique names (`info: \`P-${crypto.randomUUID()}\``) — still prefer truncate for sessions/tokens cleanup.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| One `resetDb` in `beforeAll` only | Intra-file pollution |
| Shared global `accessToken` mutated | Cross-test auth confusion |
| Hitting prod DATABASE_URL | Data loss / legal incident |
| Testing through UI only | Slow; weak API isolation signal |
| Ignoring 429 in tests | Masked by disabling asserts |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Unique / FK violations randomly | Missing reset | `beforeEach` | Call `resetDb` |
| 429 Too Many Requests | `NODE_ENV` not test at limiter load | preload; import order | Ensure preload sets env first |
| register 201 but login 403 | Forgot verify step | helper SQL activate | Use `registerVerifiedUser` |
| Silent logs hide failures | Expected in test | logger level silent | Assert HTTP status, not logs |
| Truncate fails on new table | Migration added table | `helper/db.ts` list | Add table to TRUNCATE |

---

## 11. Interview Q&A (with strong answers)

**Q: What is test isolation?**  
**A:** Guaranteeing each test’s outcome doesn’t depend on other tests’ leftover state or execution order.

**Q: Truncate vs transaction rollback?**  
**A:** Truncate clears committed data between HTTP-level tests that commit per request. Rollback wrappers work for single-connection unit tests but are harder with real HTTP + pool.

**Q: Why preload?**  
**A:** So env flags exist before modules evaluate (`rate-limit` chooses passthrough at import time).

**Q: What is a fixture?**  
**A:** Reusable setup that builds a known baseline (user, project) for assertions.

**Q: Should rate limits run in CI integration tests?**  
**A:** Usually no for functional tests; yes in dedicated abuse tests with controllable stores.

**Q: How do you prove isolation?**  
**A:** Shuffle/repeat suite; temporarily break cleanup and observe failures; keep tests hermetic.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Isolation | No cross-test interference |
| Fixture | Shared setup helper / dataset |
| Preload | Bun hook running before tests/imports |
| Passthrough middleware | `next()` only — disables limiter |
| `TRUNCATE ... CASCADE` | Empty tables + dependent FK rows |
| Hermetic test | Self-contained; no external flaky deps beyond intended DB |

---

## 13. Teach pointer

> “Clean the room before every guest — fixtures build the scene, truncate clears the stage.”

---

## 14. Optional further reading (not required)

- Proof mindset: [testing-as-proof.md](./testing-as-proof.md)  
- Pyramid: [test-pyramid.md](./test-pyramid.md)  
- Fail-closed limits: [../security/fail-closed-rate-limits.md](../security/fail-closed-rate-limits.md)

Repo paths: `backend/src/test/preload.ts`, `helper/db.ts`, `helper/http.ts`, `helper/auth.ts`, `helper/seed.ts`, `backend/src/shared/auth/rate-limit.ts`, `backend/package.json`.
