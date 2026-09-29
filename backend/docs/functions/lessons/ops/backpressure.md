# Lesson: Backpressure

**Standalone ✓** — You do not need any other doc to protect an API from overload.

**After this file you can:** explain backpressure vs rate limiting, spot implicit limits in this Express app, design bounded queues, and interview on load shedding.

---

## 1. First principles

**Backpressure** means slowing or **rejecting intake** when downstream capacity is exhausted, so queues don’t grow without bound and latency doesn’t become timeout storms.

**The problem it solves:** Accepting unlimited work when DB pool, event loop, or workers are saturated — every request hangs, memory spikes, recovery takes longer.

---

## 2. Mental model

### Analogy

Highway on-ramp meter light: stop merging cars when the main road is full — better than gridlock for everyone.

### Diagram

```text
Clients ──► [admission control] ──► handlers ──► DB pool (finite)
                  │
                  └── 429/503 early when full
```

---

## 3. Core rules (must / must-not)

1. **MUST** bound **queues** (memory, job buffers) or reject when full.  
2. **MUST** set **timeouts** so stuck work releases resources.  
3. **MUST NOT** accept unbounded POST bodies ([payload limit](../api/payload-limits.md) helps).  
4. **SHOULD** shed load **before** DB pool exhaustion when possible.  
5. **DISTINGUISH** abuse rate limits (security) from capacity backpressure (reliability).

---

## 4. How it works (mechanics)

Mechanisms: max concurrent requests middleware, bounded worker pools, 503 Retry-After, reactive pull (streams), connection pool limits (implicit wait/fail).

**Rate limiting** caps requests per identity/IP/time — often security. **Backpressure** caps **system** capacity — often 503 when overloaded.

Node: event-loop lag monitoring can trigger shedding.

---

## 5. When to use / when not to use

| Situation | Approach |
|-----------|----------|
| Email queue full | 503 or async accept + drop policy |
| DB pool saturated | Shed + scale pool/DB |
| Login brute force | Rate limit (security) |
| Normal traffic within capacity | No extra rejection |

---

## 6. Step-by-step: design → implement → verify

1. Identify bottleneck (pool size, CPU, external API).  
2. Add admission control at edge (max in-flight).  
3. Return fast errors with Retry-After.  
4. Load test to find knee in curve [load-testing](../testing/load-testing.md).  
5. Watch p95 latency — reject early if SLO threatened.

---

## 7. Worked example A — this project

**Implicit backpressure / limits:**

| Mechanism | Where | Effect |
|-----------|-------|--------|
| JSON body limit 100kb | `app.ts` `express.json({ limit: "100kb" })` | Rejects huge payloads early |
| Login rate limit | Redis-backed limiter | Caps abusive volume (also security) |
| DB connection pool | postgres.js pool | Requests wait or fail when pool busy |
| Fail-closed Redis down | rate limit store | 503 instead of unlimited login attempts |

No dedicated global concurrency middleware or outbound email queue yet.

---

## 8. Worked example B — mini scenario (self-contained)

Forgot-password email worker:

```text
Queue max 1000 jobs
If enqueue full → 503 { message: "try later" }
Worker concurrency = 10
Metric: queue_depth, shed_total
```

Or middleware:

```ts
if (inFlight > MAX) return res.status(503).set("Retry-After", "5").end();
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Outcome |
|--------------|---------|
| Unbounded in-memory queue | OOM kill |
| Accept work with exhausted pool | All requests hang |
| No 429/503 distinction | Clients retry storm |
| Backpressure without metrics | Blind shedding |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| All requests slow | Pool/event loop | pool waits, lag | shed load, scale DB |
| 503 spikes | Redis fail-closed | Redis health | restore Redis |
| 413 errors | body limit | client payload | expected — not pool |
| Recovery slow | retry storm | client backoff | Retry-After + jitter |

---

## 11. Interview Q&A (with strong answers)

**Q: Backpressure vs rate limiting?**  
**A:** Rate limiting usually caps per-client abuse; backpressure protects shared resources when the **system** is full regardless of who asks.

**Q: Load shedding strategies?**  
**A:** Reject new requests (503), drop low-priority work, degrade optional features, increase capacity — in that preference order for user-visible core paths.

**Q: Bounded queues why?**  
**A:** Unbounded queues hide overload until memory dies; bounded queues force explicit reject or drop policies.

**Q: What exists in this repo?**  
**A:** 100kb JSON cap, Redis rate limits, finite DB pool; no global in-flight limiter.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Admission control | Gate before handler work |
| Load shedding | Drop/reject work under stress |
| Pool exhaustion | All DB connections busy |
| Retry-After | HTTP hint for clients to wait |
| Event-loop lag | Node delay processing timers |

---

## 13. Teach pointer

> “Saying no early is kinder than saying nothing until timeout.”

---

## 14. Optional further reading (not required)

- [retry-backoff-timeouts](./retry-backoff-timeouts.md) · [capacity-planning](./capacity-planning.md)  
- [../database/connection-pooling.md](../database/connection-pooling.md)
