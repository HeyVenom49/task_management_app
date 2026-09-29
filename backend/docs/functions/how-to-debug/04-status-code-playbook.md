# 04 — Status code playbook

**Standalone ✓** — You do not need other how-to-debug guides or the HTTP-status lesson to map a status code + message to the first file to open in this backend.

**After this file you can:** use status as an index, refine with body clues, distinguish 401 vs 403 vs IDOR-safe 404, and explain 503 fail-closed login without guessing.

---

## 1. Why this habit exists

Status is the **index** of the playbook; message is the **page number**. Opening `task.repository.ts` for every 4xx wastes time. Each code class in this app has a small set of producers — AppError subclasses, Zod early returns, `notFound`, or rate-limit store failures.

Wrong status neighborhood → wrong house. Right status → one grep away from the throw.

---

## 2. Mental model

### Analogy

HTTP status is a **filing cabinet drawer**:

```text
400 → bad input drawer (Zod OR BadRequestError)
401 → identity drawer (authenticate / login / refresh)
403 → policy drawer (verified? member? owner? field rules?)
404 → missing drawer (route miss OR NotFoundError — check JSON keys!)
409 → conflict drawer (unique / OCC / business conflict)
500 → unknown drawer (logs + requestId only)
503 → unavailable drawer (limiter / ServiceUnavailableError)
```

### Class → status (this codebase)

```ts
UnauthorizedError          → 401
ForbiddenError             → 403
BadRequestError            → 400
NotFoundError              → 404
ConflictError              → 409
ServiceUnavailableError    → 503
// unknown Error           → 500 via errorHandler
```

AppError base: `constructor(public readonly status: number, message: string)`.

---

## 3. Core rules (must / must-not)

1. **MUST** pair status with body shape (`message`+`requestId` vs `Validation failed` vs `error: Route`).  
2. **MUST** treat **401** as identity and **403** as policy (e.g. unverified email on login is 403).  
3. **MUST** treat task-under-wrong-project as **404 Task not found** (IDOR-safe), not always 403.  
4. **MUST** debug **500** with `requestId` logs — client message is always generic.  
5. **MUST NOT** open Redis for a normal 401 invalid password.  
6. **MUST NOT** open JWT code for `Validation failed`.  
7. **MUST NOT** “fix” 503 limiter by skipping Redis checks in production.

---

## 4. Signal taxonomy by status

### 400 Bad Request

| Body clue | Producer |
|-----------|----------|
| `Validation failed` + `errors` | Controller Zod (`safeParse` → `res.status(400)`) |
| `Invalid or expired verification/reset link` | `AuthService.verifyEmail` / `resetPassword` |
| `Invalid assignee` | `TaskService` (or check violation mapped) |
| `Cannot remove the last owner` | `ProjectServices.removeMember` |
| `New password must be different` | `AuthService.changePassword` |
| `User not found or not verified` / already member variants | Project member flows |

### 401 Unauthorized

| Clue | Producer |
|------|----------|
| No/invalid Bearer on protected routes | `authenticate` → `UnauthorizedError` |
| `Invalid email or password` | `AuthService.login` |
| `Invalid refresh token` | `AuthService.refresh` |
| `Invalid credentials` | `changePassword` current password |

### 403 Forbidden

| Message (typical) | Producer |
|-------------------|----------|
| `Please verify your email` | `AuthService.login` (INACTIVE) |
| `You do not have access to this project` | `requireActiveMember` / owner helpers |
| `You cannot update this task` / fields | `TaskService.assertCanUpdateTask` |
| `Only the creator or an owner can delete` | `TaskService.remove` |
| `Only platform admins can reactivate members` | `reactivateMember` |

### 404 Not Found

| Clue | Producer |
|------|----------|
| `error: Route METHOD path not found` | `notFound` middleware |
| `Task not found` | Task get/update/remove (often project mismatch) |
| `Member not found` / `Project not found` | Project member / reactivate paths |

### 409 Conflict

| Clue | Producer |
|------|----------|
| `Email already registered` | register + `23505` map |
| Project name exists / already member | `ProjectServices` |
| `Task was modified; reload and try again` | OCC on task update |
| Cannot remove member with open tasks | removeMember + constraint/count |

### 500 Internal Server Error

Client: `{ message: "Internal Server Error", requestId }`.  
Server: `logger.error` with stack. Common: repo `throw new Error("Couldn't create …")`, unmapped driver errors.

