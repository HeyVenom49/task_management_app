# 09 — Test failures

**Standalone ✓** — You do not need testing.md or other how-to-debug guides to hunt bun:test / supertest failures in this backend (harness vs product vs bad assertion).

**After this file you can:** read Expected/Received, check preload/`resetDb`/helpers first, map red files to services, and explain the triage in interview language.

---

## 1. Why this habit exists

A red test is either: **infra/harness**, a **real product regression**, or a **wrong expectation**. Juniors patch the assertion to match whatever the API returned. Seniors ask: “Is Postgres up? Did `preload.ts` run? Did `resetDb` clear rows? Is this IDOR test teaching a security property?”

Wrong first open: rewriting `assertCanUpdateTask` because `registerVerifiedUser` threw. Right first open: the helper error string / DB URL / missing migration.

---

## 2. Mental model

### Analogy

Tests are a **flight simulator**. If the simulator has no fuel (DB down), you don’t redesign the airplane. If the airplane violates “never fly into Bob’s hangar” (IDOR), you fix the airplane — not the rulebook.

```text
bun:test starts
  → preload.ts sets NODE_ENV=test, JWT, DATABASE_URL, COOKIE_SECURE
  → beforeEach(resetDb) TRUNCATE …
  → helpers: registerVerifiedUser / seedAliceBobProjects / api()
  → assertion on status/body
         ↘ fail: harness | product | bad test
```

### Neighborhood → house → room

| Signal neighborhood | House (file) | Room (function) |
|---------------------|--------------|-----------------|
| `register failed: 500…` | `helper/auth.ts` + DB | `registerVerifiedUser` |
| `ECONNREFUSED` / connect | Postgres / `db/client` | env URL from preload |
| Expected 403 Received 200 | product service | IDOR/authz path under test |
| Expected 201,409 got 201,201 | unique/race | `AuthService.register` / constraint |
| Rate limit 503 in tests | `rate-limit.ts` + env | `NODE_ENV` not `test` |
| TRUNCATE missing table | `helper/db.ts` | new migration not listed |

---

## 3. Core rules (must / must-not)

1. **MUST** read the **first** error — helper throw vs expect mismatch vs connection.  
2. **MUST** confirm harness before changing product: Postgres up, migrations applied, `preload` loaded, `resetDb` in `beforeEach`.  
3. **MUST** map test file → module (table below) before shotgun debugging.  
4. **MUST** treat IDOR/authz/concurrency failures as **likely product bugs**, not “flaky.”  
5. **MUST NOT** weaken security expectations to green CI.  
6. **MUST NOT** share mutable DB state across tests without truncate.  
7. **MUST NOT** ignore `register failed:` / `login failed:` — fix setup first.

---

## 4. Signal taxonomy (this app)

### Assertion mismatch

```text
Expected: 403
Received: 200
```

Security property broken **or** fixture wrong (Alice accidentally member of Bob’s project).

### Helper blow-up

```text
register failed: 500 {"message":"…"}
login failed: 401 …
```

From `registerVerifiedUser` in `src/test/helper/auth.ts` — register/login didn’t return 201/200. Often DB/schema/env, not the test’s final expect.

### Connection

```text
error: Unable to connect / ECONNREFUSED
```

Postgres not running or wrong `DATABASE_URL`. Tests need DB even when Redis is unused (limiters passthrough in test).

### Concurrency invariant

```text
Expected: [201, 409]
Received: [201, 201]
```

Unique constraint / conflict mapping broken — product bug surfaced by `concurrency.test.ts`.

---

## 5. Symptom → first open

