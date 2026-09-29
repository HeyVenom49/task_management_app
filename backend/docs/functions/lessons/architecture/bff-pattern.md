# Lesson: BFF (Backend for Frontend)

**Standalone ✓** — Backend-for-Frontend pattern, when to split APIs per client, and how this repo’s single API relates.

**After this file you can:** decide BFF vs general API, design aggregation endpoints safely, avoid authz leaks in BFFs, and interview with examples.

---

## 1. First principles

A **Backend for Frontend (BFF)** is a server tailored to one client experience (web app, mobile app, admin)—shaping payloads, aggregating calls, and hiding churn from a shared **core API** or domain services.

The problem it solves: one generic REST API forces every client to over-fetch, under-fetch, or duplicate orchestration. Mobile wants compact DTOs; admin wants rich joins—one size fits poorly.

The cost: **more deployables** and duplicated auth/session handling unless BFF is thin.

---

## 2. Mental model

### Analogy

Hotel concierge (BFF) for VIP wing vs standard desk—both reach the same kitchen (core services), but concierge bundles dinner + spa into one answer for the guest.

### Diagram

```text
  Web SPA ──► Web BFF ──┐
                        ├──► Core API / services ──► Postgres
  Mobile ──► Mobile BFF ─┘

Without BFF:
  Web + Mobile ──► Same general API (this repo today)
```

---

## 3. Core rules (must / must-not)

1. **MUST NOT** put authoritative business rules only in BFF—core services own invariants.  
2. **MUST** propagate auth (JWT/cookies) consistently; BFF is not a trust bypass.  
3. **SHOULD** keep BFF thin: aggregate, reshape, cache—not duplicate transactions.  
4. **MUST NOT** create N+1 internal HTTP calls without timeouts/batching.  
5. **SHOULD** one BFF per major client type, not per screen.  
6. **MUST** enforce same authz as core—BFF forwards identity, does not invent admin.

---

## 4. How it works (mechanics)

**BFF responsibilities:**

- Combine `GET project` + `GET members` + `GET tasks` into one `GET /dashboard`.  
- GraphQL layer as BFF variant—client picks fields.  
- Adapt error shapes for UI toasts.

**Core API responsibilities (this repo):**

- `auth`, `projects`, `tasks` modules with REST resources.  
- Membership authz in services.

**This project:** **No separate BFF**—frontend talks to `/api/v1` directly. Acceptable for one web client and moderate payloads.

**When to add BFF:** Mobile launch with strict bandwidth, or third-party integrators needing stable public API separate from UI-optimized endpoints.

---

## 5. When to use / when not to use

| Situation | BFF? |
|-----------|------|
| Single web client, small team | **No** — general API enough |
| Mobile + web different shapes | **Consider** BFF per client |
| Public API + internal UI | Split **public API** vs **BFF** |
| Microservices already | BFF aggregates service calls |
| GraphQL adoption | GraphQL gateway acts as BFF |

---

## 6. Step-by-step: design → implement → verify

1. Identify client-specific chattiness or payload pain.  
2. List aggregations; ensure core still exposes atomic operations.  
3. Build BFF routes calling core with service token or forwarded user JWT.  
4. Add timeouts, circuit breakers on internal calls.  
5. Verify authz: BFF cannot access other users’ data without core checks.  
6. Load test aggregated endpoint vs N separate calls.

---

## 7. Worked example A — this project

**Current shape:** `api/v1.ts` mounts auth, projects (with nested tasks), health—one API for the SPA.

**Without BFF, frontend might:**

- Call `GET /projects` then `GET /projects/:id/tasks` per project—chatty.  
- Mitigation in core API: future `?include=tasks` or dedicated list endpoint—not a separate BFF process yet.

**If adding Web BFF (hypothetical):**

```text
GET /bff/home → internally calls core list projects + open task counts
```

Core `ProjectServices` still enforces membership; BFF only reduces round trips.

**Auth:** BFF forwards `Authorization` header or httpOnly cookies to core—same `authenticate` semantics.

---

## 8. Worked example B — self-contained mini scenario

```ts
// mobile-bff/routes/home.ts
app.get("/home", async (req, res) => {
  const token = req.headers.authorization;
  const [projects, notifications] = await Promise.all([
    fetch(`${CORE}/projects`, { headers: { authorization: token } }),
    fetch(`${CORE}/notifications`, { headers: { authorization: token } }),
  ]);
  res.json({
    projects: slimProject(await projects.json()),
    notifications: await notifications.json(),
  });
});

function slimProject(rows) {
  return rows.map((p) => ({ id: p.id, title: p.name, openTasks: p.openTaskCount }));
}
```

Core remains source of truth; BFF shapes for mobile screen.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Fat BFF with SQL | Second monolith |
| BFF skips auth checks | IDOR |
| Chain of 10 sync HTTP calls | Latency cascades |
| BFF per developer | Explosion of services |
| Business rules only in BFF | Mobile/web diverge |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| BFF 502 | Core timeout | Trace internal calls | Batch endpoint in core |
| Web OK, mobile wrong data | BFF mapping bug | Compare raw core JSON | Fix mapper |
| Auth works on core not BFF | Cookie domain / header drop | Proxy config | Forward credentials |
| Stale dashboard | BFF cache | TTL | Invalidate on writes |

---

## 11. Interview Q&A (with strong answers)

**Q: BFF vs API gateway?**  
**A:** Gateway: cross-cutting (TLS, rate limit). BFF: client-specific aggregation/shaping—can coexist.

**Q: Why not GraphQL instead?**  
**A:** GraphQL is often the BFF layer—one endpoint, client-selected fields; ops complexity differs.

**Q: This task app?**  
**A:** Single REST API for frontend—no BFF until client diversity or chattiness hurts.

**Q: Where do invariants live?**  
**A:** Core services (tasks/projects/auth)—never only in BFF.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| BFF | Backend for Frontend |
| Aggregation | Combining multiple data sources |
| Over-fetch | Getting more data than UI needs |
| Core API | Domain-owned HTTP/services |
| Chattiness | Many round trips |

---

## 13. Teach pointer

> “BFF optimizes the conversation with one client—not the truth of the domain.”

---

## 14. Optional further reading (not required)

- [modular-monolith](./modular-monolith.md) · [../api/rest-resource-design.md](../api/rest-resource-design.md)  
- [../api/graphql-basics.md](../api/graphql-basics.md)

Repo path: `backend/src/api/v1.ts`.
