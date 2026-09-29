# Lesson: Circuit breaker

**Standalone ✓** — You do not need any other doc to protect callers from sick dependencies.

**After this file you can:** explain breaker states, contrast with fail-closed rate limits in this repo, and interview on half-open behavior.

---

## 1. First principles

A **circuit breaker** wraps calls to a dependency. After enough failures, it **opens** — failing fast without waiting on timeouts. After a cooldown, **half-open** tries a probe; success **closes** the circuit again.

**The problem it solves:** Email provider down → every `forgotPassword` waits 30s → thread pool / event loop congestion → your API dies too.

---

## 2. Mental model

### Analogy

Home electrical breaker: repeated overload trips the switch — stop drawing power until reset, instead of burning the house.

### Diagram

```text
 CLOSED ──failures≥threshold──► OPEN (fail fast)
    ▲                              │
    │ success                      │ timeout
    └──────── HALF-OPEN ◄──────────┘
              (trial call)
```

---

## 3. Core rules (must / must-not)

1. **MUST** count **failures that matter** (timeouts, 5xx), not 404 business errors.  
2. **MUST** fail fast when **open** — don’t queue unbounded waiting calls.  
3. **MUST** define **fallback** behavior (degrade, queue, generic response).  
4. **MUST NOT** confuse breaker with **fail-closed security** (different goal).  
5. **SHOULD** expose metrics: state, trips, rejected calls.

---

## 4. How it works (mechanics)

States:

- **Closed:** normal calls pass through; failure counter increments.  
- **Open:** immediate error/fallback; no dependency call.  
- **Half-open:** limited trial calls; one success closes; failure reopens.

Often combined with **timeout** (per call) and **retry** only in half-open or worker context.

Libraries: cockatiel, opossum (Node), resilience4j (Java).

**Not implemented** in this task API for outbound email/HTTP.

---

## 5. When to use / when not to use

| Dependency | Breaker? |
|------------|----------|
| External email API | **Yes** |
| Primary Postgres in request path | No — fail request, don’t “open” DB |
| Redis for rate limits | Fail-closed 503 instead (security) |
| Optional recommendations service | Yes + empty fallback |

---

## 6. Step-by-step: design → implement → verify

1. Identify flaky outbound integration.  
2. Set failure threshold and open duration.  
3. Implement fallback (outbox enqueue, generic 200 for forgot-password anti-enumeration).  
4. Chaos test: dependency down → fast failures, recovery after heal.  
5. Dashboard breaker state.

---

## 7. Worked example A — this project

**No circuit breaker** for outbound calls today.

**Closest cousin — fail-closed rate limit when Redis sick:**

Rate limit store uses Redis; on Redis errors the limiter returns **503** rather than skipping limits (fail-open). That protects **users from abuse** when **your** limiter is down — not the same as protecting **you** from a sick email API, but same “don’t pretend dependency is fine” instinct.

**Where:** `backend/src/shared/auth/rate-limit.ts` — comment documents fail-closed → 503.

**If adding email:** wrap provider with breaker; on open → log metric + enqueue outbox row + return generic success for forgot-password (anti-enumeration).

---

## 8. Worked example B — mini scenario (self-contained)

```ts
const breaker = new CircuitBreaker(sendEmail, {
  timeout: 3000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
});

breaker.fallback(() => enqueueOutbox("email", payload));

await breaker.fire(msg); // fast fail when open
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Result |
|--------------|--------|
| Breaker on DB for all reads | App always “open” — total outage |
| Open circuit but still blocking call | No benefit |
| No fallback | User-visible hard fail only |
| Breaker + unlimited retry | Storm on half-open |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Stuck open | dependency still bad | health of provider | fix provider |
| Flapping | threshold too low | trip metrics | tune counts |
| Silent email loss | fallback not enqueue | outbox depth | wire outbox |
| Confused with 503 login | Redis fail-closed | rate limit logs | not breaker |

---

## 11. Interview Q&A (with strong answers)

**Q: Breaker vs retry vs timeout?**  
**A:** Timeout caps one call; retry repeats safe calls sparingly; breaker stops calling entirely after sustained failure so you fail fast and recover gradually.

**Q: Metrics to open circuit?**  
**A:** Rolling failure rate, consecutive timeouts, latency above SLO — exclude expected 4xx.

**Q: Half-open behavior?**  
**A:** Allow a small number of trial requests; success closes circuit; failure reopens and resets cooldown.

**Q: This repo?**  
**A:** No outbound breaker; Redis rate limit fail-closed is related security pattern, not dependency protection for third-party APIs.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Closed state | Normal operation |
| Open state | Fail fast, no calls |
| Half-open | Trial period |
| Trip | Transition to open |
| Fallback | Alternate path when open |

---

## 13. Teach pointer

> “Breakers protect *you* from a sick dependency. Fail-closed rate limits protect *users* from attackers when *your* limiter is sick.”

---

## 14. Optional further reading (not required)

- [graceful-degradation](./graceful-degradation.md) · [retry-backoff-timeouts](./retry-backoff-timeouts.md)  
- [../security/fail-closed-rate-limits.md](../security/fail-closed-rate-limits.md)
