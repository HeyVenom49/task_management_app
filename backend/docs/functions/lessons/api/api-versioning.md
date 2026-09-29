# Lesson: API versioning

**Standalone ✓** — You do not need any other doc to version HTTP APIs the way this project does.

**After this file you can:** choose URL vs header versioning, mount `/v1` routers in Express, plan breaking changes, and discuss migration tradeoffs in interviews.

---

## 1. First principles

**API versioning** lets you **change the contract** (URLs, fields, semantics) without silently breaking existing clients.

Mobile apps, SPAs, and third-party integrators ship on **different schedules** than your backend. Versioning is how you say: “Old behavior remains at v1; new behavior is v2.”

**The problem it solves:** A breaking rename (`info` → `title`) or status-code change would otherwise brick production clients on every deploy.

---

## 2. Mental model

### Analogy

Street addresses: “123 Main St **Apt v1**” vs “**Suite v2**” — same building, different door rules. Clients knock the door they were built for.

### Diagram

```text
/api  ──► v1Router  ──► /auth, /projects, /health
       └──► (future v2Router)
```

---

## 3. Core rules (must / must-not)

1. **MUST** expose a **visible version** when you expect external or long-lived clients.  
2. **MUST** default new development to the **latest** documented version.  
3. **MUST NOT** break v1 behavior in place without a version bump — add v2 or deprecate with timeline.  
4. **SHOULD** keep **one major version per router tree** (`v1.ts`, `v2.ts`) for clarity.  
5. **MUST** document OpenAPI per version when you publish docs (`/api/docs` in dev reads `openapi.yaml`).  
6. **AVOID** mixing versions inside one handler with `if (req.query.version)` spaghetti.

---

## 4. How it works (mechanics)

### URL path versioning (this project)

```ts
// api/index.ts
apiRouter.use("/v1", v1Router);

// app.ts
app.use("/api", apiRouter);
```

Effective base: **`/api/v1/...`**

**Pros:** Obvious in logs, curl, and browser; easy routing.  
**Cons:** URL proliferation when v2 ships (duplicate mounts or proxy).

### Alternatives (know for interviews)

| Strategy | Example |
|----------|---------|
| Header | `Accept: application/vnd.myapp.v2+json` |
| Query | `?api-version=2` (discouraged for caches) |
| No version | Acceptable for purely internal fast-moving APIs |

---

## 5. When to use / when not to use

| Change | Version bump? |
|--------|----------------|
| Add optional JSON field | Usually **no** (backward compatible) |
| Remove field or rename | **Yes** |
| Change status code meaning | **Yes** |
| Fix bug matching spec | Often **no**; document if clients relied on bug |
| New endpoint | **No** if additive |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Classify change: additive vs breaking.  
2. If breaking: v2 route + sunset plan for v1.  
3. Update OpenAPI and client SDKs.

### Implement

1. Copy or fork `v1.ts` → `v2.ts` only where behavior diverges; share services.  
2. Mount both under `/api`.  
3. Keep shared business logic in services — version differences stay thin (controllers/DTO mapping).

### Verify

1. Old client integration tests still hit `/api/v1`.  
2. New tests hit `/api/v2`.  
3. Logs/metrics tagged by version prefix.

---

## 7. Worked example A — this project

**Mount chain:**

```ts
// app.ts
app.use("/api", apiRouter);

// api/index.ts
const apiRouter = Router();
apiRouter.use("/v1", v1Router);

// api/v1.ts
v1Router.use("/health", healthRouter);
v1Router.use("/auth", authRouter);
v1Router.use("/projects", projectRouter);
v1Router.use("/projects/:id/tasks", taskRouter);
```

Example URLs:

- `GET /api/v1/health`  
- `POST /api/v1/auth/register`  
- `GET /api/v1/projects/:id/tasks`

**OpenAPI:** Non-production serves Swagger UI at `/api/docs` from `docs/openapi.yaml` — keep spec paths aligned with `/api/v1`.

---

## 8. Worked example B — mini scenario (self-contained)

**Breaking change:** Task `priority` enum adds `CRITICAL`; old mobile app crashes on unknown enum.

**Compatible approach:** v1 continues returning known set; v2 exposes full enum; server validates write on v1 without new value.

**Breaking approach:** Only v2 accepts new enum — v1 clients unchanged.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| “We’ll just break it — only one client” | Future partners, old mobile builds |
| Version in body only | Caches/proxies miss it |
| Infinite supported versions | Maintenance burden — sunset policy needed |
| Duplicate business logic in v1/v2 services | Drift bugs |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| 404 on `/api/auth/...` | Missing `/v1` | Client base URL | Use `/api/v1` |
| Wrong handler | Mount order | `v1.ts` | Fix router registration |
| Docs mismatch | OpenAPI stale | yaml paths | Sync spec |

---

## 11. Interview Q&A (with strong answers)

**Q: URL vs header versioning?**  
**A:** URL is simple and observable; header versioning keeps URLs stable — common in hypermedia APIs. Pick one and be consistent.

**Q: When don’t you need versioning?**  
**A:** Internal APIs with synchronized deploys and no external clients — still document breaking changes.

**Q: How share code between v1 and v2?**  
**A:** Services/repos stay shared; controllers/DTO mappers adapt per version.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Breaking change | Client must update to keep working |
| Additive change | Old clients ignore new fields |
| Sunset | End-of-life date for a version |
| OpenAPI | Machine-readable API description |

---

## 13. Teach pointer

> “Version the contract clients compile against — not every internal refactor.”

---

## 14. Optional further reading (not required)

- REST paths: [./rest-resource-design.md](./rest-resource-design.md)  
- Gateway routing: [./api-gateway.md](./api-gateway.md)
