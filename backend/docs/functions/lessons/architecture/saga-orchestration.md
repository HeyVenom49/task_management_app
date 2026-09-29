# Lesson: Saga orchestration

**Standalone ✓** — Long-running distributed workflows, orchestration vs choreography, compensations, with a full billing+project example.

**After this file you can:** model multi-step cross-system flows, choose orchestrator vs events, implement idempotent saga steps, and contrast with local `sql.begin`.

---

## 1. First principles

A **saga** is a sequence of **local transactions** with **compensating actions** when a later step fails—achieving overall consistency **without** a single distributed two-phase commit across Postgres, Stripe, and email.

**Orchestration:** central coordinator tells services what to do next and tracks state.  
**Choreography:** services react to each other’s events without a central brain.

The problem it solves: “Create paid project” spanning billing API, project DB, and welcome email cannot one-shot `BEGIN` across vendors.

---

## 2. Mental model

### Analogy

Travel itinerary with refundable bookings: book flight (step 1), hotel (step 2). Hotel fails → cancel flight (compensation)—no single global “transaction,” but defined undo paths.

### Diagram (orchestration)

```text
 Orchestrator (state machine)
      │
      ├──► Step 1: CreateProject (local TX) ── OK
      ├──► Step 2: ChargeCard (Stripe) ── FAIL
      └──► Compensate: DeleteProject / mark FAILED
```

---

## 3. Core rules (must / must-not)

1. **MUST** make each step **idempotent** (retry-safe keys).  
2. **MUST** store **saga state** durably (`PENDING`, `CHARGED`, `FAILED`).  
3. **MUST** define **compensations** or accept manual intervention for irreversible steps.  
4. **MUST NOT** hide saga in frontend-only API sequencing.  
5. **SHOULD** prefer orchestration when flow is complex; choreography when few steps and clear events.  
6. **MUST NOT** confuse local DB transaction with saga—saga spans systems/time.

---

## 4. How it works (mechanics)

**State table:**

```sql
CREATE TABLE sagas (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,
  state TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Orchestrator worker:** load saga → execute current transition → persist new state → on failure run compensation chain.

**Choreography:** `ProjectCreated` event → billing listens → publishes `PaymentFailed` → projects listens → compensates.

**This project:** **N/A for production flows**—create project + owner is **one local transaction** in `ProjectServices.create`. No Stripe. Sagas appear when integrating external billing or multi-service split.

---

## 5. When to use / when not to use

| Situation | Saga? |
|-----------|--------|
| Project + owner in one DB | **Local transaction only** |
| Pay + provision + email across vendors | **Saga** |
| Single service monolith | Saga rarely |
| Microservices with cross writes | **Often** |

---

## 6. Step-by-step: design → implement → verify

1. Draw steps and failure points.  
2. Mark reversible vs irreversible steps.  
3. Choose orchestrator table vs event choreography.  
4. Implement idempotent step handlers.  
5. Add timeouts for stuck states.  
6. Test: fail step 2 → compensate step 1 → consistent external view.

---

## 7. Worked example A — this project (contrast)

**Local saga-like flow (not distributed):** Refresh token rotation in `AuthService.refresh`—revoke old session + create new in **one** `sql.begin`. That is a **single-database transaction**, not a saga.

**If product added paid tiers:**

```text
CREATE_PROJECT_WITH_BILLING saga:
  PENDING → PROJECT_CREATED → CHARGED → EMAIL_SENT → DONE
  on CHARGE_FAILED → compensate DELETE project (soft) → FAILED
```

Orchestrator row stores `projectId`, `paymentIntentId`. Each transition idempotent on retry.

**Tasks module** unaffected until billing gates task limits—then saga might emit `EntitlementsUpdated` event.

---

## 8. Worked example B — self-contained mini scenario

```ts
type SagaRow = { id: string; state: string; payload: { projectId?: string; pi?: string } };

async function tick(saga: SagaRow) {
  switch (saga.state) {
    case "PENDING": {
      const projectId = await createProjectLocal(saga.payload);
      await save(saga.id, "PROJECT_CREATED", { ...saga.payload, projectId });
      return tick(await load(saga.id));
    }
    case "PROJECT_CREATED": {
      try {
        const pi = await stripe.charge(saga.payload.projectId!, saga.payload);
        await save(saga.id, "CHARGED", { ...saga.payload, pi });
      } catch {
        await deleteProject(saga.payload.projectId!);
        await save(saga.id, "FAILED", saga.payload);
        return;
      }
      return tick(await load(saga.id));
    }
    case "CHARGED": {
      await sendWelcomeEmail(saga.payload.projectId!);
      await save(saga.id, "DONE", saga.payload);
    }
  }
}
```

`createProjectLocal` and `deleteProject` idempotent on saga id key.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Frontend calls 3 APIs sequentially | Partial failure, no compensation |
| No durable saga state | Crash loses place |
| Compensation forgotten | Orphan charged card, no project |
| Non-idempotent charge step | Double billing on retry |
| Distributed monolith saga | Same pain, more network |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Stuck PENDING | Worker down | sagas table | Restart worker |
| Charged, no project | Missing compensate | State | Run compensation |
| Duplicate charge | Retry without idempotency | Stripe idempotency key | Add keys |
| DONE but wrong | Race | State transitions | Lock saga row |

---

## 11. Interview Q&A (with strong answers)

**Q: Orchestration vs choreography?**  
**A:** Orchestrator centralizes flow and state; choreography uses events—less central coupling, harder to see big picture.

**Q: Saga vs DB transaction?**  
**A:** Transaction: one DB, ACID now. Saga: multiple systems over time with compensations.

**Q: Saga state storage?**  
**A:** Durable table or event log owned by orchestrator service.

**Q: Idempotent steps?**  
**A:** Re-running step doesn’t double effect—use business keys.

**Q: This app example?**  
**A:** Project+owner uses local transaction; saga appears for future billing/email across services.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Saga | Multi-step workflow with compensations |
| Orchestration | Central coordinator |
| Choreography | Event-driven peer reactions |
| Compensation | Undo prior step |
| Idempotent step | Safe retry |
| Local transaction | Single DB BEGIN/COMMIT |

---

## 13. Teach pointer

> “If the workflow spans systems, give it a name, a state, and a compensation—that’s a saga.”

---

## 14. Optional further reading (not required)

- [outbox-events](./outbox-events.md) · [../database/two-phase-commit-and-sagas-data.md](../database/two-phase-commit-and-sagas-data.md)  
- [monolith-vs-microservices](./monolith-vs-microservices.md)

Repo path: `backend/src/modules/projects/project.service.ts`, `backend/src/modules/auth/auth.service.ts`.
