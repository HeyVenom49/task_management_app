# Shared bootstrap, infrastructure, and cross-cutting helpers

Covers process entry, Express wiring, config, DB, Redis, middleware, error types, JWT/cookies/rate limits, logger, health, and Express type augmentation.

Reading order inside this file: **server → app → api → env → db → redis → middleware → errors → auth helpers → logger → health → types**.

---

## Mental model for this layer

Everything here answers: *How does a raw TCP connection become a safe, observable, versioned HTTP API?*

Nothing here owns “create a project” business rules. It owns **safety rails** (auth middleware, errors, limits), **observability** (request id, logs), and **lifecycle** (start/stop Redis/DB connections).

---

# `src/server.ts`

## `start`

1. **Where:** `server.ts` → `start`  
2. **What it does:** Connects Redis, then starts the HTTP server listening on `env.port`.  
3. **Problem it solves:** App must not accept traffic before dependencies it needs (Redis for rate limits) are ready.  
4. **Why this shape:** Explicit async boot instead of “listen immediately and hope Redis connects later.”  
5. **How to think like that:** Ask: *What fails first if Redis is down? Do we want half-started servers?*  
6. **Teach pointer:** “Boot order is a dependency graph, not an accident.”  
7. **Fits where:** Process entry after `dotenv` + imports.  
8. **Interview bank:**  
   - **What/How:** Walk `start` line by line. Why wrap `listen` in a Promise?  
   - **Why:** Why connect Redis before listen?  
   - **Failure modes:** What happens if `connectRedis` throws? (`start().catch` → exit 1)  
   - **Security:** Does listening on all interfaces matter in containers?  
   - **Data:** Is Postgres connected here? (Client is created on import; no explicit connect in `start`.)  
   - **Ops:** How would you add a readiness probe vs liveness?  
   - **Testing:** How do tests avoid calling `start`? (They import `app` via supertest.)  
   - **Tradeoffs:** Eager Redis connect vs lazy connect on first rate-limit hit?

## `shutdown`

1. **Where:** `server.ts` → `shutdown`  
2. **What it does:** On SIGTERM/SIGINT: stop accepting new connections (`server.close`), quit Redis, end Postgres pool, exit 0.  
3. **Problem it solves:** Deploy/restart without dropping in-flight requests abruptly or leaking connections.  
4. **Why this shape:** Ordered teardown: HTTP first, then Redis, then SQL.  
5. **How to think like that:** *If I kill the process mid-request, what happens to the client and the DB?*  
6. **Teach pointer:** “Graceful shutdown is product quality for ops.”  
7. **Fits where:** `process.on("SIGTERM"|"SIGINT")`.  
8. **Interview bank:**  
   - **What/How:** Order of cleanup and why.  
   - **Why:** Why `sql.end({ timeout: 5 })`?  
   - **Failure modes:** What if `server.close` errors?  
   - **Data:** Open transactions during shutdown?  
   - **Ops:** Kubernetes SIGTERM → grace period relationship.  
   - **Tradeoffs:** Force-kill after timeout vs hang forever.

## Top-level `process.on` handlers + `start().catch`

Same file. Problem: unhandled boot failure must exit non-zero so orchestrators restart/fail the deploy. Interview: difference between uncaughtException vs rejecting the boot promise.

---

# `src/app.ts`

## Module body (Express app construction)