### 503 Service Unavailable

| Message | Producer |
|---------|----------|
| `Rate limiting unavailable. Try again later.` | `rate-limit.ts` Redis fail-closed |
| `Too many login attempts…` / `Too many requests…` | limiter `message` (also may surface as limiter response) |
| Other | `ServiceUnavailableError` throw sites |

---

## 5. Symptom → first open

| Symptom | First open | Why | If wrong, next |
|---------|------------|-----|----------------|
| 400 + `errors` | Controller + `*.schema.ts` | Zod | Content-Type / raw body |
| 400 domain message | Service method that throws it | BadRequestError | Token repos for verify/reset |
| 401 protected route | `authenticate.ts` + `token.ts` | Bearer gate | Client header / JWT_SECRET |
| 401 login message | `AuthService.login` | Credentials | DUMMY_HASH path / normalization |
| 401 refresh | `readRefreshToken` + `AuthService.refresh` | Channel + session | Cookie path / revoke |
| 403 verify email | `AuthService.login` status check | INACTIVE | Verify flow |
| 403 project access | `requireActiveMember` / `requireOwner` | Membership | DB `members` row |
| 404 Route … | `api/v1.ts` + routes | Mount | Method typo |
| 404 Task not found | `TaskService.getById/update/remove` | Scoped lookup | Wrong projectId (IDOR-safe) |
| 409 email/name | Register / project create catches | Unique | Raw 23505 as 500 if unmapped |
| 409 task modified | Task update OCC | `expectedUpdatedAt` | Client stale timestamp |
| 500 + requestId | Logs stack for id | Unhandled | Repo RETURNING / SQL |
| 503 rate limit text | `rate-limit.ts` + Redis | Fail-closed | Redis connectivity |

---

## 6. Reproduce recipe

### Matrix of quick curls

```bash
BASE=http://localhost:4000

# 404 route miss
curl -s -D- "$BASE/api/v1/nope"

# 401 protected
curl -s -D- "$BASE/api/v1/projects"

# 400 validation
curl -s -D- -X POST "$BASE/api/v1/auth/login" \
  -H 'Content-Type: application/json' -d '{"email":"bad","password":"x"}'

# 401 credentials (well-formed body)
curl -s -D- -X POST "$BASE/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"nobody@example.com","password":"wrong-password-here"}'
```

### Two-user 403 vs 404

1. Alice creates project; note project id.  
2. Bob (ACTIVE member of elsewhere, not Alice’s project) `GET /projects/:aliceId` → expect 403 access message.  
3. Bob `GET /projects/:aliceId/tasks/:taskInAliceProject` patterns → expect 403 or IDOR-safe 404 per service rules — compare message, don’t assume.

### 500 correlation

Reproduce once; copy `requestId`; search server logs for stack; open top frame file.

---

## 7. Hypothesis ladder

1. **Body family** — validation / AppError / route miss / generic 500.  
2. **Identity vs policy** — 401 vs 403.  
3. **Missing vs forbidden** — 404 route vs 404 domain vs 403 access.  
4. **Conflict vs bug** — 409 mapped vs 23505 leaked as 500.  
5. **Infra** — 503 limiter before blaming AuthService.  
6. **Unhandled** — 500 only after logs.

---

## 8. Worked failure A — “Bob gets 404 Task not found for a task that exists”

**Signal:** Alice’s task id exists in DB. Bob calls `GET /api/v1/projects/{bobOrWrongProject}/tasks/{aliceTaskId}` or wrong project scope → 404 `Task not found` (+ requestId).

**False lead:** “Delete is broken / task missing from DB.”

**Hypothesis ladder:**

1. Route miss? No — AppError shape with `message`, not `error: Route`.  
2. Authz 403? Message is NotFound, not access Forbidden.  
3. Service scopes task by **projectId + taskId** (and membership) — mismatch → NotFoundError by design (don’t leak existence across projects).

**Root cause:** Wrong project id in URL or IDOR-safe lookup — not a missing row globally.

**Fix (if bug):** Correct client URL / ensure service uses the same project scope consistently. **Don’t** change 404 to 200 for cross-project ids.

**Prove:** Alice same URL → 200; Bob wrong scope → still 404/403 as designed; no task payload leak.

---

