# Lesson: SLI, SLO, and error budgets

**Standalone ✓** — You do not need any other doc to define reliability targets for this API.

**After this file you can:** define SLIs/SLOs, use error budgets in release policy, propose SLIs for auth and tasks endpoints, and interview on SLI vs SLA.

---

## 1. First principles

- **SLI** (indicator): something you **measure** (e.g. proportion of successful requests).  
- **SLO** (objective): a **target** on that SLI (e.g. 99.5% success per 30 days).  
- **Error budget**: allowed unreliability = 100% − SLO; when spent, slow risky changes.

**The problem it solves:** Subjective “feels fine” reliability; 100% uptime goals that block shipping; deploying during unknown risk.

---

## 2. Mental model

### Analogy

Monthly phone data cap: SLO = “99% of days network works”; error budget = the 1% bad days you can afford before customers churn; burning budget too fast → stop heavy downloads (risky deploys).

### Diagram

```text
Requests ──► classify good/bad ──► SLI ratio ──► compare to SLO
                                              │
                                              └── budget remaining ──► deploy policy
```

---

## 3. Core rules (must / must-not)

1. **MUST** define SLIs on **user-visible** behavior (success + latency).  
2. **MUST** exclude **expected** client errors from “availability” where appropriate (401 for missing auth on protected routes).  
3. **MUST NOT** set 100% SLO — impossible and paralyzing.  
4. **MUST** tie alerts to **budget burn**, not single blips.  
5. **SHOULD** document SLI query precisely (PromQL, etc.).

---

## 4. How it works (mechanics)

**Availability SLI:** `good_events / total_events` over window.

**Latency SLI:** fraction of requests faster than threshold (e.g. < 300ms).

**Multi-window burn alerts:** fast burn (1h) and slow burn (6h) against monthly budget.

**SLA** (external contract) often looser than internal SLO — SLO is your stricter promise to yourself.

This repo has **no formal SLOs** yet; requestLogger duration fields and status codes are foundations.

---

## 5. When to use / when not to use

| Situation | SLO? |
|-----------|------|
| Production customer API | **Yes** |
| Local dev | No |
| Internal batch job | Maybe simpler objective |
| Prototype | Light targets OK |

---

## 6. Step-by-step: design → implement → verify

1. Pick critical journeys: login, list tasks, PATCH task.  
2. Define good: 2xx/expected 4xx vs bad: 5xx, timeout.  
3. Set 30-day target (e.g. 99.5%).  
4. Implement measurement (metrics from HTTP layer).  
5. Policy: budget < 10% → freeze features, focus reliability.

---

## 7. Worked example A — this project

**Candidate SLIs:**

| Journey | SLI | Notes |
|---------|-----|-------|
| Login | Success rate excluding validation 400 | Include 503 when Redis fail-closed |
| `GET /projects/:id/tasks` | Latency p95 for members | Authz failures 403 are “good” SLI events |
| Overall API | 5xx rate | Exclude 401 noise on protected routes |

**Measurement gap:** need Prometheus/APM — logs give per-request duration today via `requestLogger`, not aggregated SLO dashboard.

**Health:** `/api/v1/health/db` supports **dependency** SLIs (DB up) separate from user SLIs.

---

## 8. Worked example B — mini scenario (self-contained)

**SLO:** 99.5% of eligible `GET /projects/:id/tasks` complete in < 300ms over 30 days.

**Alert:** burn 2% of monthly budget in 1 hour → page on-call.

**Policy:** if budget exhausted mid-month, only reliability fixes deploy until window resets.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Problem |
|--------------|---------|
| No metrics | SLO is fiction |
| Count 401 as outage | False budget burn |
| 100% uptime goal | Never ship |
| SLO without policy | Numbers ignored |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| SLO green, users angry | Wrong SLI | journey mapping | fix good/bad classification |
| Constant budget burn | DB/index | slow queries | optimize list tasks |
| Alert never fires | Threshold loose | burn math | multi-window alerts |
| Post-deploy burn | bad release | deploy correlation | rollback + canary |

---

## 11. Interview Q&A (with strong answers)

**Q: SLI vs SLO vs SLA?**  
**A:** SLI is the measured signal; SLO is your internal target on that signal; SLA is a contractual commitment to customers, often with credits.

**Q: Error budget policy?**  
**A:** When budget remains, take deployment risk; when depleted, halt feature work and fix reliability until budget recovers.

**Q: SLIs for this task API?**  
**A:** Auth success (not counting expected 401), task CRUD 5xx rate, p95 latency on list/detail for authorized members, Redis/DB dependency health.

**Q: Exclude 401?**  
**A:** For availability of **authenticated product features**, anonymous 401 on protected routes is expected, not service failure.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| SLI | Service level indicator |
| SLO | Service level objective |
| Error budget | Allowed failure fraction |
| Burn rate | Speed of budget consumption |
| Good event | Request meeting SLI criteria |

---

## 13. Teach pointer

> “If you can’t measure it, you can’t keep a promise about it.”

---

## 14. Optional further reading (not required)

- [alerting](./alerting.md) · [structured-logging-metrics-tracing](./structured-logging-metrics-tracing.md)  
- [load-testing](../testing/load-testing.md)
