# Lesson: Message queues

**Standalone ✓** — Async work with queues, delivery semantics, idempotency, and a full verify-email worker design (not in repo yet).

**After this file you can:** choose queue vs sync HTTP, handle at-least-once delivery, design DLQ/poison messages, and interview confidently.

---

## 1. First principles

A **message queue** buffers work between a **producer** (API) and **consumer** (worker). Producers enqueue; consumers process asynchronously—decoupling time and failure domains.

The problem it solves: slow or unreliable side effects (email, webhooks, PDF generation) inside HTTP requests cause timeouts and partial failures. Queues **buy time** and **absorb spikes**.

The tradeoff: **complexity**—ordering, retries, idempotency, monitoring—and **eventual** completion.

---

## 2. Mental model

### Analogy

Restaurant ticket rail: waiter clips order (enqueue), kitchen works when ready (consumer)—diner not standing at grill. Duplicate tickets need kitchen to recognize “already made” (idempotency).

### Diagram

```text
  HTTP API ──► enqueue job ──► [ Queue ] ──► Worker ──► SMTP / external
                  │                              │
                  └── fast 201 response          └── retry on failure
```

---

## 3. Core rules (must / must-not)

1. **MUST** assume **at-least-once** delivery unless proven otherwise.  
2. **MUST** make consumers **idempotent** (unique job id, dedupe table).  
3. **MUST NOT** put unbounded work in request thread when SLA allows async.  
4. **MUST** set visibility timeout / ack correctly—message reappears if worker dies mid-process.  
5. **SHOULD** use **dead-letter queue (DLQ)** after N failures.  
6. **SHOULD** combine with **outbox** for DB + enqueue atomicity.  
7. **MUST NOT** enqueue raw secrets (passwords, raw verify tokens) in plaintext logs.

---

## 4. How it works (mechanics)

**Patterns:** Point-to-point queue (one consumer group) vs competing consumers (scale workers).

**SQS-like semantics:** Receive → invisible period → delete on success; else redeliver.

**RabbitMQ:** Ack/nack, exchanges, routing keys.

**Redis streams:** Lightweight queue for smaller systems.

**This project:** **No queue**—register/login paths synchronous; verification email simulated via `console.log` in non-prod. Production gap: async email worker.

---

## 5. When to use / when not to use

| Situation | Queue? |
|-----------|--------|
| Send verification email | **Yes** (with outbox) |
| Create project + owner in DB | **No** — sync transaction |
| Webhook notifications to customers | **Yes** |
| Read task list | **No** |
| Image processing | **Yes** |

---

## 6. Step-by-step: design → implement → verify

1. Define job type `SendVerifyEmail`.  
2. Producer writes outbox row in same TX as user (see outbox lesson).  
3. Relay publishes to queue.  
4. Worker: idempotent send using `(userId, tokenId)`.  
5. Metrics: lag, DLQ depth, processing time.  
6. Test: crash worker after send, before ack—no duplicate email to user.

---

## 7. Worked example A — this project (gap + target design)

**Today:** `AuthService.register` creates user + verification token in transaction; dev logs raw token—HTTP waits only for DB.

**Target with queue:**

1. Same transaction: user + token + outbox row `{ type: "VERIFY_EMAIL", payload: { userId, tokenId } }`.  
2. Outbox relay → queue message `jobId = outbox.id`.  
3. Worker loads token hash by id, sends email, marks outbox processed.  
4. HTTP 201 returns before email leaves SMTP.

**Idempotency key:** `outbox.id` or `tokenId`—second delivery skips if `email_sent_at` set.

**Modules:** Auth owns enqueue intent; worker is separate process (still modular monolith repo folder `workers/` or separate deploy).

---

## 8. Worked example B — self-contained mini scenario

```ts
// consumer
async function handle(job: { id: string; type: string; userId: string }) {
  const done = await db`
    SELECT 1 FROM processed_jobs WHERE job_id = ${job.id}
  `;
  if (done.length) return; // idempotent

  if (job.type === "VERIFY_EMAIL") {
    await sendEmail(job.userId);
  }

  await db`
    INSERT INTO processed_jobs (job_id) VALUES (${job.id})
  `;
}
```

**Poison message:** fails 5 times → move to DLQ, alert, manual inspect.

**Visibility timeout:** if `sendEmail` takes 2 minutes, timeout must exceed 2 minutes or another worker duplicates work (mitigated by idempotency).

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Queue without idempotency | Duplicate emails/charges |
| Enqueue before DB commit | Worker runs on ghost data |
| Infinite retry on bad payload | DLQ never fills, noise |
| Huge payloads in queue | Cost + leak surface |
| Sync HTTP to worker | Not a queue |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Duplicate emails | At-least-once + no dedupe | processed_jobs | Idempotency |
| Jobs never run | Worker down / wrong queue | Consumer metrics | Deploy worker |
| Growing backlog | Slow consumer | Lag metric | Scale workers |
| Lost jobs | Ack before work done | Order of ack | Ack after success |
| Ghost jobs | Enqueue before commit | Outbox pattern | Transactional outbox |

---

## 11. Interview Q&A (with strong answers)

**Q: At-least-once vs exactly-once?**  
**A:** Most queues at-least-once; exactly-once needs idempotent consumers + dedupe or expensive distributed transactions.

**Q: Visibility timeout?**  
**A:** Time message hidden after receive; if not acked, redelivered for another worker.

**Q: Poison messages / DLQ?**  
**A:** After max retries, quarantine for inspection—prevent blocking whole queue.

**Q: Queue vs pub/sub?**  
**A:** Queue: one consumer typically processes job; pub/sub: many subscribers notified (broadcast).

**Q: This repo?**  
**A:** Sync path today; natural first queue job is verification email with outbox.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Producer | Enqueues messages |
| Consumer | Processes messages |
| Ack | Confirm successful processing |
| DLQ | Dead-letter queue |
| At-least-once | May deliver duplicates |
| Idempotency | Repeat safe |
| Backlog | Unprocessed messages |

---

## 13. Teach pointer

> “Queues buy time. Idempotency buys correctness under redelivery.”

---

## 14. Optional further reading (not required)

- [outbox-events](./outbox-events.md) · [pub-sub](./pub-sub.md)  
- [../api/idempotency.md](../api/idempotency.md)

Repo path: `backend/src/modules/auth/auth.service.ts` (register flow).
