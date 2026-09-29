# 01 — Read the signal

**Standalone ✓** — You do not need other how-to-debug guides or lessons to extract every useful clue from an HTTP error, log line, boot failure, or test diff in this backend.

**After this file you can:** copy a signal checklist, tell AppError JSON from validation / notFound / 500, correlate `requestId` to server logs, and know which field chooses the next file — without opening source yet.

---

## 1. Why this habit exists

Random file opens are expensive. A junior sees “something broke” and scrolls `auth.service.ts`. A senior spends 60 seconds **reading the signal** — status, body shape, `requestId`, channel (Bearer / cookie / none) — then opens **one** function.

The signal is the error talking to you. Listening first costs minutes. Guessing first costs hours.

---

## 2. Mental model

### Analogy

Failure hunting is **status → neighborhood → house → room**:

```text
Status code     → neighborhood (auth? validation? infra?)
message / shape → house (which module / middleware)
requestId       → visit (exact log line for this request)
stack / SQLSTATE→ room (exact function / line)
```

### Diagram (this app’s response shapes)

```text
Client gets one of:

  AppError path (next(err) → errorHandler)
    { message, requestId }  + status from err.status

  Controller Zod (early return, no next)
    { message: "Validation failed", errors: { field: [...] } }
    ← often NO requestId in body

  notFound middleware
    { error: "Route METHOD url not found" }
    ← NO requestId in body; still has X-Request-Id header

  Unknown throw → errorHandler
    { message: "Internal Server Error", requestId }
    ← real stack only in server logs (warn vs error)
```

---

## 3. Core rules (must / must-not)

1. **MUST** write down: method, URL, status, body keys (`message` vs `error` vs `errors`), `requestId` (body and/or `X-Request-Id` header), auth channel used.  
2. **MUST** distinguish **AppError JSON** (`message` + `requestId`) from **validation** (`Validation failed` + `errors`) from **route miss** (`error: Route …`).  
3. **MUST** treat client `Internal Server Error` as “look at logs for this `requestId`” — never as the root cause text.  
4. **MUST** note warn vs error in logs: AppError → `logger.warn`; unknown → `logger.error` + stack.  
5. **MUST NOT** open a repository because the status is 403 with a domain message.  
6. **MUST NOT** ignore `errors` on validation and dig into SQL.  
7. **MUST NOT** expect every 404 to carry `requestId` in the JSON body (`notFound` does not).

---

## 4. Signal taxonomy (this app)

### A) AppError JSON (domain / auth / mapped infra)

From `errorHandler` when `err instanceof AppError`:

```json
{ "message": "You do not have access to this project", "requestId": "…" }
```

Status comes from the class (`UnauthorizedError` → 401, `ForbiddenError` → 403, `ConflictError` → 409, `BadRequestError` → 400, `NotFoundError` → 404, `ServiceUnavailableError` → 503).

Critical handler branch:

```ts
if (err instanceof AppError) {
  logger.warn({ requestId, err: { message: err.message, status: err.status, name: err.name } });
  res.status(err.status).json({ message: err.message, requestId });
  return;
}
// else:
logger.error({ requestId, err: /* message + stack */ });
res.status(500).json({ message: "Internal Server Error", requestId });
```

### B) Validation (controller Zod — not AppError)

```json
{ "message": "Validation failed", "errors": { "email": ["…"] } }
```

Controllers `res.status(400).json(...)` and **return** — they do not call `next(err)`, so `errorHandler` never runs for that response.

### C) Route miss (`notFound`)

```json
{ "error": "Route GET /api/v1/foo not found" }
```

Mounted **after** `/api` in `app.ts`. No `message`, no body `requestId`.

### D) Log lines

`requestLogger` on `finish`:

```text
requestId, method, path, statusCode, durationMs
```

`requestId` middleware: uses incoming `x-request-id` if non-empty, else `randomUUID()`; always sets response header `X-Request-Id`.

### E) Process / boot console

