# Lesson: Request ID and correlation

**Standalone ✓** — You do not need any other doc to generate, propagate, and use request IDs for debugging.

**After this file you can:** explain why every request needs a correlation id, how this app’s middleware works, how clients and logs use it, and answer interview questions on distributed correlation.

---

## 1. First principles

A **request ID** (correlation id) is a unique string attached to **one HTTP request** for its entire lifetime on the server — and ideally echoed back to the client.

When something fails, humans and tools search logs by that id instead of guessing among thousands of lines.

**The problem it solves:** “A user got 500 at 14:03” is useless without a key that joins access log, warn log, and error stack for **that** call.

---

## 2. Mental model

### Analogy

Airport baggage tag: one barcode follows bag → conveyor → claim. Without it, “black suitcase lost Tuesday” matches hundreds of bags.

### Diagram

```text
Client
  │  (optional) X-Request-Id: abc-123
  ▼
requestId middleware
  │  set req.requestId
  │  set response header X-Request-Id
  ▼
requestLogger ──► pino info { requestId, method, path, status, durationMs }
  ▼
handlers / services
  ▼
errorHandler ──► JSON { message, requestId } + warn/error logs with requestId
```

---

## 3. Core rules (must / must-not)

1. **MUST** assign an id **before** business handlers run.  
2. **MUST** accept a client-supplied `X-Request-Id` when present and non-empty (trim it).  
3. **MUST** generate a UUID when the client did not send one.  
4. **MUST** echo the id on the response as `X-Request-Id`.  
5. **MUST** include `requestId` in structured logs and error JSON.  
6. **MUST NOT** treat request ids as secrets — they are correlation, not auth.  
7. **MUST NOT** reuse one id across unrelated requests on the server (clients may reuse for retries; server still logs per attempt).

---

## 4. How it works (mechanics)

### Middleware (real)

`backend/src/shared/middleware/requestId.ts`:

```ts
export function requestId(req, res, next): void {
  const incoming = req.header("x-request-id");
  const id =
    incoming && incoming.trim().length > 0 ? incoming.trim() : randomUUID();

  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}
```

### Typing

`backend/src/types/express.d.ts` extends Express `Request` with `requestId?: string`.

### Mount order

In `backend/src/app.ts`:

1. CORS / Swagger (dev)  
2. **`app.use(requestId)`**  
3. **`app.use(requestLogger)`**  
4. cookies, JSON, `/api` router  
5. `notFound`, **`errorHandler`**

If `requestId` were after routes, early failures would lack correlation.

### Logging

`backend/src/shared/middleware/requestLogger.ts` logs on `res.on("finish")`:

```ts
logger.info({
  requestId: req.requestId,
  method: req.method,
  path: req.originalUrl,
  statusCode: res.statusCode,
  durationMs: Date.now() - start,
});
```

`errorHandler` passes the same field into warn/error objects and JSON bodies.

### Logger silence in tests

`backend/src/shared/logger/logger.ts` uses `level: "silent"` when `NODE_ENV === "test"` so tests stay quiet; correlation still works in non-test envs.

---

## 5. When to use / when not to use

| Situation | Request ID? |
|-----------|-------------|
| Every HTTP API request | **Yes** — always |
| Background job / cron | Use a **job id** (same idea, different name) |
| Auth tokens / session ids | **No** — different purpose; never confuse them |
| Cross-service calls | Propagate as header (W3C `traceparent` is richer; request id is the minimal form) |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Pick header name (`X-Request-Id` is common).  
2. Decide: accept inbound vs always generate (this app: accept or generate).  
3. Decide sinks: response header, logs, error body (this app: all three).

### Implement

1. Middleware sets `req.requestId` + response header.  
2. Log middleware reads `req.requestId`.  
3. Error middleware includes it in JSON.  
4. Optionally pass into deeper layers if they log (today most correlation is at edges).

### Verify

1. `curl -D - http://localhost:4000/api/v1/...` → see `X-Request-Id`.  
2. Send `X-Request-Id: my-test-id` → response echoes `my-test-id`.  
3. Force 401/409 → body includes `"requestId":"..."`.  
4. Grep logs for that id → access + error lines match.

---

## 7. Worked example A — this project

