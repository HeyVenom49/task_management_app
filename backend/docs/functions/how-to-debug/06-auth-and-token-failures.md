# 06 — Auth and token failures

**Standalone ✓** — You do not need auth.md or other how-to-debug guides to hunt login / JWT / refresh / cookie / verify / reset failures in this backend.

**After this file you can:** map an auth symptom to the exact function, run cookie/JWT/session checklists, reproduce common failures, avoid false leads, and explain the fix in interview language.

---

## 1. Why this habit exists

Auth bugs feel “everywhere” (middleware, cookies, Redis, SQL, argon2). Juniors open `auth.routes.ts` and scroll. Seniors read the **status + message + channel** (Bearer vs cookie vs body) and open **one** function.

Wrong first open costs hours. Right first open costs minutes.

---

## 2. Mental model

### Analogy

Auth is a **checkpoint chain**. Each gate has a different failure shape:

```text
Client
  → rate limit (Redis)           → 503 if store down / 429-style message if over max
  → controller Zod               → 400 Validation failed
  → service domain rules         → 401 / 403 / 409 / 400 AppError message
  → JWT middleware (protected)   → 401 Unauthorized
  → cookie/body refresh extract  → 401 missing/invalid refresh
```

### Neighborhood → house → room

| Signal neighborhood | House (file) | Room (function) |
|---------------------|--------------|-----------------|
| Register/login/verify/refresh messages | `auth.service.ts` | named method |
| Validation failed on auth URL | `auth.controller.ts` + `auth.schema.ts` | that handler |
| `/me` or Bearer 401 | `authenticate.ts` + `token.ts` | `verifyAccessToken` |
| Refresh cookie missing | `refresh-cookie.ts` + CORS in `app.ts` | `readRefreshToken` / `setRefreshCookie` |
| Login 503 rate limit | `rate-limit.ts` + Redis | `loginLimiter` |

---

## 3. Core rules (must / must-not)

1. **MUST** record: method, URL, status, body.message, whether Authorization header / cookie / body refresh was sent, `X-Client` if any, `requestId`.  
2. **MUST** distinguish **401** (who are you?) from **403** (we know you; not allowed — e.g. unverified email on login).  
3. **MUST** check token **channel** before doubting crypto: cookie path/Secure/SameSite vs body + `X-Client: mobile`.  
4. **MUST** remember access JWT is **stateless** — logout does not kill access until expiry; only refresh/session rows revoke.  
5. **MUST NOT** treat “forgot password always says sent” as a mailer 500 — enumeration-safe by design.  
6. **MUST NOT** start in the repository when the message is clearly Zod validation.  
7. **MUST NOT** expect refresh to work on non-`/api/v1/auth*` paths — cookie `path` is scoped.

---

## 4. Signal taxonomy (this app)

### AppError JSON

```json
{ "message": "Invalid email or password", "requestId": "…" }
```

Status comes from the error class (`UnauthorizedError` → 401, `ForbiddenError` → 403, …).

### Validation (controller)

```json
{ "message": "Validation failed", "errors": { "email": ["…"] } }
```

### Rate limit / Redis down

Message like `Too many login attempts…` or `Rate limiting unavailable. Try again later.` with **503** when Redis commands fail (fail-closed).

### Non-prod verify token

On register / resend, server may `console.log` the raw verify token — not an HTTP error if “email didn’t arrive” in local dev.

---

## 5. Symptom → first open

