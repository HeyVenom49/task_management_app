# Lesson: Secrets management

**Standalone ✓** — You do not need any other doc to load, validate, and rotate application secrets safely.

**After this file you can:** classify secrets vs config, validate env at boot, keep JWT keys out of code, plan rotation, and debug “works on my machine” secret mismatches.

---

## 1. First principles

**Secrets** are credentials that prove identity or decrypt/protect data (`JWT_SECRET`, `DATABASE_URL` password, Redis URL). **Config** is non-sensitive tuning (port, TTL strings).

Secrets must **never** live in git, logs, or client bundles. Load from environment (or secret manager), **validate early** at process start, and **rotate** on leak or schedule.

**Problem it removes:** Committed `.env` → full production compromise.

---

## 2. Mental model

### Analogy

House keys vs paint color. Keys in a locked box (secret store); paint color on the wall (config). You change keys after a break-in; you don’t commit keys to the tour brochure (repo).

### Diagram

```text
Deploy platform / .env.local (not in git)
        │
        ▼
   zod envSchema.parse(process.env)  ──► fail fast if missing JWT_SECRET
        │
        ▼
   env.jwtSecret ──► signAccessToken / verifyAccessToken only in server
```

---

## 3. Core rules (must / must-not)

1. **MUST** validate required secrets at startup (min length, URLs).  
2. **MUST NOT** commit `.env` with real values.  
3. **MUST NOT** expose `JWT_SECRET` to frontend or logs.  
4. **MUST** use different secrets per environment.  
5. **MUST** rotate JWT secret knowing all access tokens invalidate until refresh.  
6. **SHOULD** inject secrets via platform (K8s secrets, SSM) not baked in images.

---

## 4. How it works (mechanics)

### This app’s env module

- Zod schema: `JWT_SECRET` min 16, `DATABASE_URL` required.  
- Production rule: `COOKIE_SECURE` must be true.  
- Optional `REDIS_URL` for rate limiting.  
- Parsed once → exported `env` object.

### JWT usage

```ts
const secret = new TextEncoder().encode(env.jwtSecret);
```

Only server-side in `backend/src/shared/auth/token.ts`.

### Docker / CI

Pass env at runtime; Dockerfile should not `ENV JWT_SECRET=...` with real values.

---

## 5. When to use / when not to use

| Env vars + Zod (this app) | Full secret manager |
|---------------------------|---------------------|
| Learning/single service | Production at scale |

| Rotate JWT | Rotate DB password |
|------------|-------------------|
| Invalidates access tokens | Update connection string + rolling restart |

---

## 6. Step-by-step: design → implement → verify

1. Inventory secrets vs config.  
2. Add Zod constraints (min length, URL).  
3. Fail boot on missing production rules.  
4. Document required vars in README (names only, no values).  
5. Scan git history for leaks; rotate if found.

---

## 7. Worked example A — this project

```ts
const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_EXPIRES_IN: z.string().default("7d"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  COOKIE_SECURE: z.coerce.boolean().default(false),
  REDIS_URL: z.string().url().optional(),
});

const parsed = envSchema.parse(process.env);

if (parsed.NODE_ENV === "production" && !parsed.COOKIE_SECURE) {
  throw new Error("COOKIE_SECURE must be true when NODE_ENV=production");
}
```

**Where:** `backend/src/config/env.ts`.

Token signing reads `env.jwtSecret` — never from request input.

---

## 8. Worked example B — mini scenario (self-contained)

**Dual JWT keys for rotation**

```ts
const keys = [process.env.JWT_SECRET_CURRENT!, process.env.JWT_SECRET_PREVIOUS!];
// verify tries both; sign uses CURRENT only
```

Allows zero-downtime JWT secret rotation.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Outcome |
|--------------|---------|
| Secret in git | Public compromise |
| Default `JWT_SECRET=dev` in prod | Forge tokens |
| Log full DATABASE_URL | Credential leak |
| Same secret all envs | Staging leak → prod |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Boot crash on deploy | Zod parse fail | Missing env var | Set in platform |
| All 401 after deploy | JWT secret changed | Env diff | Re-login; plan rotation |
| Redis optional confusion | Rate limit 503 | REDIS_URL unset in prod | Provide Redis or policy |

---

## 11. Interview Q&A (with strong answers)

**Q: Where should JWT secret live?**  
**A:** Server environment or secret manager, validated at startup, never in client or repository.

**Q: How rotate JWT secret?**  
**A:** Deploy new secret, accept old for verify window or force re-auth; invalidate refresh sessions if breach.

**Q: Secrets vs config?**  
**A:** Secrets grant access or protect data; config tunes behavior — treat secrets with stricter storage and rotation.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Secret | Credential or key material |
| Fail fast | Crash at boot on invalid config |
| Rotation | Replace credential and deprecate old |
| Secret manager | AWS SSM, Vault, K8s Secrets |

---

## 13. Teach pointer

> “If it unlocks the kingdom, it never belongs in the repo.”

---

## 14. Optional further reading (not required)

- API keys pattern: [api-keys](./api-keys.md)  
- TLS termination: [tls-https](./tls-https.md)
