# Lesson: Multi-factor authentication (MFA)

**Standalone ✓** — You do not need any other doc to explain MFA factors, threat reduction, and how you would add MFA to a JWT + password app like this one.

**After this file you can:** describe factors (something you know/have/are), compare TOTP/WebAuthn, place MFA in login flow, handle recovery codes, and interview on MFA bypass risks.

---

## 1. First principles

**MFA** requires **two or more independent factors** to prove identity. Password alone is **single-factor** (something you know).

MFA mitigates **stolen passwords** and **credential stuffing** — not XSS on an already-logged-in session or malicious insiders with full access.

**This app** currently: email/password + email verification + JWT/refresh. **No MFA yet** — lesson covers design to add it without reading other docs.

---

## 2. Mental model

### Analogy

ATM: card (have) + PIN (know). Stealing one factor is not enough.

### Diagram (target flow)

```text
POST /login (password OK)
    │
    ▼
MFA required? ──no──► issue tokens (today)
    │
   yes
    ▼
Return mfa_token (short-lived) ──► POST /mfa/verify (TOTP)
    │
    ▼
Issue access + refresh (same as today)
```

---

## 3. Core rules (must / must-not)

1. **MUST** verify second factor **server-side**.  
2. **MUST NOT** accept MFA code only in client JS without backend check.  
3. **MUST** rate-limit MFA attempts (`loginLimiter` pattern).  
4. **MUST** provide recovery codes (hashed at rest) or support path.  
5. **MUST NOT** bypass MFA with “remember this device” without secure device binding.  
6. **SHOULD** prefer WebAuthn/phishing-resistant factors for high-risk apps.

---

## 4. How it works (mechanics)

### Common factors

| Factor | Example |
|--------|---------|
| Know | Password, recovery code |
| Have | TOTP app, SMS (weaker), WebAuthn key |
| Are | Biometrics (usually local to device) |

### TOTP

Shared secret enrolled once; 6-digit codes rotate every 30s; verify window ±1 step for clock skew.

### With this stack

After password verify in `AuthService.login`, branch:

- If `user.mfaEnabled`, return `{ mfaRequired: true, mfaToken }` instead of access JWT.  
- `mfaToken` is short-lived signed JWT or random session row (hashed).  
- Successful TOTP → same token issuance as current login (`signAccessToken`, session create).

Reuse: `hashToken`, rate limiters in `backend/src/shared/auth/rate-limit.ts`.

---

## 5. When to use / when not to use

| Require MFA | Optional MFA |
|-------------|--------------|
| Admin, billing | Low-risk read-only apps |
| Regulated data | Internal prototypes |

| WebAuthn | SMS OTP |
|----------|---------|
| Phishing-resistant | SIM swap risk |

---

## 6. Step-by-step: design → implement → verify

1. Add `user_mfa_secrets` (encrypted secret or WebAuthn credentials table).  
2. Enrollment endpoint (authenticated).  
3. Change `login` to two-step when enabled.  
4. Lockout after N failures.  
5. Test: password alone insufficient; TOTP wrong → 401.

---

## 7. Worked example A — this project (current auth hook)

Password verification today:

```ts
const ok = await argon2.verify(hashToCheck, input.password);
if (!user || !ok) {
  throw new UnauthorizedError("Invalid email or password");
}
if (user.status !== "ACTIVE") {
  throw new ForbiddenError("Please verify your email");
}
// then signAccessToken + createSession
```

**Where:** `backend/src/modules/auth/auth.service.ts` — `login`.

**MFA insertion point:** between ACTIVE check and `signAccessToken`.

Protected routes already use:

```ts
authRouter.get("/me", authenticate, ...);
```

**Where:** `backend/src/modules/auth/auth.routes.ts`.

---

## 8. Worked example B — mini scenario (self-contained)

```ts
import { authenticator } from "otplib";

function verifyTotp(secret: string, code: string): boolean {
  return authenticator.verify({ token: code, secret });
}
```

Store secret encrypted with KMS; never return secret after enroll.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Risk |
|--------------|------|
| MFA only in UI | API login skips |
| SMS as only factor | SIM swap |
| Email OTP as “second factor” same channel | Mailbox = both factors |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Valid TOTP fails | Clock skew | Server NTP | Widen window slightly |
| Locked out | Brute force | Rate limit | Backoff |
| Bypass via refresh | Old session | Revoke on MFA enroll | revokeAllForUser |

---

## 11. Interview Q&A (with strong answers)

**Q: What does MFA add?**  
**A:** Requires compromise of two independent factor types, greatly reducing password-only attacks.

**Q: Best factor for web apps today?**  
**A:** WebAuthn/FIDO2 where possible; TOTP as common second step; avoid SMS for high security.

**Q: Where in login flow?**  
**A:** After primary password verification, before issuing long-lived refresh/session.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| MFA | Multi-factor authentication |
| TOTP | Time-based one-time password |
| WebAuthn | Public-key authenticator standard |
| Recovery code | One-time backup factor |
| Phishing-resistant | Hard to relay (WebAuthn) |

---

## 13. Teach pointer

> “One stolen password should not equal one stolen account.”

---

## 14. Optional further reading (not required)

- Password hashing: [password-and-token-hashing](./password-and-token-hashing.md)  
- OAuth (social login): [oauth2-oidc](./oauth2-oidc.md)
