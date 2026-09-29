# Lesson: Health vs readiness (liveness probes)

**Standalone ✓** — You do not need any other doc to design and debug health checks.

**After this file you can:** split liveness from readiness, wire Kubernetes-style probes correctly, explain what this API exposes today, and answer interview questions without hand-waving.

---

## 1. First principles

**Liveness** answers: “Should the orchestrator **restart** this process?”  
**Readiness** answers: “Should the load balancer **send traffic** to this process?”

They exist because production processes crash, deadlock, lose dependencies, or boot before migrations finish. A single “health” endpoint that mixes both causes **wrong restarts** (DB blip kills every pod) or **wrong routing** (traffic hits pods that cannot serve).

**The problem it solves:** Operators and schedulers need a cheap, standardized signal — not guessing from user 500s.

---

## 2. Mental model

### Analogy

- **Liveness** = “Is the patient’s heart beating?” If not, CPR (restart).  
- **Readiness** = “Is the patient ready to walk on stage?” Broken leg → don’t send audience (traffic); don’t necessarily kill the patient.

### Diagram

```text
                    ┌─────────────────┐
  Kubelet / LB ───► │ GET /live       │──► 200 → keep pod alive
                    └─────────────────┘

                    ┌─────────────────┐
  Load balancer ──► │ GET /ready      │──► 200 → send HTTP traffic
                    │  (+ DB, Redis)  │    503 → drain / no new traffic
                    └─────────────────┘
```

---

## 3. Core rules (must / must-not)

1. **MUST** keep liveness checks **fast** and **dependency-light** (no DB if avoidable).  
2. **MUST** put **dependency checks** on readiness (or a dedicated ready route), not liveness.  
3. **MUST** return **503** (not 500 with ambiguous body) when not ready, if your platform expects it.  
4. **MUST NOT** restart pods because Postgres had a 2s blip — that amplifies outages.  
5. **MUST NOT** mark ready before **required** boot steps (here: Redis for rate limits).  
6. **MUST** align probe timeouts with real dependency latency (don’t use 1s timeout on a 5s cold DB).  
7. **MUST** document what each route checks so on-call doesn’t misread “OK” as “DB OK.”

---

## 4. How it works (mechanics)

| Probe | Typical path | Checks | Failure action |
|-------|--------------|--------|----------------|
| Liveness | `/health`, `/live` | Event loop responsive, process up | Restart container |
| Readiness | `/ready`, `/health/db` | DB ping, Redis, migrations version | Remove from LB pool |
| Startup (K8s) | `/startup` | Heavy checks during boot only | Hold traffic until pass |

HTTP semantics: liveness failure → kill; readiness failure → stop routing but process may recover without restart.

During **graceful shutdown**, set readiness to fail **before** `server.close` so the LB drains in-flight work (pattern not fully wired in this repo yet — see boot lesson).

---

## 5. When to use / when not to use

| Situation | Liveness | Readiness |
|-----------|----------|-----------|
| Process deadlocked | Yes — restart | N/A |
| DB temporarily unreachable | **No** restart | Fail ready → no new traffic |
| Rolling deploy, old + new versions | Keep live | New pods ready only when DB OK |
| Local dev `curl` sanity | Either | Either |
| Authenticated business logic | **Never** — health is unauthenticated infra |

---

## 6. Step-by-step: design → implement → verify

### Design

1. List dependencies **required to serve normal traffic** (DB, Redis, etc.).  
2. List dependencies **optional** (email — degrade, don’t block ready).  
3. Choose paths: e.g. `GET /api/v1/health` (live), `GET /api/v1/health/db` (partial ready).  
4. Define status codes and JSON shape for operators.

### Implement

1. Mount routes on a **public** router (no auth).  
2. Liveness: return 200 quickly.  
3. Readiness: run `SELECT 1`, Redis `PING`, etc.; on failure return 503 + reason field.  
4. Boot: connect critical deps **before** `listen` (this repo connects Redis in `server.ts` before accepting connections).

### Verify

1. `curl` live endpoint — always 200 while process runs.  
2. Stop Postgres — readiness/db should fail; liveness `/` should still 200.  
3. During deploy simulation: readiness fails → LB stops sending; no restart storm.

---

## 7. Worked example A — this project

