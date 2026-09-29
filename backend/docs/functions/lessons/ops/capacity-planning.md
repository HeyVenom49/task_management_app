# Lesson: Capacity planning

**Standalone ✓** — You do not need any other doc to estimate scale for this API stack.

**After this file you can:** do connection budget math, find bottlenecks before marketing spikes, and interview on vertical vs horizontal scaling.

---

## 1. First principles

**Capacity planning** estimates CPU, memory, DB connections, Redis, and storage needed for expected load **with headroom**, using **measurements** not guesses.

**The problem it solves:** Launch campaign → `max_connections` exhausted; scale app pods while SQL is the bottleneck; no index → useless horizontal scale.

---

## 2. Mental model

### Analogy

Planning water for a concert: count attendees (RPS), cup size (request cost), fountain flow (DB throughput), and refill stations (pool size) — not just “add more ushers.”

### Diagram

```text
RPS ──► per-request cost ──► instance capacity ──► # instances
              │
              └──► DB connections = instances × pool_size  <  max_connections
```

---

## 3. Core rules (must / must-not)

1. **MUST** measure **p95/p99** latency under load before buying hardware.  
2. **MUST** budget **Postgres connections**: `replicas × pool ≤ max_connections − admin headroom`.  
3. **MUST NOT** scale app tier alone when SQL CPU pegged.  
4. **SHOULD** fix indexes/pagination before 10× instances.  
5. **SHOULD** load test in staging [load-testing](../testing/load-testing.md).

---

## 4. How it works (mechanics)

Steps:

1. Target RPS (reads/writes separately).  
2. Benchmark one instance (k6/Artillery).  
3. Find first saturated resource (CPU, pool wait, disk I/O).  
4. Scale that layer or optimize query.  
5. Re-test with production-like row counts.

Leading indicators: pool wait time, Redis latency, p95 list endpoints, CPU steal on DB.

---

## 5. When to use / when not to use

| Situation | Planning |
|-----------|----------|
| Before public launch | **Required** |
| 3-user dev | Rough sanity OK |
| After SLO burn | Reactive replan |

---

## 6. Step-by-step: design → implement → verify

1. Identify hot endpoints (`login`, `GET tasks`).  
2. Load test single instance → max sustainable RPS at SLO latency.  
3. Compute instances = target / per-instance.  
4. Compute DB connections + Redis memory.  
5. Add 30–50% headroom; document assumptions.

---

## 7. Worked example A — this project

**Implicit limits shaping capacity:**

| Control | Effect |
|---------|--------|
| `express.json` 100kb | Bounds parse cost |
| Login rate limit 10/15m | Caps auth write pressure |
| Single Postgres | Likely first bottleneck for list tasks without pagination/index |
| Redis for limits | Memory + ops/sec for auth |

**Before scaling replicas:** ensure [pagination](../database/pagination.md) and [indexing](../database/indexing.md) on task list paths — else more pods = more concurrent heavy queries.

**Health:** `/api/v1/health/db` for capacity drills — DB must stay within connection budget as replicas grow.

---

## 8. Worked example B — mini scenario (self-contained)

Target **500 RPS** read-heavy.

- One instance sustains **100 RPS** at p95 < 300ms → need **≥5** instances.  
- Pool **10** each → **50** connections + migrations/admin < Postgres `max_connections=100`.  
- If DB CPU 90% at 300 RPS → **optimize SQL first**, not 6th instance.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Result |
|--------------|--------|
| Scale pods, DB melts | Wasted money |
| No index on filter column | Linear scans |
| Ignore Redis memory | Eviction → limiter weirdness |
| Vibes-based “we’re fine” | Launch outage |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| `too many clients` | pool math | connections | lower pool or raise max |
| High p95 list tasks | missing index | EXPLAIN | index + pagination |
| Linear cost with pods | DB bound | DB CPU | optimize queries |
| Redis OOM | key growth | memory | TTL, eviction policy |

---

## 11. Interview Q&A (with strong answers)

**Q: Connection budget math?**  
**A:** Multiply app instances by pool size per instance; add admin/migration connections; stay below Postgres max with headroom.

**Q: Vertical vs horizontal first?**  
**A:** Fix query efficiency and indexes; then scale DB vertically if needed; scale app horizontally when CPU-bound on app tier and DB can handle pooled load.

**Q: Leading indicators?**  
**A:** Pool wait, DB CPU, p95 latency on core routes, error rate, Redis latency — before hard failure.

**Q: This API focus?**  
**A:** Auth rate limits, 100kb payloads, real DB integration tests imply list/auth paths deserve first load tests.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| RPS | Requests per second |
| Headroom | Spare capacity margin |
| Pool size | DB connections per app instance |
| Saturation | Resource at limit |
| Bottleneck | Slowest constraining resource |

---

## 13. Teach pointer

> “Scale the bottleneck you measured — not the layer you like.”

---

## 14. Optional further reading (not required)

- [load-testing](../testing/load-testing.md) · [connection-pooling](../database/connection-pooling.md)  
- [horizontal-scaling](../architecture/horizontal-scaling.md)
