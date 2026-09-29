# Auth module — every function, thinking, and interview bank

Covers `modules/auth/**`: routes → controller → service → repositories → schemas → types.

**Core product problem:** Prove who someone is, keep sessions revocable, verify email, reset passwords — without leaking accounts, without timing oracles, without reusable stolen refresh tokens.

---

## Architecture map

```
auth.routes.ts  (wiring + rate limits + authenticate)
    → AuthController  (Zod validate, HTTP status, cookies)
        → AuthService  (rules, argon2, token issuance, transactions)
            → AuthRepository / SessionRepository /
              EmailVerificationRepository / PasswordResetRepository
```

**Developer thinking:** Identity is a **domain**. Controllers stay boring. Repositories never decide policy like “must be ACTIVE to login.”

---

# `auth.routes.ts`

## Module wiring (repos → service → controller)

1. **What:** Constructs SQL-backed repos, `AuthService`, `AuthController`, mounts routes.  
2. **Problem:** Composition root for auth DI without a heavy container.  
3. **Interview:** Manual DI vs NestJS-style; testability by swapping repos; why create instances once at import.

## Routes (each)

| Route | Middleware | Controller |
|-------|------------|------------|
| `POST /register` | — | `register` |
| `POST /login` | `loginLimiter` | `login` |
| `GET /me` | `authenticate` | inline `res.json({ user: req.user })` |
| `POST /refresh` | — | `refresh` |
| `POST /logout` | — | `logout` |
| `GET /verify-email` | — | `verifyEmail` |
| `POST /resend-verification` | `authWriteLimiter` | `resendVerification` |
| `POST /change-password` | `authenticate` | `changePassword` |
| `POST /forgot-password` | `authWriteLimiter` | `forgotPassword` |
| `POST /reset-password` | — | `resetPassword` |

**Interview bank for routes file:**

- Why rate-limit login and resend/forgot but not refresh? (Refresh already requires secret token; still discuss abuse.)  
- Why is `/me` so thin?  
- Why verify-email is GET with query token (email link UX) vs POST?  
- CSRF implications of cookie-based refresh on POST `/refresh`.  
- Should logout require authenticate?

---

# Schemas (`auth.schema.ts`)

Treat schemas as first-class design: they are the **public input contract**.

## `registerSchema`

1. **What:** `name` trim min 3; `email` email + trim + lowercase; `password` min 8 max 72.  
2. **Problem:** Reject garbage early; normalize email so `A@x` and `a@x` collide correctly.  
3. **Why max 72:** Argon2/bcrypt historical truncation concerns; keep explicit bound.  
4. **Interview:** Why lowercase emails; Unicode emails; password complexity vs length; trim on password? (Usually **don’t** trim passwords.)

## `loginSchema`

1. **What:** email normalized; password min 1 (don’t teach attackers your min length on login).  
2. **Interview:** Why login password rules looser than register.

## `verifyEmailSchema` / `resendVerificationSchema` / `forgotPasswordSchema` / `resetPasswordSchema` / `changePasswordSchema`

1. **What:** Token/email/password field rules for each flow.  
2. **Interview:** Why token `min(1)` not format regex; why change password requires current + new; max 72 again.

## Exported types `RegisterInput`, `LoginInput`, `ChangePasswordInput`

1. **What:** `z.infer` types shared into service.  
2. **Interview:** Single source of truth for types vs duplicating interfaces.

---

# Types (`auth.types.ts`)

## `PublicUser`

1. **What:** Safe user fields returned to clients (no password hash).  
2. **Problem:** Accidental hash leak if you return DB row.  
3. **Interview:** DTO vs entity; why include `role`/`status`.

## `UserAuthRow`

1. **What:** Internal row including `hashPassword`.  
2. **Problem:** Login/change-password need hash without exposing it on `PublicUser`.  
3. **Interview:** Naming `hashPassword` vs `passwordHash` consistency.

## `CreateUserInput`, `CreateVerificationTokenInput`, `VerificationTokenRecord`, `CreateSessionInput`, `SessionRecord`, `CreateOpaqueTokenInput`, `RegisterResult`

1. **What:** Typed boundaries between service and repos.  
2. **Interview:** Why store `tokenHash` not raw token; why `usedAt`/`revokedAt` nullable timestamps.

---

# `AuthController`

Pattern for every method: `safeParse` → 400 with fieldErrors → service → status JSON → `catch next(err)`.

