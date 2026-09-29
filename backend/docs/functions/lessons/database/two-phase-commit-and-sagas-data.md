# Lesson: Two-phase commit and sagas (data layer view)

**Standalone ✓** — You do not need any other doc to explain why you cannot `BEGIN` across Stripe and Postgres, and how sagas/outbox preserve invariants.

**After this file you can:** contrast 2PC vs saga, design compensate steps, place outbox in this stack, and answer interview questions.

---

## 1. First principles

**Two-phase commit (2PC)** coordinates commit/rollback across **multiple participants** in one distributed transaction (prepare → commit).

**Saga** is a **sequence of local transactions** with **compensating actions** when a later step fails.

**Why 2PC is rare in microservices:** Blocking, operational complexity, not supported between your API and Stripe/Postgres.

**The problem sagas solve:** “Business workflow spans systems — still reach consistent **enough** end state without one global lock.”

---

## 2. Mental model

### Analogy

**2PC:** everyone holds breath until all agree to jump — one hesitant person blocks all.  
**Saga:** book hotel, then flight; if flight fails, **cancel hotel** (compensate).

### Diagram

```text
Monolith (this app) — STRONG inside Postgres:
  sql.begin → project + member ──► one COMMIT

Cross-system — SAGA not 2PC:
  1. COMMIT order in DB
  2. CALL payment API
  3. on fail → compensate (refund / mark order CANCELLED)
```

---

## 3. Core rules (must / must-not)

1. **MUST** use **local DB transactions** for multi-row invariants in this codebase.  
2. **MUST NOT** put HTTP to Stripe/email **inside** `sql.begin` ([transactions](./transactions.md)).  
3. **MUST** make saga steps **idempotent** (payment idempotency key).  
4. **MUST** record workflow state in DB (`PENDING`, `PAID`, `FAILED`).  
5. **MUST** prefer **outbox** for reliable publish-after-commit.

---

## 4. How it works (mechanics)

### 2PC phases

1. **Prepare:** participants vote ready  
2. **Commit/Abort:** coordinator decides  

Postgres supports 2PC for **multiple DBs** (`PREPARE TRANSACTION`) — seldom used in app tier.

### Saga orchestration

Central service tells each step what to run; on failure runs compensations in reverse order.

### Saga choreography

Each service listens to events and reacts — more decoupled, harder to trace.

### Outbox pattern

Same transaction: update business row + insert `outbox_events`. Worker publishes to queue — **at-least-once** delivery.

### vs this app’s auth flows

Register: user+token in **one tx**; email send **after** — if email fails, user exists but inactive — product handles resend (eventual notification consistency).

---

## 5. When to use / when not to use

| Situation | Pattern |
|-----------|---------|
| Project + owner row | Local transaction |
| Password reset + revoke sessions | Local transaction |
| Charge card + create subscription row | Saga + idempotent payment |
| Register + send email | Tx for DB; email async/outbox |
| Two Postgres regions | Avoid 2PC — saga or single primary |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Draw steps and failure points.  
2. Define compensations (refund, mark FAILED).  
3. Idempotency keys per external call.

### Implement

1. State machine table.  
2. Outbox insert in same tx as state change.  
3. Worker executes external calls with retry.

### Verify

1. Kill worker mid-saga — recovery completes or compensates.  
2. Duplicate delivery doesn’t double-charge.

---

## 7. Worked example A — this project

### What stays in one DB transaction

From `backend/src/modules/projects/project.service.ts` — create project + OWNER membership.

From `backend/src/modules/auth/auth.service.ts`:

- Register: user + verification token  
- Refresh: revoke session + new session  
- Password reset flows combining token mark used + password + session revoke  

All use `sql.begin` — **correct** use of local ACID, not 2PC across services.

### What is NOT atomic with DB

Sending verification email / console log of token — outside commit. Failure modes: user in DB, email not sent → resend endpoint (product concern).

**Not 2PC candidate:** wrapping SMTP and Postgres in one XA transaction — impractical.

### Future paid tier saga sketch

1. `INSERT subscription status=PENDING` + outbox row in tx  
2. Worker calls payment provider  
3. On success `UPDATE status=ACTIVE`; on fail `COMPENSATE` → `CANCELLED` + optional refund API

---

## 8. Worked example B — mini scenario (self-contained)

**Order + inventory:**

| Step | Action | Compensate |
|------|--------|------------|
| 1 | Reserve inventory (tx) | Release reservation |
| 2 | Charge payment | Refund |
| 3 | Mark order SHIPPED | (business policy) |

If step 2 fails after 1 → run compensate release.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| `fetch(stripe)` inside `sql.begin` | Locks + dual-write |
| No idempotency on retry | Double charge |
| Compensate not implemented | Stuck RESERVED inventory |
| 2PC across cloud APIs | Doesn't exist reliably |
| Saga state only in memory | Crash loses progress |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| User charged, no row | Payment after DB fail ordering | Step order | Saga state; reconcile |
| Row exists, no email | Async channel fail | Outbox/worker | Retry outbox |
| Duplicate subscription | Retry without idempotency | Payment keys | Idempotency-Key header |
| Stuck PENDING | Worker down | outbox table | Alert + replay |

---

## 11. Interview Q&A (with strong answers)

**Q: Two-phase commit?**  
**A:** Distributed protocol: prepare all participants, then commit or abort together — strong but fragile and rarely used across heterogeneous services.

**Q: Saga vs 2PC?**  
**A:** Saga uses local commits plus compensations; 2PC tries one global decision. Sagas fit microservices and external APIs.

**Q: Why not 2PC Stripe + Postgres?**  
**A:** Payment APIs aren't XA transaction participants; use saga/outbox and idempotent payments.

**Q: Example local transaction in this app?**  
**A:** Refresh token rotation revokes old session and creates new in one `sql.begin` in `auth.service.ts`.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| 2PC | Two-phase commit |
| Saga | Multi-step workflow with compensations |
| Compensation | Undo prior step semantically |
| Outbox | DB table for reliable events |
| Idempotency | Safe retry of same operation |
| XA | Distributed transaction standard |

---

## 13. Teach pointer

> “One database transaction for one database’s truth; sagas for the messy world outside it.”

---

## 14. Optional further reading (not required)

- Local transactions: [transactions](./transactions.md)  
- Outbox: [../architecture/outbox-events.md](../architecture/outbox-events.md)  
- Orchestration: [../architecture/saga-orchestration.md](../architecture/saga-orchestration.md)  
- Eventual consistency: [eventual-consistency-cap](./eventual-consistency-cap.md)
