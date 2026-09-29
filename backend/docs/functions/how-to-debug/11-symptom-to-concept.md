# 11 — Symptom → concept map

**Standalone ✓** — This map is itself a hunting tool: for each symptom, check the short “before the lesson” column first, then open the lesson only if you still need the concept. You do not need the full lessons catalog to start.

**After this file you can:** match a failure shape to a concept name, know what to verify in *this* app before studying, and jump to the right how-to-debug playbook.

Guides 01–10 teach *how to hunt*. This file connects failures to the concept catalog (including lessons this repo may only cousin-implement).

---

## How to use

1. Find the row closest to your symptom.  
2. Do the **Check before lesson** steps (often enough to fix).  
3. Open the lesson only for depth / interview prep.  
4. Use **Then debug** for the specialist hunt file.

---

## Map

| Symptom / question | Check before lesson | Open lesson | Then debug |
|--------------------|---------------------|-------------|------------|
| Torn data / half-updated | Was the write in one `sql.begin`? Which statements committed? | [transactions](../lessons/database/transactions.md) | [05](./05-postgres-and-redis-errors.md) |
| “Sometimes” wrong under load | Reproduce with `Promise.all`; sketch check→write gap | [toctou](../lessons/database/toctou.md), [isolation-levels](../lessons/database/isolation-levels.md) | [08](./08-concurrency-and-flaky-failures.md) |
| Waiting / blocked on write | Who holds the row? `FOR UPDATE` in `removeMember` / transfer? | [locking-kinds](../lessons/database/locking-kinds.md) | [08](./08-concurrency-and-flaky-failures.md) |
| Task PATCH 409 reload | Client `expectedUpdatedAt` vs row `updatedAt`; ms truncation | [optimistic-concurrency](../lessons/database/optimistic-concurrency.md) | [08](./08-concurrency-and-flaky-failures.md) |
| Slow list as data grows | Explain plan on list query; N+1 in loops? | [indexing](../lessons/database/indexing.md), [pagination](../lessons/database/pagination.md), [n-plus-one](../lessons/database/n-plus-one.md) | measure queries |
| 23505 / 23514 / 23503 | Map SQLSTATE → AppError in service; constraint name | [constraints-and-fk](../lessons/database/constraints-and-fk.md) | [05](./05-postgres-and-redis-errors.md) |
| Migrate failed | Which migration file; forward-only? DB URL | [migrations](../lessons/database/migrations.md) | [05](./05-postgres-and-redis-errors.md) |
| Connection exhaustion | Pool size; leaked clients; load spike | [connection-pooling](../lessons/database/connection-pooling.md) | [05](./05-postgres-and-redis-errors.md) |
| 400 Validation failed | Zod schema for that route; body shape / Content-Type | [validation-boundary](../lessons/api/validation-boundary.md) | [04](./04-status-code-playbook.md) |
| Extra fields changed role | Allow-list in service (`assertCanUpdateTask`); strip unknown | [mass-assignment](../lessons/security/mass-assignment.md) | [07](./07-authz-idor-and-unexpected-403-404.md) |
| Browser CORS error | `FRONTEND_URL` exact; `credentials`; not `*` | [cors](../lessons/api/cors.md) | [06](./06-auth-and-token-failures.md) |
| Cookie missing in prod | Path `/api/v1/auth`; Secure; SameSite; HTTPS | [tls-https](../lessons/security/tls-https.md), [cookies-xss-csrf](../lessons/security/cookies-xss-csrf.md) | [06](./06-auth-and-token-failures.md) |
| 401 JWT | Bearer present; secret; exp; `/me` | [authn-vs-authz](../lessons/security/authn-vs-authz.md) | [06](./06-auth-and-token-failures.md) |
| 403/404 access | Membership ACTIVE; task `projectId` bind | [idor](../lessons/security/idor.md), [least-privilege](../lessons/security/least-privilege.md) | [07](./07-authz-idor-and-unexpected-403-404.md) |
| Login 503 | Redis up; fail-closed limiter message | [fail-closed-rate-limits](../lessons/security/fail-closed-rate-limits.md) | [05](./05-postgres-and-redis-errors.md) |
| Double charge / double create on retry | Idempotency key / unique natural key? | [idempotency](../lessons/api/idempotency.md) | [08](./08-concurrency-and-flaky-failures.md) |
| Email never sent after register | Non-prod console token; outbox row? | [outbox-events](../lessons/architecture/outbox-events.md) | [06](./06-auth-and-token-failures.md) |
| Dependency timeout pileup | Timeouts/retries amplifying load? | [retry-backoff-timeouts](../lessons/ops/retry-backoff-timeouts.md), [circuit-breaker](../lessons/ops/circuit-breaker.md) | [10](./10-fix-protocol.md) |
| OOM / huge body | Payload limit middleware; upload size | [payload-limits](../lessons/api/payload-limits.md), [backpressure](../lessons/ops/backpressure.md) | [02](./02-classify-the-failure.md) |
| Can’t find request in logs | `requestId` / `X-Request-Id` on response | [structured-logging-metrics-tracing](../lessons/ops/structured-logging-metrics-tracing.md) | [01](./01-read-the-signal.md) |
| K8s kill loop / no traffic | Readiness vs liveness; boot migrate | [health-readiness](../lessons/ops/health-readiness.md), [boot-and-graceful-shutdown](../lessons/ops/boot-and-graceful-shutdown.md) | [02](./02-classify-the-failure.md) |
| Stale cached authz | Is authz cached at all here? TTL? | [caching](../lessons/architecture/caching.md) | [07](./07-authz-idor-and-unexpected-403-404.md) |
| SQL looks concatenated | Uses `postgres` tagged templates? | [sql-injection-prevention](../lessons/security/sql-injection-prevention.md) | security review |
| Secret in repo/logs | Rotate now; scrub logs | [secrets-management](../lessons/security/secrets-management.md) | rotate now |
| Feature down should soft-fail | Explicit degrade decision vs fail-closed | [graceful-degradation](../lessons/ops/graceful-degradation.md) | product decision |
| Test red only | preload / `resetDb` / helper throw first | [testing-as-proof](../lessons/testing/testing-as-proof.md) | [09](./09-test-failures.md) |
| Cross-tenant data leak | Project membership on every query | [multi-tenancy](../lessons/architecture/multi-tenancy.md), [idor](../lessons/security/idor.md) | [07](./07-authz-idor-and-unexpected-403-404.md) |
| Webhook hits internal IP | URL allowlist; no link-local | [ssrf](../lessons/security/ssrf.md), [webhooks](../lessons/api/webhooks.md) | [10](./10-fix-protocol.md) |
| `../` in file download | Path resolve under root | [path-traversal](../lessons/security/path-traversal.md), [file-uploads](../lessons/api/file-uploads.md) | [10](./10-fix-protocol.md) |
| Deadlock `40P01` | Lock order; retry once? | [deadlocks-deep](../lessons/database/deadlocks-deep.md) | [08](./08-concurrency-and-flaky-failures.md) |
| Replica lag authz flicker | Reading membership from replica? | [replication](../lessons/database/replication.md), [eventual-consistency-cap](../lessons/database/eventual-consistency-cap.md) | [07](./07-authz-idor-and-unexpected-403-404.md) |
| Search returns other projects | Filter by `project_id` / membership | [full-text-search](../lessons/database/full-text-search.md), [idor](../lessons/security/idor.md) | [07](./07-authz-idor-and-unexpected-403-404.md) |
| Dual-write email missing | DB commit without outbox insert? | [outbox-events](../lessons/architecture/outbox-events.md), [message-queues](../lessons/architecture/message-queues.md) | [06](./06-auth-and-token-failures.md) |
| Socket events missing on other pods | Pub/sub between instances? | [websockets-sse](../lessons/api/websockets-sse.md), [pub-sub](../lessons/architecture/pub-sub.md) | [08](./08-concurrency-and-flaky-failures.md) |
| Deploy broke mid-migrate | Expand/contract; lock duration | [migrations](../lessons/database/migrations.md), [blue-green-canary](../lessons/ops/blue-green-canary.md) | [02](./02-classify-the-failure.md) |
| Pages noisy / no pages | Alert threshold; runbook link | [alerting](../lessons/ops/alerting.md), [on-call-runbooks](../lessons/ops/on-call-runbooks.md) | [01](./01-read-the-signal.md) |
| GraphQL expensive query | Depth/complexity limits; N+1 | [graphql-basics](../lessons/api/graphql-basics.md), [n-plus-one](../lessons/database/n-plus-one.md) | [10](./10-fix-protocol.md) |
| CDN served wrong user’s JSON | Cache key includes auth? | [cdn-edge](../lessons/ops/cdn-edge.md), [caching](../lessons/architecture/caching.md) | [07](./07-authz-idor-and-unexpected-403-404.md) |
| Wrong status / unclear error JSON | Which `AppError` subclass? `errorHandler` shape? | [error-model-and-app-errors](../lessons/architecture/error-model-and-app-errors.md) | [01](./01-read-the-signal.md), [04](./04-status-code-playbook.md) |
| Can’t correlate client ↔ server logs | Response `X-Request-Id` / body `requestId`? | [request-id-and-correlation](../lessons/ops/request-id-and-correlation.md) | [01](./01-read-the-signal.md) |
| DTO leaked domain / wrong shape | Controller DTO vs service domain types | [dto-vs-domain](../lessons/architecture/dto-vs-domain.md) | [03](./03-trace-the-request-path.md) |
| Timestamp / OCC skew / “future” times | UTC storage; `expectedUpdatedAt` round-trip; clock skew | [utc-timestamps-and-clocks](../lessons/database/utc-timestamps-and-clocks.md) | [08](./08-concurrency-and-flaky-failures.md) |
| Tests cross-talk / order-dependent | `beforeEach(resetDb)`? unique emails? worker DB? | [test-isolation-and-fixtures](../lessons/testing/test-isolation-and-fixtures.md) | [09](./09-test-failures.md) |
| Spec ↔ code drift / client codegen wrong | `openapi.yaml` path vs route; status codes | [openapi-contract-first](../lessons/api/openapi-contract-first.md) | [10](./10-fix-protocol.md) |
| Retry created duplicates / at-least-once | Unique key or idempotency key store? | [at-least-once-and-idempotency-keys](../lessons/architecture/at-least-once-and-idempotency-keys.md) | [08](./08-concurrency-and-flaky-failures.md) |
| Incident blame / repeat outage | Timeline + action items; not hero culture | [blameless-postmortems](../lessons/ops/blameless-postmortems.md) | [10](./10-fix-protocol.md) |

Full catalog: [../lessons/README.md](../lessons/README.md).

---

## Quick class → guide

| Class | Start |
|-------|--------|
| Parse status/body/log | [01](./01-read-the-signal.md) |
| Boot vs request vs test | [02](./02-classify-the-failure.md) |
| Know URL, not layer | [03](./03-trace-the-request-path.md) |
| Status playbook | [04](./04-status-code-playbook.md) |
| Postgres / Redis | [05](./05-postgres-and-redis-errors.md) |
| Login / JWT / refresh | [06](./06-auth-and-token-failures.md) |
| Membership / IDOR | [07](./07-authz-idor-and-unexpected-403-404.md) |
| Race / OCC / flake | [08](./08-concurrency-and-flaky-failures.md) |
| bun:test red | [09](./09-test-failures.md) |
| Fix discipline | [10](./10-fix-protocol.md) |

---

## Teach pointer

> “Symptoms name concepts. Concepts name files. Files name fixes. Check the app before opening the textbook.”

## Back

[README.md](./README.md) · [../lessons/README.md](../lessons/README.md) · [../how-to-think/10-concept-coverage.md](../how-to-think/10-concept-coverage.md) · Standard: [_STANDALONE_DEBUG.md](./_STANDALONE_DEBUG.md)