**Teach pointer:** “Controller is a translator between HTTP and domain.”

### Shared interview bank (every controller method)

- Why `safeParse` not `parse` (throw)?  
- Why flatten fieldErrors for clients?  
- Why `next(err)` instead of try/catch logging here?  
- Duplicate `if (!req.user)` when route already has `authenticate` — defense in depth or redundancy?

## `register`

1. **What:** Validates body; `201` + `{ user }` (no tokens until verified/login).  
2. **Problem:** Create account without auto-login of unverified user.  
3. **Interview:** Why 201; do we return verification token? (Only console in non-prod.) Email enumeration on register (ConflictError).

## `login`

1. **What:** Validates; service login; `sendAuthTokens`.  
2. **Interview:** Cookie vs body refresh; status 200 vs 201.

## `verifyEmail`

1. **What:** Token from **query**; service verify; success message.  
2. **Interview:** GET side effects; token in Referer logs; prefer one-time POST from SPA?

## `resendVerification` / `forgotPassword`

1. **What:** Always generic success message after service (service no-ops silently).  
2. **Problem:** Prevent email enumeration.  
3. **Interview:** Timing differences still leak? Rate limit importance.

## `refresh`

1. **What:** Read refresh; 401 if missing; rotate via service; send tokens.  
2. **Interview:** Missing cookie vs invalid cookie messages.

## `logout`

1. **What:** Revoke if token present; always clear cookie; 200 logged out.  
2. **Problem:** Idempotent logout UX even without cookie.  
3. **Interview:** Should missing token be 401?

## `changePassword`

1. **What:** Requires user; validate; service; clear refresh cookie; tell client to log in again.  
2. **Interview:** Why clear cookie even though service revokes all sessions; typo message `"Validate failed"`.

## `resetPassword`

1. **What:** Token + new password; service; clear cookie.  
2. **Interview:** Clear cookie for which browser context?

---

# `AuthService`

## Module-level `DUMMY_HASH`

1. **What:** Precomputed argon2 hash of a dummy password.  
2. **Problem:** When email not found, still run `argon2.verify` so response time ≈ real user (mitigate user-enumeration via timing).  
3. **Interview bank:**  
   - Timing attacks on auth.  
   - Is dummy hash enough?  
   - Constant-time string compare relevance for tokens (use hashes + DB).  
   - Top-level await for hash init.

## Constructor

1. **What:** Injects `sql`, user repo, verification, sessions, password reset.  
2. **Interview:** Why pass `sql` if repos already have it? (Transactions via `sql.begin` + passing `tx` into repos.)

## `findByEmail` (private)

1. **What:** If email exists → `ConflictError`.  
2. **Problem:** Early unique check before hash work (still race — see 23505 handler).  
3. **Interview:** TOCTOU with unique constraint; why both.

## `hashToken` (private)

1. **What:** SHA-256 hex of raw token.  
2. **Problem:** DB breach shouldn’t yield usable refresh/verify/reset tokens.  
3. **Interview:** Why SHA-256 not argon2 for random high-entropy tokens; pepper; HMAC.

## `issueVerificationToken` / `issuePasswordResetToken` (private)

1. **What:** Invalidate old tokens; `randomBytes(32)` base64url raw; store hash + expiry (1h); return **raw** once.  
2. **Problem:** Only user (or logs in dev) ever sees raw; DB has hash.  
3. **Interview:** Entropy bits; base64url vs hex; invalidate-on-reissue; email delivery missing in prod (current gap — interview gold).

## `register`

1. **What:** Unique email check; argon2 hash; transaction create user INACTIVE + verification token; log token non-prod; map unique violation 23505 → Conflict.  
2. **Problem:** Atomic user+token; concurrent duplicate emails.  
3. **Interview:** Why status INACTIVE until verify; transaction boundaries; returning PublicUser without token.

## `login`

1. **What:** Find user; verify password against real or dummy hash; unified invalid message; require ACTIVE; sign access JWT; create opaque refresh session (hashed); return user+tokens.  
4. **Why this shape:** Short-lived access + revocable refresh.  
5. **Interview bank:**  
   - Why same error for bad email and bad password.  
   - Forbidden vs Unauthorized for unverified.  
   - Session fixation.  
   - Device/session listing future.  
   - Where refresh raw is stored client-side.

## `verifyEmail`

1. **What:** Hash token; load; reject used/expired; transaction mark used + activate user; markUsed returns false → invalid (race).  
2. **Interview:** Idempotent second click; bind token to email; activate vs just set `email_verified_at`.

