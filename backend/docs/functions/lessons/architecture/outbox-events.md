# Lesson: Outbox & reliable events

**Standalone ✓** — Transactional outbox, dual-write problem, and a full verify-email flow for this auth module.

**After this file you can:** implement outbox + worker, explain dual-write failures, relate outbox to sagas/queues, and debug missed notifications.

---

## 1. First principles

When business state changes in the DB and the outside world must know (email, webhook, search index), **two writes** are required: database and external system. They cannot share one ACID transaction across Postgres and SMTP.

The **transactional outbox** pattern: in the **same DB transaction** as the business write, insert an **outbox row** describing the event. A separate **relay/worker** reads outbox and calls external systems, marking rows processed.

The problem it solves: **dual-write inconsistency**—user committed but email never sent, or email sent for user that rolled back.

---

## 2. Mental model

### Analogy

Deposit and receipt stub in one atomic bank transaction—the courier picks up stubs later to mail statements. Courier failure doesn’t undo deposit; stub remains for retry.

### Diagram

```text
  sql.begin
     ├── INSERT user
     ├── INSERT verification_token
     └── INSERT outbox (VERIFY_EMAIL)
  COMMIT
        │
        ▼
  Relay (poll or logical replication)
        │
        ▼
  Queue / SMTP ──► mark outbox processed
```

---

## 3. Core rules (must / must-not)

1. **MUST** write outbox in **same transaction** as business mutation.  
2. **MUST** process outbox **idempotently** (at-least-once relay).  
3. **MUST NOT** log raw verification tokens in outbox payloads in production—store ids, fetch securely in worker.  
4. **SHOULD** use `FOR UPDATE SKIP LOCKED` for worker concurrency.  
5. **MUST NOT** send email **before** commit hoping DB succeeds.  
6. **SHOULD** separate **outbox relay** from **domain worker** for clarity.

---

## 4. How it works (mechanics)

**Table sketch:**

```sql
CREATE TABLE outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX outbox_unprocessed ON outbox (created_at) WHERE processed_at IS NULL;
```

**Worker loop:**

```sql
SELECT * FROM outbox
WHERE processed_at IS NULL
ORDER BY created_at
FOR UPDATE SKIP LOCKED
LIMIT 10;
```

Handle each → external side effect → `UPDATE outbox SET processed_at = now()`.

**Delivery:** At-least-once to external world—email provider may duplicate; idempotency keys help.

**This project:** **Not implemented.** Auth creates tokens in DB; email is console stand-in after commit—acceptable dev shortcut, production gap.

---

## 5. When to use / when not to use

| Situation | Outbox? |
|-----------|---------|
| Email after register | **Yes** |
| Update search index | **Yes** |
| Single DB only CRUD | No |
| Fire-and-forget metrics | Maybe skip (loss acceptable) |
| Cross-service saga steps | Outbox per service |

---

## 6. Step-by-step: design → implement → verify

1. Add `outbox` migration.  
2. In `AuthService.register` transaction: user + token + outbox row.  
3. Deploy relay cron/worker.  
4. Implement handler map `{ VERIFY_EMAIL: sendVerify }`.  
5. Test: kill worker after commit—rows remain, retry sends once (idempotent).  
6. Test: fail SMTP—row stays unprocessed, alerts on age.

---

## 7. Worked example A — this project (target implementation)

**Current (simplified):**

```ts
const { user, rawToken } = await this.sql.begin(async (tx) => {
  const user = await this.repo.createUser({ name, email, passwordHash }, tx);
  const rawToken = await this.issueVerificationToken(user.id, tx);
  return { user, rawToken };
});
// after commit — console.log email (dual-write risk if this were real SMTP)
```

**With outbox:**

```ts
await this.sql.begin(async (tx) => {
  const user = await this.repo.createUser({ name, email, passwordHash }, tx);
  const { tokenId, rawToken } = await this.issueVerificationTokenRecord(user.id, tx);
  await this.outboxRepo.insert(
    {
      type: "VERIFY_EMAIL",
      payload: { userId: user.id, tokenId }, // not rawToken in DB payload
    },
    tx,
  );
  return { user, rawToken }; // rawToken only in memory for dev immediate send optional
});
```

Worker loads `tokenId`, uses one-time secret flow or regenerates link via stored hash strategy—**never** log raw token.

**Related invariants:** Same transaction pattern as [../database/transactions.md](../database/transactions.md)—user without token row impossible.

---

## 8. Worked example B — self-contained mini scenario

```ts
async function placeOrder(sql, orderId: string) {
  await sql.begin(async (tx) => {
    await tx`UPDATE orders SET status = 'PLACED' WHERE id = ${orderId}`;
    await tx`
      INSERT INTO outbox (type, payload)
      VALUES ('OrderPlaced', ${JSON.stringify({ orderId })})
    `;
  });
}

async function outboxWorker(sql, publish: (e: unknown) => Promise<void>) {
  const rows = await sql`
    SELECT id, type, payload FROM outbox
    WHERE processed_at IS NULL
    FOR UPDATE SKIP LOCKED LIMIT 5
  `;
  for (const row of rows) {
    await publish(row);
    await sql`UPDATE outbox SET processed_at = now() WHERE id = ${row.id}`;
  }
}
```

Crash between `publish` and update → redelivery → consumer idempotent on `orderId`.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Email after commit only, no outbox | Email fails silently |
| Email before commit | Email for rolled-back user |
| Outbox outside transaction | Orphan or missing events |
| Raw PII in payload logs | Compliance leak |
| No SKIP LOCKED | Workers block each other |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| User exists, no email | Side effect after commit failed | Outbox rows stale? | Outbox worker |
| Duplicate emails | At-least-once | Idempotency | Dedupe on tokenId |
| Outbox pile-up | Worker down | `processed_at IS NULL` count | Scale relay |
| Events never publish | Wrong handler type | Dead letters | Fix mapping |

---

## 11. Interview Q&A (with strong answers)

**Q: Dual-write problem?**  
**A:** DB and external system can diverge if updated separately without coordinated pattern.

**Q: Outbox vs saga?**  
**A:** Outbox reliably emits **after** local commit; saga coordinates **multi-step cross-service** workflows with compensations.

**Q: At-least-once implications?**  
**A:** Consumers must tolerate duplicates—idempotent processing.

**Q: Why not two-phase commit across Postgres and SMTP?**  
**A:** SMTP is not a transaction participant—XA impractical.

**Q: This app status?**  
**A:** Transactional user+token; email not outboxed yet—documented production gap.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Outbox | Table of pending integration events |
| Relay | Publishes outbox to bus/email |
| Dual-write | Two stores updated separately |
| Idempotent consumer | Safe on duplicate delivery |
| SKIP LOCKED | Worker concurrency without blocking |

---

## 13. Teach pointer

> “If it must happen ‘with the commit,’ put it in the same transaction as an outbox row—not as a hopeful side effect after.”

---

## 14. Optional further reading (not required)

- [message-queues](./message-queues.md) · [saga-orchestration](./saga-orchestration.md)  
- [../database/transactions.md](../database/transactions.md)

Repo path: `backend/src/modules/auth/auth.service.ts`.
