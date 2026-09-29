# Lesson: CORS (Cross-Origin Resource Sharing)

**Standalone ✓** — You do not need any other doc to understand CORS in browser + API setups.

**After this file you can:** explain why browsers block cross-origin calls, configure CORS for cookie-based SPAs, debug “network errors” that are really CORS, and answer interview questions without hand-waving.

---

## 1. First principles

**CORS** is a **browser-enforced** policy: JavaScript running on **origin A** (scheme + host + port) may read responses from **origin B** only if **B’s HTTP response** includes headers that explicitly allow A.

**Why it exists:** Without it, any malicious site you visit could use your browser’s cookies/session to call your bank (or your task app) and read the JSON response — classic cross-site data theft.

**What problem disappears when you configure it correctly:** Your legitimate SPA (different port or domain from the API) can call the API and read JSON **without** disabling browser security globally.

**What CORS is not:** API authentication. `curl`, Postman, and server-to-server clients ignore CORS. Your routes still need authn/authz.

---

## 2. Mental model

### Analogy

The API is a building with a **reception desk for browsers only**. Non-browser visitors walk in the front door (no CORS check). Browser JS must show an **invitation letter** (`Access-Control-Allow-Origin`) naming its exact origin before the browser lets JS read the response body.

### Diagram

```text
Browser tab: https://app.example:5173
        │
        │ fetch("https://api.example:3000/api/v1/...", { credentials: "include" })
        ▼
API responds with headers:
  Access-Control-Allow-Origin: https://app.example:5173   ← must match, not *
  Access-Control-Allow-Credentials: true                  ← if cookies sent
        │
        ▼
Browser: allow JS to read body  OR  block + console CORS error
```

### Simple vs preflight

| Request shape | Browser behavior |
|---------------|------------------|
| “Simple” (GET, certain POST content-types, no custom headers) | May go straight; response headers checked |
| “Non-simple” (JSON body, `Authorization`, custom headers) | **OPTIONS preflight** first; server must allow method + headers |

---

## 3. Core rules (must / must-not)

1. **MUST** set `Access-Control-Allow-Origin` to the **exact** frontend origin(s) when using cookies (`credentials: true`).  
2. **MUST NOT** use `Access-Control-Allow-Origin: *` together with `credentials: true` — browsers reject this combination.  
3. **MUST** keep `FRONTEND_URL` (or equivalent) aligned with where the SPA actually runs (dev port vs production domain).  
4. **MUST NOT** treat CORS as a substitute for auth — it only gates **browser JS readability**.  
5. **MUST** ensure preflight (`OPTIONS`) succeeds for JSON APIs (Express `cors` middleware handles this when mounted early).  
6. **MUST NOT** expose admin-only APIs “because CORS hides them” — attackers bypass CORS trivially.

---

## 4. How it works (mechanics)

1. Browser compares **request origin** (from the page) to **response** `Access-Control-Allow-Origin`.  
2. If `credentials: "include"`, the allowed origin must be a **single explicit value**, not `*`.  
3. Preflight: browser sends `OPTIONS` with `Access-Control-Request-Method` / `Access-Control-Request-Headers`; server responds with allowed methods/headers.  
4. If check fails, the **network request may still complete** on the server, but JS cannot read the response → devtools shows a CORS error, often misread as “API down.”  
5. **SameSite cookies** and **CSRF** are separate layers; CORS does not stop a form POST from another site (see optional cookies lesson).

---

## 5. When to use / when not to use

| Situation | CORS config on API? |
|-----------|-------------------|
| SPA on different origin than API, browser `fetch` | **Yes** — explicit origin + credentials if cookies |
| Mobile app / server job calling API | **No CORS needed** (not a browser JS context) |
| API only consumed via same-origin Next.js proxy | Often **no** cross-origin from browser to API |
| Public read-only API, no credentials, no custom headers | Simpler rules possible; still document origins if browsers call it |
| “Security through hiding API” | **Wrong tool** — use auth instead |

---

## 6. Step-by-step: design → implement → verify

### Design

1. List every browser origin that will call the API (local dev, staging, prod).  
2. Decide cookie vs Bearer-only auth (this app: **HttpOnly refresh cookie** → credentials required).  
3. Document env var (`FRONTEND_URL`) per environment.

### Implement

1. Mount CORS **before** routes and body parsers (global middleware).  
2. Set `origin` to configured frontend URL; set `credentials: true` if cookies cross-origin.  
3. Ensure login/refresh responses set cookies with attributes compatible with cross-site use (Secure, SameSite=None in prod cross-site, etc.).

