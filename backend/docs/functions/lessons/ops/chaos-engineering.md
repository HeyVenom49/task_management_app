# Lesson: Chaos engineering

**Standalone ✓** — You do not need any other doc to run safe failure experiments on this stack.

**After this file you can:** design staging GameDays, validate fail-closed and shutdown behavior, and interview on prod chaos guardrails.

---

## 1. First principles

**Chaos engineering** injects **controlled failures** (kill pod, latency, network partition) to find weak assumptions **before** users do.

**The problem it solves:** Only testing happy path; first Redis outage is production login meltdown; unknown interaction between deploy, DB, and rate limits.

---

## 2. Mental model

### Analogy

Fire drill in a building — prove exits work, not waiting for real fire.

### Diagram

```text
Hypothesis ──► experiment in staging ──► observe SLI ──► fix / strengthen
     │                                      │
     └── abort if user impact               └── document in runbook
```

---

## 3. Core rules (must / must-not)

1. **MUST** start in **staging** with **abort criteria**.  
2. **MUST** hypothesize expected behavior first (“Redis down → login 503, not unlimited auth”).  
3. **MUST NOT** chaos in prod without mature observability and small blast radius tools.  
4. **SHOULD** run during business hours with team ready.  
5. **SHOULD** automate steady-state experiments after manual GameDay.

---

## 4. How it works (mechanics)

Tools: Chaos Mesh, Litmus, Toxiproxy (latency), `iptables` block, manual `docker stop redis`.

Process:

1. Define steady state (error rate, login success).  
2. Inject fault.  
3. Compare to hypothesis.  
4. Fix code/ops/runbook.  
5. Repeat.

This repo’s **concurrency tests** are “mini chaos” for races — not infrastructure faults.

---

## 5. When to use / when not to use

| Experiment | Where |
|------------|-------|
| Block Redis 60s | Staging |
| Kill API pod mid-request | Staging + LB |
| Random prod pod kill | Mature org only |
| Unit tests | Different — logic chaos |

---

## 6. Step-by-step: design → implement → verify

1. Pick fault: Redis unavailable.  
2. Hypothesis: fail-closed 503 on login, health `/` still 200.  
3. Run: stop Redis container.  
4. Measure: 503 rate, no successful brute-force window.  
5. Restore; verify recovery without restart storm.  
6. Update [on-call-runbooks](./on-call-runbooks.md).

---

## 7. Worked example A — this project

**Design already encodes some answers:**

| Control | Expected under chaos |
|---------|----------------------|
| Rate limit Redis down | Fail-closed 503 (not fail-open) |
| Graceful shutdown | SIGTERM closes HTTP → Redis → SQL |
| Health `/` vs `/db` | Process alive vs DB check separation |
| Concurrency tests | Register unique, refresh rotation — logical fault injection |

**Staging experiments to run first:**

1. Block Redis — login 503, document runbook.  
2. Add 200ms Postgres latency (Toxiproxy) — watch pool/timeouts.  
3. Kill one API replica during load — LB + [load-balancing](./load-balancing.md).  
4. SIGTERM during in-flight PATCH — graceful behavior.

**Not automated in CI** — opportunity for staging pipeline.

---

## 8. Worked example B — mini scenario (self-contained)

**GameDay charter**

- Scope: staging cluster only  
- Abort if 5xx > 5% for > 10m unintended  
- Experiments: Redis down, DB slow, 1 pod kill  
- Roles: injector, observer, scribe  
- Output: runbook diffs + backlog tickets

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Result |
|--------------|--------|
| Prod chaos day one | Customer outage |
| No hypothesis | Learn nothing |
| Chaos without metrics | Can’t tell pass/fail |
| Only kill pods | Miss DB/Redis faults |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Unexpected pass | fault not applied | network rules | verify block |
| Total staging meltdown | missing abort | stop experiment | restore deps |
| Different prod behavior | config drift | parity | align env |
| Flaky test vs chaos | conflated | separate harness | staging infra |

---

## 11. Interview Q&A (with strong answers)

**Q: Safe chaos in prod?**  
**A:** Only with strong observability, automated blast-radius control, gradual experiments (e.g. internal tenants first), and executive buy-in — start in staging.

**Q: First experiment for this API?**  
**A:** Redis unavailable during login — validate fail-closed 503 and runbook; then DB latency; then pod kill under LB.

**Q: Relation to SLOs?**  
**A:** Chaos validates that SLI degradations match expectations and error budgets reflect real failure modes.

**Q: Tests vs chaos?**  
**A:** Tests prove code properties (IDOR, races); chaos proves infra/dependency behavior under real faults.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| GameDay | Planned chaos exercise |
| Steady state | Normal SLI baseline |
| Blast radius | Scope of experiment impact |
| Fault injection | Artificial failure |
| Abort criteria | Stop conditions |

---

## 13. Teach pointer

> “Chaos is unit testing for your failure modes — with adult supervision.”

---

## 14. Optional further reading (not required)

- [graceful-degradation](./graceful-degradation.md) · [fail-closed-rate-limits](../security/fail-closed-rate-limits.md)  
- [concurrency tests](../../../src/test/concurrency.test.ts) (repo, optional)
