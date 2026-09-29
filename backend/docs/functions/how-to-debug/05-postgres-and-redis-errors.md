# 05 — Postgres and Redis errors

**Standalone ✓** — You do not need other how-to-debug guides or lessons to translate connection failures, SQLSTATE codes, migration errors, empty RETURNING, and Redis/rate-limit symptoms into the next action in this backend.

**After this file you can:** check health/db, map `23505`/`23514`/`23503`, find unmapped unique violations that leak as 500, run migrate filename rules, and explain fail-closed login when Redis is down.

---

## 1. Why this habit exists

Infrastructure errors have **infrastructure first files**. Juniors debug `ForbiddenError` while Postgres is down, or rewrite AuthService because login returns 503. Seniors read the driver/SQLSTATE/Redis signal and open `DATABASE_URL`, `migrate.ts`, or `rate-limit.ts` first.

Wrong layer: hours. Right layer: minutes.

---

## 2. Mental model

### Analogy

Postgres and Redis are **utilities**. If water/electricity is out, don’t renovate the kitchen layout (business services).

```text
Connection refused / timeout     → utility not reachable (URL, process, network)
SQLSTATE 23505/23514/23503       → utility accepted query; constraint said no
Empty RETURNING / Couldn't create→ write didn’t yield a row (schema/migration/bug)
Redis error / limiter 503        → cache/limiter utility fail-closed
Migration failed                 → schema deploy job, not a request handler
```

### Neighborhood → house → room

| Signal | House | Room |
|--------|-------|------|
| DB connect / health db | `config/env.ts`, `db/client.ts` | `DATABASE_URL`, `SELECT 1` |
| Migrate console error | `db/migrate.ts` | failing `.sql` / filename |
| `23505` → 409 | Auth/Project service catch | `isUniqueViolation` |
| `23514` → 400/409 | Task/Project check handlers | `isCheckViolation` |
| `23503` on delete | `ProjectServices.remove` | FK map |
| Unmapped code → 500 | Service missing catch | errorHandler unknown |
| Redis boot / logs | `shared/redis/redis.ts`, `server.ts` | `connectRedis` |
| Login 503 limiter | `shared/auth/rate-limit.ts` | `sendCommand` catch |

---

## 3. Core rules (must / must-not)

1. **MUST** run `GET /api/v1/health` and `/api/v1/health/db` before digging into task authz for “everything fails.”  
2. **MUST** map SQLSTATE: `23505` unique, `23514` check, `23503` foreign key — then find who catches them.  
3. **MUST** treat raw `23505` as **500** as a **missing service map**, not “Postgres is weird.”  
4. **MUST** treat login/resend/forgot **503** `Rate limiting unavailable…` as Redis fail-closed.  
5. **MUST NOT** disable rate limits in production to bypass Redis outages without an explicit security decision.  
6. **MUST NOT** expect Redis for most unit/API tests — `NODE_ENV=test` makes limiters passthrough.  
7. **MUST NOT** ignore migrate filename rules (`001_name.sql`) when the job exits 1.

---

## 4. Signal taxonomy (this app)

### Postgres connection

- Driver: `ECONNREFUSED`, timeout, auth failure, “database does not exist”, SSL errors.  
- Client: `db/client.ts` — `postgres(env.databaseUrl)` at import.  
- Health:

```ts
healthRouter.get("/db", async (_req, res) => {
  const result = await sql`SELECT 1`;
  return res.json({ database: result[0] });
});
```

### SQLSTATE mapping (services)

| Code | Meaning | Typical HTTP | Look at |
|------|---------|--------------|---------|
| `23505` | unique_violation | 409 Conflict | register email; project name; membership unique |
| `23514` | check_violation | 400/409 | assignee invariants; open-task member removal triggers |
| `23503` | foreign_key_violation | 409 on project delete | `ProjectServices.remove` |

Pattern in services:

```ts
private isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err
    && (err as { code: string }).code === "23505";
}
// same pattern for isCheckViolation → "23514"
```

### Empty RETURNING

Repos throw plain `Error` (becomes **500**):

- `Couldn't create task` / `project` / `member` / `session` / `token`

### Redis

```ts
redis.on("error", (err) => { console.error("Redis error", err); });
// server.ts start():
await connectRedis(); // before listen
```

Limiter fail-closed:

```ts
sendCommand: async (...args: string[]) => {
  try {
    if (!redis.isOpen) await redis.connect();
    return await redis.sendCommand(args);
  } catch {
    throw new ServiceUnavailableError(
      "Rate limiting unavailable. Try again later.",
    );
  }
},
```

`loginLimiter` / `authWriteLimiter` are **passthrough** when `NODE_ENV === "test"`.

### Migrations

Console: `Database migration failed.` + message.  
Rules: files `^\d+_.*\.sql$`; skip `._*`; each file in `sql.begin` transaction + insert `schema_migrations`.