### A1. Full path for a failed login

1. Client `POST /api/v1/auth/login` without `X-Request-Id`.  
2. `requestId` middleware assigns `randomUUID()`, sets response header.  
3. Auth service throws `UnauthorizedError("Invalid email or password")`.  
4. `errorHandler` logs warn with `requestId`, returns:

```json
{ "message": "Invalid email or password", "requestId": "…" }
```

5. `requestLogger` still emits finish log with same id and `statusCode: 401`.

### A2. Client-supplied id (support workflow)

Mobile app sets `X-Request-Id` to its own analytics id. User screenshots the error JSON. Support searches logs for that exact string — finds warn + access lines even if clocks differ slightly.

### A3. OpenAPI awareness

`backend/docs/openapi.yaml` `ErrorMessage` schema includes optional `requestId` so contract docs match runtime.

---

## 8. Worked example B — mini scenario (self-contained)

**Two services:** API gateway and payments.

```text
Client → Gateway (adds X-Request-Id: G1 if missing)
       → Payments (forwards X-Request-Id: G1)
```

Both log `{ requestId: "G1", ... }`. One grep reconstructs the chain. Without forwarding, payments logs are orphaned.

Minimal Express forwarder:

```ts
await fetch(paymentsUrl, {
  headers: { "X-Request-Id": req.requestId! },
  // ...
});
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Only log path/time, no id | Cannot isolate one request under load |
| New UUID in errorHandler only | Access log id ≠ error log id |
| Put PII inside the id | Privacy risk; use opaque UUID |
| Trust request id for authz | Attacker can forge any string |
| Extremely long inbound ids | DoS/log bloat — production systems often cap length (this learning app trusts trim only) |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Body has no `requestId` | Request never hit `requestId` middleware | `app.ts` order | Mount before router |
| Header missing on success | Middleware not setting `res.setHeader` | `requestId.ts` | Set before `next()` |
| Client id ignored | Empty/whitespace header | trim + length check | Send non-empty value |
| Cannot find logs in test | Logger silent in test | `logger.ts` level | Debug in development |
| Two different ids in one request | Someone reassigned mid-flight | Search code for `req.requestId =` | Assign once |

---

## 11. Interview Q&A (with strong answers)

**Q: What is a correlation / request id?**  
**A:** An opaque identifier that ties all log events and the client-visible error for a single request (and optionally downstream calls).

**Q: Why echo it to the client?**  
**A:** So users/support can report the exact id without needing server access; matches `X-Request-Id` and JSON `requestId`.

**Q: Should the server always generate a new id?**  
**A:** Generate if missing; accept inbound to support client-side tracing and multi-hop systems. Never use it as a security boundary.

**Q: Request id vs distributed tracing?**  
**A:** Request id is a single string. Tracing (OpenTelemetry) adds spans, parent/child, timings. Ids are the minimum; traces are richer.

**Q: Where does this live in the Express stack?**  
**A:** Early middleware mutates `req` and response headers; log and error middleware consume `req.requestId`.

**Q: What if two requests share an id?**  
**A:** Logs interleave under one key — rare if UUIDs; possible if clients reuse keys carelessly. Prefer UUIDv4 server-side when generating.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Request / correlation id | Per-request opaque key for joining events |
| Propagation | Forwarding the id to downstream services |
| Structured logging | Logs as fields/objects, not free text only |
| `X-Request-Id` | Common HTTP header for the id |
| Cardinality | How many unique values a field takes (ids are high cardinality — fine in logs, bad as metric labels) |

---

## 13. Teach pointer

> “One id to find them all: generate early, echo always, log everywhere.”

---

## 14. Optional further reading (not required)

- Logging pillars: [structured-logging-metrics-tracing.md](./structured-logging-metrics-tracing.md)  
- Error JSON shape: [../architecture/error-model-and-app-errors.md](../architecture/error-model-and-app-errors.md)  
- Boot/middleware order: [boot-and-graceful-shutdown.md](./boot-and-graceful-shutdown.md)

Repo paths: `backend/src/shared/middleware/requestId.ts`, `requestLogger.ts`, `errorHandler.ts`, `backend/src/app.ts`, `backend/src/types/express.d.ts`.
