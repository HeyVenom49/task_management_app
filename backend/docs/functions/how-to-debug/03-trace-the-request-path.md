# 03 — Trace the request path

**Standalone ✓** — You do not need other how-to-debug guides to walk `METHOD + URL` through this backend’s fixed pipeline and stop at the first layer that explains the symptom.

**After this file you can:** recite the middleware → router → controller → service → repo → errorHandler pipe, pick the route file in ~20 seconds, binary-search “did we reach the controller?”, and avoid nested-router / `next(err)` footguns.

---

## 1. Why this habit exists

When the server is up and one URL is wrong, juniors open random services. Seniors **follow the pipe** like water until the leak: middleware → mount → route → Zod → service throw → SQL → errorHandler.

Tracing answers “where did this request die?” Classification already told you it’s a request failure; this file is the map of the street.

---

## 2. Mental model

### Analogy

Express is a **pipeline**. Each stage can stop the request (respond), transform it (`req.user`), or pass it on (`next` / `next(err)`).

```text
Client
  → cors (origin + credentials)
  → swagger (/api/docs, non-prod)
  → requestId          → sets req.requestId + X-Request-Id
  → requestLogger      → logs on finish
  → cookieParser
  → express.json(100kb)
  → /api → /v1 → module router
       → maybe authenticate / rate limit
       → controller: Zod → service → res.json  OR  next(err)
       → service: authz + tx + rules → throw AppError
       → repository: SQL → row  OR  throw / driver error
  → notFound           → if no route matched
  → errorHandler       → AppError JSON or generic 500
```

### Neighborhood → house → room

| Signal neighborhood | House | Room |
|---------------------|-------|------|
| CORS / cookies missing | `app.ts` | cors / cookieParser |
| No correlation id | `requestId.ts` | middleware order |
| Route not found | `api/v1.ts` + `*.routes.ts` | mount path |
| 401 before business logic | `authenticate.ts` | Bearer parse / verify |
| Validation failed | `*.controller.ts` + schema | that handler |
| Domain message | `*.service.ts` | method matching verb |
| SQL / RETURNING empty | `*.repository.ts` | named method |
| Mapped AppError / 500 | `errorHandler.ts` | instanceof branch |

---

## 3. Core rules (must / must-not)

1. **MUST** start from `METHOD + full path` (`/api/v1/...`), not from a guessed service name.  
2. **MUST** stop at the **first** layer that can produce the observed status/body.  
3. **MUST** know tasks nest under `/projects/:id/tasks` with `Router({ mergeParams: true })`.  
4. **MUST** remember controller Zod returns 400 **without** `next` — errorHandler never sees it.  
5. **MUST NOT** dig into SQL when the body is `Validation failed`.  
6. **MUST NOT** dig into task authz when authenticate never set `req.user` (401).  
7. **MUST NOT** forget `errorHandler` is last — if `next(err)` was never called, you get hang/empty, not AppError JSON.

---

## 4. Signal taxonomy (where the pipe leaks)

| Observed shape | Leak stage |
|----------------|------------|
| Browser CORS error / no `Set-Cookie` cross-origin | `app.ts` cors (`origin: env.frontendUrl`, `credentials: true`) |
| `{ error: "Route … not found" }` | No match → `notFound` |
| 401 `Unauthorized` on protected router | `authenticate` (missing/bad Bearer; verify failures swallowed → UnauthorizedError) |
| 400 `Validation failed` + `errors` | Controller Zod |
| `{ message, requestId }` 4xx/503 | `next(err)` → AppError → errorHandler |
| `{ message: "Internal Server Error", requestId }` | Unknown throw → errorHandler |
| 503 rate limit unavailable / too many attempts | `loginLimiter` / `authWriteLimiter` before controller |
| Log line without handler work | requestLogger still fires on finish with status |

Critical mounts:

```ts
// api/index.ts
apiRouter.use("/v1", v1Router);

// api/v1.ts
v1Router.use("/health", healthRouter);
v1Router.use("/auth", authRouter);
v1Router.use("/projects", projectRouter);
v1Router.use("/projects/:id/tasks", taskRouter);
```

---

