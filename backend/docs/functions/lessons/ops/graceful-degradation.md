# Lesson: Graceful degradation

**Standalone ✓** — You do not need any other doc to choose degrade vs fail-closed vs hard error.

**After this file you can:** reduce blast radius when optional deps fail, explain this API’s Redis fail-closed choice, and interview on fail-open pitfalls.

---

## 1. First principles

**Graceful degradation** keeps serving a **reduced but useful** experience when a **non-critical** dependency fails.

Contrast **fail-closed** controls: when a security dependency fails, you **refuse** service rather than silently weaken protection.

**The problem it solves:** Optional microservice down → entire product 500; or worse — security control down → unlimited login attempts (unsafe “degradation”).

---

## 2. Mental model

### Analogy

Airplane: entertainment screens off (degrade) vs engine failure (cannot “degrade” flying — land or fail safe).

### Diagram

```text
Request ──► core path (DB) ──► 200 + partial payload
              │
              └── optional enrich ──X──► skip / empty / slower fallback
Security path (rate limit) ──X Redis ──► 503 fail-closed (NOT degrade open)
```

---

## 3. Core rules (must / must-not)

1. **MUST** classify dependencies: **critical**, **security**, **optional**.  
2. **MUST NOT** degrade **security** into fail-open.  
3. **SHOULD** signal degradation to clients (`X-Degraded`, empty array, header).  
4. **SHOULD** log degradation events for SLO tracking.  
5. **MAY** use slower fallback (Postgres search vs Elasticsearch).

---

## 4. How it works (mechanics)

Decision table:

| Dependency | On failure |
|------------|------------|
| Auth rate limit Redis | **Fail-closed 503** |
| Primary Postgres | Cannot serve writes — error |
| Email provider | Accept + outbox retry / generic response |
| Recommendations | Empty suggestions |
| Read-through cache | Fall back to DB |

Product communicates reduced UX; ops monitors degradation rate.

---

## 5. When to use / when not to use

| Feature | Degrade? |
|---------|----------|
| Task CRUD | **No** — DB required |
| Login rate limit | **Fail-closed** |
| Swagger in prod | Already disabled — surface reduction |
| Email verification send | Degrade to queue + log in dev |

---

## 6. Step-by-step: design → implement → verify

1. List features and deps per route.  
2. Mark optional vs security vs core.  
3. Implement fallbacks with explicit metrics.  
4. Document client behavior for empty fields.  
5. Chaos test optional dep down — core still 200.

---

## 7. Worked example A — this project

| Behavior | Pattern |
|----------|---------|
| Redis down for rate limits | **Fail-closed** → login 503 (security) |
| Email not fully integrated | Console/log in dev — dev degradation |
| Swagger | Disabled when `NODE_ENV === production` in `app.ts` — reduces attack surface |
| Health `/` vs `/db` | Partial dependency visibility |

**Rate limit philosophy:** degrading to “no limits” on Redis loss would be **fail-open** — rejected by design.

---

## 8. Worked example B — mini scenario (self-contained)

Suggestions service down:

```json
GET /tasks → 200
{ "tasks": [...], "suggestions": [] }
Header: X-Degraded: suggestions
```

Search: Elasticsearch down → Postgres `ILIKE` with strict `LIMIT 20` (slower but works).

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Result |
|--------------|--------|
| Recommendations down → 500 whole page | Bad degradation |
| Rate limit skip on Redis error | Attack window |
| Silent empty without header | Client confusion |
| Degrade authz checks | IDOR catastrophe |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Login 503 all users | Redis fail-closed | Redis health | restore — intentional |
| Missing suggestions only | optional svc | degraded header | fix svc or accept |
| Users think data loss | empty array ambiguous | API docs | header + message |
| Security regression | fail-open deploy | rate limit code | fail-closed |

---

## 11. Interview Q&A (with strong answers)

**Q: Example of bad degradation?**  
**A:** Skipping rate limits when Redis is down — “degrades” availability into insecure fail-open.

**Q: Fail-open vs fail-closed vs degrade?**  
**A:** Fail-open continues without control (risky for security); fail-closed errors; degrade serves reduced non-security features.

**Q: Communicate degradation to clients?**  
**A:** Headers, explicit empty fields, documentation — not silent behavior changes.

**Q: This API?**  
**A:** Redis rate limits fail-closed; Swagger off in prod; email path is minimal/console — core task/auth needs DB.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Fail-closed | Refuse when control unavailable |
| Fail-open | Continue without control |
| Optional dependency | Core works without it |
| Blast radius | Scope of failure impact |
| Fallback | Alternate code path |

---

## 13. Teach pointer

> “Degrade features, not security guarantees.”

---

## 14. Optional further reading (not required)

- [circuit-breaker](./circuit-breaker.md) · [../architecture/outbox-events.md](../architecture/outbox-events.md)  
- [../security/fail-closed-rate-limits.md](../security/fail-closed-rate-limits.md)
