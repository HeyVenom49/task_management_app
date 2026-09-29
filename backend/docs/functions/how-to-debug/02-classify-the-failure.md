# 02 — Classify the failure

**Standalone ✓** — You do not need other how-to-debug guides to put a bug in one bucket and open the right subsystem first in this backend.

**After this file you can:** answer five sorting questions, map a symptom to boot / request / infra / auth / authz / concurrency / test-only, and know what *not* to open for each bucket.

---

## 1. Why this habit exists

Most wasted debug time is **wrong neighborhood**. Postgres-down symptoms get chased in task authz. Login-503 gets chased in Zod. CI-only red gets chased as a production outage.

Classification is a 30-second habit that saves a 30-minute wander. You are choosing which *playbook* applies — not fixing yet.

---

## 2. Mental model

### Analogy

Think of the system as a city with districts. The failure report is a **911 call**. Dispatch sends you to the right district before you pick a house.

```text
Any request work? ──no──► Boot / process / Redis connect / env
        │
       yes
        │
Health OK, this URL bad? ──yes──► Request path (status + message)
        │
Depends on which user? ──yes──► Authz / IDOR / membership
        │
Depends on timing/parallel? ──yes──► Concurrency / flaky
        │
Only tests red? ──yes──► Test harness / preload / NODE_ENV=test
        │
Connection/SQLSTATE/503 limiter? ──yes──► Postgres / Redis / migrate
```

### Neighborhood → house (this repo)

| Bucket | House (start files) |
|--------|---------------------|
| Boot | `config/env.ts`, `server.ts`, `shared/redis/redis.ts`, `db/client.ts` |
| Request HTTP | Route module → controller → service (by status) |
| Infra | `DATABASE_URL`, health `/db`, Redis URL, `rate-limit.ts`, `migrate.ts` |
| Auth/session | `auth.service.ts`, `authenticate.ts`, `refresh-cookie.ts`, `token.ts` |
| Authz/IDOR | `project.service` / `task.service` membership asserts |
| Concurrency | OCC `expectedUpdatedAt`, locks, parallel refresh |
| Test-only | `test/preload.ts`, helpers, limiter passthrough |

---

## 3. Core rules (must / must-not)

1. **MUST** ask: does **any** request work (especially `GET /api/v1/health`)?  
2. **MUST** ask: one-curl reproducible, or only under parallel / only in CI?  
3. **MUST** ask: does it depend on **which user** or which project membership?  
4. **MUST** separate **boot** (process never healthy) from **request** (server up, one URL wrong).  
5. **MUST NOT** start in controllers when the process exits before `listen`.  
6. **MUST NOT** treat “login 503 rate limiting unavailable” as a Zod/business bug — infra adjacent.  
7. **MUST NOT** assume Postman-green / test-red means production is fine forever — classify as test-only first, then ask why environments differ.

---

## 4. Signal taxonomy (buckets)

### 1) Boot failure

**Signals:** process exit; Docker/K8s crash loop; console `Failed to start server: …`; Zod env throw at import; `COOKIE_SECURE must be true when NODE_ENV=production`; hang/fail on `connectRedis()`.

**Not:** HTTP JSON from a live handler.

### 2) Request failure (runtime HTTP)

**Signals:** server listening; one `METHOD URL` returns wrong status/body; AppError / validation / notFound shapes (see signal reading).

### 3) Infra adjacent (DB / Redis / migrate)

**Signals:** `ECONNREFUSED`, timeouts, `Redis error`, health `/db` fails, migrate `Database migration failed.`, login **503** `Rate limiting unavailable. Try again later.`

### 4) Auth / session

**Signals:** `/auth/login|register|refresh|logout|verify|reset|/me`; cookie missing; mobile body refresh; JWT Bearer 401.

### 5) Authz / IDOR

**Signals:** 403 `You do not have access…`; 404 `Task not found` when id exists under another project; Alice/Bob wrong data.

### 6) Concurrency / flaky

**Signals:** fails under parallel tests; OCC 409 `Task was modified; reload and try again`; refresh reuse; “works once locally.”

### 7) Test-only

**Signals:** app works in Postman; `bun test` red; or only CI red. `NODE_ENV=test` makes rate limiters **passthrough** — Redis not required for most tests.

---

## 5. Symptom → first open