### Verify

1. From the real SPA origin, call an authenticated endpoint; no CORS console errors.  
2. From a **wrong** origin, confirm browser blocks **reading** (server may still log the hit).  
3. Check preflight in devtools Network tab for `POST` with `Content-Type: application/json`.

---

## 7. Worked example A — this project

Global middleware in `backend/src/app.ts`:

```ts
app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true,
  }),
);
```

**Why each piece matters:**

- **`origin: env.frontendUrl`** — single explicit allowlist entry; works with credentials (unlike `*`).  
- **`credentials: true`** — tells browser it may expose responses to JS when the client sends cookies (`credentials: "include"`). Matches refresh-token-in-cookie design.  
- **Mounted before** `app.use("/api", apiRouter)` — all API routes inherit CORS headers.

**Env:** `FRONTEND_URL` must match the SPA (e.g. `http://localhost:5173` in dev). Wrong value → successful server logs but browser shows opaque “Network Error.”

**Where:** `backend/src/app.ts`, `backend/src/config/env.ts` (frontend URL validation).

---

## 8. Worked example B — mini scenario (self-contained)

**Setup:** API at `https://api.tasks.io`, SPA at `https://app.tasks.io`, session cookie on login.

```ts
// api/app.ts
import cors from "cors";
app.use(
  cors({
    origin: "https://app.tasks.io",
    credentials: true,
  }),
);
```

```ts
// spa: login
await fetch("https://api.tasks.io/auth/login", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
```

**Failure:** Developer sets `origin: "*"` with `credentials: true` → browser refuses to expose response; login “works” in Network tab (200) but JS throws.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| `origin: *` + cookies | Browser blocks response to JS |
| CORS allows `localhost:3000` but SPA runs on `5173` | Intermittent “API broken” in dev |
| CORS only on `/auth` routes | Other JSON routes fail preflight |
| “We’re safe — CORS blocks Postman” | False sense of security |
| Disabling CORS in browser for dev | Masks misconfig until production |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Browser “Network Error”, server 200 | CORS headers missing/wrong | Response headers; request `Origin` | Fix `origin` to match SPA |
| Works in curl, fails in browser | CORS-only issue | Compare `Origin` header | Configure CORS, not server logic |
| Preflight 404/405 | OPTIONS not handled | Network tab OPTIONS | Mount `cors()` globally |
| Cookie not sent cross-origin | Client missing `credentials: "include"` | fetch options | Add credentials on client |
| Cookie sent but not stored | SameSite/Secure mismatch | Set-Cookie attributes | Align cookie policy with cross-site needs |

---

## 11. Interview Q&A (with strong answers)

**Q: What is CORS?**  
**A:** A browser mechanism that restricts whether JavaScript on one origin can read responses from another origin, unless the response includes explicit allow headers.

**Q: Why can’t you use `*` with credentials?**  
**A:** Allowing any origin to read credentialed responses would let malicious sites steal authenticated API data; the spec forbids `*` when credentials are involved.

**Q: Does CORS protect the API from attackers?**  
**A:** No. It protects **users’ browsers** from malicious sites reading responses. Servers must still authenticate and authorize every request.

**Q: What is a preflight request?**  
**A:** An `OPTIONS` request the browser sends before certain cross-origin requests to ask which methods and headers are permitted.

**Q: Is CORS enough to prevent CSRF?**  
**A:** No. CSRF concerns cross-site **request submission**; CORS governs **reading** responses. Use SameSite cookies, CSRF tokens, or double-submit patterns where needed.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Origin | Scheme + host + port tuple |
| Simple request | Cross-origin request class with limited methods/headers |
| Preflight | OPTIONS probe before non-simple requests |
| `Access-Control-Allow-Origin` | Header naming permitted caller origin |
| Credentials | Cookies, client certs, or Authorization in credentialed fetches |
| Same-origin policy | Broader browser isolation CORS relaxes selectively |

---

## 13. Teach pointer

> “CORS is the browser’s bouncer for **reading** cross-origin responses — not your API’s auth system.”

---

## 14. Optional further reading (not required)

- Cookies + CSRF: [../security/cookies-xss-csrf.md](../security/cookies-xss-csrf.md)  
- App bootstrap order: `backend/src/app.ts`, `backend/docs/functions/shared-bootstrap.md`
