# Lesson: Blameless postmortems

**Standalone ✓** — You do not need any other doc to run a blameless incident review that produces real fixes.

**After this file you can:** facilitate a blameless postmortem, write a timeline and action items, analyze a Redis fail-closed or migration outage, and answer interview questions on incident culture.

---

## 1. First principles

A **postmortem** (incident review) is a written learning document after an outage or near-miss: what happened, why, how we detected it, and what we will change.

**Blameless** means we optimize for **system truth**, not finding a person to punish. Humans operate imperfect systems; shame hides data.

**The problem it solves:** The same outage repeating because the team fixed a person instead of a guardrail (timeout, migration gate, alert, runbook).

---

## 2. Mental model

### Analogy

Aviation incident reports ask “why did the procedure and cockpit allow this?” — not “who is the worst pilot?” Better checklists emerge; flying gets safer.

### Diagram

```text
Incident → mitigate → stabilize
              │
              ▼
     Timeline (facts only)
              │
              ▼
   Contributing factors (5 whys / fishbone)
              │
              ▼
   Action items (owner, due, verifiable)
              │
              ▼
   Share + track to close
```

---

## 3. Core rules (must / must-not)

1. **MUST** separate **mitigation** (stop the bleeding) from **review** (learn).  
2. **MUST** write a **timeline** with UTC timestamps and evidence (logs, `requestId`s).  
3. **MUST** list **contributing factors** in the system (design, process, tooling).  
4. **MUST** produce **action items** that are specific, owned, and testable.  
5. **MUST NOT** use the postmortem to HR-punish individuals.  
6. **MUST NOT** stop at “human error” — ask what allowed the error to matter.  
7. **MUST** share with everyone who might hit the same footgun.

---

## 4. How it works (mechanics)

### Typical sections

| Section | Content |
|---------|---------|
| Summary | Impact in one paragraph |
| Severity | Who/what hurt; duration |
| Timeline | Detection → mitigation → resolve |
| Root / contributing causes | Technical + process |
| What went well | Detection, communication |
| What went poorly | Gaps |
| Action items | Prevent / detect / mitigate faster |

### Blameless language

| Blamey | Blameless rewrite |
|--------|-------------------|
| “Dev forgot Redis” | “Deploy had no Redis readiness gate; fail-closed limits returned 503” |
| “Junior ran bad migration” | “Migration lacking expand/contract was runnable on prod without review checklist” |

### Tie to this codebase’s failure styles

- **Fail-closed rate limits:** `backend/src/shared/auth/rate-limit.ts` throws `ServiceUnavailableError` when Redis commands fail — users see 503 on login/auth writes. Correct security posture; still an **availability** incident if Redis is down.  
- **Migrations:** `backend/src/db/migrate.ts` applies versioned SQL; a bad migration can block boot or lock tables.  
- **Correlation:** use `requestId` from logs/error JSON to build the timeline (`requestId` middleware + `errorHandler`).

---

## 5. When to use / when not to use

| Situation | Postmortem? |
|-----------|-------------|
| Customer-visible outage / data risk | **Yes** |
| Near-miss that almost corrupted data | **Yes** (often highest ROI) |
| Typo on a feature flag with no impact | Lightweight note optional |
| Every tiny 500 | Aggregate in weekly review — don’t drowning in docs |
| Security breach | Yes + legal/comms process |

---

## 6. Step-by-step: design → implement → verify

### During incident

1. Declare incident; assign incident lead.  
2. Mitigate first (rollback, restore Redis, feature flag).  
3. Capture rough timeline live (chat pins).

### After stabilize

1. Schedule review within a few days.  
2. Draft doc from logs (`requestId`, status spikes).  
3. Meeting: facts → factors → actions (no blame theater).  
4. Publish; track actions in issue tracker until done.

### Verify learning stuck

1. Action items closed with proof (alert exists, test added).  
2. Tabletop: “Redis down” drill once a quarter.

---

## 7. Worked example A — invented outage grounded in this repo

### Title

**SEV-2: Auth write paths returned 503 for 18 minutes (Redis unavailable, fail-closed rate limit)**

### Summary

From 14:02–14:20 UTC, `loginLimiter` / `authWriteLimiter` could not talk to Redis. `rate-limit-redis` `sendCommand` caught errors and threw `ServiceUnavailableError("Rate limiting unavailable. Try again later.")`. Clients received **503** with `requestId`. Fail-closed behavior worked as coded; availability suffered.

### Timeline (excerpt)

| UTC | Event |
|-----|-------|
| 14:01 | Redis pod OOMKill (infra) |
| 14:02 | First `ServiceUnavailableError` warn logs with `requestId` |
| 14:04 | Support reports login failures; paste `requestId`s |
| 14:08 | On-call sees Redis down; rate-limit store failing |
| 14:12 | Redis restored |
| 14:20 | Error rate normal; incident closed |

### Contributing factors

