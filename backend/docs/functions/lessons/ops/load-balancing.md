# Lesson: Load balancing

**Standalone ✓** — You do not need any other doc to place this stateless API behind a load balancer.

**After this file you can:** explain L4 vs L7, health checks, sticky sessions, and why this app fits horizontal scale.

---

## 1. First principles

A **load balancer (LB)** distributes incoming connections/requests across **multiple app instances** so no single machine bears all traffic.

**The problem it solves:** Single-server capacity ceiling; need zero-downtime deploys; fault isolation when one instance dies.

---

## 2. Mental model

### Analogy

Supermarket checkout: open multiple lanes (instances); a greeter (LB) directs customers to the shortest line.

### Diagram

```text
Clients ──► LB ──┬──► API pod 1
                 ├──► API pod 2
                 └──► API pod 3
                      │
                      └── readiness probe on each
```

---

## 3. Core rules (must / must-not)

1. **MUST** health-check **readiness**, not only TCP open port.  
2. **MUST** keep app **stateless** — any instance serves any request.  
3. **MUST NOT** require **sticky sessions** unless unavoidable — limits scale.  
4. **SHOULD** terminate TLS at LB or ingress with modern ciphers.  
5. **SHOULD** drain instances before kill (graceful shutdown + readiness).

---

## 4. How it works (mechanics)

**L4:** TCP flow distribution — fast, less HTTP awareness.  
**L7:** HTTP routing, host/path rules, cookies — smarter health checks.

Algorithms: round-robin, least connections, consistent hash (careful with hot keys).

**Sticky sessions:** same client → same backend — needed only if server stores session in RAM (avoid).

This API: JWT access in header, refresh in DB/Redis patterns, Redis rate limits — **any replica OK** behind LB.

---

## 5. When to use / when not to use

| Situation | LB |
|-----------|-----|
| Multiple API replicas | **Yes** |
| Single dev laptop | No |
| WebSocket long-lived | LB with connection affinity or dedicated gateway |
| Static SPA assets | Often CDN + LB to API origin |

---

## 6. Step-by-step: design → implement → verify

1. Confirm stateless app (no local session store).  
2. Configure readiness: `/api/v1/health/db` + future Redis ready.  
3. Rolling update: new pods ready before old drained.  
4. Verify: hit LB repeatedly — requests spread (access logs on each pod).  
5. Kill one pod — clients still succeed.

---

## 7. Worked example A — this project

**Stateless alignment:**

- Access tokens verified per request (Bearer).  
- Refresh sessions in Postgres.  
- Rate limits in Redis — shared across instances.  
- No in-memory user session required for routing.

**Health for LB:**

- `GET /api/v1/health` — liveness-style.  
- `GET /api/v1/health/db` — dependency check before sending traffic.

**Boot:** Redis connected before listen in `server.ts` — each new instance ready for rate limits when added to pool.

**Shutdown:** SIGTERM closes HTTP — pair with LB drain via readiness failure (production hardening).

---

## 8. Worked example B — mini scenario (self-contained)

Ingress config sketch:

```yaml
backend:
  servicePort: 3000
  healthCheck:
    path: /api/v1/health/db
    interval: 10s
  strategy: round_robin
```

Anti-pattern: sticky cookie because “we cache user in Map()” — fix code instead.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Result |
|--------------|--------|
| Sticky due to local state | Uneven load, fragile |
| No health check | Traffic to dead pods |
| Liveness on DB | Restart storm |
| LB timeout < app timeout | Premature 502 |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| 502 from LB | no healthy backends | readiness | fix DB/Redis |
| One pod all traffic | sticky misconfig | LB rules | disable stickiness |
| Uneven load | long requests on one | least-conn | tune algorithm |
| Session flapping | state on instance | architecture | externalize state |

---

## 11. Interview Q&A (with strong answers)

**Q: L4 vs L7?**  
**A:** L4 routes TCP connections; L7 understands HTTP for path-based routing and richer health checks.

**Q: Sticky when needed?**  
**A:** Only when unavoidable server-local state exists — prefer external session store instead.

**Q: Health check design?**  
**A:** Readiness checks dependencies; liveness stays lightweight; align with [health-readiness](./health-readiness.md).

**Q: Why this app LB-friendly?**  
**A:** Shared Redis/Postgres, Bearer auth, no required single-instance RAM session.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| L7 load balancer | HTTP-aware balancer |
| Readiness | Backend eligible for traffic |
| Sticky session | Client pinned to one instance |
| Drain | Stop sending new traffic to instance |
| Replica | One running app instance |

---

## 13. Teach pointer

> “Load balancers spread load; they don’t fix sticky state — you do.”

---

## 14. Optional further reading (not required)

- [health-readiness](./health-readiness.md) · [horizontal-scaling](../architecture/horizontal-scaling.md)  
- [boot-and-graceful-shutdown](./boot-and-graceful-shutdown.md)