| Symptom | First open | Why | If wrong, next |
|---------|------------|-----|----------------|
| Process exits at start | `config/env.ts` | Zod parse / COOKIE_SECURE guard runs at import | `server.ts` `connectRedis`, then `DATABASE_URL` |
| `Failed to start server` | `server.ts` `start()` | Redis connect before listen | Redis URL / Postgres later if import of `db/client` fails |
| Health 200, `/health/db` fails | `db/client.ts` + Postgres | `SELECT 1` path | `DATABASE_URL`, network, DB exists |
| Health OK, login 503 limiter | `rate-limit.ts` + Redis | Fail-closed store | Redis up? `isOpen`? |
| Health OK, login 401/403 | Auth service / status | Request auth bucket | Not projects |
| Protected route 401, no Bearer | `authenticate.ts` | Identity gate | Client header |
| 403 project/task access | `requireActiveMember` / owner helpers | Authz | Membership row status/role |
| 404 Route … not found | `api/v1.ts` mounts | Routing | Module routes typo |
| 409 email / name / OCC | Matching service catch | Conflict domain | Unmapped 23505 → 500 |
| Parallel-only failure | Concurrency guides / OCC / locks | Race | Isolation in tests |
| Postman OK, test Expected≠Received | Failing test + `preload.ts` | Harness | `resetDb`, seed, `NODE_ENV=test` |
| Migrate job red | `db/migrate.ts` + failing `.sql` | Schema apply | `schema_migrations` rows |

---

## 6. Reproduce recipe

### Sort with health first

```bash
BASE=http://localhost:4000
curl -s -D- "$BASE/api/v1/health"
curl -s -D- "$BASE/api/v1/health/db"
```

- Neither works / connection refused → boot or process not up.  
- Health OK, db fails → Postgres bucket.  
- Both OK → request/auth/authz; use one failing curl next.

### One-curl reproducibility check

```bash
# Replace with the failing call
curl -s -D- -X POST "$BASE/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"u@example.com","password":"secret"}'
```

If always same → request bucket. If intermittent → concurrency/infra.

### Test-only probe

Run the single failing test file. If manual curl against the same server passes, open `test/preload.ts` and helpers before rewriting production services.

---

## 7. Hypothesis ladder

1. **Dead process / bad env** — health unreachable; check boot.  
2. **Infra half-up** — health OK, db or Redis path fails; 503 limiter.  
3. **Identity** — 401 / refresh / cookie channel.  
4. **Policy** — 403 / membership / role.  
5. **Routing / validation** — Route not found / Validation failed.  
6. **Domain conflict / OCC** — 409.  
7. **Unhandled** — 500 + requestId logs.  
8. **Harness** — only tests fail.

Kill each with one check (health, one curl, two users, parallel flag, test vs Postman).

---

## 8. Worked failure A — “Production pod crash loops; login ‘works’ on laptop”

**Signal:** K8s: container exits. Local: `bun run` fine. No useful HTTP body — process never stays up.

**Reproduce:** Set `NODE_ENV=production` and `COOKIE_SECURE=false` locally (or omit COOKIE_SECURE).

**Hypothesis ladder:**

1. Request bug? No — never listens.  
2. `env.ts` production guard: `COOKIE_SECURE must be true when NODE_ENV=production`.  
3. Confirm deploy env missing `COOKIE_SECURE=true`.

**Root cause:** env guard throws at import before `start()`.

**Fix:** Set `COOKIE_SECURE=true` (and HTTPS) in production; don’t remove the guard.

**Prove:** Process stays up; `GET /api/v1/health` → 200; login still sets Secure cookies as designed.

**Critical code:**

```ts
if (parsed.NODE_ENV === "production" && !parsed.COOKIE_SECURE) {
  throw new Error("COOKIE_SECURE must be true when NODE_ENV=production");
}
```

---

## 9. Worked failure B — mini invented: “Login returns 503 — is AuthService broken?”

**Signal:** `POST /auth/login` → 503, message `Rate limiting unavailable. Try again later.` Health `/` is 200. Redis container stopped.

**False lead:** Dig into argon2 / `AuthService.login`.

**Classify:** Infra adjacent (rate limit fail-closed), not auth domain.

**Confirm:** Redis down → `rate-limit.ts` `sendCommand` catch throws `ServiceUnavailableError`. Logs may show `Redis error`.

