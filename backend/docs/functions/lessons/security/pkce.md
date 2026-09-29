# Lesson: PKCE (Proof Key for Code Exchange)

**Standalone ✓** — You do not need any other doc to implement OAuth authorization code safely for SPAs and mobile apps without a client secret.

**After this file you can:** explain code interception attack, generate verifier/challenge, wire PKCE into OAuth login, and interview on why PKCE replaces implicit flow.

---

## 1. First principles

**PKCE** (RFC 7636) protects the **OAuth authorization code flow** when the client **cannot keep a secret** (SPA, mobile).

Attack without PKCE: malicious app intercepts redirect `code` and exchanges it at token endpoint.

PKCE binds the code to a **verifier** only the legitimate client knows: send **challenge** at authorize; send **verifier** at token exchange.

**This app** does not implement OAuth yet — PKCE is required when you add OIDC per [oauth2-oidc](./oauth2-oidc.md) (optional link).

---

## 2. Mental model

### Analogy

Locker pickup: desk gives package only if you return the **exact ticket stub** you got when you dropped it off — intercepting someone else’s pickup number is not enough without the stub.

### Diagram

```text
Authorize request:
  code_challenge = BASE64URL(SHA256(code_verifier))
  code_challenge_method = S256

Token request:
  code + code_verifier  ──► server verifies SHA256(verifier) == challenge
```

---

## 3. Core rules (must / must-not)

1. **MUST** use `S256` method (SHA-256), not plain `plain` except legacy.  
2. **MUST** generate cryptographically random `code_verifier` (43–128 chars).  
3. **MUST** store verifier in client until token exchange (memory or secure storage).  
4. **MUST NOT** send verifier in authorize redirect (only challenge).  
5. **MUST** use authorization code flow + PKCE for public clients.  
6. **MUST** validate `state` param for CSRF on OAuth redirect.

---

## 4. How it works (mechanics)

### Client steps

1. `verifier = randomURLSafeString(32)`  
2. `challenge = base64url(sha256(verifier))`  
3. Redirect user to `/authorize?...&code_challenge=...&code_challenge_method=S256&state=...`  
4. Receive `code` on redirect  
5. POST token endpoint with `code`, `code_verifier`, `client_id`, `redirect_uri`  
6. Server verifies challenge, returns tokens

### Relation to this repo’s crypto style

Same primitives as token hashing:

```ts
import { createHash, randomBytes } from "node:crypto";

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

const verifier = randomBytes(32).toString("base64url");
```

Parallel to `hashToken` in `backend/src/modules/auth/auth.service.ts`.

---

## 5. When to use / when not to use

| PKCE | Client secret in server backend only |
|------|--------------------------------------|
| SPA, mobile | Confidential server-side OAuth client |

| Always with OAuth code flow (modern) | Implicit flow |
|--------------------------------------|---------------|
| Recommended | Deprecated for SPAs |

---

## 6. Step-by-step: design → implement → verify

1. Generate verifier/challenge before redirect.  
2. Persist `state` + verifier (sessionStorage for SPA — XSS risk remains; minimize).  
3. Callback validates `state`.  
4. Exchange with verifier.  
5. Test: wrong verifier → `invalid_grant`.

---

## 7. Worked example A — this project

**No OAuth redirect yet.** Closest pattern: high-entropy random + hash before storage:

```ts
const rawToken = randomBytes(32).toString("base64url");
const tokenHash = this.hashToken(rawToken);
```

**Where:** `backend/src/modules/auth/auth.service.ts` — same random+hash discipline PKCE builds on.

Mobile header for refresh (public client):

```ts
export function wantsRefreshInBody(req: Request): boolean {
  const client = req.headers["x-client"];
  return typeof client === "string" && client.toLowerCase() === "mobile";
}
```

**Where:** `backend/src/shared/auth/refresh-cookie.ts` — public clients need body token; OAuth would add PKCE for provider login.

---

## 8. Worked example B — mini scenario (self-contained)

```ts
const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");

const authorizeUrl = new URL("https://issuer/oauth/authorize");
authorizeUrl.searchParams.set("response_type", "code");
authorizeUrl.searchParams.set("client_id", CLIENT_ID);
authorizeUrl.searchParams.set("redirect_uri", REDIRECT);
authorizeUrl.searchParams.set("code_challenge", challenge);
authorizeUrl.searchParams.set("code_challenge_method", "S256");
authorizeUrl.searchParams.set("state", randomBytes(16).toString("hex"));
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Risk |
|--------------|------|
| No PKCE on SPA | Stolen code → tokens |
| `plain` challenge | Intercepted challenge = verifier |
| Reuse verifier | Weak binding |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| invalid_grant | Verifier mismatch | Stored verifier | Regenerate pair |
| CSRF login | Missing state | Callback | Require state match |
| challenge too short | Bad random | Length | 32+ bytes |

---

## 11. Interview Q&A (with strong answers)

**Q: What problem does PKCE solve?**  
**A:** Prevents authorization code interception attacks for public OAuth clients that cannot use a client secret.

**Q: What is code_verifier vs code_challenge?**  
**A:** Verifier is secret kept by client; challenge is derived hash sent to authorize endpoint; token endpoint proves possession of verifier.

**Q: PKCE for confidential clients?**  
**A:** Recommended everywhere now; mandatory for public clients.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| PKCE | Proof Key for Code Exchange |
| code_verifier | High-entropy secret |
| code_challenge | Hash of verifier sent to authorize |
| Public client | Cannot store client secret |
| Authorization code | Short-lived exchange credential |

---

## 13. Teach pointer

> “The authorization code is public in the URL; PKCE is the private half that makes it useless to steal.”

---

## 14. Optional further reading (not required)

- OAuth overview: [oauth2-oidc](./oauth2-oidc.md)
