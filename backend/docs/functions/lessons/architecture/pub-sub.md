# Lesson: Pub/sub (publish–subscribe)

**Standalone ✓** — Event broadcasting vs queues, use cases, and a project-events design for this app.

**After this file you can:** choose pub/sub vs queue, design topics and subscribers, handle fan-out idempotency, and interview clearly.

---

## 1. First principles

**Publish–subscribe** lets a **publisher** emit events to a **topic**; **subscribers** receive copies without the publisher knowing each consumer. Contrast with a **queue** where one worker typically consumes a job.

The problem it solves: one business event (`ProjectDeleted`) must trigger many reactions—purge cache, notify analytics, enqueue webhooks—without the projects service calling N clients synchronously.

The cost: **ordering**, **delivery guarantees**, and **debugging** distributed fan-out.

---

## 2. Mental model

### Analogy

Radio station broadcast (topic)—listeners tune in (subscribe). Unlike a postal queue where one clerk handles each letter once for a specific desk.

### Diagram

```text
  ProjectService ──publish──► topic: project.events
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              SearchIndexer    WebhookDispatcher   AuditLogger
              (subscriber)     (subscriber)        (subscriber)
```

---

## 3. Core rules (must / must-not)

1. **MUST** treat delivery as **at-least-once** unless platform guarantees otherwise.  
2. **MUST** make each subscriber **idempotent**.  
3. **MUST NOT** put critical invariants only in async subscribers—core transaction must enforce laws.  
4. **SHOULD** use outbox to publish reliably after DB commit.  
5. **SHOULD** version event schemas (`ProjectDeletedV1`).  
6. **MUST NOT** assume global ordering across topics without design.

---

## 4. How it works (mechanics)

**Broker examples:** Kafka (log), SNS+SQS fan-out, Redis pub/sub (fire-and-forget, weak persistence), NATS.

**Queue vs pub/sub:**

| | Queue | Pub/sub |
|---|-------|---------|
| Consumers | Compete for jobs | Each subscriber gets copy |
| Use | Work processing | Notifications, fan-out |
| Typical pattern | Task worker | Event-driven reactions |

**This project:** **No event bus.** Project delete guards and task counts happen **synchronously** in `ProjectServices` via `TaskRepository`—correct for monolith, not pub/sub.

---

## 5. When to use / when not to use

| Situation | Pub/sub? |
|-----------|----------|
| Many independent reactions to one event | **Yes** |
| Exactly one worker must process payment | **Queue**, not broadcast |
| Monolith with 2 reactions | Direct service calls OK |
| Cross-team integration | **Yes** with schema registry |

---

## 6. Step-by-step: design → implement → verify

1. Name events past tense (`TaskCreated`).  
2. Define JSON schema with ids only.  
3. Publish from outbox relay after commit.  
4. Implement subscribers as isolated consumers.  
5. Monitor lag per consumer group.  
6. Test subscriber failure doesn’t rollback original HTTP transaction.

---

## 7. Worked example A — this project (hypothetical evolution)

**Today:** Deleting project checks open tasks synchronously in project service—single process.

**With pub/sub:**

1. `ProjectServices.remove` commits `status=DELETED` + outbox `ProjectDeleted { projectId }`.  
2. Relay publishes to `project.events`.  
3. Subscribers:  
   - Tasks service marks tasks archived (or separate command).  
   - Analytics counts churn.  
   - Cache invalidator drops `project:{id}:*` keys.

**Auth module** might subscribe to `UserBanned` to revoke sessions—decoupled from auth HTTP.

**Keep synchronous path** until extraction pain justifies broker ops.

---

## 8. Worked example B — self-contained mini scenario

```ts
// publisher (after outbox relay)
await bus.publish("billing.events", {
  type: "InvoicePaid",
  version: 1,
  invoiceId: "inv_123",
  paidAt: "2026-01-01T00:00:00Z",
});

// subscriber A
bus.subscribe("billing.events", async (evt) => {
  if (evt.type !== "InvoicePaid") return;
  if (await ledger.hasEntry(evt.invoiceId)) return;
  await ledger.recordPayment(evt.invoiceId);
});

// subscriber B
bus.subscribe("billing.events", async (evt) => {
  if (evt.type !== "InvoicePaid") return;
  await email.sendReceipt(evt.invoiceId);
});
```

Each subscriber dedupes on `invoiceId`.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Pub/sub without outbox | Lost events on crash |
| Fat event with huge payload | Broker bloat |
| Subscriber enforces sole invariant | Race with API read |
| Redis pub/sub as sole source of truth | Message loss on disconnect |
| No schema versioning | Breaking consumers |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Some subscribers stale | Consumer lag | Lag metrics | Scale consumer |
| Duplicate side effects | At-least-once | Dedupe table | Idempotency |
| Missing events | No outbox relay | Outbox backlog | Fix publisher |
| Ordering bugs | Parallel subscribers | Design | Per-aggregate partition key |

---

## 11. Interview Q&A (with strong answers)

**Q: Pub/sub vs message queue?**  
**A:** Queue: work item consumed once by one worker in a group. Pub/sub: broadcast to all subscribers.

**Q: How relate to outbox?**  
**A:** Outbox ensures publish after DB commit; pub/sub is transport fan-out.

**Q: Exactly-once?**  
**A:** Rare end-to-end; use idempotent subscribers + dedupe.

**Q: This repo?**  
**A:** In-process orchestration; pub/sub future for cross-module async reactions.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Topic | Named channel for events |
| Publisher | Event sender |
| Subscriber | Event receiver |
| Fan-out | One event → many consumers |
| Consumer group | Queue competition group (Kafka) |
| Event schema | Contract for payload fields |

---

## 13. Teach pointer

> “Pub/sub tells everyone something happened—it doesn’t replace the transaction that made it true.”

---

## 14. Optional further reading (not required)

- [outbox-events](./outbox-events.md) · [message-queues](./message-queues.md)  
- [event-sourcing](./event-sourcing.md)

Repo path: `backend/src/modules/projects/project.service.ts`.