| Symptom | First open | Why | If wrong, next |
|---------|------------|-----|----------------|
| Register 400 validation | `auth.controller` `register` + `registerSchema` | Zod failed before service | Check Content-Type / body shape |
| Register 409 email taken | `AuthService.register` (`23505` → ConflictError) | Unique email race or duplicate | DB constraint / concurrent test |
| Register OK, login 403 verify email | `AuthService.login` status check; verify flow | User `INACTIVE` until verify | `verifyEmail`, token hash/expiry |
| Login 401 invalid email/password | `AuthService.login` | Dummy hash path for unknown email | Argon2 verify; email casing/normalization |
| Login 503 | `loginLimiter` in `rate-limit.ts` | Redis fail-closed or too many tries | Redis connectivity; wait window |
| `/me` or protected route 401 | `authenticate` + `verifyAccessToken` | Missing/bad/expired Bearer | `JWT_SECRET`, clock, payload `sub` |
| Refresh 401 | `AuthService.refresh` + `readRefreshToken` | No token, expired, revoked, reuse | Cookie attrs; session row |
| Refresh OK in mobile test, fails in browser | `sendAuthTokens` / `wantsRefreshInBody` | Browser expects cookie only | `X-Client: mobile` vs cookie |
| Logout then refresh still works | `AuthService.logout` + session revoke | Logout didn’t see cookie/body | Same channel as login |
| Logout then **access** still works | *(expected)* | JWT not in denylist | Wait expiry or accept design |
| Change password; old refresh works | `changePassword` → `revokeAllForUser` | Revoke-all missing/failed | Session table rows |
| Verify link invalid | `verifyEmail` + verification repo | Hash mismatch, used, expired | Conditional `markTokenUsed` race |
| Forgot always “sent”, no mail | `forgotPassword` / resend style | Enumeration-safe early return | Non-prod console token; mailer not wired |
| Reset invalid | `resetPassword` + reset repo | Same as verify: hash/used/expiry | Tx mark used + password update |

---

## 6. Reproduce recipes

### Login 401 (unknown user vs bad password)

```bash
curl -s -D- -X POST "$BASE/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"nobody@example.com","password":"wrong"}'
```

Expect 401 + same message shape as wrong password for a real user (timing padded with `DUMMY_HASH`).

### Login 403 unverified

Register → do **not** verify → login with correct password → 403 `Please verify your email`.

### Refresh cookie path

1. Login from browser against API origin with credentials.  
2. DevTools → cookie `refreshToken` → confirm `Path=/api/v1/auth`, `HttpOnly`, `Secure` matches HTTPS.  
3. `POST /api/v1/auth/refresh` with credentials.  
4. Call refresh from a path outside `/api/v1/auth` → cookie **won’t send**.

### Mobile body refresh

```bash
curl -s -X POST "$BASE/api/v1/auth/login" \
  -H 'Content-Type: application/json' -H 'X-Client: mobile' \
  -d '{"email":"…","password":"…"}'
# response JSON includes refreshToken
curl -s -X POST "$BASE/api/v1/auth/refresh" \
  -H 'Content-Type: application/json' -H 'X-Client: mobile' \
  -d "{\"refreshToken\":\"$RT\"}"
```

### Reuse / parallel refresh

Capture refresh RT0 → refresh once get RT1 → replay RT0 → expect 401 and **all** sessions revoked for that user.

---

## 7. Hypothesis ladder

Ordered: kill early hypotheses with one check each.

1. **Wrong channel** — Was refresh in cookie, body, or neither? (`readRefreshToken` = cookie **or** body).  
2. **Cookie attributes** — Path / Secure / SameSite / cleared with different attrs.  
3. **User status** — `INACTIVE` → 403 on login, 401 on refresh.  
4. **Session row** — expired / revoked / hash mismatch (raw vs hashed at rest).  
5. **Reuse path** — `revokedAt` set → revoke-all.  
6. **JWT** — secret mismatch across processes; expired access; missing `Bearer`.  
7. **Rate limit** — 503 vs “too many attempts.”  
8. **Validation** — never hit service.

---

## 8. Worked failure A — “Refresh works in Postman, not in SPA”

**Signal:** Postman POST `/auth/refresh` with JSON body → 200. Browser SPA → 401 `Invalid refresh token`.

**Reproduce:** Login in browser; Application tab shows `refreshToken` cookie; SPA calls refresh **without** `credentials: 'include'` or hits API on another site without CORS credentials.

**Hypothesis ladder:**

