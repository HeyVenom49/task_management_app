# Lesson: HTTP status semantics (401 / 403 / 404 / 409 / 503)

**Standalone ✓** — You do not need any other doc to pick and map HTTP statuses in this API.

**After this file you can:** choose status codes from client behavior, map `AppError` subclasses consistently, explain 403 vs 404 for access denial, and answer interview scenarios with security-aware answers.

---

## 1. First principles

HTTP **status codes** are part of the **API contract**. They tell clients, proxies, and monitors **how to react** before parsing the body: re-authenticate, show forbidden UI, retry, reload data, or surface a conflict.

A uniform `{ message, requestId }` body helps humans; **status** drives machines.

**The problem it solves:** If everything is `500`, clients cannot distinguish “bad password” from “database on fire.” If everything is `200` with `{ error: true }`, caches and middleware lie.

---

## 2. Mental model

### Analogy

Traffic signals: red = stop and fix credentials; yellow = conflict — proceed carefully; green = success. Different colors, different driver actions — not one generic “something happened.”

### Diagram

```text
Request
   │
   ▼
Controller ──► validation fail ──► 400
   │
   ▼
Service ──► throw AppError subclass
   │
   ▼
errorHandler ──► res.status(err.status).json({ message, requestId })
```

---

## 3. Core rules (must / must-not)

1. **MUST** map domain outcomes to **stable** statuses across the API.  
2. **MUST** use **401** when authentication is missing or invalid (including bad refresh).  
3. **MUST** use **403** when the caller is authenticated but **not permitted** (e.g. not a project member).  
4. **MUST** use **404** when the resource is **not found in this scoped context** (task id not in this project — IDOR-safe).  
5. **MUST** use **409** for **state conflicts**: duplicate email, optimistic concurrency miss, business rule blocking delete.  
6. **MUST** use **400** for validation and malformed input at the boundary.  
7. **MUST** use **503** when a **safety dependency** is unavailable (this app: Redis for rate limits — fail closed).  
8. **MUST NOT** return **500** for expected business failures.  
9. **MUST NOT** leak stack traces to clients on 500 — log server-side with `requestId`.

---

## 4. How it works (mechanics)

### This project’s error types (`backend/src/shared/errors/`)

| Class | Status | Typical meaning |
|-------|--------|-----------------|
| `BadRequestError` | 400 | Malformed token link, bad request semantics |
| `UnauthorizedError` | 401 | Bad login, invalid/expired refresh |
| `ForbiddenError` | 403 | Verified user but action denied (e.g. unverified login policy) |
| `NotFoundError` | 404 | Project/task/member not in scope |
| `ConflictError` | 409 | UNIQUE violation, OCC, “cannot remove member with open tasks” |
| `ServiceUnavailableError` | 503 | Rate limit store (Redis) down |

### Controller vs middleware

- Controllers return **400** directly from Zod `safeParse` failures.  
- Services **throw** `AppError` subclasses; `errorHandler` sets status.

### Login nuance

Invalid credentials → **401** with generic message (avoid “user exists” vs “wrong password” split).  
Unverified account policy may use **403** with “verify email” — deliberate product choice.

---

## 5. When to use / when not to use

| Situation | Status |
|-----------|--------|
| Zod validation failed | **400** |
| JWT missing/invalid | **401** |
| Member tries admin-only action | **403** |
| Task UUID valid globally but wrong `projectId` in path | **404** (this app’s IDOR policy) |
| Two updates race on same task version | **409** |
| Postgres unreachable on health | **503** or health sub-check fails |
| Uncaught exception | **500** generic |

---

## 6. Step-by-step: design → implement → verify

### Design

1. For each endpoint, list outcomes → status + message template.  
2. Decide 403 vs 404 philosophy for cross-tenant ids — **document and test**.  
3. Ensure auth endpoints don’t enumerate users via status/body differences.

### Implement

1. Throw specific `AppError` subclasses from services.  
2. Never `res.status(409)` in service — keep HTTP mapping centralized.  
3. Controllers: validation 400; `next(err)` for thrown errors.

### Verify

1. Integration tests assert status per scenario (`failures.test.ts` patterns).  
2. Monitor 4xx/5xx ratios separately.  
3. Confirm 500 responses never include stack in JSON.

---

## 7. Worked example A — this project

**Global handler** (`errorHandler.ts`):

```ts
if (err instanceof AppError) {
  res.status(err.status).json({ message: err.message, requestId });
  return;
}
res.status(500).json({ message: "Internal Server Error", requestId });
```

**Task OCC** (`task.service.ts` pattern):

```ts
throw new ConflictError("Task was modified; reload and try again");
```

Client should **reload** task, merge edits, retry PATCH with new `expectedUpdatedAt`.

**Rate limit Redis down** (`rate-limit.ts`):

```ts
throw new ServiceUnavailableError(
  "Rate limiting unavailable. Try again later.",
);
```

**503** signals “infrastructure not safe to proceed” — not the user’s fault.

**Controller validation** (`auth.controller.ts`):

```ts
res.status(400).json({
  message: "Validation failed",
  errors: parsed.error.flatten().fieldErrors,
});
```

---

## 8. Worked example B — mini scenario (self-contained)

**DELETE /projects/:id/members/:memberId** when member has open tasks.

- Return **409** `{ message: "Member has incomplete tasks" }` — client shows conflict UI, not “server error.”  
- Returning **400** would imply bad input; **403** would imply permission; **409** correctly means “state doesn’t allow this transition.”

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| All errors → 500 | Clients retry forever; alerts noisy |
| 403 for wrong password | Helps enumerate accounts |
| 404 for “not logged in” | Client won’t trigger login flow |
| 200 with `{ error: "..." }` | Breaks HTTP semantics |
| Different statuses for same logical failure | Flaky client behavior |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Client never redirects to login | 403 instead of 401 | Auth middleware path | Use 401 for bad/missing token |
| IDOR leak rumor | 403 on others’ ids | Service throws | Use 404 in scoped context |
| Flaky 409 on PATCH | Stale `expectedUpdatedAt` | Client cache | Reload before update |
| 503 on login only | Redis down | Rate limit store | Restore Redis or degrade policy explicitly |
| 500 on bad JSON | Body parser error | Not AppError | Optional custom parser error → 400 |

---

## 11. Interview Q&A (with strong answers)

**Q: 401 vs 403?**  
**A:** 401 = authentication failed or missing. 403 = authenticated (or policy treats you as known) but not allowed to perform the action.

**Q: Why 404 for wrong project’s task?**  
**A:** Prevents confirming object existence across tenancy boundaries — “not found **here**” rather than “forbidden but exists elsewhere.”

**Q: Why 409 for optimistic locking?**  
**A:** The request was valid but conflicted with current server state; client should refresh and retry — not a permission or syntax problem.

**Q: Should 503 include Retry-After?**  
**A:** Good practice for overload/maintenance; this app currently returns message + requestId — optional improvement.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| AppError | Base class carrying HTTP `status` |
| IDOR | Accessing resources by id outside authorized scope |
| OCC | Optimistic concurrency control |
| Fail closed | Reject requests when safety deps fail (503 vs open bypass) |
| requestId | Correlation id for support/log lookup |

---

## 13. Teach pointer

> “403 means I know who you are and I’m saying no. 401 means I don’t accept your proof. 404 means nothing here — sometimes on purpose.”

---

## 14. Optional further reading (not required)

- IDOR: [../security/idor.md](../security/idor.md)  
- Email enumeration: [../security/email-enumeration-and-timing.md](../security/email-enumeration-and-timing.md)