**Fix:** Restore Redis (or fix `REDIS_URL`). Do not disable limiter in production to “unblock” login.

**Prove:** Redis up → login returns 401/403/200 as credentials dictate, not 503.

---

## 10. False leads / anti-patterns

| False lead | Reality |
|------------|---------|
| Debugging task repos while process won’t start | Boot / env / Redis connect |
| “Auth bug” on 503 limiter message | Redis fail-closed |
| “Postgres bug” on 403 access message | Membership / ForbiddenError |
| Rewriting service because CI fails and Postman works | Test preload / DB reset / env |
| Skipping classification “to save time” | Guarantees wrong first file |

---

## 11. Fix + prove checklist

- [ ] Bucket written down before the fix (boot / request / infra / auth / authz / concurrency / test)  
- [ ] Health (and `/health/db` if DB-related) checked  
- [ ] Same failing curl or test now passes  
- [ ] Neighboring bucket still sane (e.g. fixed Redis → login domain errors still correct)  
- [ ] Did not “fix” by removing fail-closed limiter or env production guards  

---

## 12. Interview Q&A

**Q: Server won’t start in production — first three checks?**  
**A:** (1) Env parse / production guards in `config/env.ts` (especially `COOKIE_SECURE`). (2) `connectRedis()` in `server.ts` — Redis reachable at `REDIS_URL` or default. (3) `DATABASE_URL` / Postgres reachable (`db/client.ts` created at import; migrate job separate). Don’t open controllers until the process listens and health responds.

**Q: Health OK but login 503 — what failed?**  
**A:** Almost certainly the Redis-backed rate limiter fail-closed path: store `sendCommand` threw → `ServiceUnavailableError("Rate limiting unavailable…")`. Auth service may never run. Fix Redis connectivity; keep fail-closed behavior.

**Q: Test fails, manual API works — what differs in this repo?**  
**A:** `test/preload.ts` forces `NODE_ENV=test` and default secrets/URLs. Rate limiters become passthrough when `NODE_ENV=test`. Tests use helpers (`resetDb`, seed, HTTP helpers). Failures are often fixture/isolation/assertion issues, not the same code path as a long-lived Postman session against a manually migrated DB.

**Q: Why classify before tracing the request path?**  
**A:** Tracing the full middleware → service pipe is the right tool for request failures. Boot and infra failures don’t have a meaningful “controller entry.” Classification picks the tool; tracing is one tool.

**Q: How do you tell authz from auth?**  
**A:** Auth = who are you? (401, invalid credentials, bad/missing JWT/refresh). Authz = we know you, policy denies (403 access/role), or IDOR-safe 404 for cross-project resources. Sorting question: “Does it depend on which user/membership?”

---

## 13. Glossary

| Term | Meaning |
|------|---------|
| **Bucket / class** | Boot, request, infra, auth, authz, concurrency, test-only |
| **Health** | `GET /api/v1/health` process liveness-ish; `/health/db` = `SELECT 1` |
| **Fail-closed limiter** | Redis errors → 503, do not skip limits |
| **Passthrough limiter** | In `NODE_ENV=test`, limiters call `next()` only |
| **Crash loop** | Process exits repeatedly — treat as boot until proven otherwise |
| **One-curl reproducible** | Same request always fails → request bucket evidence |

---

## 14. Optional further reading

- Signals: [01-read-the-signal.md](./01-read-the-signal.md) · Trace: [03-trace-the-request-path.md](./03-trace-the-request-path.md) · Status: [04-status-code-playbook.md](./04-status-code-playbook.md)  
- Infra: [05-postgres-and-redis-errors.md](./05-postgres-and-redis-errors.md) · Auth: [06-auth-and-token-failures.md](./06-auth-and-token-failures.md) · Authz: [07-authz-idor-and-unexpected-403-404.md](./07-authz-idor-and-unexpected-403-404.md)  
- Concurrency: [08-concurrency-and-flaky-failures.md](./08-concurrency-and-flaky-failures.md) · Tests: [09-test-failures.md](./09-test-failures.md)  
- Lessons (optional): [fail-closed-rate-limits](../lessons/security/fail-closed-rate-limits.md), [health-readiness](../lessons/ops/health-readiness.md)  
- Code: `server.ts`, `config/env.ts`, `modules/health/health.routes.ts`, `shared/auth/rate-limit.ts`, `test/preload.ts`