1. Channel — SPA never sends cookie → `readRefreshToken` undefined → 401.  
2. CORS — `credentials: true` + exact `FRONTEND_URL` required for cookie cross-origin.  
3. Secure — HTTPS page vs `COOKIE_SECURE=true` on HTTP localhost.

**Root cause (typical):** fetch omitted `credentials: 'include'`, or frontend origin not in CORS allowlist.

**Fix:** SPA: `credentials: 'include'` on auth calls; API: CORS origin exact match; local: align `COOKIE_SECURE` with how you serve HTTP/HTTPS.

**Prove:** DevTools Network → refresh request shows `Cookie: refreshToken=…`; response 200; new Set-Cookie rotates token.

**Critical code:**

```ts
export function readRefreshToken(req): string | undefined {
  return req.cookies?.refreshToken ?? req.body?.refreshToken;
}
// Cookie set with path: "/api/v1/auth", httpOnly, secure: env.cookieSecure, sameSite: "lax"
```

---

## 9. Worked failure B — mini invented: “I logged out but API still accepts my token”

**Signal:** Client calls logout → 204/200; immediately `GET /me` with same `Authorization: Bearer` → **200**.

**False lead:** “Logout is broken / session revoke failed.”

**Actual design:** Logout revokes the **refresh session row** (and clears cookie). Access JWT remains valid until `exp`. Stateless access tokens are not deleted server-side.

**Confirm:** Decode JWT exp; wait or use old refresh → refresh 401; access may still work until exp.

**If product needs instant kill:** need short access TTL + refresh, or a denylist/version field on user checked in `authenticate` (not in this app today) — teach as tradeoff, don’t “fix” logout to parse JWT.

**Prove refresh side:** after logout, `POST /refresh` with old cookie/body → 401; session `revokedAt` set.

---

## 10. Checklists (keep these)

### Cookie checklist

1. Name: `refreshToken`  
2. `path: /api/v1/auth` — only auth routes receive it  
3. `httpOnly: true` — not readable from JS (XSS-resistant storage)  
4. `secure` ↔ `COOKIE_SECURE` / HTTPS  
5. `sameSite: lax` — cross-site POST quirks  
6. `clearRefreshToken` must use **same** path/secure/sameSite or browser keeps cookie  
7. CORS `credentials: true` + explicit origin (not `*`)

### JWT checklist

1. Same `JWT_SECRET` on every instance  
2. Header `Authorization: Bearer <token>`  
3. Payload includes string `sub` + `email` as signed  
4. Failures become Unauthorized — no algorithm/stack leak to client  

### Session / reuse checklist

1. Store **hash** of refresh, never raw  
2. Refresh: if `revokedAt` → `revokeAllForUser` + 401  
3. Happy path: tx revokes old + inserts new  
4. Parallel refresh: one 200, one 401 — expected  
5. Password change / reset → `revokeAllForUser`

### Timing / enumeration checklist

1. Login unknown email still runs `argon2.verify` against `DUMMY_HASH`  
2. Forgot/resend: generic success even if user missing or already active  
3. Don’t “fix” missing mail by returning 404 for unknown email  

---

## 11. False leads / anti-patterns

| False lead | Reality |
|------------|---------|
| “Postgres is down” on login 401 | Auth message is domain 401 |
| Digging into task repos for `/me` 401 | `authenticate` only |
| “Email broken” because forgot always succeeds | By design |
| “Logout bug” because access still works | JWT TTL |
| Rewriting argon2 params first | Check ACTIVE status / wrong password first |
| Disabling rate limit in prod to clear 503 | Fix Redis; keep fail-closed |

---

## 12. Fix + prove checklist

After a change:

- [ ] Same curl/test that failed now returns expected status  
- [ ] Opposite channel still works (cookie **and** mobile body if you touched `sendAuthTokens`)  
- [ ] Reuse test: old refresh after rotate → 401 + sessions cleared  
- [ ] Unverified user still 403 on login  
- [ ] Logs: no raw refresh or password; `requestId` present on AppError  

