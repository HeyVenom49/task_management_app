# Lesson: OAuth 2.0 and OpenID Connect (OIDC)

**Standalone ✓** — You do not need any other doc to explain authorization vs identity layers, flows, and how they differ from this app’s first-party login.

**After this file you can:** describe OAuth2 roles, authorization code flow, OIDC ID tokens, compare to email/password JWT auth here, and interview on common OAuth mistakes.

---

## 1. First principles

**OAuth 2.0** is a framework for **delegated authorization**: app A gets limited access to user’s resources at provider B **without** receiving the user’s password at A.

**OpenID Connect (OIDC)** adds **identity** on top — standardized **ID token** (JWT) with claims like `sub`, `email`.

**This task app** uses **first-party** register/login (`AuthService`), not Google/GitHub OAuth — but the same JWT access patterns apply if you add “Sign in with …” later.

---

## 2. Mental model

### Analogy

Hotel: OAuth = front desk gives you a **scoped key card** to the gym, not a copy of your home key. OIDC = front desk also gives a **photo ID badge** proving who you are.

### Diagram (authorization code + PKCE)

```text
User ──► Provider login
App ◄── redirect ?code=...
App ──► exchange code + client_secret/PKCE ──► access_token + id_token
App ──► create local session (like login today)
```

---

## 3. Core rules (must / must-not)

1. **MUST** use authorization code flow for web/mobile (not implicit).  
2. **MUST** use **PKCE** for public clients (SPAs, mobile).  
3. **MUST** validate ID token signature, `aud`, `iss`, expiry.  
4. **MUST NOT** treat OAuth access token as your app session without mapping to local user.  
5. **MUST** store refresh tokens from providers securely (encrypted).  
6. **MUST NOT** embed client secret in SPA.

---

## 4. How it works (mechanics)

### Roles

| Role | Example |
|------|---------|
| Resource owner | User |
| Client | Your SPA |
| Authorization server | Google |
| Resource server | Google API |

### Mapping to this codebase

After OIDC, you still likely:

```ts
const accessToken = await signAccessToken({ sub: localUser.id, email });
await this.sessionRepo.createSession({ ... });
setRefreshCookie(res, rawRefresh);
```

Same as `AuthService.login` outcome — **local session** remains source of truth for API auth (`authenticate` middleware).

### Scopes

Request minimum scopes (`openid email profile`), not `https://www.googleapis.com/auth/drive` unless needed.

---

## 5. When to use / when not to use

| OAuth/OIDC social login | First-party password |
|-------------------------|----------------------|
| Reduce password handling | Full control, simpler for learning app |
| Enterprise SSO | Air-gapped |

| OIDC | Raw OAuth only |
|------|----------------|
| Need stable `sub` + email | API-only delegation |

---

## 6. Step-by-step: design → implement → verify

1. Register client at provider; redirect URIs exact match.  
2. Implement `/auth/oauth/:provider/callback`.  
3. Exchange code with PKCE verifier.  
4. Validate ID token; upsert local user by `sub`/email.  
5. Issue **your** JWT + refresh (existing flow).  
6. Test: wrong `state` rejected (CSRF).

---

## 7. Worked example A — this project (first-party today)

Login issues local tokens:

```ts
const accessToken = await signAccessToken({
  sub: user.id,
  email: user.email,
});
const rawRefresh = randomBytes(32).toString("base64url");
await this.sessionRepo.createSession({ userId: user.id, tokenHash, expiresAt });
```

**Where:** `backend/src/modules/auth/auth.service.ts`.

Browser delivery:

```ts
sendAuthTokens(req, res, result);
```

**Where:** `backend/src/shared/auth/refresh-cookie.ts`.

OIDC would **replace password verify** block only — not middleware shape.

---

## 8. Worked example B — mini scenario (self-contained)

Callback handler sketch:

```ts
const tokens = await exchangeCode(code, codeVerifier);
const idToken = await verifyIdToken(tokens.id_token, { aud: CLIENT_ID, iss: ISS });
const user = await upsertUser({ email: idToken.email, oauthSub: idToken.sub });
return issueLocalSession(user);
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Risk |
|--------------|------|
| Implicit flow in SPA | Token in URL fragment |
| No PKCE | Auth code interception |
| Trust ID token without verify | Forged identity |
| OAuth access token in cookie | Wrong token type confusion |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| redirect_uri_mismatch | Typo in console | Provider settings | Exact URL |
| invalid_grant | Used code twice | Logs | One exchange |
| Wrong user linked | Email change at provider | Link by `sub` | Stable oauth_sub column |

---

## 11. Interview Q&A (with strong answers)

**Q: OAuth vs OIDC?**  
**A:** OAuth delegates access to APIs; OIDC adds standardized identity (ID token) for authentication.

**Q: Best flow for SPA?**  
**A:** Authorization code with PKCE; no client secret in browser.

**Q: After OIDC login, why local JWT?**  
**A:** Your API authz (project membership) is local; provider token does not encode your app permissions.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Authorization code | Short-lived code exchanged for tokens |
| ID token | OIDC JWT about user identity |
| Scope | Permission string |
| Redirect URI | Allowed callback URL |
| Delegation | App acts with limited access |

---

## 13. Teach pointer

> “OAuth asks ‘what may this app do?’ OIDC adds ‘who is the user?’ — then your app still decides project access.”

---

## 14. Optional further reading (not required)

- PKCE: [pkce](./pkce.md)  
- Cookies after login: [cookies-xss-csrf](./cookies-xss-csrf.md)
