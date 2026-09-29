# Backend function guide (teaching + interviews)

This folder explains **every production and test function** in `backend/src`: what it does, what problem it solves, why it exists, how the developer was thinking, how you teach it, and **every interview angle** that code naturally invites.

## Four tracks (use all)

| Track | Purpose | Start here |
|-------|---------|------------|
| **How to think** | Build a feature from scratch — process order (**Standalone ✓**) | [how-to-think/README.md](./how-to-think/README.md) |
| **How to debug** | Read errors → open the right file (**Standalone ✓**) | [how-to-debug/README.md](./how-to-debug/README.md) |
| **Dedicated lessons** | Broader concepts (DB, API, security, ops…) (**Standalone ✓**) | [lessons/README.md](./lessons/README.md) |
| **Function guides** | Every function/method in the codebase | Order below |

**How to think** = *what order to decide things*. **How to debug** = *what the error is telling you*. **Lessons** = *what the ideas mean (beyond this repo)*. **Function guides** = *where they live in code*.

## How to read — when something breaks

Start at [how-to-debug/README.md](./how-to-debug/README.md) (standard: [_STANDALONE_DEBUG.md](./how-to-debug/_STANDALONE_DEBUG.md) · gold: [06-auth](./how-to-debug/06-auth-and-token-failures.md)) → status playbook → [symptom→concept](./how-to-debug/11-symptom-to-concept.md) → fix protocol.

## How to read — build from scratch

Follow [how-to-think/README.md](./how-to-think/README.md) (standard: [_STANDALONE_PROCESS.md](./how-to-think/_STANDALONE_PROCESS.md) · gold: [06-concurrency](./how-to-think/06-concurrency-and-failure.md)) steps 01→09, then [concept coverage](./how-to-think/10-concept-coverage.md). Walkthrough: [task comments](./how-to-think/08-build-the-feature-walkthrough.md).

## How to read — lessons (broader curriculum)

Full catalog + **read order (phases A→G):** [lessons/README.md](./lessons/README.md) (**110+ Standalone ✓** — order is guidance, not prerequisites).

Standard: [lessons/_STANDALONE_STANDARD.md](./lessons/_STANDALONE_STANDARD.md) · Gold: [transactions](./lessons/database/transactions.md).

Categories (each has its own numbered order): [architecture](./lessons/architecture/) · [api](./lessons/api/) · [database](./lessons/database/) · [security](./lessons/security/) · [testing](./lessons/testing/) · [ops](./lessons/ops/)

## How to read — function guides (order)

1. [shared-bootstrap.md](./shared-bootstrap.md) — process start, Express app, env, DB, Redis, middleware, errors, tokens, cookies, rate limits, health, API wiring  
2. [auth.md](./auth.md) — register → verify → login → refresh → logout → password flows  
3. [projects.md](./projects.md) — projects + members + ownership + soft-remove rules  
4. [tasks.md](./tasks.md) — CRUD, field-level authz, optimistic concurrency, IDOR guards  
5. [testing.md](./testing.md) — helpers + every test file and what it proves  

Do not skip “simple” pieces (e.g. `notFound`, Zod schemas, `map` helpers). Interviews often start there.

## Layered architecture (sketch — full lesson exists)

```
HTTP request
  → middleware (requestId, logger, cors, cookies, json, auth, rate limit)
  → route (wires URL → controller method)
  → controller (validate input, shape HTTP status/body, call service)
  → service (business rules, authz, transactions, orchestration)
  → repository (SQL only; maps rows ↔ domain types)
  → PostgreSQL / Redis
  → errors bubble to errorHandler
```

Full dedicated lesson: [layered-architecture](./lessons/architecture/layered-architecture.md).

## How to think like the author (questions before writing code)

Ask these before every new endpoint or helper — each maps to a dedicated lesson:

1. **Who is the actor?** → [authn-vs-authz](./lessons/security/authn-vs-authz.md)  
2. **What must never leak?** → [idor](./lessons/security/idor.md), [email-enumeration-and-timing](./lessons/security/email-enumeration-and-timing.md)  
3. **What if two requests race?** → [toctou](./lessons/database/toctou.md), [pessimistic-locking](./lessons/database/pessimistic-locking.md), [optimistic-concurrency](./lessons/database/optimistic-concurrency.md)  
4. **What if Redis/DB is down?** → [fail-closed-rate-limits](./lessons/security/fail-closed-rate-limits.md)  
5. **Where does the secret live?** → [cookies-xss-csrf](./lessons/security/cookies-xss-csrf.md), [password-and-token-hashing](./lessons/security/password-and-token-hashing.md)  
6. **How do we prove it?** → [testing-as-proof](./lessons/testing/testing-as-proof.md)

