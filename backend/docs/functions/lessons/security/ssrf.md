# Lesson: Server-Side Request Forgery (SSRF)

**Standalone ✓** — You do not need any other doc to recognize SSRF, block internal network access from user-controlled URLs, and assess this API’s surface.

**After this file you can:** explain SSRF, list dangerous features (webhooks, URL preview, import-from-URL), design allowlists and network controls, and interview on cloud metadata attacks.

---

## 1. First principles

**SSRF** occurs when the **server** performs HTTP (or other) requests to a URL **chosen or influenced by the attacker**, reaching internal IPs, cloud metadata (`169.254.169.254`), or localhost services not exposed publicly.

The attacker uses **your server’s network position** as a proxy.

**This task API** has **no** user-controlled outbound fetch endpoints today — SSRF risk is **latent** until you add webhooks, “import task from URL,” or PDF generators.

---

## 2. Mental model

### Analogy

You ask a concierge to “pick up package from this address” — they enter the staff-only vault because you wrote an internal room number.

### Diagram

```text
Attacker ──► POST { url: "http://169.254.169.254/..." }
                    │
                    ▼
              Your server fetch(url)
                    │
                    ▼
              Internal/metadata (blocked ideally)
```

---

## 3. Core rules (must / must-not)

1. **MUST** avoid fetching arbitrary user URLs; prefer upload or provider SDKs.  
2. **MUST** allowlist schemes (`https` only) and block private IP ranges if fetch required.  
3. **MUST NOT** follow redirects blindly to internal hosts.  
4. **MUST** use network egress controls (firewall, VPC) in production.  
5. **SHOULD** resolve DNS and validate IP **after** lookup (TOCTOU aware — use pinned checks or proxy).  
6. **MUST NOT** expose raw response from internal fetch to user (error oracle).

---

## 4. How it works (mechanics)

### Cloud metadata

IMDS at link-local addresses returns credentials on some clouds if server role is attached — classic SSRF target.

### Defenses (layered)

| Layer | Control |
|-------|---------|
| App | URL parse, blocklist RFC1918, link-local |
| App | Disable redirects or re-validate each hop |
| Infra | Egress firewall, no IMDS v1, IMDSv2 |
| Architecture | No generic “HTTP proxy” feature |

### This repo

Outbound calls today: Postgres, Redis — connection strings from **env**, not users (`backend/src/config/env.ts`, `backend/src/db/client.ts`, `backend/src/shared/redis/redis.ts`).

No `fetch(userUrl)` in modules — SSRF prevention is **design-time** for future features.

---

## 5. When to use / when not to use

| User-supplied URL fetch | Predefined integrations |
|-------------------------|-------------------------|
| High SSRF risk | Stripe SDK, email API with fixed base URL |

| Webhook **receiver** | Webhook **sender** to user URL |
|----------------------|--------------------------------|
| Verify HMAC inbound | SSRF on outbound |

---

## 6. Step-by-step: design → implement → verify

1. Requirement: do we truly need server-side fetch?  
2. If yes: allowlist domains or use dedicated worker with no metadata access.  
3. Parse URL; reject non-https, IP literals, private ranges.  
4. Short timeouts; no cookie jar to internal apps.  
5. Test with `http://127.0.0.1`, metadata IP, redirect chain.

---

## 7. Worked example A — this project

**Env-driven fixed destinations only:**

```ts
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url().optional(),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
});
```

**Where:** `backend/src/config/env.ts` — operators set URLs, not end users.

**CORS** restricts browser origins calling API — not SSRF, but shows controlled trust:

```ts
cors({ origin: env.frontendUrl, credentials: true })
```

**Where:** `backend/src/app.ts`.

If adding `POST /integrations/webhook-test { url }`, treat as new SSRF surface — do not copy auth middleware alone; add outbound policy.

---

## 8. Worked example B — mini scenario (self-contained)

```ts
import ipaddr from "ipaddr.js";

function assertSafeUrl(url: URL) {
  if (url.protocol !== "https:") throw badRequest("https only");
  const addrs = await dns.lookup(url.hostname, { all: true });
  for (const { address } of addrs) {
    const addr = ipaddr.parse(address);
    if (addr.range() !== "unicast" || addr.isPrivate()) {
      throw badRequest("host not allowed");
    }
  }
}
```

Combine with egress firewall — app checks are not enough alone.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Result |
|--------------|--------|
| `fetch(req.body.url)` | Full SSRF |
| Allow `file://` | Local file read |
| Trust DNS rebinding without re-check | Bypass blocklist |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Metadata in app logs | SSRF exploit | Access logs | Block + rotate creds |
| Slow requests | Attacker scans internal ports | Timeouts | Deny + alert |
| “Works in staging” | Open egress | Network policy | Lock down |

---

## 11. Interview Q&A (with strong answers)

**Q: What is SSRF?**  
**A:** Attacker induces server to make requests to targets the attacker cannot reach directly, often internal services or cloud metadata.

**Q: Primary mitigations?**  
**A:** Avoid arbitrary URL fetch; allowlists; block private IPs; network egress controls; secure IMDS.

**Q: SSRF in this task app today?**  
**A:** No user-controlled outbound HTTP; risk appears when adding URL-fetch features — design controls first.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| SSRF | Server-Side Request Forgery |
| IMDS | Instance metadata service |
| Egress | Outbound network from server |
| Allowlist | Explicit permitted targets |
| Link-local | Addresses like 169.254.x.x |

---

## 13. Teach pointer

> “If the server fetches URLs users type, you gave attackers a VPN into your network.”

---

## 14. Optional further reading (not required)

- Webhooks API: [../api/webhooks.md](../api/webhooks.md)  
- Defense in depth: [defense-in-depth](./defense-in-depth.md)
