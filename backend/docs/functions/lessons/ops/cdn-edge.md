# Lesson: CDN and edge caching

**Standalone ✓** — You do not need any other doc to cache safely around this authenticated API.

**After this file you can:** explain CDN role, Cache-Control/Vary pitfalls, and why this JSON API stays private/no-store.

---

## 1. First principles

A **CDN (Content Delivery Network)** caches content at **edge PoPs** close to users — lower latency, less origin load.

**The problem it solves:** Serving static assets from one origin continent away; repeating identical public bytes.

**Risk for APIs:** caching **personalized** JSON at edge → user A sees user B’s data (catastrophic with cookies/Bearer).

---

## 2. Mental model

### Analogy

Chain of photocopy shops (edge) for a **public textbook** (static JS). Never photocopy someone’s **bank statement** (authenticated API) and hand it to the next customer.

### Diagram

```text
Browser ──► CDN edge ──► cache HIT? ──► return
                │
                └── MISS ──► origin API (private, no-store)
```

---

## 3. Core rules (must / must-not)

1. **MUST** use `Cache-Control: private, no-store` (or stricter) for **authenticated** JSON.  
2. **MUST NOT** CDN-cache responses that vary by `Authorization` without impossible-to-safe-key rules.  
3. **MUST** set correct **`Vary`** if caching negotiated responses — rare for private API.  
4. **MAY** CDN-cache **static** SPA assets with hashed filenames.  
5. **SHOULD** purge CDN on deploy of static assets (versioned filenames minimize need).

---

## 4. How it works (mechanics)

**Cache-Control directives:**

| Directive | Meaning |
|-----------|---------|
| `public` | Shared caches may store |
| `private` | Browser only |
| `no-store` | Do not store |
| `max-age` | Fresh seconds for cacheable |

**Vary:** tells caches which request headers affect response — `Authorization` makes shared caching impractical for personalized bodies.

This API: dynamic member-scoped tasks/projects — default **no CDN on API JSON**.

**OpenAPI/Swagger UI** in non-prod (`app.ts`) could be cached lightly in dev tooling contexts — not production user traffic.

---

## 5. When to use / when not to use

| Asset | CDN? |
|-------|------|
| SPA `app.[hash].js` | **Yes** |
| `GET /api/v1/projects` with Bearer | **No shared cache** |
| Public marketing HTML | Yes with cache rules |
| OpenAPI yaml behind auth | No |

---

## 6. Step-by-step: design → implement → verify

1. Classify routes public vs authenticated.  
2. Set response headers on API (middleware).  
3. Put SPA on CDN; API on origin only.  
4. Test: two users — no cross-leak at edge (use CDN debug headers).  
5. Review [IDOR](../security/idor.md) — caching mistakes amplify IDOR.

---

## 7. Worked example A — this project

**API nature:** CORS to `env.frontendUrl`, cookies for refresh, Bearer access — responses are **user-specific**.

**Correct default:** do not cache authenticated task/project payloads at shared edge.

**Swagger in dev:**

```24:31:backend/src/app.ts
if (env.nodeEnv !== "production") {
  const raw = readFileSync(
    join(import.meta.dirname, "../docs/openapi.yaml"),
    "utf8",
  );
  const spec = parse(raw);
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(spec));
}
```

Production disables docs surface — less to accidentally expose/cache.

**Frontend:** host static Vite build on CDN; API calls go to origin with credentials — standard split.

---

## 8. Worked example B — mini scenario (self-contained)

**Wrong:**

```http
Cache-Control: public, max-age=3600
GET /api/v1/projects  (Authorization: Bearer alice)
```

Edge stores Alice’s list; Bob gets Alice’s — disaster.

**Right:**

```http
Cache-Control: private, no-store
```

CDN bypasses API; only static assets cached.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Result |
|--------------|--------|
| CDN cache personalized GET | Cross-user data leak |
| Ignore cookies in cache key | Session bleed |
| Long cache on error page | Sticky failures |
| Cache POST responses | Undefined behavior / unsafe |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| User sees stale other data | shared cache | CDN headers | no-store |
| API fast, SPA slow | no CDN on assets | static hosting | CDN JS/CSS |
| Intermittent old UI | CDN TTL | cache bust hash | filename hashing |
| 401 cached as 200 | misconfigured edge | cache rules | only cache public |

---

## 11. Interview Q&A (with strong answers)

**Q: Cache-Control directives?**  
**A:** `public/private` who may cache; `no-store` prevents storage; `max-age` freshness; use `private, no-store` for auth API JSON.

**Q: Vary header?**  
**A:** Lists headers that change response variant — critical if shared cache; with Authorization-heavy APIs, avoid shared caching instead.

**Q: Purge strategies?**  
**A:** Versioned asset filenames (immutable) + short TTL for HTML entry; API generally not purged because not cached.

**Q: This project?**  
**A:** Authenticated dynamic API — no edge cache on JSON; static frontend CDN is the typical pattern.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| CDN | Edge cache network |
| PoP | Point of presence |
| Origin | Your server behind CDN |
| no-store | Must not persist response |
| Vary | Request headers affecting cached variant |

---

## 13. Teach pointer

> “If the response depends on who you are, the edge must not share it.”

---

## 14. Optional further reading (not required)

- [caching](../architecture/caching.md) · [cors](../api/cors.md) · [idor](../security/idor.md)
