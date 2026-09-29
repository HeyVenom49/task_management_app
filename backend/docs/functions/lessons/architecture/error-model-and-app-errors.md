# Lesson: Error model and AppErrors

**Standalone ✓** — You do not need any other doc to throw, map, and debug API errors in this backend.

**After this file you can:** explain the `AppError` hierarchy, map domain failures to HTTP status codes, keep stacks off the wire, correlate errors with `requestId`, and answer interview questions with confidence.

---

## 1. First principles

An **application error model** is a small, intentional set of exception types that mean **business or protocol outcomes**, not “any thrown `Error`.”

In this backend, services `throw` subclasses of `AppError`. The Express `errorHandler` turns those into JSON responses with a status code. Unexpected bugs become a generic **500** with no internal details leaked to the client.

**The problem it solves:** Without a shared model you get inconsistent status codes, stack traces in responses, and logs you cannot tie to a single request.

---

## 2. Mental model

### Analogy

Think of a hotel front desk:

- Guests get a short, polite reason (“room taken”, “key expired”).  
- Staff get the full incident report in the back office.  
- Every complaint ticket has a **case number** so phone support can find the same incident.

`AppError` = guest-facing reason + status. Logs = staff report. `requestId` = case number.

### Diagram

```text
Service / middleware
        │ throw new ConflictError("...")
        ▼
   errorHandler
        │
        ├── AppError? ──► logger.warn({ requestId, status, message })
        │                 res.status(status).json({ message, requestId })
        │
        └── else ───────► logger.error({ requestId, message, stack })
                          res.status(500).json({ message: "Internal Server Error", requestId })
```

---

## 3. Core rules (must / must-not)

1. **MUST** throw `AppError` subclasses for expected failures (auth, authz, not found, conflict, bad input, dependency down).  
2. **MUST** let the central `errorHandler` map status — do not scatter `res.status(...).json(...)` for domain failures in services.  
3. **MUST** include `requestId` in every error JSON body when middleware set it.  
4. **MUST NOT** send `stack`, SQL text, Redis errors, or file paths to the client.  
5. **MUST** log unexpected errors at **error** level with stack; expected `AppError`s at **warn**.  
6. **MUST** throw inside `sql.begin` callbacks so the transaction rolls back with the error.  
7. **MUST NOT** catch `AppError`, swallow it, and return success.

---

## 4. How it works (mechanics)

### Base class

`backend/src/shared/errors/app-error.ts`:

```ts
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
```

Subclasses fix the status:

| Class | Status | Typical meaning |
|-------|--------|-----------------|
| `BadRequestError` | 400 | Invalid input / expired link / bad assignee |
| `UnauthorizedError` | 401 | Missing/invalid credentials or refresh |
| `ForbiddenError` | 403 | Authenticated but not allowed |
| `NotFoundError` | 404 | Resource missing (or hidden) |
| `ConflictError` | 409 | Unique clash / OCC stale write / invariant |
| `ServiceUnavailableError` | 503 | Dependency required for this path is down |

Exports live in `backend/src/shared/errors/index.ts`.

### Handler

`backend/src/shared/middleware/errorHandler.ts`:

- Reads `req.requestId`.  
- `instanceof AppError` → warn log → `{ message, requestId }` with `err.status`.  
- Anything else → error log **with stack** → generic `"Internal Server Error"` at 500.

Mounted last in `backend/src/app.ts` after `notFound`.

### Status mapping intuition

| Situation | Prefer |
|-----------|--------|
| Wrong password / bad refresh | 401 |
| Email not verified | 403 |
| Not a project member | 403 (often same message as “no access”) |
| Task missing after authz | 404 |
| Duplicate email / project name / stale `updated_at` | 409 |
| Zod validation failure in controller | 400 (handled before service; still user-facing) |
| Redis rate-limit store down | 503 via `ServiceUnavailableError` |

---

## 5. When to use / when not to use

| Situation | Use `AppError`? |
|-----------|-----------------|
| Business rule failed | **Yes** — specific subclass |
| DB unique violation mapped in service | **Yes** — `ConflictError` |
| Programmer bug (null deref) | **No** — let it become 500 |
| Validation at controller (`safeParse`) | Prefer 400 JSON there; or throw `BadRequestError` |
| “Soft” degrade and continue | Not an error — return partial success intentionally |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Name the failure in product language (“email taken”, “task changed”).  
2. Pick status from the table above (authn vs authz vs conflict).  
3. Decide client message: safe, stable, no internals.  
4. Decide if throwing aborts a transaction (usually yes).

### Implement

1. `import { ConflictError } from "../../shared/errors"` (or path from module).  
2. `throw new ConflictError("...")` in the service.  
3. Do not catch unless you map DB codes (`23505`) then rethrow `AppError`.  
4. Confirm route has no local try/catch that eats the error without `next(err)`.

### Verify

1. Hit the endpoint; expect correct status + `{ message, requestId }`.  
2. Confirm response has **no** `stack`.  
3. Confirm logs include the same `requestId`.  
4. For transactional paths: force throw after first write → no partial rows.

---

## 7. Worked example A — this project

### A1. Auth — duplicate register → 409

`AuthService.register` catches unique violations / pre-checks and throws:

```ts
throw new ConflictError("Email already registered");
```

Client sees `409` + message + `requestId`. Password hash never appears in the body.

