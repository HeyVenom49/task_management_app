# Lesson: Stateless services

**Standalone ✓** — Understand stateless API design, what may live in memory, and how this app stores session truth in Postgres/Redis.

**After this file you can:** design horizontally scalable handlers, spot state bugs before multi-replica deploy, relate to 12-factor, and interview confidently.

---

## 1. First principles

A **stateless service** (in the scaling sense) means **no request-specific durable state** is stored in the process memory between requests. Any replica can handle any request because **truth** lives outside the process: database, Redis, object storage.

The problem it solves: if user A’s session exists only in server 1’s RAM, load balancer sends user A to server 2 → logged out. If rate limits are in-memory maps, each replica allows 10× traffic. Stateless design lets you **scale out** by adding identical processes.

---

## 2. Mental model

### Analogy

Bank tellers (API instances) do not keep your account balance in their desk drawer. They look up the ledger (Postgres). Two tellers, same answer—because the ledger is shared.

### Diagram

```text
        LB ──► API pod 1 ──┐
        │                  ├──► Postgres (users, sessions, tasks)
        LB ──► API pod 2 ──┤
        │                  └──► Redis (rate limit counters)
        LB ──► API pod 3 ──┘

Forbidden: pod 2 remembers "user 7 is logged in" only locally
```

---

## 3. Core rules (must / must-not)

1. **MUST** store sessions, refresh tokens, and business entities in **Postgres** (or shared store).  
2. **MUST** use **Redis** (or similar) for cross-request counters shared by replicas (rate limits).  
3. **MUST** treat JWT access tokens as self-contained but short-lived; refresh rotation state in DB.  
4. **MUST NOT** use `global.currentUser` or in-memory session maps in production multi-replica setups.  
5. **MUST NOT** write uploads only to local disk without shared storage.  
6. **MAY** keep immutable config and process-wide singletons (logger, `sql` pool, DI wiring).  
7. **MAY** use in-memory cache only with acceptance of stale data per replica—or use Redis cache.

---

## 4. How it works (mechanics)

**Request flow (auth):**

1. Client sends access JWT (header) and/or refresh cookie.  
2. `authenticate` middleware validates JWT signature/expiry—no server-side session table hit for every read (stateless access).  
3. Refresh flow hits `sessions` table—**stateful refresh**, but state is in DB, not RAM.

**Rate limiting:** `express-rate-limit` + `RedisStore` in `shared/auth/rate-limit.ts`. All pods share `rl:` keys. Redis down → **503 fail-closed** (not unlimited auth attempts).

**What is in memory here:**

- Module singletons (`ProjectController` wired once)  
- Connection pools  
- `DUMMY_HASH` constant for timing-safe login failures (not user state)

**Not stateless in the strict sense:** refresh sessions and verification tokens are **server-side state**—but **externalized**, which is what ops cares about.

---

## 5. When to use / when not to use

| Situation | Externalize state? |
|-----------|-------------------|
| Horizontally scaled API | **Yes** — DB/Redis/object store |
| Single developer laptop | In-memory OK for convenience |
| WebSocket sticky rooms | Often need sticky sessions or Redis pub/sub bridge |
| Heavy local ML model weights | Weights in memory OK (model state), not user sessions |
| Background job worker | Stateless if job claim uses DB `FOR UPDATE SKIP LOCKED` |

---

## 6. Step-by-step: design → implement → verify

1. List data the handler “remembers” after response finishes.  
2. If it is user-specific, move to DB/Redis with key including user/id.  
3. Ensure idempotent retries safe (refresh rotation).  
4. Load test with 2+ instances behind LB—login on A, request on B.  
5. Kill Redis—confirm rate limit fails closed (503), not open.

---

## 7. Worked example A — this project

**Refresh sessions:** `SessionRepository` persists hashed refresh tokens. Rotation revokes old row and inserts new in one transaction—any API instance can validate refresh.

**Tasks/projects:** All reads/writes via Postgres; no in-memory project cache.

**Rate limits:** Login and auth write limiters use Redis unless `NODE_ENV=test` (passthrough for tests).

**JWT access:** Stateless verification with `JWT_SECRET`; expiry enforced without DB round-trip per request.

---

## 8. Worked example B — self-contained mini scenario

**Broken:**

```ts
const sessions = new Map<string, string>(); // in-memory
app.post("/login", (req, res) => {
  sessions.set(req.body.userId, token);
});
```

**Fixed:**

```ts
await redis.set(`session:${userId}`, tokenHash, { EX: 86400 });
// or INSERT INTO sessions ...
```

Deploy 3 pods; any pod reads same key/table.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| In-memory rate limit per pod | Effective limit = N × max |
| Sticky sessions as permanent crutch | Uneven load; pod death drops sessions |
| File upload to `/tmp` on one pod | Other pod cannot serve file |
| Assuming JWT alone for instant revoke | Need blocklist or short TTL + refresh in DB |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Random logouts under load | Session not shared | Sticky off + in-memory session | DB/Redis sessions |
| Rate limit too loose | Per-replica store | Redis connectivity | Centralize store |
| 503 on auth routes | Redis down (fail-closed) | Redis health | Restore Redis or policy |
| User sees old data after update | Per-pod cache | Cache layer | Invalidate or Redis cache |

---

## 11. Interview Q&A (with strong answers)

**Q: What’s allowed in memory?**  
**A:** Config, pools, read-only caches with known staleness, DI singletons—not authoritative per-user session state.

**Q: Sticky sessions when unavoidable?**  
**A:** WebSocket or legacy; prefer external session store instead. Sticky is a band-aid.

**Q: 12-factor relationship?**  
**A:** Processes disposable; backing services (Postgres, Redis) hold state; scale horizontally.

**Q: Is JWT access stateless?**  
**A:** Verification is stateless; revocation requires short TTL, refresh in DB, or denylist.

**Q: This app’s state stores?**  
**A:** Postgres for users/sessions/tasks; Redis for rate limits; JWT for short-lived access.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Stateless (scaling) | No sticky per-user RAM between requests |
| Backing service | External DB/cache |
| Sticky session | LB routes user to same instance |
| Fail-closed | Deny when dependency missing |
| Refresh rotation | Server-side session rows updated atomically |
| Horizontal scaling | More identical API instances |

---

## 13. Teach pointer

> “Lose the process, keep the truth — truth lives outside the process.”

---

## 14. Optional further reading (not required)

- [horizontal-scaling](./horizontal-scaling.md) · [../ops/12-factor-app.md](../ops/12-factor-app.md)  
- [caching](./caching.md) · [../security/fail-closed-rate-limits.md](../security/fail-closed-rate-limits.md)

Repo paths: `backend/src/shared/auth/rate-limit.ts`, `backend/src/modules/auth/session.repository.ts`.