Routes live under `/api/v1/health` via `v1Router.use("/health", healthRouter)`.

**Liveness-style (process up):**

```6:8:backend/src/modules/health/health.routes.ts
healthRouter.get("/", (_req: Request, res: Response) => {
  res.status(200).json({ message: "OK" });
});
```

**Dependency check (readiness-style, DB only today):**

```10:15:backend/src/modules/health/health.routes.ts
healthRouter.get("/db", async (_req: Request, res: Response) => {
  const result = await sql`SELECT 1`;
  return res.json({
    database: result[0],
  });
});
```

**Boot order (readiness implied before traffic):** `server.ts` calls `connectRedis()` then `server.listen()` — rate limiting uses Redis; listening before Redis would mean first login requests hit fail-closed or inconsistent limiter state.

**Gap (honest):** No dedicated `/ready` combining DB + Redis; `/db` does not return 503 on failure (errors bubble to error handler). Production hardening would map DB failure to 503 JSON for probes.

---

## 8. Worked example B — mini scenario (self-contained)

Add explicit live/ready split:

```ts
healthRouter.get("/live", (_req, res) => {
  res.status(200).json({ status: "alive" });
});

healthRouter.get("/ready", async (_req, res) => {
  try {
    await sql`SELECT 1`;
    await redis.ping(); // pseudocode
    res.status(200).json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "not_ready", reason: "dependency" });
  }
});
```

Kubernetes manifest sketch:

```yaml
livenessProbe:
  httpGet: { path: /api/v1/health/live, port: 3000 }
  periodSeconds: 10
readinessProbe:
  httpGet: { path: /api/v1/health/ready, port: 3000 }
  periodSeconds: 5
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| DB check on liveness | DB outage → all pods restarted → thundering herd |
| No readiness | Traffic to pods mid-boot or mid-migration |
| Health requires JWT | Probes fail; endless restarts |
| `/health` returns 200 when Redis down | LB sends login traffic → 503 storm for users |
| Same endpoint for deploy gate and liveness | Confusing ops; wrong restart behavior |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Pods restart every 30s | Liveness too strict or slow | Probe path, timeout, DB on liveness | Split live vs ready |
| 503 for all users, pods “Running” | Readiness failing | `/health/db`, Redis, migrations | Fix dependency; don’t restart |
| Intermittent ready flaps | Pool exhaustion, slow DB | Postgres connections, probe period | Scale DB/pool; tune probes |
| Deploy hangs “0/3 ready” | Migrations not run | Job logs, schema version | Run migrate Job before Deployment |
| Health OK but app broken | Health doesn’t check what users need | Product deps vs probe | Extend readiness checklist |

---

## 11. Interview Q&A (with strong answers)

**Q: Liveness vs readiness?**  
**A:** Liveness decides restart (is the process fundamentally stuck?). Readiness decides routing (can this instance serve traffic right now?). DB checks belong on readiness so a DB blip drains traffic instead of killing every replica.

**Q: What should liveness check?**  
**A:** Minimal: process responds, event loop not wedged. Avoid external dependencies.

**Q: What should readiness check?**  
**A:** Everything required for **typical** requests: DB connectivity, cache if required for security paths (Redis here for rate limits), sometimes migration version.

**Q: Relation to graceful shutdown?**  
**A:** Before closing HTTP, fail readiness so the load balancer stops sending new requests; then `server.close` drains in-flight work.

**Q: What does this project expose?**  
**A:** `GET /api/v1/health` for process OK and `GET /api/v1/health/db` with `SELECT 1`; Redis is validated at boot via `connectRedis` before listen.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Liveness probe | Restart-if-unhealthy check |
| Readiness probe | Route-traffic-if-healthy check |
| Startup probe | Slow boot guard in Kubernetes |
| Drain | Stop new traffic to an instance |
| LB | Load balancer |

---

## 13. Teach pointer

> “Alive means ‘don’t kill me.’ Ready means ‘you may send users now.’”

---

## 14. Optional further reading (not required)

- [boot-and-graceful-shutdown](./boot-and-graceful-shutdown.md)  
- [load-balancing](./load-balancing.md)  
- Repo: `backend/src/server.ts`, `backend/src/modules/health/health.routes.ts`
