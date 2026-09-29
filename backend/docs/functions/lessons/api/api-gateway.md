# Lesson: API gateway

**Standalone ✓** — You do not need any other doc to understand what an API gateway does in front of services like this Express app.

**After this file you can:** explain routing, TLS termination, rate limits, auth at the edge, and how a monolith maps to “gateway + one service” today.

---

## 1. First principles

An **API gateway** is a **reverse proxy** at the network edge that routes client requests to backend services, often centralizing **TLS, auth, rate limits, routing, and observability**.

**Why it exists:** Microservices mean many ports and teams — clients want **one hostname** (`api.example.com`) and consistent policies.

**The problem it solves:** Duplicating CORS, JWT validation, and rate limits in every service — or exposing internal service topology.

**This repo today:** One **Express monolith** (`app.ts` + `/api/v1`) — the gateway role is often played by **nginx, cloud load balancer, or platform ingress** in production, not a separate Kong/Envoy layer in code.

---

## 2. Mental model

### Analogy

Hotel front desk: guests never wander into the kitchen. Desk checks ID, assigns room (route), and handles noise complaints (rate limits) before staff inside cook (business logic).

### Diagram

```text
Client ──► Gateway (TLS, WAF, rate limit) ──► Express monolith /api/v1
                    │
                    └── (future) ──► auth-svc, task-svc, ...
```

---

## 3. Core rules (must / must-not)

1. **MUST** terminate **TLS** at edge (or trusted mesh).  
2. **MUST** enforce **global rate limits** and request size at edge **and** app (defense in depth).  
3. **SHOULD NOT** put **business rules** only in gateway — domain logic stays in services.  
4. **MUST** forward **trace/request ids** (`requestId` middleware pattern) to backends.  
5. **MUST NOT** trust `X-Forwarded-For` without trusted hop config.  
6. **SHOULD** path-route `/api/v1/*` to correct service when split.

---

## 4. How it works (mechanics)

Typical gateway features:

| Feature | Example |
|---------|---------|
| Route | `/api/v1/auth/*` → auth cluster |
| Auth | Validate JWT at edge OR pass through to app |
| Rate limit | IP/global (Redis like `loginLimiter`) |
| Transform | Strip internal headers |
| Observability | Access logs, metrics |

**Monolith mapping:** `app.use("/api", apiRouter)` is internal routing; gateway is external hostname → this process `:3000`.

---

## 5. When to use / when not to use

| Situation | Gateway |
|-----------|---------|
| Many microservices | **Yes** — Kong, Envoy, AWS API GW |
| Single Express app | Ingress/LB often enough |
| Need API keys per partner | Gateway or dedicated middleware |
| Complex path-based routing | Gateway |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Public paths vs internal admin.  
2. Which auth validates where.  
3. Body size limits aligned with `express.json({ limit: "100kb" })`.

### Implement (deploy)

1. Ingress rules to service.  
2. Health check `GET /api/v1/health`.  
3. Optional WAF rules.

### Verify

1. Direct pod access blocked from public internet.  
2. Request id appears in app logs from gateway header.  
3. Rate limit 429 at edge + app auth limits.

---

## 7. Worked example A — this project

**App bootstrap** (`app.ts`):

```ts
app.use(cors({ origin: env.frontendUrl, credentials: true }));
app.use(requestId);
app.use(requestLogger);
app.use(express.json({ limit: "100kb" }));
app.use("/api", apiRouter);
```

**Version routing** (`api/index.ts`):

```ts
apiRouter.use("/v1", v1Router);
```

**Auth rate limits** live **in app** (`auth.routes.ts` + Redis store) — if you add Kong, you might duplicate coarse IP limits at edge and keep login-specific limits in app (`loginLimiter`).

**Health for load balancers:**

```text
GET /api/v1/health
GET /api/v1/health/db
```

Gateway health checks hit these — not heavy project list endpoints.

---

## 8. Worked example B — mini scenario (self-contained)

Split future services:

```text
/api/v1/auth/*     → auth-service:3001
/api/v1/projects/* → project-service:3002
```

Gateway validates JWT once, injects `X-User-Id` **only if** mTLS trusted internal network — services still verify membership (don’t trust header alone from internet).

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| All business logic in gateway plugins | Untestable, vendor lock |
| No TLS | Credential theft |
| Gateway trust client JWT without verify | Forged tokens |
| Huge body through gateway | OOM — match app limit |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| 502 Bad Gateway | App down | Health/db routes | Fix upstream |
| Wrong service | Route rule | Gateway config | Path prefix |
| CORS ok direct, fail via gateway | Strip headers | Gateway CORS | Configure allow |
| Rate limit too aggressive | Edge + app double | Logs | Tune tiers |

---

## 11. Interview Q&A (with strong answers)

**Q: Gateway vs load balancer?**  
**A:** LB distributes traffic; gateway adds L7 features — routing, auth, rate limits, sometimes transformation. Many products blend both.

**Q: Where validate JWT?**  
**A:** Either gateway (less backend load) or service (more context for authz). This app validates in `authenticate` middleware on routes.

**Q: Monolith need gateway?**  
**A:** Still need TLS termination and often ingress; full API gateway product optional until service split.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Reverse proxy | Server-facing client requests on behalf of backends |
| Ingress | K8s edge routing resource |
| mTLS | Mutual TLS between gateway and services |
| WAF | Web application firewall |

---

## 13. Teach pointer

> “Gateway is the front door policy — not the place to implement task business rules.”

---

## 14. Optional further reading (not required)

- Rate limits: [./rate-limit-algorithms.md](./rate-limit-algorithms.md)  
- Horizontal scaling: [../architecture/horizontal-scaling.md](../architecture/horizontal-scaling.md)
