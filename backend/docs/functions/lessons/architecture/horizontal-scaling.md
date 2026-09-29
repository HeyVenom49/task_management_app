# Lesson: Horizontal scaling

**Standalone ✓** — Scale out stateless API replicas, connection pools, Redis, and Postgres limits for this stack.

**After this file you can:** design N-instance deploys, spot stateful bottlenecks, plan pool sizing, and interview on scale-out vs scale-up.

---

## 1. First principles

**Horizontal scaling** adds more identical application instances behind a load balancer. **Vertical scaling** makes one machine bigger.

The problem it solves: traffic grows beyond one CPU’s capacity. Stateless APIs scale out linearly until **shared resources** (Postgres connections, Redis, disk IOPS) saturate.

This backend is designed **stateless at the process level**—sessions and data in Postgres, rate limits in Redis—so multiple Node containers can serve traffic.

---

## 2. Mental model

### Analogy

More identical cashiers (API pods), one shared ledger (Postgres), shared security counter (Redis for rate limits)—not each cashier keeping their own ledger in a drawer.

### Diagram

```text
                    ┌─────────┐
               ┌───►│ API #1  │
               │    └────┬────┘
  Clients ──LB─┼───►│ API #2  ├──► Postgres (pool per instance)
               │    └────┬────┘
               └───►│ API #3  │
                    └────┬────┘
                         └──► Redis (rate limits)
```

---

## 3. Core rules (must / must-not)

1. **MUST** externalize session and business state ([stateless-services](./stateless-services.md)).  
2. **MUST** size DB connection pools: `instances × poolSize ≤ postgres max_connections`.  
3. **MUST** use shared Redis for cross-instance rate limits.  
4. **MUST NOT** rely on in-memory rate limits in multi-instance prod.  
5. **SHOULD** health/readiness probes per instance (`/health`).  
6. **SHOULD** graceful shutdown: stop accepting, drain requests, close pools.  
7. **MUST NOT** assume sticky sessions unless documented exception.

---

## 4. How it works (mechanics)

**Load balancer:** Round-robin or least connections to API pods.

**Postgres:** Each Node process holds a connection pool (postgres.js). Too many replicas × large pools → `too many connections`. Mitigate: PgBouncer, lower per-instance pool, read replicas for read-heavy paths.

**Redis:** Centralized rate limit store; failure → this app **fail-closed** on auth rate limits (503).

**Migrations:** Run once per deploy, not per instance—job or init container.

**Files/local disk:** Not used for authoritative uploads in this app—good for scale-out.

---

## 5. When to use / when not to use

| Situation | Scale horizontally? |
|-----------|---------------------|
| REST API traffic growth | **Yes** — add pods |
| CPU-bound single-thread hot spot in Node | Scale out + profile; maybe worker for jobs |
| Postgres write bottleneck | Scale **up** DB, shard, or optimize writes—not infinite API pods |
| Heavy report queries | Read replicas or separate analytics |

---

## 6. Step-by-step: design → implement → verify

1. Confirm stateless checklist (no in-memory sessions).  
2. Calculate max connections budget.  
3. Configure LB + N replicas in Docker/K8s.  
4. Shared Redis + Postgres URLs via env ([12-factor](../ops/12-factor-app.md)).  
5. Load test: login on instance A, next request hits B—still authorized.  
6. Monitor DB connections, Redis latency, p95 API latency.

---

## 7. Worked example A — this project

**Deploy:** Docker image runs `server.ts`; scale `docker compose up --scale api=3` (with compose LB or external ALB).

**Auth:** JWT access validated on any instance; refresh uses DB sessions—any instance.

**Tasks/projects:** All data in Postgres—any instance.

**Rate limits:** Redis keys shared—login abuse blocked globally per window.

**Tests:** `NODE_ENV=test` disables limiter passthrough behavior differs from prod—remember when interpreting load tests locally.

---

## 8. Worked example B — self-contained mini scenario

**Connection math:**

```text
Postgres max_connections = 100
Reserved admin = 10
App budget = 90
Replicas = 6
Pool per replica = 90 / 6 = 15 max
```

If each replica defaults pool 30 → outages. Fix pool config before adding replica #4.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| 20 pods, pool 50 each | DB connection storm |
| In-memory sessions | Users bounce between pods break |
| Run migrations on every pod race | Schema corruption |
| No readiness probe | LB sends traffic to starting pod |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Intermittent 401 | Sticky/session local state | Architecture review | DB sessions |
| 503 on login only | Redis down | Redis metrics | Restore/fail-closed policy |
| DB `too many connections` | Pool × replicas | `pg_stat_activity` | PgBouncer, shrink pool |
| Uneven load | Sticky misconfig | LB settings | Round-robin |

---

## 11. Interview Q&A (with strong answers)

**Q: Horizontal vs vertical?**  
**A:** More instances vs bigger machine—API tier usually horizontal first; DB often vertical then replicas/sharding.

**Q: What blocks horizontal scaling?**  
**A:** In-process state, DB/Redis saturation, non-idempotent side effects without coordination.

**Q: How does this app scale?**  
**A:** Stateless API replicas + Postgres + Redis rate limits; watch connection pools.

**Q: Sticky sessions?**  
**A:** Avoid for REST; prefer external session store.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Horizontal scaling | More instances |
| Vertical scaling | Bigger instance |
| Load balancer | Distributes traffic |
| Connection pool | Reused DB connections per process |
| Read replica | Postgres copy for reads |
| PgBouncer | Connection pooler for Postgres |

---

## 13. Teach pointer

> “Scale pods until the database asks you to stop—and then fix the database plan.”

---

## 14. Optional further reading (not required)

- [stateless-services](./stateless-services.md) · [../ops/load-balancing.md](../ops/load-balancing.md)  
- [../database/connection-pooling.md](../database/connection-pooling.md)

Repo paths: `backend/src/server.ts`, `backend/src/modules/health/`, `backend/Dockerfile`.