1. **Where:** `app.ts` (module scope)  
2. **What it does:** Builds the Express application: CORS, optional Swagger, middleware chain, `/api` router, 404, error handler. Exports `app`.  
3. **Problem it solves:** Separate **app** (request handling) from **server** (listen/lifecycle) so tests can hit routes without binding a port.  
4. **Why this shape:** Classic testable Express pattern.  
5. **How to think like that:** *Can I unit/integration-test without `listen`?*  
6. **Teach pointer:** “`app` is the product; `server` is the process wrapper.”  
7. **Fits where:** Imported by `server.ts` and test `http` helper.  
8. **Interview bank:**  
   - **What/How:** List middleware order top to bottom and what each needs from earlier ones.  
   - **Why:** Why is `errorHandler` last? Why is `notFound` before it?  
   - **Failure modes:** What if `errorHandler` is registered before routes?  
   - **Security:** CORS `origin: env.frontendUrl` + `credentials: true` — why both? What breaks with `*` + credentials?  
   - **HTTP:** Why `express.json({ limit: "100kb" })`?  
   - **Ops:** Why Swagger only when `nodeEnv !== "production"`?  
   - **Testing:** How does OpenAPI load path use `import.meta.dirname`?  
   - **Tradeoffs:** Mount Swagger behind auth in staging?

### Middleware order (memorize for interviews)

1. `cors`  
2. Swagger (non-prod)  
3. `requestId`  
4. `requestLogger`  
5. `cookieParser`  
6. `express.json`  
7. `/api` router  
8. `notFound`  
9. `errorHandler`  

Interview questions:

- Why must `requestId` run before `requestLogger` and `errorHandler`?  
- Why `cookieParser` before auth routes that read refresh cookies?  
- What happens to async errors if a route forgets `next(err)`?

---

# `src/api/index.ts` — `apiRouter`

1. **Where:** `api/index.ts`  
2. **What it does:** Mounts versioned API at `/v1`.  
3. **Problem it solves:** URL versioning so breaking changes can live under `/v2` without breaking old clients.  
4. **Why this shape:** Thin composition root for API versions.  
5. **Teach pointer:** “Version the contract, not every internal file.”  
6. **Interview bank:** Path versioning vs header versioning; when to bump `v1`→`v2`; does `/api` without version confuse clients?

# `src/api/v1.ts` — `v1Router`

1. **Where:** `api/v1.ts`  
2. **What it does:** Mounts health, auth, projects, and nested tasks (`/projects/:id/tasks`).  
3. **Problem it solves:** Single place to see the public surface of v1.  
4. **Why nest tasks under projects:** Tasks are project-scoped resources; URL encodes the parent (REST nesting).  
5. **Interview bank:**  
   - Why `mergeParams` needed on task router (answered in tasks doc)?  
   - Pros/cons of nesting vs flat `/tasks/:id` with project in body.  
   - How would you add `/admin` routes?

---

# `src/config/env.ts`

## `envSchema` + parse + production guard + exported `env`

1. **Where:** `config/env.ts`  
2. **What it does:** Validates `process.env` with Zod at import time; maps to a typed camelCase object; **throws** if production and `COOKIE_SECURE` is false.  
3. **Problem it solves:** Misconfigured deploys fail fast instead of failing weirdly at runtime (empty JWT secret, missing DB URL).  
4. **Why this shape:** Schema-as-single-source-of-truth; coerce numbers/booleans; defaults for local DX.  
5. **How to think like that:** *What is the cheapest moment to discover bad config?*  
6. **Teach pointer:** “Config is code’s contract with the environment.”  
7. **Fits where:** Imported everywhere secrets/ports are needed.  
8. **Interview bank:**  
   - **What/How:** Which vars are required vs defaulted? Why `JWT_SECRET` min 16?  
   - **Why:** Why fail production when cookies are not Secure?  
   - **Failure modes:** What if `DATABASE_URL` missing?  
   - **Security:** Should `REDIS_URL` be optional? Default Redis localhost implications.  
   - **Ops:** 12-factor config; secrets in env vs files.  
   - **Testing:** How `preload.ts` seeds env before imports.  
   - **Tradeoffs:** Zod at boot vs lazy getters; `z.coerce.boolean()` quirks (`"false"` string).

---

# `src/db/client.ts`

## default export `sql`

1. **Where:** `db/client.ts`  
2. **What it does:** Creates a `postgres` (postgres.js) client from `env.databaseUrl`.  
3. **Problem it solves:** One shared pool/client for the process.  
4. **Why this shape:** Tagged-template SQL (`sql\`...\``) reduces injection risk vs string concat.  
5. **Interview bank:**  
   - Parameterized queries vs string interpolation.  
   - Pool sizing; connection limits in serverless.  
   - Why export default vs named.  
   - How transactions work (`sql.begin`).  
   - ORM vs query builder vs raw SQL tradeoffs for this app.

