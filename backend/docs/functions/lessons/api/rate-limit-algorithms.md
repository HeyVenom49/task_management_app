# Lesson: Rate limiting (algorithms and practice)

**Standalone ✓** — You do not need any other doc to rate-limit HTTP endpoints and fail safely like this project.

**After this file you can:** explain token bucket vs fixed window at a high level, apply per-route limits in Express, use Redis-backed stores for multi-instance deploys, and justify fail-closed on Redis outage.

---

## 1. First principles

**Rate limiting** caps how many requests a **client identity** (IP, user id, API key) may make in a time window.

**Why it exists:** Brute-force login, password reset spam, registration floods, and accidental retry loops can overwhelm auth and email paths without caps.

**The problem it solves:** Unlimited tries turn weak passwords and expensive side effects (email, DB writes) into cheap attacks.

---

## 2. Mental model

### Analogy

Nightclub bouncer with a counter: “10 entries per 15 minutes per person.” Different queues for VIP (authenticated users) vs general (IP) if you design tiers.

### Diagram

```text
Request ──► rate limit middleware ──► under cap? ──► handler
                         │
                         └── over cap ──► 429 + message
                         └── Redis down ──► 503 (this app, fail-closed)
```

### Common algorithms (working knowledge)

| Algorithm | Behavior | Tradeoff |
|-----------|----------|----------|
| **Fixed window** | Count per clock window (e.g. each 15 min) | Simple; burst at window edges |
| **Sliding window** | Smoother count over rolling interval | More state |
| **Token bucket** | Tokens refill at rate; burst allowed up to bucket size | Good for APIs allowing bursts |
| **Leaky bucket** | Steady outflow | Smooths traffic |

`express-rate-limit` implements a **window** model with configurable `windowMs` and `max`.

---

## 3. Core rules (must / must-not)

1. **MUST** rate-limit **auth-sensitive** routes (login, forgot password, resend verification).  
2. **MUST** return **429** (or library default) when over limit with a clear message.  
3. **MUST** use a **shared store** (Redis) when running **multiple app instances** — in-memory limits per node are ineffective.  
4. **MUST** decide **fail-open vs fail-closed** when store is down — this app **fail-closed → 503**.  
5. **MUST NOT** disable limits in production because “Redis is hard.”  
6. **SHOULD** expose `RateLimit-*` standard headers when enabled (`standardHeaders: true`).  
7. **MUST** bypass or relax limits in **tests** to avoid flaky CI (this app uses passthrough when `NODE_ENV=test`).

---

## 4. How it works (mechanics)

**This stack:** `express-rate-limit` + `rate-limit-redis` + existing `redis` client.

```ts
rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "..." },
  store: new RedisStore({ sendCommand: ..., prefix: "rl:" }),
});
```

Each hit increments a Redis key scoped by client key (default often IP + route).

**Routes:**

- `loginLimiter` on `POST /login`  
- `authWriteLimiter` on forgot password, resend verification, etc.

---

## 5. When to use / when not to use

| Situation | Rate limit? |
|-----------|-------------|
| Login / token refresh abuse | **Yes** |
| Public write endpoints | **Often yes** |
| Health checks for k8s | **Usually no** (or very high) |
| Authenticated CRUD per user | Optional tiered limits |
| Internal service mesh | mTLS + separate quotas |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Identify abuse scenarios and costliest endpoints.  
2. Pick window + max (start strict on auth, tune with metrics).  
3. Choose identity key: IP vs user id vs combo.  
4. Document fail-open vs fail-closed policy.

### Implement

1. Factory `buildLimiter(message, max)`.  
2. Export named limiters; attach in route files before controller.  
3. Wire Redis store with error → `ServiceUnavailableError`.

### Verify

1. Exceed max → 429 with message.  
2. Kill Redis → 503 on limited routes (this app).  
3. Tests use passthrough limiter.

---

## 7. Worked example A — this project

`backend/src/shared/auth/rate-limit.ts`:

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
          if (!redis.isOpen) await redis.connect();
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

`auth.routes.ts`:

```ts
authRouter.post("/login", loginLimiter, (req, res, next) => { ... });
authRouter.post("/forgot-password", authWriteLimiter, (req, res, next) => { ... });
```

**Why fail-closed:** If limits silently disabled when Redis dies, login brute-force opens during exactly the outage window when ops are distracted.

---

## 8. Worked example B — mini scenario (self-contained)

**API key tier:** 1000 req/hour per key.

Use Redis key `rl:apikey:{hash}` with sliding window or token bucket library; return 429 + `Retry-After` when empty.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| In-memory limit on 8 pods | Effective limit × 8 |
| Fail-open on Redis loss | Auth endpoints unprotected during outage |
| Same limit for health and login | False positive outages |
| No headers | Clients can’t backoff intelligently |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| 429 immediately | Low max / shared IP (NAT) | Headers, client IP trust | Tune max; consider user-based key after login |
| 503 on auth routes | Redis down | Redis logs | Restore Redis; policy intentional |
| Limits not working in prod | Store not shared | Multiple instances | Redis store |
| Flaky tests | Real limiter in test | `NODE_ENV=test` passthrough | Keep test bypass |

---

## 11. Interview Q&A (with strong answers)

**Q: Fixed window vs token bucket?**  
**A:** Fixed window resets a counter each interval — simple but allows bursts at boundaries. Token bucket refills tokens continuously — allows controlled bursts while limiting average rate.

**Q: Fail-open vs fail-closed?**  
**A:** Fail-open preserves availability but removes protection; fail-closed protects abuse-sensitive paths at cost of 503 — common for login when limiter is a safety control.

**Q: Why Redis for rate limits?**  
**A:** Centralized counters across horizontally scaled Node processes.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| 429 | Too Many Requests |
| Window | Time span for counting hits |
| Fail-closed | Reject when limiter infrastructure unavailable |
| RedisStore | Shared backing store for express-rate-limit |

---

## 13. Teach pointer

> “Rate limits are a safety rail on expensive endpoints — treat the limiter as part of your security posture, not UX polish.”

---

## 14. Optional further reading (not required)

- Fail-closed: [../security/fail-closed-rate-limits.md](../security/fail-closed-rate-limits.md)  
- HTTP 503: [./http-status-semantics.md](./http-status-semantics.md)
