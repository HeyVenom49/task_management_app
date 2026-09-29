# Lesson: API keys

**Standalone ✓** — You do not need any other doc to design machine-to-machine credentials distinct from user JWTs.

**After this file you can:** compare API keys vs OAuth vs JWT sessions, design hashed key storage, scope and rotate keys, and explain why this task app uses user JWT instead (with a migration path).

---

## 1. First principles

**API keys** identify **programs** (scripts, integrations), not humans clicking login. They are long-lived bearer secrets sent in headers (`Authorization: ApiKey …` or `X-API-Key`).

Store **hashes** only; show raw key once at creation. Scope keys narrowly; rotate and revoke.

**This project** uses **user JWT + refresh** for the SPA/mobile — no first-class API keys yet. Same hashing ideas as refresh tokens apply when you add them.

---

## 2. Mental model

### Analogy

Hotel room key (user session) vs loading dock badge (API key). Dock badge works 24/7 for deliveries; revoke badge without changing guest keys.

### Diagram

```text
Integration ── X-API-Key: sk_live_... ──► middleware
                                              │
                                         hash ──► lookup key row
                                              │
                                         scopes: projects:read
```

---

## 3. Core rules (must / must-not)

1. **MUST** generate high-entropy keys (`randomBytes`).  
2. **MUST** store SHA-256 (or similar) of key, not plaintext.  
3. **MUST** support revoke + optional expiry per key.  
4. **MUST NOT** commit keys to git or log them.  
5. **MUST** scope keys (read vs write, tenant/project).  
6. **SHOULD** rate-limit key endpoints separately.

---

## 4. How it works (mechanics)

### vs user JWT (this app)

| | User access JWT | API key (hypothetical) |
|--|-----------------|------------------------|
| Lifetime | Short (15m default) | Long until rotated |
| Identity | User `sub` | Integration + optional user |
| Transport | Bearer | Header |
| Storage | Not stored (stateless JWT) | Hash in `api_keys` table |

### Implementation sketch (not in repo)

1. `POST /admin/api-keys` (authenticated admin) → return raw once.  
2. Middleware: hash header, load scopes, set `req.integration`.  
3. Authz: check scope before service call.

Reuse pattern from:

```ts
private hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
```

**Where:** `backend/src/modules/auth/auth.service.ts`.

---

## 5. When to use / when not to use

| API keys | User OAuth/JWT |
|----------|----------------|
| Server cron, ETL | Interactive app |
| Single-tenant script | User consent flows |

| Avoid keys in browser | Why |
|-----------------------|-----|
| Exposed in JS bundle | Use user session instead |

---

## 6. Step-by-step: design → implement → verify

1. Table: `api_keys(id, key_hash, name, scopes, revoked_at, expires_at)`.  
2. Issuance endpoint with audit.  
3. Middleware before routes.  
4. Tests: wrong key 401; revoked 401; scope miss 403.  
5. Document rotation runbook.

---

## 7. Worked example A — this project (today)

**Human API access:** `authenticate` middleware verifies JWT:

```ts
const payload = await verifyAccessToken(token);
req.user = { id: payload.sub, email: payload.email };
```

**Where:** `backend/src/shared/middleware/authenticate.ts`.

Machine callers would not use login CSRF flow — future keys would parallel session **hash-at-rest** pattern in `SessionRepository`, not copy JWT.

---

## 8. Worked example B — mini scenario (self-contained)

```ts
async function authApiKey(req, res, next) {
  const raw = req.header("x-api-key");
  if (!raw) return next(new UnauthorizedError());
  const hash = createHash("sha256").update(raw).digest("hex");
  const row = await db.apiKeys.findActive(hash);
  if (!row) return next(new UnauthorizedError());
  req.scopes = row.scopes;
  next();
}
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Outcome |
|--------------|---------|
| Key in frontend | Stolen from bundle |
| One global key for all customers | Cross-tenant breach |
| Plaintext keys in DB | Dump = access |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| 401 after deploy | Key rotated | Hash in DB | Re-issue |
| Over-privileged integration | `*` scope | Row scopes | Narrow |
| Key in access logs | Logged header | Redact middleware | Strip from logs |

---

## 11. Interview Q&A (with strong answers)

**Q: API key vs JWT?**  
**A:** Keys are usually long-lived machine credentials stored hashed server-side; JWTs are often short-lived signed claims verified without DB lookup (unless revoked list).

**Q: How store API keys?**  
**A:** Show raw once; persist only fast hash; index by hash for lookup.

**Q: Why this app has no API keys?**  
**A:** Product is user-facing task management with session auth; keys would be added for integrations with scoped middleware.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| API key | Long-lived M2M bearer secret |
| Scope | Allowed operation subset |
| Revocation | Invalidate before expiry |
| Bearer | Credential sent per request |

---

## 13. Teach pointer

> “Treat API keys like spare root passwords — generate strong, hash, scope, rotate.”

---

## 14. Optional further reading (not required)

- Token hashing: [password-and-token-hashing](./password-and-token-hashing.md)  
- OAuth for third-party users: [oauth2-oidc](./oauth2-oidc.md)