# `src/db/migrate.ts`

## `migrate` (+ top-level try/finally)

1. **Where:** `db/migrate.ts`  
2. **What it does:** Ensures `schema_migrations` table; lists `*.sql` files; applies unapplied ones **inside a transaction** with version insert; skips applied; exits 1 on failure; always `sql.end()`.  
3. **Problem it solves:** Repeatable, ordered schema evolution across environments.  
4. **Why this shape:** Filename `001_name.sql` encodes version; transaction ties DDL + bookkeeping.  
5. **How to think like that:** *If migration 3 fails halfway, is the DB half-migrated?* (Transaction for that file.)  
6. **Teach pointer:** “Migrations are append-only history, not editable past.”  
7. **Interview bank:**  
   - **What/How:** Why `schema_migrations`? Why sort files? Why reject bad filenames?  
   - **Why:** Why skip `._*` files (macOS resource forks)?  
   - **Failure modes:** Expanding vs contracting migrations; lock contention.  
   - **Data:** `unsafe` for multi-statement SQL — risks?  
   - **Ops:** Run migrate in CI vs container entrypoint vs separate Job.  
   - **Tradeoffs:** Flyway/Liquibase vs hand-rolled; down migrations yes/no.

---

# `src/shared/redis/redis.ts`

## `redis` client

1. **What:** Singleton Redis client; URL from env or localhost.  
2. **Problem:** Shared store for rate-limit counters across instances.  
3. **Interview:** Why log `error` events; reconnect strategy; multi-instance rate limiting without Redis.

## `connectRedis` / `disconnectRedis`

1. **What:** Idempotent connect/quit based on `isOpen`.  
2. **Problem:** Avoid double-connect and hang on quit.  
3. **Interview:** `quit` vs `disconnect`; when Redis is optional for health but required for rate limits (this app: rate limit fail-closed).

---

# Middleware

## `requestId` (`shared/middleware/requestId.ts`)

1. **What:** Reads `x-request-id` or generates UUID; sets `req.requestId` and response header `X-Request-Id`.  
2. **Problem:** Correlate logs/errors across services and client bug reports.  
3. **Why accept incoming id:** Distributed tracing / gateway propagation.  
4. **Interview bank:**  
   - Spoofing request ids — is that a security issue? (Usually no; don’t trust them for auth.)  
   - UUID v4 vs ULID.  
   - Why set on response?  
   - How errorHandler uses it.

## `requestLogger` (`shared/middleware/requestLogger.ts`)

1. **What:** Records start time; on `res` `finish`, logs method, path, status, duration, requestId.  
2. **Problem:** Observability without blocking the request path on log I/O beyond pino’s design.  
3. **Why `finish`:** Know final status code after handlers run.  
4. **Interview bank:**  
   - Why not log body? (PII, size, passwords.)  
   - Access logs vs app logs.  
   - High-cardinality path params.  
   - Sampling in production.

## `authenticate` (`shared/middleware/authenticate.ts`)

1. **What:** Requires `Authorization: Bearer <token>`; verifies JWT; sets `req.user = { id: sub, email }`; otherwise `UnauthorizedError`.  
2. **Problem:** Protect routes without repeating verify logic.  
3. **Why catch-all → Unauthorized:** Do not leak “malformed JWT” vs “expired” details to clients (and unify error type).  
4. **Interview bank:**  
   - Authn vs authz — does this check project membership? (**No.**)  
   - Why Bearer scheme?  
   - Empty token after `Bearer `?  
   - Where is refresh token checked? (Not here — separate cookie/body flow.)  
   - Attaching user on request — alternatives (AsyncLocalStorage).  
   - Should expired token return 401 with WWW-Authenticate?

## `notFound` (`shared/middleware/notFound.ts`)