Relevant tests to re-run (names may vary): auth login/verify/refresh/reuse, cookie helpers, rate-limit fail-closed if touched.

---

## 13. Interview Q&A

**Q: Why can’t you immediately invalidate an access JWT on logout?**  
**A:** Access tokens here are signed JWTs checked locally — no server session lookup on each request. Logout clears refresh cookie/session so *new* access tokens can’t be minted. Old access works until `exp`. Mitigations: short TTL, refresh rotation, optional server-side version/denylist if instant revoke is required.

**Q: How do you debug a missing refresh cookie?**  
**A:** Confirm Set-Cookie on login (path, Secure, SameSite, HttpOnly). Confirm next request is under `/api/v1/auth` with credentials. Confirm clearCookie used identical attributes. Confirm CORS credentialed origin. Then read `readRefreshToken` — body fallback only helps if client sends JSON refresh (mobile header path).

**Q: What does refresh reuse detection do?**  
**A:** If a refresh session row is already revoked and presented again, assume theft or replay: revoke **all** sessions for that user and return 401. Normal rotation revokes the prior row once inside a transaction when issuing the next refresh.

**Q: Login returns 403 not 401 for unverified email — why?**  
**A:** Credentials were correct (authenticated identity), but account policy forbids access until verification — authorization/state gate. 401 is reserved for missing/wrong credentials or invalid tokens. That split helps clients show “check your email” vs “wrong password.”

**Q: Redis is down and login returns 503. Is that a bug?**  
**A:** No — fail-closed rate limiting. Skipping limits when Redis dies would enable credential stuffing. Fix Redis (or controlled degrade only with an explicit product/security decision).

**Q: Why hash refresh tokens at rest?**  
**A:** DB leak of session rows must not yield usable refresh tokens. Only the client holds the raw token; server stores a one-way hash and compares hashes on refresh.

---

## 14. Glossary

| Term | Meaning |
|------|---------|
| **Access token** | Short-lived JWT in `Authorization` header |
| **Refresh token** | Long-lived opaque secret; cookie and/or JSON body |
| **Rotation** | On each refresh, revoke old session, issue new raw refresh |
| **Reuse detection** | Presenting a revoked refresh → revoke all sessions |
| **DUMMY_HASH** | Precomputed argon2 hash to equalize timing when user missing |
| **Fail-closed limiter** | Redis errors → 503, do not skip limit |
| **Cookie path** | Browser only attaches cookie to matching URL path prefix |
| **`X-Client: mobile`** | App signal to also return refresh in JSON body |

---

## 15. Optional further reading

- Decision tree: [README.md](./README.md) · Prev signals: [01-read-the-signal.md](./01-read-the-signal.md), [04-status-code-playbook.md](./04-status-code-playbook.md)  
- Next if identity works but access doesn’t: [07-authz-idor-and-unexpected-403-404.md](./07-authz-idor-and-unexpected-403-404.md) · Races: [08-concurrency-and-flaky-failures.md](./08-concurrency-and-flaky-failures.md) · Redis: [05-postgres-and-redis-errors.md](./05-postgres-and-redis-errors.md)  
- Lessons (optional): [refresh-rotation-and-reuse](../lessons/security/refresh-rotation-and-reuse.md), [cookies-xss-csrf](../lessons/security/cookies-xss-csrf.md), [email-enumeration-and-timing](../lessons/security/email-enumeration-and-timing.md), [password-and-token-hashing](../lessons/security/password-and-token-hashing.md), [fail-closed-rate-limits](../lessons/security/fail-closed-rate-limits.md)  
- Code: `auth.service.ts`, `auth.controller.ts`, `refresh-cookie.ts`, `rate-limit.ts`, `authenticate.ts`, `token.ts`

---

## Teach pointer

> “Auth bugs are almost always: wrong user status, wrong token channel (cookie vs body), or session row state — not ‘Express is broken.’”
