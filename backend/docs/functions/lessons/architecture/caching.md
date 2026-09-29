# Lesson: Caching

**Standalone ✓** — Cache strategies, invalidation, authz pitfalls, and how this app uses Redis today.

**After this file you can:** choose cache-aside vs write-through, design safe keys/TTLs, avoid authz cache bugs, and debug stale data.

---

## 1. First principles

A **cache** stores a copy of data closer or cheaper to read than the source of truth (Postgres), trading **freshness** for **speed** and **load reduction**.

The problem it solves: hot reads (project metadata, config flags) hammering the DB. The problem it creates: **invalidation**—knowing when the copy is wrong. Wrong cache on **permissions** becomes an **authorization bug** (removed member still sees tasks).

---

## 2. Mental model

### Analogy

Photocopy of a menu on the wall: fast to read, but if the kitchen changes prices, someone must replace the copy (invalidate) or date it “valid until 6pm” (TTL).

### Diagram

```text
  Request ──► Cache hit? ──yes──► return cached
                  │
                  no
                  ▼
              Source (Postgres)
                  │
                  └──► populate cache (SET EX ttl)
```

---

## 3. Core rules (must / must-not)

1. **MUST** measure before caching—optimize after correctness and indexes.  
2. **MUST** include tenant/user/project in keys when data is scoped.  
3. **MUST** invalidate or TTL on **every** write path that changes meaning.  
4. **MUST NOT** cache authorization decisions without strict invalidation on membership change.  
5. **SHOULD** prefer short TTL + explicit delete on writes for medium-risk data.  
6. **SHOULD** use singleflight/lock against thundering herd on hot keys.  
7. **MUST NOT** cache secrets or raw tokens.

---

## 4. How it works (mechanics)

| Pattern | Read | Write |
|---------|------|-------|
| **Cache-aside** | App reads cache; on miss, DB then set cache | App writes DB then deletes cache key |
| **Write-through** | Cache always synced on write | Write goes to cache + DB together |
| **Read-through** | Cache library loads from DB on miss | Similar to cache-aside with wrapper |

**TTL:** Upper bound on staleness even if invalidation missed.

**Stampede:** Cache expires; 1000 requests miss together → DB spike. Mitigate: probabilistic early expiry, request coalescing, warm cache.

**This project today:** Redis used for **rate limit counters** (`rl:` prefix), not HTTP response caching. Postgres is source of truth for projects/tasks/membership.

---

## 5. When to use / when not to use

| Data | Cache? |
|------|--------|
| Public static config | **Yes** — long TTL |
| Project name by id | Maybe — TTL 30s + invalidate on PATCH |
| “Is user member of project?” | **Risky** — invalidate on every member change |
| Rate limit counters | **Yes** — Redis (this app) |
| Financial balances | Careful — often no cache or strict invalidation |
| Session/authz lists | Avoid or very short TTL + events |

---

## 6. Step-by-step: design → implement → verify

1. Identify read hot spot (metrics).  
2. Define key: `project:{id}:meta`.  
3. Choose TTL + invalidation triggers (`PATCH /projects/:id` → `DEL`).  
4. Implement cache-aside in service layer—not controller.  
5. Test: update DB → cache miss shows new data.  
6. Test: remove member → no cached list showing them.

---

## 7. Worked example A — this project

**What is cached-like:** Redis stores rate limit counts for login/auth writes—shared across replicas, not business entity cache.

**If we cached project `GET /projects/:id`:**

```text
key: project:{projectId}:detail
on GET: GET redis → else SELECT → SET EX 30
on PATCH project: DEL project:{projectId}:detail
on member add/remove: DEL project:{projectId}:detail  (membership affects some aggregated views)
```

**Safer first target:** OpenAPI spec, feature flags—not membership-gated lists without bulletproof invalidation.

**Authz stays in service:** Even with cache, `TaskService` must re-check membership on writes—never trust cached “allowed: true” forever.

---

## 8. Worked example B — self-contained mini scenario

```ts
async function getProjectMeta(redis, sql, id: string) {
  const key = `project:${id}:meta`;
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit);

  const [row] = await sql`SELECT id, name, updated_at FROM projects WHERE id = ${id}`;
  if (!row) throw new NotFoundError();

  await redis.set(key, JSON.stringify(row), { EX: 30 });
  return row;
}

async function updateProjectName(redis, sql, id: string, name: string) {
  await sql`UPDATE projects SET name = ${name} WHERE id = ${id}`;
  await redis.del(`project:${id}:meta`);
}
```

Missed `del` on update → 30s stale name—acceptable for name; **not** for security flags.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Cache member list forever | Removed user sees data |
| No TTL | Leak + eternal staleness |
| Cache before authz check | Serve another user’s key if key wrong |
| Thundering herd on expiry | DB outage |
| Caching paginated lists without version | Inconsistent pages |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Stale project name | Missing DEL | Write path | Invalidate key |
| User sees after removal | Cached authz/list | Key includes user? | DEL on member change |
| Redis memory growth | No TTL | `INFO memory` | EX on all keys |
| Spiky DB after deploy | Cold cache | Traffic pattern | Warm cache, stagger TTL |

---

## 11. Interview Q&A (with strong answers)

**Q: Cache-aside vs write-through?**  
**A:** Cache-aside: app manages cache on read miss and invalidates on write. Write-through: write path updates cache and DB together—simpler consistency, more write latency.

**Q: Why caching authz is dangerous?**  
**A:** Stale allow/deny violates security; invalidation must happen on every role/membership change or TTL must be tiny with accept risk.

**Q: Stampede mitigation?**  
**A:** Singleflight, lock per key, early probabilistic refresh, background warmers.

**Q: What does this repo cache?**  
**A:** Rate limit state in Redis—not project/task response bodies.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Cache-aside | Application-managed cache |
| TTL | Time to live |
| Invalidation | Delete/update cache on source change |
| Thundering herd | Many misses at once |
| Singleflight | Coalesce concurrent loads for one key |
| Stale read | Cached value outdated vs DB |

---

## 13. Teach pointer

> “Caching is easy. Invalidation is the product.”

---

## 14. Optional further reading (not required)

- [../architecture/stateless-services.md](./stateless-services.md)  
- [../security/fail-closed-rate-limits.md](../security/fail-closed-rate-limits.md)  
- [../database/indexing.md](../database/indexing.md)

Repo paths: `backend/src/shared/auth/rate-limit.ts`, `backend/src/shared/redis/redis.ts`.