## 9. Worked failure B — mini invented: “Login 503 — status playbook says ServiceUnavailable”

**Signal:** 503, message `Rate limiting unavailable. Try again later.`, requestId present (AppError path).

**Classify:** 503 drawer → rate-limit + Redis, not AuthService password logic.

**Confirm:** Redis stopped; `sendCommand` catch throws `ServiceUnavailableError`; errorHandler returns 503 JSON.

**Fix:** Bring Redis up. Re-test login → domain 401/403/200.

**Prove:** With Redis healthy, forced bad credentials still 401 (not 503).

---

## 10. False leads / anti-patterns

| False lead | Reality |
|------------|---------|
| 403 = “DB down” | ForbiddenError domain message |
| 404 task = row deleted | Often wrong project scope |
| 401 = refresh cookie bug on `/projects` | Missing Bearer on authenticate |
| 500 message explains root cause | It never does — logs do |
| 400 validation → rewrite SQL | Zod in controller |
| Treating limiter 503 as AuthService outage | Fail-closed Redis |

---

## 11. Fix + prove checklist

- [ ] Failing status now matches the **intended** contract (not merely “not 500”)  
- [ ] Neighbor statuses still correct (401 without token; 403 unverified; 404 route miss shape)  
- [ ] 500s still generic to clients; stacks only in logs  
- [ ] Mapped SQLSTATE still becomes 409/400 — not raw 500  
- [ ] Re-run the same curl and any status-sensitive tests touched  

---

## 12. Interview Q&A

**Q: 403 vs 404 for task access — when each?**  
**A:** 403 when identity is known but membership/policy denies project access (`You do not have access to this project`, update/delete rules). 404 `Task not found` when the lookup is scoped so a task outside the authorized project context is indistinguishable from missing — reduces IDOR leakage. Route miss 404 uses a different JSON key (`error`).

**Q: Why 503 on login if Redis dies?**  
**A:** Login uses `loginLimiter` with a Redis store. On command failure the store path throws `ServiceUnavailableError("Rate limiting unavailable…")` — **fail-closed**. Skipping limits when Redis is down would allow credential stuffing. Fix Redis; don’t open the gate.

**Q: How do you debug a 500 with only requestId?**  
**A:** Search logs for that id. `errorHandler` logged `logger.error` with message and stack. Open the top application frame (often repository `Couldn't create…` or unmapped driver error). Reproduce with curl; fix mapping or data; confirm client still never receives the stack.

**Q: Why is unverified login 403 not 401?**  
**A:** Password was correct — identity established — but account policy blocks access until email verification. 401 is for missing/wrong credentials or invalid tokens. Clients can show “check your email” vs “wrong password.”

**Q: Validation 400 vs BadRequestError 400 — how to tell?**  
**A:** Validation: `message: "Validation failed"` plus `errors` field map; usually no body `requestId`. BadRequestError: single `message` string + `requestId` via errorHandler. Same status, different producers and first files.

---

## 13. Glossary

| Term | Meaning |
|------|---------|
| **AppError subclass** | Typed HTTP status + message thrown from services/middleware |
| **OCC** | Optimistic concurrency — stale `updatedAt` → 409 reload message |
| **IDOR-safe 404** | Hide cross-tenant existence behind Not Found |
| **Fail-closed** | Prefer deny/unavailable over skipping a security control |
| **Generic 500** | Client-safe message; details only in logs |
| **Rate limit message** | Limiter JSON or ServiceUnavailableError from Redis errors |

---

## 14. Optional further reading

- Signals: [01-read-the-signal.md](./01-read-the-signal.md) · Trace: [03-trace-the-request-path.md](./03-trace-the-request-path.md) · Infra: [05-postgres-and-redis-errors.md](./05-postgres-and-redis-errors.md)  
- Auth: [06-auth-and-token-failures.md](./06-auth-and-token-failures.md) · Authz/IDOR: [07-authz-idor-and-unexpected-403-404.md](./07-authz-idor-and-unexpected-403-404.md)  
- Lessons (optional): [http-status-semantics](../lessons/api/http-status-semantics.md), [idor](../lessons/security/idor.md), [fail-closed-rate-limits](../lessons/security/fail-closed-rate-limits.md)  
- Code: `shared/errors/*.ts`, `errorHandler.ts`, `notFound.ts`, `authenticate.ts`, `rate-limit.ts`, module `*.service.ts`