1. **What:** 404 JSON with method + originalUrl.  
2. **Problem:** Distinguish “route missing” from “handler forgot to respond.”  
3. **Interview:** Why before errorHandler; consistency of error shape vs AppError responses; information disclosure via path echoing.

## `errorHandler` (`shared/middleware/errorHandler.ts`)

1. **What:** If `AppError` → warn log + status + `{ message, requestId }`; else error log (with stack) + generic 500.  
2. **Problem:** Central place for safe client messages and rich server logs.  
3. **Why never send stack to client:** Security + UX.  
4. **Interview bank:**  
   - Express 4-arg signature requirement.  
   - Why `_next` unused but required.  
   - Mapping Zod errors here vs in controllers.  
   - Operational vs programmer errors.  
   - Retry-After for 503.  
   - Tie to `failures.test.ts`.

---

# Error classes (`shared/errors/*`)

## `AppError`

1. **What:** Base error with `status` + message.  
2. **Problem:** Carry HTTP semantics through throw sites without touching `res`.  
3. **Interview:** Why extend `Error`; setting `name`; instanceof across bundles.

## `BadRequestError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409), `ServiceUnavailableError` (503)

1. **What:** Thin subclasses with default messages.  
2. **Problem:** Consistent status mapping; readable throw sites (`throw new ForbiddenError(...)`).  
3. **Interview bank (apply to each):**  
   - When 401 vs 403? (Not authenticated vs authenticated but not allowed.)  
   - When 404 vs 403 for IDOR? (This app often uses **403 for cross-project**, **404 when task id doesn’t belong to URL project** — explain both philosophies.)  
   - When 409? (Unique violation, optimistic lock, business conflict like open tasks.)  
   - When 503? (Rate limit store down.)  
   - Why `index.ts` re-exports?

---

# Shared auth helpers

## `parseDurationToMs` (`shared/auth/duration.ts`)

1. **What:** Parses `15m`, `7d`, etc. into milliseconds.  
2. **Problem:** Cookie maxAge and session expiry need ms; env uses human strings.  
3. **Interview:** Invalid format throws; support for `ms` library; clock skew.

## `signAccessToken` / `verifyAccessToken` (`shared/auth/token.ts`)

1. **What:** HS256 JWT via `jose`; payload `{ sub, email }`; expiry from env.  
2. **Problem:** Short-lived proof of identity without DB lookup on every request.  
3. **Why jose:** Modern Web Crypto API friendly; avoid legacy `jsonwebtoken` pitfalls.  
4. **Why verify claim types:** Malicious/odd JWTs shouldn’t become `req.user` with wrong types.  
5. **Interview bank:**  
   - Access vs refresh responsibilities.  
   - Why email in JWT (convenience vs stale email).  
   - Symmetric HS256 vs RS256/JWKS.  
   - Revoking access tokens before expiry (you can’t easily — hence short TTL + refresh revoke).  
   - Algorithm confusion attacks.  
   - Where secret lives.

## Refresh cookie helpers (`shared/auth/refresh-cookie.ts`)

### `setRefreshCookie`

1. **What:** Sets `httpOnly`, `sameSite=lax`, path `/api/v1/auth`, Secure from env, maxAge from refresh duration.  
2. **Problem:** Store long-lived refresh where JS cannot read it (XSS mitigation).  
3. **Interview:** Why path scoped to `/api/v1/auth`? Why Lax not Strict? CSRF on cookie refresh? SameSite mitigations. Secure flag HTTPS-only.

### `clearRefreshToken`

1. **What:** Clears cookie with **same attributes** as set.  
2. **Problem:** Browsers only clear if path/secure/sameSite match.  
3. **Interview:** Classic cookie-clearing bugs.

### `readRefreshToken`

1. **What:** Cookie first, else body `refreshToken`.  
2. **Problem:** Web (cookie) + mobile (body) clients.  
3. **Interview:** Prefer cookie when both present?

### `wantsRefreshInBody`