- `Failed to start server: …` → `server.ts` `start().catch`  
- `COOKIE_SECURE must be true when NODE_ENV=production` → `config/env.ts`  
- `Redis error …` → `shared/redis/redis.ts` `redis.on("error")`  
- `Database migration failed.` → `db/migrate.ts` catch  

### F) Test runner

```text
Expected: 403
Received: 200
```

Property assertion failure — not an Express stack. Signal is **expected vs received**, not HTTP body (unless the test prints it).

---

## 5. Symptom → first open

| Symptom | First open | Why | If wrong, next |
|---------|------------|-----|----------------|
| Known AppError `message` text | Grep that string in `modules/**/*.service.ts` | Domain throw site | Matching controller only if message never thrown |
| `Validation failed` + `errors` | That route’s controller + `*.schema.ts` | Zod before service | Content-Type / body shape |
| `error: Route … not found` | `api/v1.ts` + module `*.routes.ts` | Never hit a handler | Typo in mount path `/api` vs `/api/v1` |
| `Internal Server Error` + requestId | Logs for that id (`logger.error` stack) | Unknown throw | Repo `Couldn't create…` or unmapped SQL |
| Client 503 + rate-limit style message | `shared/auth/rate-limit.ts` + Redis | Fail-closed store | Redis URL / `isOpen` |
| No body `requestId` on AppError-looking 400 | Controller validation path | Early `res.json`, not `next` | Confirm `errors` key present |
| Boot exit, never listens | `env.ts` → `server.ts` → Redis → DB | Import / connect order | Migrate job separately |
| Test Expected/Received mismatch | Test file assertion + fixture | Property failure | `preload.ts` / DB reset |

---

## 6. Reproduce recipe

### Capture a full signal with curl

```bash
BASE=http://localhost:4000
curl -s -D- -X POST "$BASE/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-Id: debug-login-1' \
  -d '{"email":"bad","password":"x"}'
```

Record: status line, `X-Request-Id` response header, JSON body keys.

### Force AppError vs validation

- Bad email format → expect `Validation failed` + `errors`.  
- Well-formed unknown user → expect 401 `Invalid email or password` + `requestId`.

### Correlate logs

Search logs / console for `debug-login-1` (or the returned id). AppError → warn object; unhandled → error + stack.

---

## 7. Hypothesis ladder

1. **Wrong response family** — Is it `message`+`requestId`, `Validation failed`, or `error: Route`? Kill two families with one glance at keys.  
2. **Wrong layer** — Validation → controller; domain message → service; Route not found → mounts; 500 → stack.  
3. **Missing correlation** — No body requestId? Check header; if validation/notFound, body omission is expected.  
4. **Client vs server story** — Client paraphrased the error; prefer raw JSON + status.  
5. **Flaky vs steady** — One curl always fails → request path; intermittent → concurrency / infra.

---

## 8. Worked failure A — “API says Internal Server Error, no clue”

**Signal:** SPA shows toast “Internal Server Error”. Network tab: status 500, body `{ "message": "Internal Server Error", "requestId": "a1b2…" }`.

**Reproduce:** Same request with curl; confirm identical body.

**Hypothesis ladder:**

1. AppError? No — client message is the generic 500 string (AppErrors return their own message).  
2. Open logs for `a1b2…` → `logger.error` with stack.  
3. Stack top: `Couldn't create task` in `task.repository.ts` → INSERT returned no row.

**Root cause (typical):** migration missing column / constraint reject without service catch, or RETURNING empty.

**Fix:** Repair schema/migration or map the driver error in the service; never “fix” by returning stack to the client.

**Prove:** Same curl → domain status (4xx) or 201; logs no longer error for that path; `requestId` still present on AppError responses.

**Critical code:** `errorHandler` unknown branch always returns generic 500 — root cause lives only in logs.

---

## 9. Worked failure B — mini invented: “Validation has no requestId — is middleware broken?”

**Signal:** `POST /api/v1/auth/register` with `{ "email": "not-an-email" }` → 400, body has `message` + `errors`, **no** `requestId` field. Junior assumes `requestId` middleware is off.

**False lead:** Rewrite `requestId.ts`.