## 5. Symptom → first open

| Symptom | First open | Why | If wrong, next |
|---------|------------|-----|----------------|
| Wrong CORS / cookie not stored cross-site | `app.ts` cors + `FRONTEND_URL` | Credentialed cross-origin | `refresh-cookie.ts` attrs |
| `Route GET /api/v1/… not found` | `api/v1.ts` + module routes | Never entered handler | Typo `/api` vs `/api/v1`; method |
| Nested task param empty / Zod on project id | `task.routes.ts` `mergeParams` | Parent `:id` not merged | `projectIdParamsSchema` in controller |
| 401 on `/projects` or `/tasks` | `authenticate` on those routers | `projectRouter.use(authenticate)` | Token / `JWT_SECRET` |
| 401 on `/auth/me` | Same authenticate | Route-level authenticate | Bearer header |
| Login 503 / too many attempts | `rate-limit.ts` on `/login` | Before controller | Redis |
| Validation failed on create task | `task.controller` + schemas | Zod first | Body/params shape |
| Forbidden access message | `TaskService` / `ProjectServices` require* | After auth | Membership row |
| 500 stack mentions repository | That repo method | SQL / RETURNING | Migration / constraints |
| No response / hung | Controller catch missing `next(err)` | Error never reached handler | Express error path |

---

## 6. Reproduce recipe

### Confirm entry route

```bash
BASE=http://localhost:4000
# Health — no auth
curl -s -D- "$BASE/api/v1/health"
# Protected — expect 401 without Bearer
curl -s -D- "$BASE/api/v1/projects"
# Nested tasks mount
curl -s -D- "$BASE/api/v1/projects/00000000-0000-0000-0000-000000000001/tasks"
```

### Binary search with logs / breakpoint

1. Breakpoint or temporary log at **controller method entry** — hit?  
2. **No** → cors (browser only), mount, authenticate, rate limit, wrong method/path.  
3. **Yes** → Zod fail? (400 validation, no `next`).  
4. Service throw? Grep the exact `message` string.  
5. Service OK, wrong JSON → controller mapping.  
6. SQL wrong → repository + DB state.

### Auth middleware behavior

```ts
// authenticate.ts — all verify failures become UnauthorizedError
try {
  // Bearer required; verifyAccessToken; set req.user
  next();
} catch {
  next(new UnauthorizedError());
}
```

---

## 7. Hypothesis ladder

1. **Never reached Express handler** — CORS preflight / wrong host / process down.  
2. **Wrong mount** — 404 Route not found.  
3. **Blocked by authenticate / limiter** — 401 / 503 / rate message.  
4. **Zod** — Validation failed.  
5. **Service domain** — AppError message.  
6. **Repo / driver** — 500 or unmapped SQLSTATE.  
7. **errorHandler not invoked** — missing `next(err)`.

---

## 8. Worked failure A — “POST task returns Validation failed on project id”

**Signal:** `POST /api/v1/projects/<uuid>/tasks` with valid body → 400 `Validation failed`, `errors` mention project id / params.

**Reproduce:** Same URL; inspect which schema failed (`projectIdParamsSchema` vs body).

**Hypothesis ladder:**

1. Body Zod? Body looks fine.  
2. Params? `req.params.id` empty or missing.  
3. Task router created without `mergeParams: true` → parent `:id` not visible → Zod fails on params.

**Root cause (this repo’s footgun):** nested router must be `Router({ mergeParams: true })` as in current `task.routes.ts`. If someone removes it, `:id` from `/projects/:id/tasks` never merges.

**Fix:** Restore `mergeParams: true`; ensure controller reads the param name the schema expects.

**Prove:** Params parse succeeds; request reaches `TaskService.create`; membership Forbidden or 201 as appropriate.

**Critical code:**

```ts
const taskRouter = Router({ mergeParams: true });
taskRouter.use(authenticate);
```

---

## 9. Worked failure B — mini invented: “Service throws ForbiddenError but client sees empty response”

**Signal:** Debugger shows `throw new ForbiddenError("You do not have access to this project")` inside service; client hangs or gets empty body; no AppError JSON.