1. **What:** True if `X-Client: mobile` (case-insensitive).  
2. **Problem:** Signal that client cannot use cookies reliably.  
3. **Interview:** Spoofable header — is that OK? (Yes; it only changes response shape, not auth strength.)

### `sendAuthTokens`

1. **What:** Always set cookie; strip refresh from JSON unless mobile wants body.  
2. **Problem:** One response helper for login/refresh.  
3. **Interview:** Dual delivery risks; documenting the contract in OpenAPI.

## Rate limiting (`shared/auth/rate-limit.ts`)

### `buildLimiter`

1. **What:** express-rate-limit with Redis store; on Redis failure throws `ServiceUnavailableError` (fail-closed).  
2. **Problem:** Brute-force login / abuse of write endpoints; shared limit across app instances.  
3. **Why fail-closed:** Prefer temporary outage over unlimited password guessing.  
4. **Interview bank:**  
   - Fail-open vs fail-closed.  
   - Keying by IP (default) vs user id.  
   - Window/max choices.  
   - Bypass in tests via passthrough when `NODE_ENV=test`.  
   - Prefix `rl:`.  
   - IPv6 / proxy `X-Forwarded-For` trust settings.

### `loginLimiter` / `authWriteLimiter`

1. **What:** Exported limiters (or passthrough in test).  
2. **Interview:** Which routes use which; should register be limited; CAPTCHA alternative.

---

# Logger (`shared/logger/logger.ts`)

## `canUsePretty` + `logger`

1. **What:** Pino logger; silent in test; pretty transport only in development if `pino-pretty` resolves.  
2. **Problem:** Fast structured logs in prod; readable logs in dev; quiet tests.  
3. **Interview:** Why not pretty in production; JSON logs + aggregation; log levels; child loggers with requestId (not wired yet — improvement question).

---

# Health (`modules/health`)

## `GET /` and `GET /db`

1. **What:** Liveness-ish OK; DB check runs `SELECT 1`.  
2. **Problem:** Orchestrators and humans verify process + DB connectivity.  
3. **Interview:** Liveness vs readiness; should `/db` be public; auth on health; Redis check; avoid expensive health queries.

## `index.ts` re-export

Barrel for clean imports. Interview: barrel file pros/cons.

---

# `src/types/express.d.ts`

1. **What:** Augments Express `Request` with `user`, `requestId`, `cookies`.  
2. **Problem:** Type-safe middleware contract without `as any`.  
3. **Interview:** Module augmentation; why `cookies` typed if cookie-parser already adds it; optional `user?`.

---

# File-level interview set — shared-bootstrap

### Junior
- Explain the request lifecycle from TCP to JSON response.  
- What is middleware? Give three examples from this app.  
- Difference between 401 and 403.  
- Why validate env at startup?  
- What does `httpOnly` cookie mean?

### Mid
- Why separate access JWT and refresh session?  
- Walk CORS + cookies for a SPA on another origin.  
- How does requestId help debug a production incident?  
- Rate limiting design with Redis and multiple Node processes.  
- Why is `errorHandler` four parameters?

### Senior
- Fail-closed rate limiting: product vs security tradeoff.  
- Token storage: cookie vs localStorage vs memory; XSS/CSRF matrix.  
- Migration strategy for zero-downtime deploys.  
- How would you add OpenTelemetry without rewriting every handler?  
- Threat model for this bootstrap layer alone.  
- What would you change for multi-tenant SaaS?

### Testing tie-ins
- `failures.test.ts` proves unknown routes and bad JWTs don’t leak internals.  
- Tests import `app`, not `server` — why?

---

# Teach-the-teacher script (5 minutes)

1. Draw the middleware stack on a whiteboard.  
2. Trace a bad JWT through `authenticate` → `errorHandler`.  
3. Ask: “Where does project authorization happen?” (Not here — projects/tasks.)  
4. Ask: “If Redis dies, can attackers brute-force login?” (No — 503.)  
5. Point at graceful shutdown and ask why Docker cares.