1. Redis single point for limit store — no degraded mode policy beyond 503.  
2. No alert on Redis process down paired with 503 spike on `/auth/login`.  
3. Status page / runbook incomplete for “auth 503 + Redis.”  
4. (Positive) Fail-closed avoided open relay of unlimited login attempts.

### Action items

1. Alert: Redis down OR 503 rate on login > threshold — owner: ops — due: +1 week.  
2. Runbook section: verify Redis, correlate `requestId`, communicate fail-closed — owner: backend — due: +1 week.  
3. Consider separate Redis or memory store **only** for non-security limiters; keep auth fail-closed — ADR — due: +3 weeks.  
4. Add synthetic login check in readiness **or** document that readiness ≠ Redis (honest SLOs).

### What this teaches about the code

```ts
// backend/src/shared/auth/rate-limit.ts (behavior)
catch {
  throw new ServiceUnavailableError(
    "Rate limiting unavailable. Try again later.",
  );
}
```

Security chose **availability hit over skipped limits**. The postmortem does not “blame” that choice — it asks for detection and communication around it.

---

## 8. Worked example B — migration failure mini outage

### Scenario

Engineer applies a migration that adds a column with `DEFAULT` on a large `tasks` table in one step, taking an ACCESS EXCLUSIVE-like lock too long. API write latency spikes; health checks flap; deploy stuck.

### Blameless factors

- No expand/contract checklist required in PR template.  
- Migration ran in prod without lock-time estimate.  
- Load test absent for migrate-on-large-table.

### Actions

1. Require expand/contract for hot tables in review.  
2. Run migrations in CI against prod-sized scrubbed dump monthly.  
3. Abort criteria: lock wait > N seconds → cancel.

(Invented for teaching; migration runner still transactional per file in this learning app — large-table lock risk is still real in production Postgres.)

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Blame meeting | Silence next time; hidden near-misses |
| No action items | Ritual without improvement |
| Actions without owners/dates | Eternal backlog |
| Only “retrain humans” | Same system fails again |
| Hiding the doc | Others repeat the footgun |
| Rewriting history to look perfect | Can’t learn |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Same SEV repeats | Actions not done / wrong actions | Tracker; was action preventive? | Close loop; add detection |
| Timeline fuzzy | No `requestId` / metrics | Logs | Mandate ids; better dashboards |
| Team defensive | Blame culture leak | Facilitator norms | Leadership models blameless |
| 503 “random” on login | Redis flaps + fail-closed | rate-limit catch path | Infra + alerts (example A) |
| Migrate blocked boot | Bad SQL / half thinking | migrate logs | Fix forward or documented rollback |

---

## 11. Interview Q&A (with strong answers)

**Q: What is a blameless postmortem?**  
**A:** An incident review that seeks systemic causes and preventive actions without punishing individuals for operating in a fallible system.

**Q: Why blameless?**  
**A:** Fear suppresses reporting. Learning requires honest timelines and near-misses.

**Q: What makes a good action item?**  
**A:** Specific change (alert, test, gate), single owner, due date, and a way to verify it’s done.

**Q: Human error — root cause?**  
**A:** Almost never sufficient. Ask which design made a slip catastrophic and which detection was missing.

**Q: How do you use request IDs in postmortems?**  
**A:** Glue user reports to exact log lines and error JSON for a precise timeline.

**Q: Fail-closed vs fail-open in incidents?**  
**A:** Fail-closed (this app’s Redis limiter) protects security and can cause availability incidents; document the trade-off and alert on it — don’t “fix” by silently skipping limits without an ADR.

**Q: SEV levels?**  
**A:** Org-specific severity based on user impact and duration; use them to prioritize response and review depth.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Postmortem / incident review | Written learning after an incident |
| Blameless | Focus on systems, not punishment |
| Mitigate | Stop or reduce impact now |
| Contributing factor | Condition that made the incident possible |
| Action item | Trackable follow-up that reduces recurrence |
| Fail-closed | Prefer deny/unavailable when a control breaks |
| SEV | Severity classification |
| Near-miss | Failure almost happened — still worth review |

---

## 13. Teach pointer

> “Fix the path that let the failure through — not the person who walked it.”

---

## 14. Optional further reading (not required)

- Fail-closed limits: [../security/fail-closed-rate-limits.md](../security/fail-closed-rate-limits.md)  
- Request correlation: [request-id-and-correlation.md](./request-id-and-correlation.md)  
- On-call: [on-call-runbooks.md](./on-call-runbooks.md)  
- Migrations: [../database/migrations.md](../database/migrations.md)  
- SLOs: [sli-slo-error-budgets.md](./sli-slo-error-budgets.md)

Repo paths cited: `backend/src/shared/auth/rate-limit.ts`, `backend/src/shared/errors/service-unavailable-error.ts`, `backend/src/db/migrate.ts`, request id / error middleware under `backend/src/shared/middleware/`.
