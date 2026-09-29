# Lesson: Alerting

**Standalone ✓** — You do not need any other doc to design actionable alerts for an API like this one.

**After this file you can:** distinguish good vs spam alerts, tie alerts to SLIs and runbooks, and interview on fatigue and severity.

---

## 1. First principles

An **alert** notifies a human (or automation) that **something requires action now** or soon. It is not “every log line” and not “CPU went up” without user impact context.

**The problem it solves:** Outages discovered by customers first; on-call woken for non-actionable noise; missing correlation between symptoms (login 503) and causes (Redis down).

---

## 2. Mental model

### Analogy

Fire alarm vs kitchen timer. Alarm = leave the building (page). Timer = check the cookies (ticket). Mixing them trains people to ignore alarms.

### Diagram

```text
SLI metric ──► burn rate / threshold ──► alert route ──► runbook
                                              │
                                              ├── page (wake human)
                                              └── ticket (next business day)
```

---

## 3. Core rules (must / must-not)

1. **MUST** alert on **symptoms** users feel (error rate, latency SLO burn) not only causes.  
2. **MUST** include **runbook link** and exemplar **requestId** samples in alert payload.  
3. **MUST NOT** page on expected **401/404** for auth APIs.  
4. **MUST NOT** page on every warning log line.  
5. **SHOULD** tier severity: page vs ticket vs dashboard-only.  
6. **SHOULD** require alert to be **actionable** — if on-call can only “wait”, fix the alert.

---

## 4. How it works (mechanics)

Define SLIs (success rate, latency). Set SLO targets. Alert when **error budget** burns too fast or dependency health fails sustained period.

Good alert text: what, since when, severity, link to dashboard filtered by service, first steps from runbook.

This repo has **pino logs + requestId** but **no alert stack wired** — design is forward-looking.

---

## 5. When to use / when not to use

| Signal | Alert? |
|--------|--------|
| Login 5xx > 1% for 5m | **Page** |
| p95 latency degraded 30m | Ticket |
| Single 500 with retry success | No |
| Redis down (rate limit fail-closed) | **Page** |
| Scanner 404 noise | No |

---

## 6. Step-by-step: design → implement → verify

1. Pick 2–3 user-journey SLIs (login, list tasks, PATCH task).  
2. Wire metrics from requestLogger-derived data or APM.  
3. Write runbook per alert (see on-call lesson).  
4. Test alert in staging (fire drill).  
5. Review monthly: alerts that never needed action → delete.

---

## 7. Worked example A — this project

**Today:** logs via `pino`; errors return `requestId` in JSON — enough to **design** alerts, not auto-fire them.

**Future alert candidates for this stack:**

| Alert | Rationale |
|-------|-----------|
| `5xx rate` on `/api/v1/auth/login` | Users cannot sign in |
| Redis connectivity errors spike | Fail-closed rate limit → 503 |
| DB pool wait time | Cascading timeouts |
| Error budget burn on task list latency | Product SLO |

Include log query: `requestId=<from user report>` using fields from `requestLogger`.

**Never page:** high 401 on protected routes — expected for anonymous traffic.

---

## 8. Worked example B — mini scenario (self-contained)

**Alert: Login 503**

- Condition: `sum(rate(http_5xx{route="/auth/login"}[5m])) / sum(rate(http_total{route="/auth/login"}[5m])) > 0.01`  
- Runbook step 1: check Redis (rate limit store fail-closed).  
- Step 2: check Postgres `/health/db`.  
- Step 3: sample `requestId` from last 10 failures in logs.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Result |
|--------------|--------|
| Alert on CPU only | Miss login meltdown |
| Page every 404 | Fatigue |
| No runbook | 3am guessing |
| Alert without ownership | Rotting noise |
| Symptom-free “Redis CPU” | Chasing red herrings |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Alert fatigue | Too many pages | alert history | tighten thresholds |
| Missed outage | No symptom alert | user reports | add SLI alert |
| Alert fires, nothing wrong | Flappy threshold | window length | increase `for:` duration |
| Can't debug from alert | No requestId | payload | attach exemplars |

---

## 11. Interview Q&A (with strong answers)

**Q: Symptom vs cause alerts?**  
**A:** Symptom alerts (SLO burn, user-facing errors) page when users hurt; cause alerts (disk, CPU) supplement dashboards — page only when they predict imminent symptom.

**Q: Alert fatigue?**  
**A:** Too many non-actionable pages; fix by deleting bad alerts, paging on SLOs, and using tickets for slow burns.

**Q: Severity model?**  
**A:** Page = immediate human action; ticket = fix within days; info = dashboard. One page policy per on-call rotation.

**Q: What would you alert on for this API?**  
**A:** Auth 5xx, Redis-down 503 pattern on login, DB readiness failures, SLO burn on core CRUD — not 401 volume.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Page | Wake on-call |
| SLI | Service level indicator |
| Burn rate | Speed of error budget consumption |
| Exemplar | Sample trace/log id attached to metric |
| Runbook | Step checklist for an alert |

---

## 13. Teach pointer

> “If the on-call can’t act, it’s not an alert — it’s spam.”

---

## 14. Optional further reading (not required)

- [sli-slo-error-budgets](./sli-slo-error-budgets.md) · [on-call-runbooks](./on-call-runbooks.md)  
- [structured-logging-metrics-tracing](./structured-logging-metrics-tracing.md)