## How to use this for teaching

**Concept day:** pick one [lesson](./lessons/README.md) → wrong world → repo map → interview bank → matching test.  
**Code day:** pick one request path → walk function guides → jump to the lesson when a concept appears (e.g. hit `FOR UPDATE` → open [pessimistic-locking](./lessons/database/pessimistic-locking.md)).

## How to drill for interviews

1. Drill a **lesson** end-to-end (definition without notes, then code pointers).  
2. Drill the matching **function** section and **test** file.  
3. Cross-link two lessons in one answer (e.g. TOCTOU + defense in depth).

### Cross-project themes → dedicated lessons

| Theme | Lesson | Code / tests |
|-------|--------|--------------|
| Layered architecture | [layered-architecture](./lessons/architecture/layered-architecture.md) | `*.routes.ts`, controllers/services/repos |
| Authn vs authz / field-level | [authn-vs-authz](./lessons/security/authn-vs-authz.md) | `authenticate`, `assertCanUpdateTask` |
| 401 / 403 / 404 / 409 | [http-status-semantics](./lessons/api/http-status-semantics.md) | `shared/errors`, IDOR/authz tests |
| IDOR | [idor](./lessons/security/idor.md) | `tasks.idor.test.ts` |
| TOCTOU / races | [toctou](./lessons/database/toctou.md) | concurrency + removal tests |
| `FOR UPDATE` | [pessimistic-locking](./lessons/database/pessimistic-locking.md) | member locks, transfer |
| OCC / `expectedUpdatedAt` | [optimistic-concurrency](./lessons/database/optimistic-concurrency.md) | `TaskRepository.update` |
| Refresh rotation / reuse | [refresh-rotation-and-reuse](./lessons/security/refresh-rotation-and-reuse.md) | `AuthService.refresh` |
| Enumeration / timing | [email-enumeration-and-timing](./lessons/security/email-enumeration-and-timing.md) | login / forgot / resend |
| Argon2 + token hash | [password-and-token-hashing](./lessons/security/password-and-token-hashing.md) | `AuthService` |
| Cookies / XSS / CSRF | [cookies-xss-csrf](./lessons/security/cookies-xss-csrf.md) | `refresh-cookie.ts` |
| Fail-closed rate limits | [fail-closed-rate-limits](./lessons/security/fail-closed-rate-limits.md) | `rate-limit.ts` |
| Soft delete / invariants | [soft-delete-and-invariants](./lessons/database/soft-delete-and-invariants.md) | `removeMember` |
| App + DB depth | [defense-in-depth](./lessons/security/defense-in-depth.md) | `23505` / `23514` mapping |
| Boot / shutdown | [boot-and-graceful-shutdown](./lessons/ops/boot-and-graceful-shutdown.md) | `server.ts` |
| Tests as proof | [testing-as-proof](./lessons/testing/testing-as-proof.md) | `src/test/**` |

## File map

| Doc | Source trees |
|-----|----------------|
| **how-to-think/** | From-scratch feature/process playbook (steps 01–09) |
| **how-to-debug/** | Read errors → classify → open the right file (01–10) |
| **lessons/** | Concept curriculum by category: `database/`, `api/`, `architecture/`, `security/`, `ops/`, `testing/` |
| shared-bootstrap | `server.ts`, `app.ts`, `api/`, `config/`, `db/`, `shared/`, `modules/health/`, `types/` |
| auth | `modules/auth/**` |
| projects | `modules/projects/**` |
| tasks | `modules/tasks/**` |
| testing | `src/test/**` |

## Per-entry template (used everywhere)

1. **Where**  
2. **What it does**  
3. **Problem it solves**  
4. **Why this shape**  
5. **How to think like that**  
6. **Teach pointer**  
7. **Fits where**  
8. **Interview bank** (axes: What/How, Why, Failure modes, Security, Data/consistency, HTTP/API, Ops, Testing, Tradeoffs/senior) — every applicable question, not a sample subset  

## Related

- HTTP contract overview: [`../openapi.yaml`](../openapi.yaml) (Swagger UI at `/api/docs` in non-production)
