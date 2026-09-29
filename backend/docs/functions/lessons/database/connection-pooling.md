# Lesson: Connection pooling

**Standalone ✓** — You do not need any other doc to understand why Postgres connections are expensive and how this app uses the `postgres` client safely.

**After this file you can:** explain pool vs one connection per request, size pools, debug “too many connections” and pool exhaustion, and answer interview questions.

---

## 1. First principles

Opening a **TCP + Postgres session** is costly (auth, memory on server ~ few MB per connection). A **pool** reuses a small set of connections across many short requests.

**Why it exists:** Web servers handle thousands of concurrent requests; you cannot open one dedicated DB connection per request at scale.

**The problem it solves:** “Share a bounded number of DB sessions efficiently without leaking or exhausting Postgres `max_connections`.”

---

## 2. Mental model

### Analogy

A taxi **stand** (pool) with N cabs (connections). Riders (requests) borrow a cab, ride (query), return it. If all cabs busy, the next rider **waits** — or times out if wait too long.

### Diagram

```text
[HTTP req 1] ──┐
[HTTP req 2] ──┼──► pool (max 10) ──► Postgres (max_connections = 100)
[HTTP req 3] ──┘         │
                    reuse same TCP sessions
```

---

## 3. Core rules (must / must-not)

1. **MUST** use one pool (or driver-managed pool) per process — not one new `postgres()` client per request.  
2. **MUST** close pool on shutdown (`sql.end()`) for graceful deploys.  
3. **MUST** size pool × app instances < Postgres `max_connections` minus admin/replication slots.  
4. **MUST NOT** hold connections open across slow external I/O inside a transaction.  
5. **MUST NOT** leak clients in tests — reuse test DB URL with bounded concurrency.  
6. **MUST** keep queries short so connections return to pool quickly.

---

## 4. How it works (mechanics)

### postgres.js behavior

The `postgres` package maintains connections internally. Tagged template queries borrow a connection, run, release.

### This project

`backend/src/db/client.ts`:

```ts
import postgres from "postgres";
const sql = postgres(env.databaseUrl);
export { sql };
```

Single shared `sql` imported by services/repositories.

### Shutdown

`backend/src/server.ts` calls `await sql.end({ timeout: 5 })` on SIGTERM — drains pool.

### PgBouncer (external pool)

At scale, many app pods connect to **PgBouncer** in transaction or session pooling mode, which multiplexes onto fewer real Postgres connections. Not required in this learning repo but standard in production.

### Pool sizing rule of thumb

`connections_per_instance ≈ (CPU cores * 2)` for OLTP — tune with metrics. Total = instances × per-instance ≤ safe headroom under `max_connections`.

---

## 5. When to use / when not to use

| Situation | Approach |
|-----------|----------|
| Express API + Postgres | Shared driver pool (this app) |
| Serverless many cold starts | External pooler + low max per function |
| Long-running batch job | Dedicated connection or small separate pool |
| Migrations CLI | Short-lived `sql` then `end()` — see `migrate.ts` |
| Read replicas | Separate pool per target URL |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Count app replicas × pool max.  
2. Set Postgres `max_connections` with headroom.  
3. Decide PgBouncer if > ~100 app connections.

### Implement

1. Export singleton `sql` from `client.ts`.  
2. Inject `sql` into services — no second hidden pools.  
3. Register shutdown hook.

### Verify

1. Load test — no `too many connections`.  
2. Deploy — old pods release connections after `end()`.  
3. Monitor active connections in Postgres.

---

## 7. Worked example A — this project

### Singleton client

All modules import the same `sql` from `backend/src/db/client.ts`. Repositories accept `Sql | TransactionSql`; transactions use `sql.begin` which holds one connection for the callback duration.

### Migrate script

`backend/src/db/migrate.ts` creates its own `postgres(env.databaseUrl)`, runs migrations, then `await sql.end()` — avoids leaving hanging connections in CI.

### Test preload

`backend/src/test/preload.ts` sets `DATABASE_URL` for integration tests against local Postgres.

**Implication:** parallel test workers multiply connections — cap test parallelism or use pooler in CI.

---

## 8. Worked example B — mini scenario (self-contained)

**Misconfiguration:** 50 API pods × default pool 20 = 1000 connections; Postgres `max_connections=100` → random `53300` errors.

**Fix sketch:**

- Lower per-pod max to 5 → 250 (still high)  
- Add PgBouncer with 50 server connections  
- Or reduce pods + scale vertically

**Health check:** `SELECT count(*) FROM pg_stat_activity WHERE datname = current_database();`

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| `new postgres()` per request | Connection storm |
| Never `sql.end()` on deploy | Zombie connections until timeout |
| Huge pool “for speed” | Postgres CPU context switch thrash |
| Long transaction + pool starvation | All connections stuck in `idle in transaction` |
| Serverless without pooler | DB melts on traffic spike |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| `too many connections` | Pool × pods > max | `pg_stat_activity`, pod count | PgBouncer; lower max |
| Requests hang | Pool exhausted waiting | Active tx, slow queries | Shorten queries; increase pool slightly |
| `idle in transaction` | Forgot commit/rollback | Long `begin` callbacks | Fix service; statement timeout |
| After deploy errors | Old pods still connected | Connection age | Graceful shutdown + `end()` |
| Tests flaky | Parallel overload | CI workers | Serialize DB tests or pooler |

---

## 11. Interview Q&A (with strong answers)

**Q: Why connection pooling?**  
**A:** Postgres connections are expensive; pools reuse sessions so many concurrent HTTP requests share a bounded number of DB connections.

**Q: Pool size per instance?**  
**A:** Tune with load — too small waits, too large wastes RAM on DB. Sum across all instances must fit `max_connections`.

**Q: Transaction pooling vs session pooling (PgBouncer)?**  
**A:** Transaction mode returns connection after each transaction — great for stateless API; session mode supports prepared statements and temp tables per session.

**Q: How does this app manage connections?**  
**A:** Single shared `postgres()` client in `backend/src/db/client.ts`, closed on server shutdown via `sql.end()`.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Pool | Set of reusable DB connections |
| PgBouncer | External connection multiplexer |
| max_connections | Postgres server limit |
| idle in transaction | Open tx holding connection |
| Session | One client ↔ Postgres backend |

---

## 13. Teach pointer

> “Connections are scarce tickets — return them quickly.”

---

## 14. Optional further reading (not required)

- Short transactions: [transactions](./transactions.md)  
- Prepared statements + pooling: [prepared-statements](./prepared-statements.md)
