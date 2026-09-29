# Lesson: Email enumeration and timing attacks

**Standalone ✓** — You do not need any other doc to reduce account oracle leaks and timing side channels in auth flows.

**After this file you can:** explain enumeration risks, design uniform responses on forgot-password/register, implement constant-work password verification, choose tradeoffs, and debug “attacker learns who registered.”

---

## 1. First principles

**Email enumeration** is when an attacker learns whether an email is registered (or verified) from **different error messages**, **status codes**, or **response timing**.

**Timing attacks** infer the same from **how long** the server takes (e.g. skip password hash when user missing).

**Problem it reduces:** Targeted phishing, credential stuffing lists, and harassment of known users. Perfect hiding is hard; goal is **no easy oracle** on public endpoints.

---

## 2. Mental model

### Analogy

Two doors labeled “wrong password” vs “no account” tell a stalker which houses exist. A single message “could not sign in” and similar wait time at every door removes the hint.

### Diagram

```text
Login request
    │
    ├─ user missing ──► still run argon2.verify(DUMMY_HASH, password)
    │
    └─ user present ──► argon2.verify(realHash, password)
              │
              └──► same error message: "Invalid email or password"
```

---

## 3. Core rules (must / must-not)

1. **MUST** use generic login failure copy for bad email vs bad password.  
2. **MUST** run password verification work even when user absent (dummy hash).  
3. **SHOULD** return uniform success for forgot-password / resend (no “unknown email”).  
4. **MUST NOT** return 404 on login for unknown email while 401 for bad password.  
5. **MUST** balance UX: register may still conflict on duplicate email (product choice).  
6. **MUST NOT** log different events that leak to client (e.g. “user not found” JSON).

---

## 4. How it works (mechanics)

### Login (this repo)

```ts
const user = await this.repo.findByEmail(input.email);
const hashToCheck = user?.hashPassword ?? DUMMY_HASH;
const ok = await argon2.verify(hashToCheck, input.password);
if (!user || !ok) {
  throw new UnauthorizedError("Invalid email or password");
}
```

`DUMMY_HASH` is computed once at module load — always Argon2 work.

### Forgot password / resend

```ts
if (!user || user.status !== "ACTIVE") return;
// no error to client — attacker cannot distinguish
```

Silent return whether or not account exists.

### Register

Duplicate email → `ConflictError("Email already registered")` — **does** leak existence. Many products accept this for UX; document as conscious tradeoff.

### Unverified login

`ForbiddenError("Please verify your email")` — reveals account exists and is inactive. Needed for UX; rate-limit auth writes.

---

## 5. When to use / when not to use

| Uniform / silent response | Explicit error OK |
|---------------------------|-------------------|
| Login failure | Register duplicate (product decision) |
| Forgot password | Admin-only user lookup |
| Resend verification | Internal support tools |

| Timing mitigation | When |
|-------------------|------|
| Dummy hash verify | Public login |
| Fixed delays | High-threat public APIs (rare here) |

---

## 6. Step-by-step: design → implement → verify

1. List auth endpoints and what they reveal.  
2. Unify login errors; add dummy hash path.  
3. Make forgot/resend no-op silently.  
4. Add rate limits on auth writes (`authWriteLimiter`, `loginLimiter`).  
5. Measure p95 login time for missing vs present user (should be close).

---

## 7. Worked example A — this project

### A1. Dummy hash constant

```ts
const DUMMY_HASH = await argon2.hash("dummy-password-for-timing");
```

**Where:** `backend/src/modules/auth/auth.service.ts` (top of module).

### A2. Login branch

See mechanics section — same message for missing user and wrong password.

### A3. Forgot password

```ts
public async forgotPassword(email: string): Promise<void> {
  const user = await this.repo.findByEmail(email);
  if (!user || user.status !== "ACTIVE") return;
  const rawToken = await this.issuePasswordResetToken(user.id);
  // token only logged in non-production
}
```

### A4. Rate limiting auth abuse

```ts
authRouter.post("/login", loginLimiter, ...);
authRouter.post("/forgot-password", authWriteLimiter, ...);
```

**Where:** `backend/src/modules/auth/auth.routes.ts`, limiters in `backend/src/shared/auth/rate-limit.ts`.

---

## 8. Worked example B — mini scenario (self-contained)

**Invite-only SaaS signup**

Return `202 Accepted` with body `{ message: "If eligible, you will receive email" }` for both new and existing emails; only send mail when eligible. Slower to implement but removes register oracle.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Leak |
|--------------|------|
| “Email not found” | Enumeration |
| Skip hash if no user | Timing |
| Different response sizes | Side channel |
| Instant return on forgot for fake emails | Timing |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Faster login for fake emails | Dummy path removed | Login service | Restore `DUMMY_HASH` |
| Users confused on forgot | Expect error when no account | Product copy | Explain privacy in UI |
| Scrapers register emails | Open register conflict | Rate limit + CAPTCHA | Ops controls |

---

## 11. Interview Q&A (with strong answers)

**Q: How do you prevent login enumeration?**  
**A:** Same error message and similar work on every attempt — verify password against real or dummy hash so missing users do not short-circuit.

**Q: Should forgot-password say “email sent”?**  
**A:** Public APIs usually always say “if an account exists, we sent email” without revealing existence.

**Q: Tradeoff on register duplicate?**  
**A:** Explicit conflict helps UX but confirms registered emails; mitigate with rate limits and monitoring.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Enumeration | Discovering valid identifiers |
| Oracle | Any signal that answers attacker’s yes/no question |
| Timing side channel | Infer state from response duration |
| Dummy hash | Precomputed hash for constant-time verify path |
| Credential stuffing | Password reuse attacks using known emails |

---

## 13. Teach pointer

> “Do not tell strangers which emails belong to you — and do not answer faster when they don’t.”

---

## 14. Optional further reading (not required)

- Rate limits when Redis down: [fail-closed-rate-limits](./fail-closed-rate-limits.md)  
- Password hashing: [password-and-token-hashing](./password-and-token-hashing.md)
