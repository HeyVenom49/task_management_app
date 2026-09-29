# Lesson: HTTP security headers

**Standalone ✓** — You do not need any other doc to choose CSP, HSTS, frame options, and related headers for browser-facing apps.

**After this file you can:** explain what each header does, know this JSON API’s current header posture, plan headers for a future frontend, and debug missing HSTS/CSP in scans.

---

## 1. First principles

**Security headers** instruct browsers to enforce policies: where scripts may run (CSP), whether to force HTTPS (HSTS), whether page may be framed (clickjacking), MIME sniffing, referrer leakage, etc.

They complement **cookie flags** and **CORS** — they mostly protect **HTML documents**; pure JSON API responses benefit indirectly when the same origin serves SPA + API.

**This Express API** does not set a full helmet stack in `app.ts` today — deployment (reverse proxy) or future middleware should add them for any served HTML (Swagger UI in dev).

---

## 2. Mental model

### Analogy

Building code for browsers: headers are posted rules — “no iframe embedding,” “only scripts from these origins.”

### Diagram

```text
Browser requests HTML/JS
        │
        ▼
Response headers: CSP, HSTS, X-Frame-Options, ...
        │
        ▼
Browser enforces before executing page
```

JSON API clients (mobile, curl) ignore many of these; **SPA shell** needs them.

---

## 3. Core rules (must / must-not)

1. **MUST** use **HSTS** in production for HTTPS sites (`Strict-Transport-Security`).  
2. **MUST** set **CSP** for any page running your JS (restrict scripts).  
3. **MUST** use `X-Frame-Options: DENY` or CSP `frame-ancestors 'none'` against clickjacking.  
4. **MUST** set `Content-Type: application/json` correctly for API (Express json parser).  
5. **MUST NOT** rely on `security through obscurity` headers alone.  
6. **SHOULD** add `Referrer-Policy` and `Permissions-Policy` on frontend host.

---

## 4. How it works (mechanics)

### Common headers

| Header | Purpose |
|--------|---------|
| `Strict-Transport-Security` | Force HTTPS |
| `Content-Security-Policy` | Script/style/load sources |
| `X-Content-Type-Options: nosniff` | Block MIME guess |
| `X-Frame-Options` / `frame-ancestors` | Anti-clickjacking |
| `Referrer-Policy` | Limit referrer leakage |

### CORS (related, not identical)

This API sets:

```ts
cors({ origin: env.frontendUrl, credentials: true })
```

**Where:** `backend/src/app.ts` — controls cross-origin **read** of responses, not CSP.

### Swagger UI in dev

Serves HTML/JS from `/api/docs` — if exposed, CSP and auth matter; disabled in production in current code path.

---

## 5. When to use / when not to use

| Helmet/CSP on HTML host | On every JSON 200 |
|-------------------------|-------------------|
| Yes | Low value |

| Strict CSP | `unsafe-inline` everywhere |
|------------|----------------------------|
| Production SPA | Dev-only convenience |

---

## 6. Step-by-step: design → implement → verify

1. Identify who serves SPA (CDN vs same Express).  
2. Add helmet or nginx headers on that host.  
3. Tune CSP with nonce or hash for inline scripts.  
4. Scan with securityheaders.com / Mozilla observatory.  
5. Ensure API `COOKIE_SECURE` aligns with HSTS.

---

## 7. Worked example A — this project

### A1. CORS + credentials

```ts
app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true,
  }),
);
```

**Where:** `backend/src/app.ts`.

### A2. Secure cookies (pairs with HSTS at edge)

```ts
if (parsed.NODE_ENV === "production" && !parsed.COOKIE_SECURE) {
  throw new Error("COOKIE_SECURE must be true when NODE_ENV=production");
}
```

**Where:** `backend/src/config/env.ts`.

### A3. Cookie flags on refresh

```ts
httpOnly: true,
secure: env.cookieSecure,
sameSite: "lax",
```

**Where:** `backend/src/shared/auth/refresh-cookie.ts`.

**Gap:** Add `helmet()` or proxy headers before production SPA launch; JSON routes alone do not set CSP today.

---

## 8. Worked example B — mini scenario (self-contained)

```ts
import helmet from "helmet";

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true },
  }),
);
```

Place on app serving HTML.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Issue |
|--------------|-------|
| CSP `*` everywhere | XSS wins |
| HSTS on HTTP only | Ignored |
| API CORS `*` + credentials | Invalid/unsafe |
| Only headers, no XSS encode | Defense gap |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| CSP blocks SPA | Too strict script-src | Browser console | nonce/hash |
| Cookies not sent | Secure on HTTP dev | COOKIE_SECURE | Local HTTPS or false in dev |
| Clickjacking | No frame deny | Response headers | CSP frame-ancestors |

---

## 11. Interview Q&A (with strong answers)

**Q: CSP purpose?**  
**A:** Restrict which resources browser may load/execute, mitigating XSS impact.

**Q: HSTS?**  
**A:** Tells browser to use HTTPS only for the site for a period, reducing sslstrip.

**Q: Headers on REST JSON API?**  
**A:** Less critical than on HTML; still set on any browsable docs/SPA; pair with CORS for API.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| CSP | Content Security Policy |
| HSTS | HTTP Strict Transport Security |
| Clickjacking | UI redress via iframe |
| Helmet | Express middleware setting headers |
| MIME sniffing | Browser guessing content type |

---

## 13. Teach pointer

> “Headers tell the browser how paranoid to be — use them where the browser runs your UI.”

---

## 14. Optional further reading (not required)

- TLS: [tls-https](./tls-https.md)  
- XSS/cookies: [cookies-xss-csrf](./cookies-xss-csrf.md)
