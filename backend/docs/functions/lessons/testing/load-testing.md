# Lesson: Load testing

**Standalone ✓** — You do not need any other doc to find throughput limits of this API.

**After this file you can:** run soak/spike/stress concepts, pick first endpoints to hammer, interpret bottlenecks, and contrast with concurrency correctness tests.

---

## 1. First principles

**Load testing** simulates many concurrent users (k6, Locust, Artillery) to measure **latency, error rate, and resource saturation** at scale.

**The problem it solves:** Functional tests pass at 1 RPS; launch day melts Postgres or exhausts connection pools.

**Not the same as** `concurrency.test.ts` — that proves **correctness under races**, not **how many RPS** you sustain.

---

## 2. Mental model

### Analogy

Stress-test a bridge with weighted trucks (load), separate from checking bolt torque specs (correctness unit/integration).

### Diagram

```text
VUs ramp ──► HTTP scenarios ──► metrics (p95, 5xx)
                    │
                    └── watch DB CPU, pool wait, Redis
```

---

## 3. Core rules (must / must-not)

1. **MUST** run in **staging** with production-like **data volume**.  
2. **MUST NOT** load test production without explicit controls.  
3. **MUST** define success criteria (p95 latency, max 5xx %) before run.  
4. **SHOULD** start with **read-heavy** paths after auth setup.  
5. **SHOULD** fix indexes/pagination before blaming “need more pods.”

---

## 4. How it works (mechanics)

| Type | Purpose |
|------|---------|
| Smoke | Tiny load — script works |
| Load | Expected traffic |
| Stress | Beyond expected — find breaking point |
| Spike | Sudden burst |
| Soak | Hours — leaks, drift |

Watch: p95/p99 latency, 5xx rate, Postgres connections, Redis memory, app CPU.

---

## 5. When to use / when not to use

| Situation | Load test |
|-----------|-------------|
| Pre-launch capacity | **Yes** |
| After pagination added | Re-baseline |
| Proving IDOR | Integration test |
| Local every commit | Usually no — nightly staging |

---

## 6. Step-by-step: design → implement → verify

1. Script: login → list projects → list tasks.  
2. Ramp VUs gradually (k6 `stages`).  
3. Monitor `/api/v1/health/db` and DB metrics.  
4. Identify first knee in p95.  
5. Fix query/index or scale per [capacity-planning](../ops/capacity-planning.md).

---

## 7. Worked example A — this project

**No load suite in repo today.**

**Good first scenarios:**

1. `POST /api/v1/auth/login` — respects rate limits; watch 429 vs 503 (Redis).  
2. `GET /api/v1/projects/:id/tasks` — likely DB-heavy without indexes.  
3. Authenticated CRUD mix — pool sizing vs `max_connections`.

**Harness contrast:**

- Load test: many VUs, metrics over time.  
- `concurrency.test.ts`: small parallelism, invariant assertions after `Promise.all`.

**Env:** use staging URLs; not `preload.ts` test env — separate credentials.

**Observability gap:** add metrics from [structured-logging-metrics-tracing](../ops/structured-logging-metrics-tracing.md) before serious load campaigns.

---

## 8. Worked example B — mini scenario (self-contained)

k6 sketch:

```javascript
export const options = {
  stages: [
    { duration: "2m", target: 50 },
    { duration: "5m", target: 200 },
  ],
  thresholds: { http_req_duration: ["p(95)<300"], http_req_failed: ["rate<0.01"] },
};
// default function: login once, loop GET tasks with token
```

If list endpoint fails first → add DB index + pagination before scaling replicas.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Result |
|--------------|--------|
| Load prod | Incident |
| Empty DB | Unrealistic fast queries |
| Ignore 429 as failure | Misread auth limiter |
| Only login load | Miss list bottleneck |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| p95 explodes | missing index | EXPLAIN | index |
| 503 spike | Redis fail-closed | Redis | capacity |
| 502 from LB | timeouts | app vs LB timeout | align |
| Flat CPU, slow DB | DB bound | Postgres metrics | tune SQL |
| Many 429 | rate limit | expected on login | separate auth load scenario |

---

## 11. Interview Q&A (with strong answers)

**Q: Soak vs spike vs stress?**  
**A:** Soak finds leaks over time; spike tests sudden bursts; stress pushes beyond design load to find breaking point.

**Q: Which endpoint first for this API?**  
**A:** Authenticated task list after login — DB-heavy; then write paths; monitor pool and Redis on auth.

**Q: Interpreting bottleneck?**  
**A:** If DB CPU maxed while app CPU low, scale SQL/optimize queries — not app replicas.

**Q: Load vs concurrency tests here?**  
**A:** Load = throughput/latency at volume; concurrency tests = correctness invariants under parallel requests in CI.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| VU | Virtual user in load tool |
| p95 | 95th percentile latency |
| Soak test | Long-duration load |
| Spike | Sudden traffic increase |
| Saturation | Resource at capacity limit |

---

## 13. Teach pointer

> “Load tests ask ‘how much?’ Concurrency tests ask ‘still correct?’ You need both.”

---

## 14. Optional further reading (not required)

- [capacity-planning](../ops/capacity-planning.md) · [pagination](../database/pagination.md)  
- Repo: `backend/src/test/concurrency.test.ts` (correctness, not load)