---

## 5. Symptom → first open

| Symptom | First open | Why | If wrong, next |
|---------|------------|-----|----------------|
| ECONNREFUSED / timeout to DB | `DATABASE_URL` / Postgres up | Connection | Docker network, DB name |
| `/health` OK, `/health/db` fails | `db/client.ts` + Postgres | `SELECT 1` | Credentials / SSL |
| Process fails at start after Redis | `server.ts` `connectRedis` | Boot order | `REDIS_URL` / Redis process |
| Logs `Redis error` | `shared/redis/redis.ts` | Client error event | Network blips vs hard down |
| Login/resend 503 rate limiting unavailable | `rate-limit.ts` | Fail-closed store | Redis `isOpen`, URL |
| Register 409 email taken | `AuthService.register` 23505 | Mapped unique | Concurrent double submit |
| Register 500 with unique in logs | Same register catch missing | Unmapped 23505 | Add ConflictError map |
| Task create 400 Invalid assignee | `TaskService` check map | 23514 → BadRequest | DB trigger/constraint |
| Remove member conflict open tasks | `removeMember` + migration invariants | 23514 / count | `010_member_assignee_invariants.sql` |
| `Couldn't create …` 500 | Named repository + migrations | RETURNING empty | Schema drift |
| `Database migration failed` | `migrate.ts` + failing SQL file | Deploy job | Filename format; partial schema check |
| Invalid migration filename | `migrate.ts` regex | `001_name.sql` required | Rename file |
| Tests ignore Redis | `rate-limit.ts` `isTest` | Passthrough | Don’t assume prod parity |

---

## 6. Reproduce recipe

### DB connectivity

```bash
BASE=http://localhost:4000
curl -s -D- "$BASE/api/v1/health"
curl -s -D- "$BASE/api/v1/health/db"
# Optional: psql "$DATABASE_URL" -c 'SELECT 1'
```

### Redis / limiter 503

1. Stop Redis (or point `REDIS_URL` at a closed port).  
2. Restart API so `connectRedis` fails **or** keep process up and break Redis after boot (runtime sendCommand fail).  
3. `POST /api/v1/auth/login` with valid JSON → expect 503 `Rate limiting unavailable…` when store commands fail.  
4. Start Redis → login returns domain status again.

### Migration failure

```bash
# From backend package — use your usual migrate script
# Intentionally break: rename a new file without NNN_ prefix → Invalid migration filename
# Or apply bad SQL → Database migration failed + SQL error message
```

Inspect `schema_migrations` for applied versions; each file runs in a transaction (should roll back that file on failure).

### Unique violation path

Register same email twice → 409 `Email already registered` (mapped). If you temporarily remove the catch, expect 500 + driver code in logs — teaches why mapping matters.

---

## 7. Hypothesis ladder

1. **Reachability** — health/db / Redis ping / migrate connect.  
2. **Env URL wrong** — `DATABASE_URL`, `REDIS_URL` optional default `redis://127.0.0.1:6379`.  
3. **Constraint expected** — 23505/23514/23503 mapped to AppError?  
4. **Constraint unmapped** — 500 + code in logs → add service catch.  
5. **Schema drift** — RETURNING empty / missing column → migrate.  
6. **Limiter vs domain** — 503 message vs 401 invalid password.  
7. **Test env** — passthrough limiter; separate DB URL in preload.

---

## 8. Worked failure A — “Duplicate email returns 500 instead of 409”

**Signal:** Second `POST /auth/register` with same email → 500 `Internal Server Error`, requestId X. Logs: postgres error `code: '23505'`.

**Reproduce:** Register once 201; register again same email.

**Hypothesis ladder:**

1. Redis? No — not 503 limiter text.  
2. Domain ConflictError path — should map 23505.  
3. Open `AuthService.register` catch: `err.code === "23505"` → `ConflictError("Email already registered")`. If catch missing/regressing → 500.

**Root cause:** Unique violation not mapped (or thrown outside catch). Unique index still correct — HTTP mapping bug.

**Fix:** Restore map to `ConflictError` (keep DB unique constraint — defense in depth).

**Prove:** Second register → 409 `{ message: "Email already registered", requestId }`; warn log AppError not error stack.

**Critical pattern:** DB constraint is source of truth under races; service maps known codes to stable HTTP.

---

## 9. Worked failure B — mini invented: “CI migrate fails: Invalid migration filename”

**Signal:** Job prints `Database migration failed.` / `Invalid migration filename: foo.sql. Expected format 001_name.sql`. App never boots with new schema.

**False lead:** Rewrite `db/client.ts` or health checks.

**Actual:** `migrate.ts` requires `/^(\d+)_.*\.sql$/`. A file like `add_users.sql` or macOS `._001_foo.sql` (filtered partially — `._` skipped; bad names still throw).

**Fix:** Rename to `011_descriptive_name.sql`; ensure sort order; re-run migrate; confirm row in `schema_migrations`.

