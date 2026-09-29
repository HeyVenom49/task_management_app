# Lesson: At-least-once delivery and idempotency keys

**Standalone ✓** — You do not need any other doc to reason about retries, duplicate side effects, and Idempotency-Key design.

**After this file you can:** explain at-least-once vs exactly-once, design Idempotency-Key storage, relate this app’s partial protections (UNIQUE, OCC), and interview with a concrete mini design.

---

## 1. First principles

Networks fail **after** work may already have succeeded. Clients retry. Message brokers default to **at-least-once**: you might process the same logical intent more than once.

**Exactly-once** end-to-end is rare across HTTP + DB + email. What you actually build is **at-least-once + idempotent handlers** so duplicates are safe.

**The problem it solves:** Double-created projects, double charges, twin side effects when the client “wasn’t sure.”

---

## 2. Mental model

### Analogy

You mail a check. Unsure it arrived, you mail another. Without a check number the bank can cash both. With a unique check number, the second is rejected — **idempotent deposit**.

### Diagram

```text
Client                  Server                         DB
  │ POST + Idempotency-Key: K1 │                         │
  │───────────────────────────►│ insert key K1 (pending) │
  │                            │ do work                 │
  │                            │ store response for K1   │
  │◄────────── 201 ────────────│                         │
  │ timeout / retry            │                         │
  │ POST + Key K1 ────────────►│ find K1 → replay body   │
  │◄────────── same 201 ───────│ (no second insert)      │
```

At-least-once without keys:

```text
retry → second INSERT → duplicate row
```

---

## 3. Core rules (must / must-not)

1. **MUST** assume POSTs can be duplicated by retries.  
2. **MUST** make handlers idempotent via keys and/or natural UNIQUE constraints.  
3. **MUST** store idempotency records with request hash + response snapshot + TTL.  
4. **MUST** return the **same** status/body on replay (not a new resource silently).  
5. **MUST NOT** claim “exactly-once HTTP” without defining the whole pipeline.  
6. **MUST** backstop with DB constraints (email unique, etc.).  
7. **SHOULD** use OCC on updates so stale retries conflict loudly (409).

---

## 4. How it works (mechanics)

### Delivery semantics (working defs)

| Term | Meaning |
|------|---------|
| At-most-once | May lose messages; no dupes |
| At-least-once | No silent loss; possible dupes |
| Exactly-once | Dupes eliminated or made no-ops — usually “effective exactly-once” via idempotency |

HTTP clients after timeout cannot know if the server committed → they retry → **at-least-once intent**.

### Idempotency-Key protocol

1. Client sends header `Idempotency-Key: <uuid>` on unsafe POST.  
2. Server begins transaction: try insert key row.  
3. If key exists with completed response → return stored response.  
4. If key exists in-progress → 409 Conflict or wait (choose policy).  
5. Else perform work; save status+body; commit.

Key scope: usually **per user** (or API key) so users can’t collide.

### This project — partial (no global key middleware yet)

| Mechanism | Effect |
|-----------|--------|
| UNIQUE email on register | Second register → `ConflictError` 409 |
| UNIQUE-ish project name conflicts mapped to 409 | Duplicate create name fails |
| Task PATCH `expectedUpdatedAt` | Stale/duplicate PATCH → 409 |
| DELETE task | Second delete → 404 — acceptable idempotent delete |

There is **no** `Idempotency-Key` middleware in `backend/src` today — treat that as a design gap for payment-like POSTs. Neighbor lesson `api/idempotency.md` covers HTTP method theory; this lesson focuses on **delivery + keys**.

---

## 5. When to use / when not to use

| Situation | Keys / idempotency? |
|-----------|---------------------|
| POST create money movement | **Mandatory** keys + ledger uniqueness |
| POST create project | Keys **or** client-generated UUID primary key |
| GET list | Naturally idempotent |
| PATCH with OCC | Retry-safe with 409 recovery |
| Internally once-daily cron with lease | Use lock/lease instead of HTTP keys |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Name the side effect that must not double.  
2. Choose natural key (email) vs explicit Idempotency-Key.  
3. Define TTL (24h typical for payments).  
4. Define mismatch policy: same key, different body → 422.

### Implement (mini table)

```sql
CREATE TABLE idempotency_keys (
  user_id UUID NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code INT,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);
```

### Verify

1. POST twice with same key → one row side effect, identical responses.  
2. Same key different body → error.  
3. Different keys → two resources.  
4. Crash after work before save response — define recovery (see failure modes).

---

## 7. Worked example A — this project (partial)

### A1. Register is naturally idempotent-ish via UNIQUE

