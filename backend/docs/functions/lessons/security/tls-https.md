# Lesson: TLS and HTTPS

**Standalone ✓** — You do not need any other doc to explain transport encryption, certificates, and how this app expects HTTPS in production.

**After this file you can:** describe TLS handshake at a working level, configure secure cookies behind TLS, terminate TLS at load balancer vs Node, and debug mixed-content/certificate errors.

---

## 1. First principles

**TLS** encrypts data in transit and authenticates the **server** (and optionally client in mTLS) using **certificates** signed by trusted CAs.

**HTTPS** is HTTP over TLS. Without it, passwords, JWTs, and cookies are visible on the network and vulnerable to tampering.

**Problem it removes:** Passive eavesdropping and many active MITM attacks on auth traffic.

---

## 2. Mental model

### Analogy

Sealed envelope with wax seal: contents hidden in mail; seal proves sender (CA-signed cert).

### Diagram

```text
Browser ── TLS handshake ──► Load balancer / Node
         ◄── encrypted HTTP ──►
              (JWT, cookies inside tunnel)
```

This Node app listens HTTP in `server.ts` — **TLS usually terminates at reverse proxy** (nginx, Caddy, cloud LB) in production.

---

## 3. Core rules (must / must-not)

1. **MUST** use HTTPS for production API and frontend.  
2. **MUST** set `secure: true` on session cookies in production — enforced:

```ts
if (parsed.NODE_ENV === "production" && !parsed.COOKIE_SECURE) {
  throw new Error("COOKIE_SECURE must be true when NODE_ENV=production");
}
```

**Where:** `backend/src/config/env.ts`.

3. **MUST** redirect HTTP→HTTPS at edge.  
4. **MUST NOT** send refresh cookies over plaintext except local dev.  
5. **SHOULD** enable HSTS on public host (see security-headers lesson).  
6. **MUST** keep TLS certificates renewed (Let’s Encrypt automation).

---

## 4. How it works (mechanics)

### Handshake (working knowledge)

1. Client hello (supported ciphers).  
2. Server presents certificate chain.  
3. Key agreement → symmetric session keys.  
4. Encrypted HTTP requests follow.

### What TLS does **not** do

- Does not validate JWT claims — app does.  
- Does not stop XSS — cookies/httpOnly + CSP do.  
- Does not stop IDOR — authz does.

### Cookies + TLS

```ts
secure: env.cookieSecure,
```

**Where:** `backend/src/shared/auth/refresh-cookie.ts` — browser sends cookie only on HTTPS when secure true.

### CORS origin

`FRONTEND_URL` should be `https://...` in production so credentialed calls match trusted origin (`backend/src/app.ts`).

---

## 5. When to use / when not to use

| TLS at load balancer | TLS in Node |
|----------------------|-------------|
| Common, cert central | Full control, more ops |

| HTTPS everywhere | HTTP internal mesh |
|------------------|---------------------|
| Public internet | Sometimes plain HTTP inside VPC + mTLS |

---

## 6. Step-by-step: design → implement → verify

1. Obtain cert for API and frontend hostnames.  
2. Terminate TLS at proxy → forward to Node HTTP.  
3. Set `COOKIE_SECURE=true`, `FRONTEND_URL=https://...`.  
4. Test curl/v2 HTTPS; SSL Labs scan.  
5. Verify refresh cookie has Secure flag in browser.

---

## 7. Worked example A — this project

### A1. Production cookie requirement

Enforced at boot — misconfig fails fast (see rule 2 above).

### A2. Refresh cookie

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

### A3. Credentialed CORS

```ts
cors({ origin: env.frontendUrl, credentials: true })
```

HTTPS frontend origin prevents accidental http/https mismatch blocking cookies.

**Where:** `backend/src/app.ts`.

### A4. Access JWT in Authorization header

Still must travel over TLS — otherwise Bearer token readable on wire (`authenticate` middleware).

**Where:** `backend/src/shared/middleware/authenticate.ts`.

---

## 8. Worked example B — mini scenario (self-contained)

**Caddy reverse proxy**

```text
api.example.com {
  reverse_proxy localhost:4000
}
```

Automatic HTTPS + forward plain HTTP to Node on loopback (safe inside host).

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Risk |
|--------------|------|
| HTTPS API + HTTP SPA | Mixed content / cookies blocked |
| Self-signed cert in prod without trust | Users bypass warnings |
| TLS 1.0 enabled | Weak crypto |
| Terminate TLS, HTTP to Node on public network | Sniffing inside VPC mistake |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Cookie not stored | Secure on HTTP | DevTools | HTTPS or COOKIE_SECURE false locally |
| CERT_HAS_EXPIRED | Renewal failed | cert dates | Renew ACME |
| CORS + credentials fail | http vs https origin | FRONTEND_URL | Align scheme |
| SSL_ERROR_SYSCALL | Proxy misconfig | LB health | Fix chain |

---

## 11. Interview Q&A (with strong answers)

**Q: What does TLS provide?**  
**A:** Confidentiality and integrity in transit plus server authentication via certificates.

**Q: Where terminate TLS for Node Express?**  
**A:** Often at load balancer/reverse proxy; Node sees HTTP on private loopback — acceptable if network path is trusted.

**Q: Why COOKIE_SECURE in production?**  
**A:** Ensures browsers only send refresh cookies over HTTPS, preventing accidental leakage on HTTP.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| TLS | Transport Layer Security |
| HTTPS | HTTP over TLS |
| Certificate | Public key + identity signed by CA |
| Termination | Decrypt TLS at proxy |
| MITM | Man-in-the-middle attack |

---

## 13. Teach pointer

> “Auth secrets on the wire need a locked pipe — TLS is that pipe.”

---

## 14. Optional further reading (not required)

- Security headers (HSTS): [security-headers](./security-headers.md)  
- mTLS internal: [mtls](./mtls.md)