**Prove:** Migrate exits 0; `/health/db` OK; feature using new tables works.

---

## 10. False leads / anti-patterns

| False lead | Reality |
|------------|---------|
| Task authz for ECONNREFUSED | Postgres down / URL |
| AuthService password bug for 503 limiter | Redis fail-closed |
| “Delete Redis requirement in tests” as prod fix | Test passthrough ≠ prod |
| Dropping UNIQUE to fix 409 | Fix race handling / return Conflict |
| Ignoring migrate and patching schema by hand only | Drift vs `schema_migrations` |
| Treating `Couldn't create` as client validation | 500 — schema/RETURNING |

---

## 11. Fix + prove checklist

- [ ] `/health` and `/health/db` green if DB was involved  
- [ ] Redis up when testing real limiters (non-test env)  
- [ ] Known SQLSTATE paths return 409/400 AppErrors, not 500  
- [ ] Migrate: filename OK; `schema_migrations` has version; failing SQL fixed  
- [ ] Same curl that failed now shows expected domain or success status  
- [ ] Did not remove fail-closed limiter or unique constraints as a shortcut  

---

## 12. Interview Q&A

**Q: What is fail-closed rate limiting?**  
**A:** When the rate-limit store (Redis) cannot execute commands, the app throws `ServiceUnavailableError` (503) instead of skipping the limiter. Open-fail would let attackers hammer login during an outage. Availability of the limiter control wins over “login at all costs.”

**Q: How does this app turn `23505` into 409?**  
**A:** Postgres unique indexes/constraints reject duplicates with SQLSTATE `23505`. Services catch errors with `code === "23505"` (e.g. register, project create) and throw `ConflictError`, which `errorHandler` serializes as 409 `{ message, requestId }`. If the catch is missing, the same DB error becomes a generic 500.

**Q: Health vs readiness for DB?**  
**A:** `GET /api/v1/health` returns `{ message: "OK" }` without touching Postgres — process is up. `GET /api/v1/health/db` runs `SELECT 1` — dependency readiness. Use db health when classifying infra vs “server up but data plane dead.” (Production orgs often split liveness/readiness probes the same way.)

**Q: Why do repositories throw `Couldn't create …`?**  
**A:** INSERT … RETURNING expected a row; got none. That is unexpected — becomes an unhandled `Error` → 500. Causes include schema mismatch, RLS-like filters (not used here), or logic bugs. Fix schema/migration or query; don’t expose the string as a 400 validation message without understanding why RETURNING was empty.

**Q: Why aren’t most tests dependent on Redis?**  
**A:** `rate-limit.ts` sets limiters to a passthrough `next()` when `NODE_ENV === "test"` (set in `test/preload.ts`). Tests focus on domain behavior without a Redis container. Production/dev still use RedisStore and fail-closed behavior — don’t assume test green means Redis-less prod is OK.

**Q: What does a migration transaction guarantee here?**  
**A:** Each new file runs inside `sql.begin`: apply SQL + insert `schema_migrations` version. Failure should roll back that file’s changes so you don’t get half-applied SQL without a version row. Still verify manually if a failure mode is unclear; never invent versions by hand without matching files.

---

## 13. Glossary

| Term | Meaning |
|------|---------|
| **SQLSTATE** | Postgres error code (`23505`, `23514`, `23503`, …) |
| **unique_violation** | `23505` — duplicate key / unique index |
| **check_violation** | `23514` — CHECK or trigger ERRCODE |
| **foreign_key_violation** | `23503` — FK parent/child conflict |
| **RETURNING empty** | Write returned no row → repo throws |
| **schema_migrations** | Table tracking applied migration versions |
| **Fail-closed limiter** | Redis errors → 503, do not skip |
| **Passthrough limiter** | Test env: no Redis store calls |
| **Defense in depth** | App checks + DB constraints both enforce rules |

---

## 14. Optional further reading

- Status playbook: [04-status-code-playbook.md](./04-status-code-playbook.md) · Classify: [02-classify-the-failure.md](./02-classify-the-failure.md) · Fix: [10-fix-protocol.md](./10-fix-protocol.md)  
- Auth limiter context: [06-auth-and-token-failures.md](./06-auth-and-token-failures.md)  
- Lessons (optional): [fail-closed-rate-limits](../lessons/security/fail-closed-rate-limits.md), [constraints-and-fk](../lessons/database/constraints-and-fk.md), [migrations](../lessons/database/migrations.md), [connection-pooling](../lessons/database/connection-pooling.md), [health-readiness](../lessons/ops/health-readiness.md)  
- Code: `db/client.ts`, `db/migrate.ts`, `shared/redis/redis.ts`, `shared/auth/rate-limit.ts`, `modules/health/health.routes.ts`, `server.ts`, service `isUniqueViolation` / `isCheckViolation` helpers
