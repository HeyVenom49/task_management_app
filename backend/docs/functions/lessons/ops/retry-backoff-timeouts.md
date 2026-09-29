# Lesson: Retries, backoff, and timeouts

**Standalone ✓** — You do not need any other doc to design safe retry policies.

**After this file you can:** choose timeouts, retry only idempotent work, apply jitter, relate retries to circuit breakers, and map patterns to this API’s clients and shutdown.

---

## 1. First principles

Distributed systems fail transiently. **Timeouts** bound wait time. **Retries** repeat failed operations **only when safe**. **Backoff** (with **jitter**) spaces retries to avoid amplifying outages.

**The problem it solves:** Hang forever (no timeout); duplicate writes (retry POST); retry storms (no backoff).

---

## 2. Mental model

### Analogy

Calling a busy restaurant: wait max 10 minutes (timeout); if line busy, try again later with increasing gaps (backoff), not 50 people rushing the door at once (no jitter).

### Diagram

```text
Request ──► attempt ──► timeout?
              │ fail transient
              └── wait (backoff + jitter) ──► retry (max N)
```

---

## 3. Core rules (must / must-not)

1. **MUST** set **timeouts** on every outbound call and client-to-API calls.  
2. **MUST** retry only **idempotent** ops or those with **idempotency keys**.  
3. **MUST** cap retry count and use **exponential backoff + jitter**.  
4. **MUST NOT** retry non-idempotent POST without deduplication.  
5. **SHOULD** prefer **async outbox** for email/payments over inline retry loops.

---

## 4. How it works (mechanics)

Idempotent HTTP methods: GET, HEAD, PUT (usually), DELETE (usually) — retry safer. POST create: unsafe unless idempotency-Key header.

Backoff: `delay = min(cap, base * 2^attempt) + random jitter`.

This API **server** does not implement a shared outbound HTTP retry library; **clients** of the API should timeout. **Shutdown** uses `sql.end({ timeout: 5 })` — bounded wait on pool close.

OCC / refresh flows: clients may retry **carefully** on 409/401 with new tokens — not blind POST replay.

---

## 5. When to use / when not to use

| Call | Retry? |
|------|--------|
| GET task list | Yes with backoff |
| POST create task without key | **No** blind retry |
| Email provider 503 | Worker retries with outbox |
| DB query in request | Usually no retry in request path — fail fast |
| Pool shutdown | Timeout on `sql.end` |

---

## 6. Step-by-step: design → implement → verify

1. Classify operations idempotent or not.  
2. Set client timeout < server timeout.  
3. Retry 429/503 with Retry-After respect.  
4. For side effects, enqueue outbox worker.  
5. Test: simulate 503 — verify no duplicate rows.

---

## 7. Worked example A — this project

**Inbound (callers of this API):** SPA/mobile should use fetch timeouts; retry GETs; for POST login/register use caution — duplicate register may 409.

**Server shutdown timeout:**

```28:28:backend/src/server.ts
  await sql.end({ timeout: 5 });
```

**Future outbound email from auth:** prefer outbox worker with retries, not blocking login handler with 3× SendGrid retry.

**Rate limit 429:** clients should backoff — aligns with [fail-closed](../security/fail-closed-rate-limits.md) when Redis healthy.

---

## 8. Worked example B — mini scenario (self-contained)

SendGrid from worker:

```text
timeout 3s per attempt
max 3 attempts on 429/503
delay: 200ms, 800ms, 3.2s + jitter
dead letter queue after failure
```

SPA calling API:

```text
GET with 10s timeout, retry 2 on network error only
POST /tasks with Idempotency-Key: uuid — safe retry
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Result |
|--------------|--------|
| Retry POST create | Duplicate tasks |
| No timeout | Connection pileup |
| Immediate tight retry loop | Outage amplifier |
| Retry through open circuit | Waste [circuit-breaker](./circuit-breaker.md) |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Duplicate records | retried POST | idempotency | keys + UNIQUE |
| Hung deploy | sql.end stuck | long queries | drain HTTP first |
| Client storm | no jitter | retry timing | exponential + random |
| 503 loops | retry without cap | client policy | max attempts |

---

## 11. Interview Q&A (with strong answers)

**Q: Which HTTP methods to retry?**  
**A:** Safe retries on idempotent reads and well-keyed writes; avoid blind POST retries; respect 429 Retry-After.

**Q: Why jitter?**  
**A:** Desynchronizes clients so retries don’t arrive in synchronized waves that retrip the failing system.

**Q: Timeout vs circuit breaker?**  
**A:** Timeout limits one call’s wait; breaker stops calling a sick dependency entirely for a cooldown after repeated failures.

**Q: Retries in this server?**  
**A:** Not centralized for outbound HTTP; shutdown uses pool end timeout; side-effect retries belong in workers/outbox.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Idempotent | Repeat safe — same effect |
| Exponential backoff | Increasing delay between retries |
| Jitter | Random spread on delay |
| Outbox | DB-backed queue for async retry |
| Transient failure | Likely succeeds on retry |

---

## 13. Teach pointer

> “Retry is a multiplier. Multiply only what is safe.”

---

## 14. Optional further reading (not required)

- [circuit-breaker](./circuit-breaker.md) · [../api/idempotency.md](../api/idempotency.md)  
- [../architecture/outbox-events.md](../architecture/outbox-events.md)
