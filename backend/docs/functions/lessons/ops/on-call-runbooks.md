# Lesson: On-call runbooks

**Standalone ✓** — You do not need any other doc to write runbooks for this stack.

**After this file you can:** structure a runbook, connect alerts to debugging steps for Redis/DB/auth, and interview on keeping runbooks fresh.

---

## 1. First principles

A **runbook** is a **repeatable checklist** for a known failure mode: symptoms → verification → mitigation → escalation → post-incident.

**The problem it solves:** 3am tribal knowledge; every incident rediscovered from scratch; long MTTR when the fix is “restart Redis.”

---

## 2. Mental model

### Analogy

Airline emergency cards: same steps every time — not improvising which door is an exit.

### Diagram

```text
Alert fires ──► Runbook title ──► Step 1 verify ──► Step 2 mitigate ──► Escalate?
                      │
                      └── links: dashboards, logs (requestId), code behavior
```

---

## 3. Core rules (must / must-not)

1. **MUST** start with **customer symptom** (“login 503”), not internal jargon only.  
2. **MUST** include **commands/queries** copy-paste ready (`curl` health, Redis CLI).  
3. **MUST** state **when to escalate** and to whom.  
4. **MUST NOT** assume reader is the author — no “ask Bob.”  
5. **SHOULD** link to **one** primary dashboard per alert.  
6. **SHOULD** update runbook after every postmortem action item.

---

## 4. How it works (mechanics)

Runbook sections: Overview, Impact, Prerequisites (access), Diagnosis steps, Mitigation, Rollback, Verification, Escalation, Post-incident.

For this API, tie steps to **health routes**, **Redis fail-closed rate limits**, **Postgres**, **requestId log search**.

Repo’s how-to-debug docs are **runbook seedlings** — formalize per alert name.

---

## 5. When to use / when not to use

| Situation | Runbook |
|-----------|---------|
| Recurring alert | **Required** |
| One-off novel bug | Ad-hoc debug, then **write** runbook |
| Pure feature dev | N/A |

---

## 6. Step-by-step: design → implement → verify

1. List top 5 alerts you’d actually page on.  
2. For each, write 5–10 numbered steps with expected outputs.  
3. Dry-run in staging (GameDay).  
4. Store next to alert definition in PagerDuty/Opsgenie.  
5. Review quarterly — delete obsolete steps.

---

## 7. Worked example A — this project

**Runbook: Login returns 503**

1. **Impact:** Users cannot authenticate; rate limiting may fail-closed.  
2. **Check Redis:** connectivity from API pod; rate limit store uses Redis (`rate-limit-redis`). On Redis error, login limiter returns **503** (fail-closed — do not skip limits).  
3. **Check DB:** `GET /api/v1/health/db` — `SELECT 1` via health route.  
4. **Logs:** search `requestId` from user report in pino output; filter path `/auth/login`, status 503.  
5. **Mitigate:** restore Redis (failover/restart); scale Redis; if DB down, fix Postgres first.  
6. **Verify:** login succeeds; 503 rate drops; readiness stable.  
7. **Postmortem:** if SLO burned, link [sli-slo-error-budgets](./sli-slo-error-budgets.md).

**Runbook: Elevated 5xx on tasks**

1. Check DB pool / slow queries on list endpoints.  
2. Sample `requestLogger` durationMs spikes.  
3. Check recent deploy — migration compatibility [blue-green-canary](./blue-green-canary.md).

---

## 8. Worked example B — mini scenario (self-contained)

Template:

```markdown
# RB-001: API 5xx spike
## Verify
- Dashboard: 5xx rate > 2% for 10m
- curl -s localhost:PORT/api/v1/health/
- curl -s localhost:PORT/api/v1/health/db
## Mitigate
- Rollback deployment if correlated
- Scale replicas if CPU-saturated AND DB healthy
## Escalate
- DBA if health/db fails > 5m
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Result |
|--------------|--------|
| Runbook = link to wiki home | Useless under stress |
| Stale commands | Wrong port/path |
| No verification step | “Fixed” but still broken |
| 40-page runbook | Nobody reads it |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Runbook didn’t help | Wrong alert mapping | alert → doc link | rewrite steps |
| Steps assume SSH | K8s-only env | access docs | kubectl equivalents |
| Mitigation worsens | skip rate limits | security policy | fail-closed preserved |

---

## 11. Interview Q&A (with strong answers)

**Q: What belongs in a runbook?**  
**A:** Symptom, impact, verification commands, mitigation with expected outcomes, escalation criteria, and how to confirm recovery.

**Q: Keep runbooks fresh?**  
**A:** Postmortem action items update runbooks; quarterly review; delete alerts that never fire or never need human action.

**Q: How do debug playbooks relate?**  
**A:** Generic debugging teaches thinking; runbooks are alert-specific shortcuts — same skills, tighter steps.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| MTTR | Mean time to repair |
| Mitigation | Stop user pain quickly |
| Escalation | Hand off to specialist |
| GameDay | Planned failure exercise |
| Postmortem | Blameless incident review |

---

## 13. Teach pointer

> “Runbooks turn senior debugging into a reusable procedure.”

---

## 14. Optional further reading (not required)

- [alerting](./alerting.md) · [chaos-engineering](./chaos-engineering.md)  
- Repo debug docs under `backend/docs/functions/how-to-debug/` (optional)