**False lead:** “errorHandler doesn’t handle ForbiddenError.”

**Actual:** Controller `catch` logged the error but forgot `next(err)` — error never entered Express’s error middleware.

**Confirm:** Compare a working controller (`catch (err) { next(err); }`) with the broken one.

**Fix:** Always `next(err)` from async controllers (or wrap with a helper that does).

**Prove:** Same membership miss → 403 `{ message, requestId }`; warn log from errorHandler.

---

## 10. False leads / anti-patterns

| False lead | Reality |
|------------|---------|
| Rewriting service for Route not found | Mounts / typo |
| Digging SQL on Validation failed | Controller Zod |
| Assuming authenticate returns JWT details to client | Always UnauthorizedError |
| Ignoring `mergeParams` on nested tasks | Empty parent params |
| Blaming errorHandler for validation shape | Validation never calls it |
| Starting in repository for `/me` 401 | authenticate only |

---

## 11. Fix + prove checklist

- [ ] Same METHOD+URL curl now hits expected layer (log/breakpoint proof)  
- [ ] Wrong-layer symptoms still correct (401 without token; validation on bad body)  
- [ ] Nested task routes still receive `:id`  
- [ ] Controllers still `next(err)` on service throws  
- [ ] `errorHandler` remains **after** `notFound` in `app.ts`  
- [ ] AppError responses include `requestId`; stacks stay server-side  

---

## 12. Interview Q&A

**Q: Order of middleware in `app.ts`?**  
**A:** cors → (optional swagger `/api/docs`) → `requestId` → `requestLogger` → `cookieParser` → `express.json({ limit: "100kb" })` → `/api` router → `notFound` → `errorHandler`. requestId must run before handlers so AppError bodies and logs can correlate. errorHandler must be last and have the four-arg signature.

**Q: How do you find which service method a route uses?**  
**A:** Path prefix → `api/v1.ts` mount → module `*.routes.ts` line → controller method name → `this.service.<sameVerb>(…)`. Grep the route path string or HTTP verb in that routes file; don’t search the whole monorepo first.

**Q: Why might path params be empty on a nested router?**  
**A:** Child `Router()` defaults to not inheriting parent params. This app mounts tasks at `/projects/:id/tasks` and uses `Router({ mergeParams: true })` so `:id` appears in `req.params` for Zod. Without mergeParams, project id validation fails before the service runs.

**Q: Where do rate limits sit in the pipe?**  
**A:** On specific auth routes (e.g. `loginLimiter` on `POST /login`, `authWriteLimiter` on resend/forgot) — after global middleware, before/around the controller callback. They can 503 fail-closed if Redis commands fail, never reaching AuthService.

**Q: How does a thrown AppError become JSON?**  
**A:** Service throws → controller `catch` → `next(err)` → Express skips to `errorHandler` → `instanceof AppError` → status from `err.status`, body `{ message, requestId }`, warn log.

---

## 13. Glossary

| Term | Meaning |
|------|---------|
| **Pipeline / pipe** | Ordered middleware + router + handler stages |
| **Mount** | `router.use(path, subRouter)` wiring in `api/v1.ts` |
| **mergeParams** | Child router inherits parent route params |
| **authenticate** | Bearer JWT gate; sets `req.user` or 401 |
| **next(err)** | Hands control to error middleware |
| **notFound** | Final 404 for unmatched routes |
| **Binary search debug** | Prove reached controller vs not; then narrow |

---

## 14. Optional further reading

- Classify first: [02-classify-the-failure.md](./02-classify-the-failure.md) · Signals: [01-read-the-signal.md](./01-read-the-signal.md) · Status: [04-status-code-playbook.md](./04-status-code-playbook.md)  
- Fix discipline: [10-fix-protocol.md](./10-fix-protocol.md)  
- Lessons (optional): [layered-architecture](../lessons/architecture/layered-architecture.md), [validation-boundary](../lessons/api/validation-boundary.md)  
- Code: `app.ts`, `api/index.ts`, `api/v1.ts`, `authenticate.ts`, `errorHandler.ts`, `notFound.ts`, `task.routes.ts`, `project.routes.ts`, `auth.routes.ts`
