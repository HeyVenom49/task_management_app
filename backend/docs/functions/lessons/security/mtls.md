# Lesson: Mutual TLS (mTLS)

**Standalone ✓** — You do not need any other doc to explain client+server TLS, when to use it, and how it differs from this app’s JWT auth.

**After this file you can:** contrast TLS vs mTLS, describe certificate chains, place mTLS in service meshes, and interview on zero-trust internal APIs.

---

## 1. First principles

**TLS (HTTPS)** encrypts traffic and proves **server** identity to the client (certificate).

**mTLS** adds **client certificate** verification — the **server** also proves the **client** is an expected program/device before HTTP handlers run.

Used heavily **service-to-service** (mesh, internal gRPC), less often for browser SPAs (certificate distribution is hard).

**This task API** uses **HTTPS at the edge** (deployment concern) + **JWT** for user identity — not mTLS on public browser traffic.

---

## 2. Mental model

### Analogy

Nightclub: server TLS = you check the venue’s license; mTLS = bouncer also checks **your** employee badge before you enter the staff door.

### Diagram

```text
Standard TLS:
  Browser ── verifies server cert ──► API

mTLS (internal):
  Service A ── server cert ──► Service B
            ◄── verifies client cert ──
```

---

## 3. Core rules (must / must-not)

1. **MUST** use TLS for all production HTTP (see tls-https lesson).  
2. **MUST** rotate client certs and maintain CA trust store.  
3. **MUST NOT** confuse mTLS with user login — cert identifies **workload**, not human.  
4. **SHOULD** use short-lived certs (SPIFFE/SPIRE, mesh) vs manual years-long certs.  
5. **MUST NOT** disable client cert verification (`rejectUnauthorized: false`) in prod.

---

## 4. How it works (mechanics)

### Handshake (simplified)

1. Client hello.  
2. Server presents cert; client verifies CA.  
3. Server requests client cert (mTLS).  
4. Client presents cert; server verifies against trusted CA.  
5. Encrypted channel; HTTP proceeds — often identity mapped to SPIFFE ID.

### vs JWT here

| mTLS | JWT (this app) |
|------|----------------|
| Transport identity | Application identity |
| Machine | End user |
| `authenticate` N/A | Bearer header |

Public `backend/src/app.ts` Express app expects JWT on protected routes via `authenticate`, not client certs.

---

## 5. When to use / when not to use

| mTLS | JWT/cookies |
|------|-------------|
| Microservice internal calls | Browser users |
| Zero-trust pod-to-pod | Mobile/SPA API |

| Terminate mTLS at gateway | End-to-end mTLS |
|---------------------------|-----------------|
| Simpler app | Stronger internal |

---

## 6. Step-by-step: design → implement → verify

1. Internal API needs machine auth? Consider mTLS.  
2. Issue certs from private CA or mesh.  
3. Configure Node `https.createServer({ cert, key, ca, requestCert: true, rejectUnauthorized: true })`.  
4. Map cert CN/SAN to service account.  
5. Still authorize actions in app layer.

---

## 7. Worked example A — this project

**User-facing auth** (not mTLS):

```ts
export async function authenticate(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new UnauthorizedError();
  }
  const token = header.slice("Bearer ".length).trim();
  const payload = await verifyAccessToken(token);
  req.user = { id: payload.sub, email: payload.email };
  next();
}
```

**Where:** `backend/src/shared/middleware/authenticate.ts`.

**Transport:** Production should place API behind TLS terminator; `COOKIE_SECURE` requires HTTPS for cookies (`backend/src/config/env.ts`).

---

## 8. Worked example B — mini scenario (self-contained)

Internal Node server:

```ts
import https from "node:https";
import fs from "node:fs";

https.createServer(
  {
    cert: fs.readFileSync("server.crt"),
    key: fs.readFileSync("server.key"),
    ca: fs.readFileSync("ca.crt"),
    requestCert: true,
    rejectUnauthorized: true,
  },
  app,
).listen(8443);
```

Caller presents client cert signed by same CA.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Risk |
|--------------|------|
| mTLS only on one hop | Plain HTTP inside VPC |
| Shared client cert for all services | No blast radius isolation |
| Cert in git | Impersonation |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| ECONNRESET handshake | Client cert missing | curl --cert | Deploy cert |
| UNABLE_TO_VERIFY | Wrong CA | ca bundle | Update trust store |
| 401 still on mTLS | Confused layers | App expects JWT | Separate internal routes |

---

## 11. Interview Q&A (with strong answers)

**Q: TLS vs mTLS?**  
**A:** TLS authenticates server to client; mTLS also authenticates client to server with a client certificate.

**Q: Why not mTLS for browsers?**  
**A:** Distributing and protecting client certs for every user is hard; OAuth/JWT fits better.

**Q: mTLS replace JWT?**  
**A:** No for users — mTLS identifies services; JWT identifies user sessions inside trusted networks.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| mTLS | Mutual TLS with client cert |
| CA | Certificate authority signing certs |
| SPIFFE | Workload identity standard |
| Termination | TLS ended at load balancer |

---

## 13. Teach pointer

> “TLS locks the wire; mTLS checks IDs on both ends of the wire.”

---

## 14. Optional further reading (not required)

- HTTPS basics: [tls-https](./tls-https.md)  
- User auth: [authn-vs-authz](./authn-vs-authz.md)