**Actual design:** Controller returns 400 directly; `errorHandler` never runs, so body never gets `requestId`. Header `X-Request-Id` is still set by middleware earlier in `app.ts`.

**Confirm:** Response headers include `X-Request-Id`; `requestLogger` still logs that id with status 400.

**Prove:** Valid body that triggers `ConflictError` → body includes `requestId`; invalid body → validation shape without body requestId (expected).

---

## 10. False leads / anti-patterns

| False lead | Reality |
|------------|---------|
| Open DB because status is 403 | Domain Forbidden message → membership/service |
| “errorHandler broken” because validation lacks requestId | Controllers bypass errorHandler by design |
| Treat toast text as canonical | Read Network/raw JSON |
| Chase 500 in the SPA | Use requestId + server stack |
| Assume every 404 is AppError NotFound | Route miss uses `error` key, different middleware |

---

## 11. Fix + prove checklist

After any change driven by a signal:

- [ ] Re-run the **same** curl/test; status + body shape match expectation  
- [ ] AppError paths still return `{ message, requestId }` — never stack in JSON  
- [ ] Validation still returns `{ message: "Validation failed", errors }`  
- [ ] Logs: AppError → warn; unknown → error with stack; no secrets (passwords/tokens)  
- [ ] If you touched middleware order: `requestId` still before handlers; `errorHandler` still last  

---

## 12. Interview Q&A

**Q: What’s in an AppError response vs a 500?**  
**A:** AppError → `res.status(err.status).json({ message: err.message, requestId })` and a warn log with name/status. Unknown errors → always status 500 with message `"Internal Server Error"` and `requestId`; the real `err.message` and stack go only to `logger.error`. Clients never get internal details.

**Q: How do you correlate a client report to server logs?**  
**A:** Ask for or read `requestId` from the JSON body or `X-Request-Id` header. Search logs for that id. `requestLogger` gives method/path/status/duration; AppError adds warn details; 500 adds the stack on the error log line.

**Q: Why might validation errors omit `requestId` from the body?**  
**A:** Controllers call `res.status(400).json({ message, errors })` and return without `next(err)`. Only `errorHandler` attaches `requestId` to JSON. The middleware still set the header and `req.requestId` earlier — the body just never included it.

**Q: How do you tell a missing route from a domain NotFoundError?**  
**A:** Route miss: `{ error: "Route METHOD … not found" }` from `notFound`. Domain: `{ message: "Task not found", requestId }` (or similar) with status 404 from `NotFoundError` via `errorHandler`. Different JSON keys.

**Q: Status chooses the neighborhood — what does that mean?**  
**A:** 401/403/409 point at auth/authz/conflict services; 400 with `errors` at Zod; 404 with `error` at routing; 500 at logs/stack; 503 rate-limit message at Redis/limiter. You don’t start in the same file for every failure.

---

## 13. Glossary

| Term | Meaning |
|------|---------|
| **Signal** | Status + body shape + headers + logs that describe one failure |
| **AppError** | Base class with `status` + `message`; subclasses set HTTP codes |
| **requestId** | Per-request correlation id on `req` / `X-Request-Id` / AppError body |
| **Validation failed** | Controller Zod early return — not an AppError |
| **notFound** | Catch-all 404 middleware after routers |
| **errorHandler** | Final Express error middleware — AppError vs generic 500 |
| **Neighborhood** | Failure class suggested by status (auth, validation, infra, …) |

---

## 14. Optional further reading

- Next: [02-classify-the-failure.md](./02-classify-the-failure.md) · [04-status-code-playbook.md](./04-status-code-playbook.md) · [03-trace-the-request-path.md](./03-trace-the-request-path.md)  
- Map: [11-symptom-to-concept.md](./11-symptom-to-concept.md) · [README.md](./README.md)  
- Lessons (optional): [http-status-semantics](../lessons/api/http-status-semantics.md)  
- Code: `shared/middleware/errorHandler.ts`, `requestId.ts`, `notFound.ts`, `requestLogger.ts`, `shared/errors/*.ts`, `app.ts`
