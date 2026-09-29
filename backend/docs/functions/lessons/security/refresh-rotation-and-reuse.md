# Lesson: Refresh token rotation and reuse detection

**Standalone ✓** — You do not need any other doc to design session rotation, detect token theft, and implement refresh safely.

**After this file you can:** explain refresh vs access tokens, implement rotate-on-refresh with reuse detection, store hashes transactionally, wire httpOnly cookies, and debug “logged out everywhere” incidents.

---

## 1. First principles

**Access tokens** are short-lived JWTs sent on every API call. **Refresh tokens** are long-lived opaque secrets used only on `/auth/refresh` to mint new access (and usually new refresh) tokens.

If a refresh token is stolen, the thief can keep getting access tokens until expiry or revocation. **Rotation** replaces the refresh token on each use so only one valid chain exists. **Reuse detection:** if an old refresh appears after rotation, assume theft and **revoke all sessions** for that user.

**Problem it removes:** Silent long-term hijack with a single stolen refresh cookie.

---

## 2. Mental model

### Analogy

A theater gives you a **day pass** (access) and a **receipt** (refresh) to print a new pass. Each reprint invalidates the old receipt. If someone tries the old receipt, the box office assumes fraud and cancels all passes for that account.

### Diagram

```text
Login ──► session row (hash R1), cookie R1

Refresh(R1) ──BEGIN──► revoke R1, create R2 ──COMMIT──► cookie R2

Attacker replays R1 after rotation ──► revoked_at set on R1
                                    ──► revokeAllForUser ──► 401
```

---

## 3. Core rules (must / must-not)

1. **MUST** store only **hashes** of refresh tokens.  
2. **MUST** rotate refresh on successful refresh (new random, new row).  
3. **MUST** revoke old session and create new in **one transaction**.  
4. **MUST** on reuse of revoked refresh, revoke **all** user sessions (containment).  
5. **MUST** use httpOnly, path-scoped cookie for browser clients.  
6. **MUST NOT** accept refresh on every API route — dedicated endpoint only.  
7. **MUST** revoke all sessions on password reset/change.

---

## 4. How it works (mechanics)

### Cookie vs mobile body

- Browser: `refreshToken` httpOnly cookie, path `/api/v1/auth`, `sameSite: lax`, `secure` in production.  
- Mobile: header `x-client: mobile` → refresh returned in JSON body (`sendAuthTokens`).

### Rotation steps

1. Hash presented refresh; lookup session by hash.  
2. Reject if missing, expired, or already revoked (reuse path).  
3. Verify user still ACTIVE.  
4. Transaction: revoke current session id; insert new session with new hash.  
5. Return new access JWT + new refresh (cookie or body).

### Access token

Still short JWT; compromise window is minutes, not days.

---

## 5. When to use / when not to use

| Use rotation + reuse detection | Skip rotation |
|-------------------------------|---------------|
| Browser sessions with stolen-cookie risk | Pure SPA with refresh in memory only (still risky) |
| Mobile long-lived sessions | One-time OAuth code exchange only |

| Avoid | Why |
|-------|-----|
| Same refresh forever | Stolen cookie works until expiry |
| Rotate without transaction | Two valid refreshes or zero valid |

---

## 6. Step-by-step: design → implement → verify

1. Table: `sessions(user_id, refresh_token_hash, expires_at, revoked_at)`.  
2. Issue on login; hash at rest.  
3. Refresh endpoint reads cookie/body.  
4. Implement rotation in transaction.  
5. On `revokedAt` hit, call `revokeAllForUser`.  
6. Test: double refresh with same token → second fails; user logged out globally on reuse attack simulation.

---

## 7. Worked example A — this project

### A1. Cookie settings

```ts
res.cookie(COOKIE_NAME, rawRefresh, {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: "lax",
  path: "/api/v1/auth",
  maxAge: parseDurationToMs(env.refreshExpiresIn),
});
```

**Where:** `backend/src/shared/auth/refresh-cookie.ts` — `setRefreshCookie`.

### A2. Reuse detection

```ts
if (session.revokedAt) {
  await this.sessionRepo.revokeAllForUser(session.userId);
  throw new UnauthorizedError("Invalid refresh token");
}
```

**Where:** `backend/src/modules/auth/auth.service.ts` — `refresh`.

### A3. Rotation transaction

```ts
await this.sql.begin(async (tx) => {
  const revoked = await this.sessionRepo.revoke(session.id, tx);
  if (!revoked) {
    throw new UnauthorizedError("Invalid refresh token");
  }
  await this.sessionRepo.createSession(
    { userId: user.id, tokenHash, expiresAt },
    tx,
  );
});
```

**Why:** Prevents two active refresh hashes or orphan revoke without replacement.

### A4. Production cookie guard

```ts
if (parsed.NODE_ENV === "production" && !parsed.COOKIE_SECURE) {
  throw new Error("COOKIE_SECURE must be true when NODE_ENV=production");
}
```

**Where:** `backend/src/config/env.ts`.

---

## 8. Worked example B — mini scenario (self-contained)

**Family plan:** max 5 devices.

On refresh, rotate hash; maintain `device_id` column. On 6th login, reject or drop oldest. Reuse of revoked hash → revoke all devices for account (same containment idea).

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Outcome |
|--------------|---------|
| Refresh in localStorage | XSS steals long-lived token |
| No revoke on password change | Old sessions survive |
| Logout only clears client cookie | Server session still valid |
| Parallel refresh without conditional revoke | Race creates two valid chains |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Random full logout | Reuse detection fired | Two tabs refreshing | Expected; educate or serialize refresh |
| Refresh 401 always | Cookie path/domain | Browser devtools Application tab | Path `/api/v1/auth` |
| Mobile no refresh | Missing `x-client: mobile` | Response body | `wantsRefreshInBody` |
| Two sessions after refresh | Non-transactional rotate | `refresh` method | Use `sql.begin` |

---

## 11. Interview Q&A (with strong answers)

**Q: Why rotate refresh tokens?**  
**A:** Limits validity of a stolen refresh to one window and enables detecting reuse when the legitimate client and attacker both present tokens.

**Q: What do you do on reuse?**  
**A:** Treat as compromise signal: revoke all refresh sessions for the user and force re-login.

**Q: Why httpOnly cookie?**  
**A:** JavaScript cannot read it, reducing XSS impact on refresh (access JWT may still be in memory).

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Rotation | Replace refresh token on each refresh |
| Reuse | Presenting a refresh after it was rotated/revoked |
| Session row | Server-side record of a refresh hash |
| httpOnly | Cookie flag blocking JS access |
| Opaque token | Non-JWT bearer secret |

---

## 13. Teach pointer

> “One live refresh chain per session family. An old receipt is a fire alarm.”

---

## 14. Optional further reading (not required)

- Hashing: [password-and-token-hashing](./password-and-token-hashing.md)  
- Cookies/XSS: [cookies-xss-csrf](./cookies-xss-csrf.md)