**Where:** `backend/src/modules/auth/auth.service.ts`.

### A2. Auth — login failures

```ts
throw new UnauthorizedError("Invalid email or password"); // bad creds
throw new ForbiddenError("Please verify your email");     // inactive / unverified
```

401 vs 403 separates “who are you?” from “you’re not allowed yet.”

### A3. Projects — name conflict and access

```ts
throw new ConflictError("A project with this name already exists");
throw new ForbiddenError("You do not have access to this project");
```

**Where:** `backend/src/modules/projects/project.service.ts`.

### A4. Tasks — OCC conflict

On stale `expectedUpdatedAt`:

```ts
throw new ConflictError("Task was modified; reload and try again");
```

**Where:** `backend/src/modules/tasks/task.service.ts`.

### A5. Handler contract (real)

```ts
if (err instanceof AppError) {
  logger.warn({ requestId, err: { message: err.message, status: err.status, name: err.name } });
  res.status(err.status).json({ message: err.message, requestId });
  return;
}
// ...
res.status(500).json({ message: "Internal Server Error", requestId });
```

Stacks stay in logs only for non-`AppError`.

---

## 8. Worked example B — mini scenario (self-contained)

**Feature:** “Reserve a seat.” Only one reservation per `(event_id, user_id)`.

```ts
class SeatTakenError extends AppError {
  constructor() {
    super(409, "Seat already reserved");
    this.name = "SeatTakenError";
  }
}

async function reserve(sql, eventId, userId) {
  try {
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO reservations (event_id, user_id)
        VALUES (${eventId}, ${userId})
      `;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new SeatTakenError();
    throw e; // unexpected → 500 via errorHandler
  }
}
```

Client always gets either 201, 409 `{ message, requestId }`, or opaque 500 — never the Postgres error string.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| `res.status(409).json(...)` deep in service | Skips logging/`requestId` consistency; hard to test |
| `throw new Error("duplicate")` for business cases | Becomes 500; client sees “Internal Server Error” |
| `json({ error: err })` including stack | Leaks internals; security + noise |
| Catch-all `catch (e) { return null }` | Silent failures; wrong HTTP semantics |
| 404 for “wrong password” | Helps enumeration; use 401 with uniform message |
| 403 vs 401 confused | Clients refresh tokens incorrectly |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Always 500 for “email taken” | Thrown plain `Error` or unmapped DB error | Service catch for `23505` | Map to `ConflictError` |
| Error JSON missing `requestId` | `requestId` middleware after handler, or early response | `app.ts` order: `requestId` before routes | Mount `requestId` early |
| Client sees stack | Custom handler or `err` dumped | Response body | Use shared `errorHandler` only |
| 409 but row still inserted | Throw **after** commit / wrong `sql` vs `tx` | Transaction boundary | Throw inside `begin` |
| Log has no request id | Middleware not run (crash before) | `req.requestId` in handler | Ensure middleware order |

---

## 11. Interview Q&A (with strong answers)

**Q: Why have an `AppError` base class?**  
**A:** So the HTTP layer can distinguish expected domain failures (typed status + safe message) from unexpected bugs (generic 500, stack only in logs).

**Q: What should never go to the client?**  
**A:** Stack traces, SQL, connection strings, Redis exceptions, internal file paths — anything that helps an attacker or confuses clients.

**Q: 401 vs 403?**  
**A:** 401 = authentication failed or missing; 403 = identity known (or session valid) but action/resource forbidden (e.g. unverified email, not a member).

**Q: How do errors interact with transactions?**  
**A:** Throwing inside `sql.begin` aborts the callback → driver rolls back → then `errorHandler` maps the `AppError` to HTTP.

**Q: Why put `requestId` on error bodies?**  
**A:** So support and the client can paste one ID that matches server logs for that exact request.

**Q: Should validation errors be `AppError`?**  
**A:** Either throw `BadRequestError` or return 400 at the controller after Zod `safeParse`; both are fine if status/message/`requestId` stay consistent.

**Q: What is fail-closed with errors?**  
**A:** When a security control cannot run (e.g. rate-limit Redis down), throw `ServiceUnavailableError` (503) instead of skipping the control.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| `AppError` | Base class carrying HTTP `status` + safe `message` |
| Domain / expected error | Failure the product anticipates |
| Unexpected error | Bug or unmapped infrastructure failure → 500 |
| Status mapping | Choosing 4xx/5xx from failure kind |
| Fail-closed | Deny/unavailable when a safety check cannot execute |
| `requestId` | Per-request correlation id (see ops lesson optionally) |

---

## 13. Teach pointer

> “Throw meaning, not chaos: typed errors for clients, stacks only for operators, one id to join them.”

---

## 14. Optional further reading (not required)

- HTTP status nuance: [../api/http-status-semantics.md](../api/http-status-semantics.md)  
- Correlation: [../ops/request-id-and-correlation.md](../ops/request-id-and-correlation.md)  
- Fail-closed limits: [../security/fail-closed-rate-limits.md](../security/fail-closed-rate-limits.md)  
- Transactions: [../database/transactions.md](../database/transactions.md)

Repo paths: `backend/src/shared/errors/`, `backend/src/shared/middleware/errorHandler.ts`, `backend/src/app.ts`, auth/projects/tasks services under `backend/src/modules/`.
