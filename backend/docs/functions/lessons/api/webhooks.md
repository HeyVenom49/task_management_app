# Lesson: Webhooks (outbound HTTP callbacks)

**Standalone ✓** — You do not need any other doc to design reliable event delivery to partner systems.

**After this file you can:** explain signing, retries, idempotency, verify endpoints, and relate webhooks to patterns this monolith could add (not implemented yet).

---

## 1. First principles

A **webhook** is your server **calling the client’s URL** when something happens — “task completed”, “invoice paid” — instead of the client polling `GET /tasks`.

**The problem it solves:** Real-time integrations without hammering your API every 5 seconds.

**Costs:** Delivery guarantees, signature verification on receiver side, retry storms, and **at-least-once** semantics.

This task API **does not emit webhooks today** — integrations poll or use future event bus. Auth flows (email verify) are user-driven, not partner callbacks except you might receive **inbound** webhooks from email providers later.

---

## 2. Mental model

### Analogy

Doorbell when package arrives — not you checking the porch every minute. Receiver must trust the ring (signature) and ignore duplicate rings (idempotency).

### Diagram

```text
TaskService.update ──► outbox row ──► worker ──► POST partner URL
                              │              │
                              │              └── HMAC signature header
                              └── retry with backoff
```

---

## 3. Core rules (must / must-not)

1. **MUST** sign payloads (**HMAC-SHA256** of raw body + timestamp).  
2. **MUST** include **event id** for receiver deduplication.  
3. **MUST** retry with **exponential backoff** on 5xx/timeout; stop on persistent 4xx.  
4. **MUST NOT** block HTTP request thread on partner delivery — use **queue/outbox**.  
5. **MUST** allow partners to **rotate secrets**.  
6. **SHOULD** document replay window (reject old timestamps).  
7. **MUST NOT** leak internal stack traces in webhook body.

---

## 4. How it works (mechanics)

1. Domain event occurs (task status → COMPLETED).  
2. Persist **outbox** row in same transaction as state change (optional pattern).  
3. Worker reads outbox, POSTs JSON to registered `callbackUrl`.  
4. Headers: `X-Signature`, `X-Event-Id`, `X-Timestamp`.  
5. Receiver verifies signature, returns 2xx quickly, processes async.

**Contrast with this app’s sync flow:**

```ts
// task.controller.ts — immediate JSON response to caller
const parsed = updateTaskSchema.safeParse(req.body);
await this.service.update(...);
res.status(200).json(result);
```

Webhook delivery is **async** side effect after that commit.

---

## 5. When to use / when not to use

| Situation | Webhooks |
|-----------|----------|
| SaaS integrations (Slack, Zapier) | **Yes** |
| Same-team SPA only | **No** — polling/SSE enough |
| Payment provider status | **Inbound** webhook to you |
| Guaranteed audit trail | Event log + consumer |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Event types enum.  
2. Subscription model per project.  
3. Signing secret per subscription.  
4. Retry policy max 72h.

### Implement

1. `webhook_subscriptions` table.  
2. Outbox worker (see architecture outbox lesson optional).  
3. Admin API to rotate secret — Zod validated like other controllers.

### Verify

1. Receiver test endpoint logs signature pass/fail.  
2. Duplicate event id ignored.  
3. Partner down → retries, no lost events if outbox durable.

---

## 7. Worked example A — this project (foundation you’d reuse)

**Transactional core** already bundles writes (`ProjectServices.create` in `sql.begin`) — webhook outbox row would insert **in same transaction** as task status change so you never notify without commit.

**HTTP stack patterns to reuse:**

- `requestId` middleware for correlating delivery logs.  
- `errorHandler` style structured logging — apply to worker, not partner response.  
- Rate limiting irrelevant on outbound worker — **limit concurrent deliveries** instead.

**Inbound analogy:** Stripe-style `POST /api/v1/webhooks/stripe` would use **raw body** parser for signature — separate from `express.json({ limit: "100kb" })`.

---

## 8. Worked example B — mini scenario (self-contained)

```ts
const body = JSON.stringify({ eventId, type: "task.completed", taskId });
const sig = hmacSha256(secret, `${timestamp}.${body}`);
await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Event-Id": eventId,
    "X-Timestamp": timestamp,
    "X-Signature": sig,
  },
  body,
});
```

Receiver:

```ts
if (timingSafeEqual(expected, sig)) process(eventId);
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| POST webhook synchronously in request | Timeouts; partner slowness breaks users |
| No signature | Forged events |
| Retry without id | Duplicate side effects |
| GET webhook with side effects | CSRF/cache disasters |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Partner missed event | Worker down | Outbox backlog | Scale worker |
| 401 on verify | Clock skew | Timestamp window | Sync NTP |
| Duplicates | Retries | eventId store | Idempotent handler |
| SSL errors | Cert pin | URL | Update endpoint |

---

## 11. Interview Q&A (with strong answers)

**Q: At-least-once vs exactly-once?**  
**A:** Webhooks are at-least-once; receivers dedupe with event id. Exactly-once end-to-end requires distributed transactions — rare; dedupe is practical.

**Q: Outbox pattern?**  
**A:** Store “message to send” in DB same transaction as business change; separate process delivers — avoids dual-write inconsistency.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Outbox | DB table of pending outbound messages |
| HMAC | Keyed hash for authenticity |
| At-least-once | Delivery may repeat |
| Dedup | Ignore processed event ids |

---

## 13. Teach pointer

> “Webhooks are your API calling them — design like an unreliable network you own.”

---

## 14. Optional further reading (not required)

- Outbox: [../architecture/outbox-events.md](../architecture/outbox-events.md)  
- Idempotency: [./idempotency.md](./idempotency.md)