| Symptom | First open | Why | If wrong, next |
|---------|------------|-----|----------------|
| All files red, connect errors | Postgres + `DATABASE_URL` | Infra | Docker compose / `.env` |
| Many helpers throw on register | migrations + `users` table | Schema drift | `preload.ts` JWT length |
| Single file: `auth.api.test.ts` | `auth.service` / routes | Auth flows | cookie/`X-Client` |
| `failures.test.ts` | `notFound`, `authenticate`, `errorHandler` | Middleware stack | AppError mapping |
| `tasks.idor.test.ts` | membership + projectId bind | IDOR | `seedAliceBobProjects` setup |
| `tasks.authz.test.ts` | `assertCanUpdateTask` | Field allow-list | fixture roles |
| `members.removal.test.ts` | `removeMember` + open tasks | 409 invariant | OCC timestamp on complete |
| `concurrency.test.ts` | register / refresh / transfer | Races | [08](./08-concurrency-and-flaky-failures.md) |
| 429/503 only in tests | `loginLimiter` / env | `NODE_ENV≠test` | preload order |
| TRUNCATE errors new table | `helper/db.ts` | List incomplete | add table to truncate |

---

## 6. Reproduce recipes

### Run one file

```bash
cd backend && bun test src/test/tasks.idor.test.ts
```

### Confirm preload

Bun should load `src/test/preload.ts` (configured in package / bunfig). Expect `NODE_ENV=test`, `COOKIE_SECURE=false`, JWT secret ≥16 chars.

### Confirm reset

Every suite here uses:

```ts
beforeEach(async () => {
  await resetDb();
});
```

`resetDb` truncates: `tasks`, `members`, `projects`, `sessions`, email/password token tables, `users`.

### Helper-only smoke

If `registerVerifiedUser` throws, curl register against the same DB URL or log `reg.status`/`reg.body` inside the helper temporarily.

---

## 7. Hypothesis ladder

1. **Infra** — DB up? migrations? URL matches preload default?  
2. **Preload** — `NODE_ENV=test`? JWT set? rate limit passthrough?  
3. **Isolation** — `resetDb` present? unique emails per test?  
4. **Fixture** — `seedAliceBobProjects` create 401 (bad token) vs wrong `info` validation?  
5. **Product** — Expected≠Received on IDOR/authz/concurrency → fix service.  
6. **Bad test** — assertion outdated after intentional API change (update test + OpenAPI together).  
7. **Order dependency** — only fails when full suite runs → shared state / missing truncate.

---

## 8. Worked failure A — “IDOR test: Expected 403 Received 200”

**Signal:** `tasks.idor.test.ts` — Alice GET Bob’s project tasks → 200 with Bob’s tasks.

**Reproduce:** `bun test src/test/tasks.idor.test.ts` after `resetDb`.

**Hypothesis ladder:**

1. Fixture — did seed add Alice to Bob’s project? Inspect `seedAliceBobProjects` (it should not).  
2. Auth — wrong token swapped in test?  
3. Product — `TaskService.list` skipped `requireActiveMember`.

**Root cause (typical):** membership check removed or always-true during a refactor.

**Fix:** restore `requireActiveMember` in `list`/`getById`; keep test expectation 403.

**Prove:** IDOR file green; manual Alice/Bob curl matches.

---

## 9. Worked failure B — mini invented: “Only CI fails members.removal”

**Signal:** Local single-file green; CI full suite red on `cannot remove member assigned to open task`.

**False lead:** “CI timezone breaks OCC” only — check that too, but first isolation.

**Investigate:**

1. Does CI run parallel workers against one DB? Cross-talk without DB-per-worker.  
2. Did a previous test leave Bob assigned? Missing `resetDb` in another file.  
3. Complete-task step 409 because stale `expectedUpdatedAt` if another worker patched the task.

**Fix:** ensure every file `beforeEach(resetDb)`; one DB per worker or serial tests; keep removal test’s OCC timestamp from create response.

**Prove:** full `bun test` green twice locally; CI green.

---

## 10. Helper cheat sheet

| Helper | Path | Common break |
|--------|------|--------------|
| `registerVerifiedUser` | `helper/auth.ts` | register≠201; SQL verify update; login≠200 |
| `seedAliceBobProjects` | `helper/seed.ts` | project create 401; validation on `info` |
| `api` / `authHeader` | `helper/http.ts` | importing `app` needs env — preload first |
| `resetDb` | `helper/db.ts` | new table not in TRUNCATE list |
| `preload.ts` | `src/test/preload.ts` | JWT too short; wrong DB; COOKIE_SECURE |

