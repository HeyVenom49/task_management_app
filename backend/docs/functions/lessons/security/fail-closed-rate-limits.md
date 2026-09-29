# Lesson: Fail-closed rate limiting

**Standalone ✓** — You do not need any other doc to design rate limits that fail safely when infrastructure breaks.

**After this file you can:** explain fail-open vs fail-closed, wire Redis-backed limits, return 503 when the limiter is unavailable, place limits on auth routes, and debug “503 on login” in production.

---

## 1. First principles

**Rate limiting** caps how many requests a client (IP, user, API key) may make in a window — protecting auth endpoints from brute force and abuse.

When the limiter’s store (Redis) is down, the app must choose:

- **Fail open:** allow traffic → attackers hit auth when Redis fails.  
- **Fail closed:** reject with **503** → short outage vs unbounded guessing.

This backend **fails closed** on Redis errors during limit checks.

**Problem it removes:** “Redis blip = unlimited login attempts.”

---

## 2. Mental model

### Analogy

A bouncer with a counter clicker. If the clicker breaks, **fail closed** means “nobody enters until we fix it,” not “free entry for everyone.”

### Diagram

```text
POST /login
    │
    ▼
loginLimiter (express-rate-limit + RedisStore)
    │
    ├─ Redis OK ──► under max? ──► next()
    │
    └─ Redis error ──► throw ServiceUnavailableError (503)
```

---

## 3. Core rules (must / must-not)

1. **MUST** rate-limit credential and token issuance endpoints.  
2. **MUST** fail closed when limiter storage unavailable (this repo).  
3. **MUST** disable limits in test env to keep tests deterministic (`NODE_ENV=test` passthrough).  
4. **MUST** return standard rate-limit headers when enabled (`standardHeaders: true`).  
5. **MUST NOT** silently skip limits on Redis reconnect races without policy.  
6. **SHOULD** use separate windows/messages for login vs generic auth writes.

---

## 4. How it works (mechanics)

### Stack

- `express-rate-limit` with `rate-limit-redis` store.  
- Prefix `rl:` keys in Redis.  
- Window: 15 minutes; default max 10 per route group.  
- `sendCommand` wrapper connects Redis; on **any** error throws `ServiceUnavailableError`.

### Routes

| Limiter | Routes |
|---------|--------|
| `loginLimiter` | `POST /login` |
| `authWriteLimiter` | resend verification, forgot password |

### Test mode

Passthrough middleware — tests do not need Redis for limits.

---

## 5. When to use / when not to use

| Fail closed | Fail open |
|-------------|-----------|
| Auth brute force surfaces | Non-critical analytics beacons |
| Password reset spam | Read-heavy public CDN (with edge limits) |

| Redis-backed | In-memory only |
|--------------|----------------|
| Multiple app instances | Single-process dev |

---

## 6. Step-by-step: design → implement → verify

1. Identify abuse-sensitive routes.  
2. Pick window + max (tune with metrics).  
3. Shared Redis with health checks.  
4. Implement store with explicit error → 503.  
5. Load test: Redis stopped → login returns 503, not 200 flood.  
6. Document ops: Redis required for auth in prod.

---

## 7. Worked example A — this project

```ts
function buildLimiter(message: string, max = 10): RequestHandler {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
    store: new RedisStore({
      sendCommand: async (...args: string[]) => {
        try {
          if (!redis.isOpen) {
            await redis.connect();
          }
          return await redis.sendCommand(args);
        } catch {
          throw new ServiceUnavailableError(
            "Rate limiting unavailable. Try again later.",
          );
        }
      },
      prefix: "rl:",
    }),
  });
}
```

**Where:** `backend/src/shared/auth/rate-limit.ts`.

Route attachment:

```ts
authRouter.post("/login", loginLimiter, (req, res, next) => {
  controller.login(req, res, next);
});
```

**Where:** `backend/src/modules/auth/auth.routes.ts`.

---

## 8. Worked example B — mini scenario (self-contained)

**Per-user limit after authn**

```ts
const userLimiter = rateLimit({
  keyGenerator: (req) => req.user!.id,
  max: 100,
  windowMs: 60_000,
  handler: (_req, res) => res.status(429).json({ message: "Slow down" }),
});
```

Still fail closed on store outage if policy requires — same `sendCommand` pattern.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Risk |
|--------------|------|
| catch Redis error → `next()` | Unlimited auth attempts |
| Only CDN rate limit | Origin still brute forced |
| 429 body leaks user existence | Pair with uniform auth errors |
| Same max for login and file upload | Wrong sensitivity |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| 503 on login | Redis down / URL wrong | `REDIS_URL`, redis logs | Restore Redis |
| No 429 ever | Test passthrough | `NODE_ENV` | Expect in prod only |
| Limits not shared across pods | In-memory store | Store type | Redis store |
| Spurious 503 | Network blips to Redis | Timeouts, VPC | Retry policy at infra layer |

---

## 11. Interview Q&A (with strong answers)

**Q: Fail open or closed for auth rate limits?**  
**A:** Fail closed — brief availability loss beats unbounded credential guessing when Redis fails.

**Q: Why Redis for rate limits?**  
**A:** Centralized counters across horizontally scaled API instances.

**Q: Difference 429 vs 503 here?**  
**A:** 429 = client exceeded quota. 503 = server cannot enforce limits right now.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Fail closed | Deny when safety dependency fails |
| Fail open | Allow when dependency fails |
| Window | Time span for counter reset |
| RedisStore | Shared counter backend for express-rate-limit |
| ServiceUnavailableError | App error mapped to HTTP 503 |

---

## 13. Teach pointer

> “When the bouncer’s counter breaks, don’t throw the doors open.”

---

## 14. Optional further reading (not required)

- Enumeration: [email-enumeration-and-timing](./email-enumeration-and-timing.md)  
- Redis client: `backend/src/shared/redis/redis.ts`