Retry register with same email → 409 `"Email already registered"` (`auth.service.ts`). Not a stored Idempotency-Key replay of the original 201 body, but **safe against duplicate users**.

### A2. Project create

`ConflictError("A project with this name already exists")` — partial protection when `info` collides; two retries with **different** names still create two projects (true duplicate intent needs a key).

**Where:** `project.service.ts`.

### A3. Task update OCC

Retried PATCH with old `expectedUpdatedAt` after success → 409 `"Task was modified; reload and try again"`. Client reloads — no silent overwrite.

**Where:** `task.service.ts` + `task.repository.ts` `date_trunc` predicate.

---

## 8. Worked example B — mini scenario (self-contained)

**Feature:** `POST /v1/orders` creates an order + reserves inventory.

```ts
async function createOrder(sql, userId, key, body) {
  const hash = sha256(JSON.stringify(body));

  return sql.begin(async (tx) => {
    const [existing] = await tx`
      SELECT status_code, response_body, request_hash
      FROM idempotency_keys
      WHERE user_id = ${userId} AND key = ${key}
      FOR UPDATE
    `;

    if (existing) {
      if (existing.request_hash !== hash) {
        throw new ConflictError("Idempotency-Key reused with different body");
      }
      return {
        status: existing.status_code,
        body: existing.response_body,
        replay: true,
      };
    }

    const order = await insertOrder(tx, userId, body);
    await reserveStock(tx, body.items);

    const response = { order };
    await tx`
      INSERT INTO idempotency_keys (user_id, key, request_hash, status_code, response_body)
      VALUES (${userId}, ${key}, ${hash}, 201, ${tx.json(response)})
    `;
    return { status: 201, body: response, replay: false };
  });
}
```

At-least-once retries become **safe**; inventory reserved once.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| “TCP is reliable, no retries needed” | Timeouts still happen at app layer |
| Idempotency key without UNIQUE/PK | Race inserts two works |
| Key only in Redis, no DB | Redis flush → dupes |
| Return 201 with new id on replay | Client thinks one order, DB has two |
| Exactly-once queue marketing taken literally | Still need handler idempotency |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Duplicate projects on double-click | No key; different names | Client UX + server keys | Add Idempotency-Key |
| 409 on register | Expected UNIQUE | Email | Show “already registered” |
| Key replay returns 500 | Response not stored / crashed mid-way | idempotency row state | Two-phase: mark processing carefully |
| OCC 409 storms | Client not refreshing `updatedAt` | PATCH body | Reload then retry |
| Cross-user key collision | Global key namespace | PK includes user_id | Scope keys per principal |

---

## 11. Interview Q&A (with strong answers)

**Q: What does at-least-once mean?**  
**A:** The system may deliver or process an operation more than once, but won’t silently drop it forever after the sender got uncertainty. Consumers must be idempotent.

**Q: How do you get effective exactly-once?**  
**A:** At-least-once transport + idempotent processing (keys, dedupe tables, unique constraints) so duplicates don’t change business state twice.

**Q: Why are POST retries dangerous?**  
**A:** POST is not idempotent by default; each attempt may create a new resource or charge.

**Q: What is an Idempotency-Key?**  
**A:** A client-chosen token that lets the server recognize retries of the same logical request and return the original result.

**Q: How does this task app partially help?**  
**A:** UNIQUE conflicts and OCC 409s prevent some duplicate/corrupt writes, but create-project without keys can still double on different payloads.

**Q: Idempotency vs OCC?**  
**A:** Idempotency dedupes creates/side effects; OCC protects concurrent updates with versions/timestamps.

**Q: Where would you add keys first in this codebase?**  
**A:** `POST /projects` and any future payment/webhook receivers — middleware + table as in example B.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| At-least-once | Dupes possible; loss minimized |
| Idempotent | Many executions → one logical effect |
| Idempotency-Key | Client header token for dedupe |
| Natural key | Business UNIQUE that prevents dupes |
| Replay | Returning stored response for a key |
| Effective exactly-once | Dupes made no-ops |

---

## 13. Teach pointer

> “Assume the network will retry; make doing it twice the same as doing it once.”

---

## 14. Optional further reading (not required)

- HTTP idempotency methods: [../api/idempotency.md](../api/idempotency.md)  
- OCC timestamps: [../database/utc-timestamps-and-clocks.md](../database/utc-timestamps-and-clocks.md)  
- Outbox: [outbox-events.md](./outbox-events.md)  
- Retries: [../ops/retry-backoff-timeouts.md](../ops/retry-backoff-timeouts.md)

Repo paths: `auth.service.ts`, `project.service.ts`, `task.service.ts` / `task.repository.ts` (partial patterns). No Idempotency-Key middleware file exists yet by design of this lesson’s “gap.”