Unused imports in helpers don’t fail tests — ignore unless lint gates CI.

---

## 11. False leads / anti-patterns

| False lead | Reality |
|------------|---------|
| Changing Expected to 200 on IDOR | Shipping a vulnerability |
| Disabling `resetDb` “to go faster” | Order-dependent flakes |
| Digging into Redis for most tests | Limiters passthrough when `NODE_ENV=test` |
| Rewriting argon2 because helper login failed | User still INACTIVE if SQL update skipped |
| “bun:test is broken” on concurrency red | Invariant failed — see guide 08 |

---

## 12. Fix + prove checklist

- [ ] Same single file fails/passes reproducibly  
- [ ] Harness checklist done before product edits  
- [ ] Security tests still assert deny cases  
- [ ] New tables added to `resetDb` if you migrated  
- [ ] Full suite run once after local green  

---

## 13. Interview Q&A

**Q: Manual API works, tests fail — what differs?**  
**A:** Test env from `preload.ts` (`NODE_ENV=test`, `COOKIE_SECURE=false`, fixed JWT, default local DATABASE_URL), `resetDb` empty database, helpers that force-verify users via SQL, and rate-limit passthrough. Manual may hit Redis limits, unverified users, or a different DB. Diff env and whether migrations match.

**Q: How does preload interact with rate limits?**  
**A:** With `NODE_ENV=test`, login limiting should not block suites the way production Redis fail-closed does. If tests see 503/429 on login, preload didn’t apply or code paths ignore the test shortcut — fix env loading before product auth logic.

**Q: What do you do when a concurrency test flakes?**  
**A:** Run it in a tight loop / keep `Promise.all`. If it sometimes violates the invariant, the product race is real — add locking/constraint (guide 08). If it only flakes in parallel workers sharing one DB, fix isolation. Never merge with a sleep.

**Q: Helper throws `register failed: 500` — where first?**  
**A:** Postgres connectivity and migrations; then unique email collision if reset skipped; then auth register path. Don’t debug the downstream expect until register returns 201.

**Q: When is changing the test correct?**  
**A:** When product behavior intentionally changed and the old assertion encodes the old contract — update test, OpenAPI, and clients together. Not when you’re tired of a red IDOR case.

**Q: Why truncate instead of transactions per test?**  
**A:** This suite hits the real HTTP app and commits like production. Truncate gives a clean slate across tables with FKs (`RESTART IDENTITY CASCADE`) without teaching false isolation that request-scoped code doesn’t have.

---

## 14. Glossary

| Term | Meaning |
|------|---------|
| **preload** | Env bootstrap file run before tests |
| **`resetDb`** | TRUNCATE of app tables between tests |
| **Helper throw** | Setup failed before assertion |
| **Fixture** | Seeded users/projects (`seedAliceBobProjects`) |
| **Invariant test** | Asserts safety property under concurrency |
| **Harness** | DB, env, helpers, app import — not business rules |

---

## 15. Optional further reading

- Decision tree: [README.md](./README.md) · Races: [08-concurrency-and-flaky-failures.md](./08-concurrency-and-flaky-failures.md) · Fix loop: [10-fix-protocol.md](./10-fix-protocol.md) · Function testing notes: [../testing.md](../testing.md)  
- Lessons (optional): [testing-as-proof](../lessons/testing/testing-as-proof.md), [test-isolation-and-fixtures](../lessons/testing/test-isolation-and-fixtures.md), [test-pyramid](../lessons/testing/test-pyramid.md)  
- Code: `src/test/preload.ts`, `helper/{db,auth,http,seed}.ts`, `tasks.idor.test.ts`, `tasks.authz.test.ts`, `members.removal.test.ts`, `concurrency.test.ts`, `auth.api.test.ts`, `failures.test.ts`

---

## Teach pointer

> “A failed IDOR test is a gift. It’s the production incident that didn’t happen.”
