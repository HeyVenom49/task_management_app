# Lesson: Cookies, XSS, and CSRF

**Standalone ✓** — You do not need any other doc to harden browser sessions against script theft and cross-site request forgery.

**After this file you can:** choose cookie flags, explain why refresh lives in httpOnly cookies, relate CORS + credentials, assess CSRF risk on cookie-auth endpoints, and debug “refresh not sent.”

---

## 1. First principles

**Cookies** are browser-stored name/value pairs the browser attaches to matching requests. **XSS** (cross-site scripting) lets attacker JavaScript run in your origin — stealing anything JS can read (localStorage, non-httpOnly cookies). **CSRF** tricks a logged-in browser into sending **automatic** cookies to your API on a malicious site’s behalf.

Mitigations:

- **httpOnly** refresh cookie → JS cannot read refresh.  
- **sameSite** reduces cross-site cookie sends.  
- **CORS** restricts which origins may read responses with credentials.  
- Short **access JWT in memory** (Authorization header) for API calls — not auto-sent by browser navigation.

**Problem it reduces:** Stolen refresh tokens and forged state-changing requests from other sites.

---

## 2. Mental model

### Analogy

**httpOnly:** Safe deposit box — clerk uses it, customer JS cannot peek.  
**sameSite=lax:** Cookie stays home unless user explicitly navigates from outside.  
**CORS:** Bouncer checks “is this AJAX from our frontend origin?” before showing response.

### Diagram

```text
Browser SPA (trusted origin)
  API calls: Authorization: Bearer <access>  (JS holds access)
  Refresh: POST /auth/refresh + Cookie: refreshToken (httpOnly, auto)

Attacker XSS on your site
  cannot read refresh cookie
  may still call API if access token in JS memory → shorten access TTL

Attacker site evil.com
  cross POST to your API
  lax cookie often not sent on cross-origin fetch; CORS blocks reading response
```

---

## 3. Core rules (must / must-not)

1. **MUST** set `httpOnly: true` on refresh cookies.  
2. **MUST** set `secure: true` in production (`COOKIE_SECURE` enforced in env).  
3. **MUST** scope cookie `path` narrowly (`/api/v1/auth`).  
4. **MUST** configure CORS `origin` to frontend URL with `credentials: true`.  
5. **MUST NOT** store refresh tokens in localStorage if avoidable.  
6. **SHOULD** use `sameSite: 'lax'` (or `strict` if UX allows) for session cookies.  
7. **MUST** treat access JWT as XSS-exposed — keep TTL short.

---

## 4. How it works (mechanics)

### Refresh flow (browser)

1. Login response sets cookie via `Set-Cookie`.  
2. SPA stores access token in memory.  
3. On 401, SPA POSTs `/refresh` with `credentials: 'include'`.  
4. Server rotates refresh, sets new cookie, returns new access in JSON.

### Mobile

Header `x-client: mobile` → refresh in JSON body instead of cookie (`sendAuthTokens`).

### CSRF on refresh

Cross-site form POST might hit refresh if cookies were `SameSite=None` without protection — **lax** + narrow path + JSON APIs reduce classic CSRF. State-changing auth uses POST with JSON body; browsers don’t send custom JSON from simple CSRF forms as easily as cookies alone.

For cookie-only mutations, add CSRF token or `SameSite=strict` where UX permits.

---

## 5. When to use / when not to use

| httpOnly cookie refresh | Body refresh (mobile) |
|-------------------------|------------------------|
| Browser SPA | Native apps |

| sameSite lax | sameSite none + secure |
|--------------|------------------------|
| Same-site SPA | Embedded cross-site widgets (rare) |

---

## 6. Step-by-step: design → implement → verify

1. Decide token split: short access, long refresh.  
2. Set cookie flags and path.  
3. Enable CORS credentials for one origin.  
4. Frontend: `fetch(..., { credentials: 'include' })` on refresh only.  
5. Verify in DevTools: refresh not visible to `document.cookie`.  
6. Production: `COOKIE_SECURE=true`.

---

## 7. Worked example A — this project

### A1. Cookie write

```ts
res.cookie(COOKIE_NAME, rawRefresh, {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: "lax",
  path: "/api/v1/auth",
  maxAge: parseDurationToMs(env.refreshExpiresIn),
});
```

**Where:** `backend/src/shared/auth/refresh-cookie.ts`.

### A2. CORS

```ts
app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true,
  }),
);
```

**Where:** `backend/src/app.ts`.

### A3. Mobile vs browser response

```ts
if (wantsRefreshInBody(req)) {
  res.status(status).json({ ...rest, refreshToken });
} else {
  res.status(status).json(rest);
}
```

**Where:** `backend/src/shared/auth/refresh-cookie.ts` — `sendAuthTokens`.

### A4. Env production guard

```ts
if (parsed.NODE_ENV === "production" && !parsed.COOKIE_SECURE) {
  throw new Error("COOKIE_SECURE must be true when NODE_ENV=production");
}
```

**Where:** `backend/src/config/env.ts`.

---

## 8. Worked example B — mini scenario (self-contained)

**Double-submit CSRF token**

Server sets non-httpOnly `csrf` cookie + expects header `X-CSRF-Token` matching on POST. Attacker site cannot read cookie (same-origin policy) → cannot forge header.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Risk |
|--------------|------|
| refresh in localStorage | XSS steals session |
| `SameSite=None` without need | CSRF cookie send |
| CORS `*` with credentials | Invalid / unsafe |
| Cookie path `/` | Broader exposure surface |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Refresh 401 in browser | Cookie not sent | Path, domain, secure on HTTP | Match env |
| CORS error on refresh | Missing credentials | fetch options | `credentials: 'include'` |
| Cookie visible in JS | httpOnly false | Set-Cookie | Fix server flags |
| Works locally, not prod | Secure cookie on HTTP | HTTPS | TLS termination |

---

## 11. Interview Q&A (with strong answers)

**Q: Why httpOnly on refresh?**  
**A:** So XSS cannot exfiltrate the long-lived secret; access token may still be stolen from memory, so keep it short-lived.

**Q: Does CORS prevent CSRF?**  
**A:** CORS prevents **reading** cross-origin responses; CSRF is about **sending** requests. SameSite cookies and CSRF tokens address sending.

**Q: Why lax not strict?**  
**A:** Lax allows top-level navigations (email links) while blocking many cross-site POST cookie sends; strict is tighter UX tradeoff.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| XSS | Injected script running in victim browser |
| CSRF | Forged request using victim’s cookies |
| httpOnly | Cookie inaccessible to JavaScript |
| sameSite | Cross-site cookie shipping policy |
| CORS | Browser rules for cross-origin XHR/fetch |

---

## 13. Teach pointer

> “Keep the long-lived key in a cookie JS cannot read; keep the short-lived key where JS needs it — and accept that XSS still hurts.”

---

## 14. Optional further reading (not required)

- Refresh rotation: [refresh-rotation-and-reuse](./refresh-rotation-and-reuse.md)  
- TLS for secure cookies: [tls-https](./tls-https.md)