## `resendVerification`

1. **What:** No-op if missing or ACTIVE; else new token + console.log.  
2. **Interview:** Enumeration; prod email; shouldn’t log tokens in staging.

## `refresh` (rotation + reuse detection)

1. **What:** Hash; find session; reject expired; **if already revoked → revoke ALL user sessions** then 401; load ACTIVE user; transaction: revoke current (must succeed) + create new; new access JWT.  
2. **Problem:** Stolen refresh reuse should kill the family of sessions (theft detection).  
3. **Why revoke-all on reuse:** Attacker and victim both lose; forces re-login (secure default).  
4. **Interview bank (senior favorite):**  
   - Refresh token rotation explained.  
   - Reuse detection design.  
   - Race: two parallel refresh (see concurrency test — at most one 200).  
   - Why revoke must be conditional (`revoked_at IS NULL`).  
   - Sliding expiration.

## `logout`

1. **What:** Revoke matching session if active.  
2. **Interview:** Access JWT still valid until expiry — acceptable?

## `changePassword`

1. **What:** Timing-safe verify current; reject same new password; hash new; update; **revokeAllForUser**.  
2. **Problem:** Password change must invalidate stolen refresh tokens.  
3. **Interview:** Why not rotate access in response; step-up auth.

## `forgotPassword`

1. **What:** No-op unless ACTIVE user; issue reset token; log non-prod.  
2. **Interview:** Enumeration; inactive users; email bombing (rate limit).

## `resetPassword`

1. **What:** Validate token; hash password; transaction mark used + update password + revoke all sessions.  
2. **Interview:** One-time tokens; concurrent reset; login after reset UX.

---

# `AuthRepository`

## `createUser`

1. **What:** Insert USER/INACTIVE with hash; return PublicUser.  
2. **Interview:** Default role/status in SQL vs app; RETURNING; throw if no row.

## `findByEmail` / `findById` / `findAuthById`

1. **What:** Select with/without hash.  
2. **Interview:** Why two find-by-id variants; index on email; case sensitivity (app lowercases).

## `markEmailVerified`

1. **What:** Set `email_verified_at` + status ACTIVE.  
2. **Interview:** Partial unique indexes; already-active updates.

## `updatePassword`

1. **What:** Set hash + `updated_at`.  
2. **Interview:** Passing `db` for transactional reset.

---

# `SessionRepository`

## `createSession` / `findByTokenHash` / `revoke` / `revokeAllForUser`

1. **What:** Persist refresh hash; lookup; soft-revoke one or all.  
2. **Interview:** Soft revoke vs delete; indexing `refresh_token_hash`; cleanup job for expired rows; `revoke` boolean for optimistic concurrency on rotation.

---

# `EmailVerificationRepository` / `PasswordResetRepository`

Nearly twin APIs: `createToken`, `findTokenByHash`, `markTokenUsed`, `invalidateUserTokens`.

1. **What:** Opaque token lifecycle tables.  
2. **Why separate tables:** Different product semantics, expiry, audit, future rate policies.  
3. **Interview:** Schema duplication vs generic `opaque_tokens` table; `markTokenUsed` conditional update; invalidate = mark used.

---

# File-level interview set — auth

### Junior
- Register → verify → login sequence.  
- Why hash passwords? Why argon2?  
- What is JWT? What’s inside ours?  
- What does `/me` return?

### Mid
- Access vs refresh; cookie flags.  
- Email enumeration defenses in this codebase.  
- Why store token hashes.  
- Transaction in register/verify/reset.  
- 23505 handling.

### Senior
- Refresh reuse detection end-to-end.  
- Parallel refresh race.  
- Threat model: XSS steals access token vs refresh cookie.  
- What you’d add for production email (queue, templates, bounce).  
- Session revocation UX across devices.  
- Password reset token in URL logs/proxies.

### Testing tie-ins
- `auth.api.test.ts` — happy path + unauthenticated projects.  
- `concurrency.test.ts` — duplicate register; parallel refresh.  
- `failures.test.ts` — bad JWT message safety.

---

# Teach script (auth)

1. Draw two tokens: short JWT vs long opaque refresh.  
2. Show DB columns: `hash_password`, `refresh_token_hash`, `token_hash`.  
3. Act out stolen refresh reuse → revoke all.  
4. Ask learner to explain dummy hash on login without looking.
