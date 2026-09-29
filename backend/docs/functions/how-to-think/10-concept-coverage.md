# Step 10 — Concept coverage map (when building)

**Standalone ✓** — This map alone tells you *which* concept families to load for each build decision and *why*; you do not need every lesson open to choose the next doc.

**After this file you can:** pick the right lesson cluster for the decision in front of you, spot “forgot a concept?” gaps before PR, and point an interviewer at the catalog intentionally.

Use while walking steps 01–09. Home base = this repo; lessons also show **broader** examples when the concept isn’t implemented yet.

Process depth standard: [_STANDALONE_PROCESS.md](./_STANDALONE_PROCESS.md) (gold step: [06](./06-concurrency-and-failure.md)).

---

## Why this map exists

Steps 01–09 tell you *what to decide*. This file tells you *which named concepts unlock that decision* so you don’t rediscover transactions, IDOR, or outbox in production.

**Artifact:** a load list per feature (“for this ticket I open: idor, migrations, OCC, testing-as-proof…” ).

---

## Map: build step → concepts

### 01 Clarify

**Why load / decision unlocked:** Forces *who* and *resource shape* before endpoints. Least-privilege and REST design stop “logged-in means allowed” and UI-shaped URLs. Unlock: actors + job sentence + non-goals you can defend.

| Concepts |
|----------|
| [least-privilege](../lessons/security/least-privilege.md), [rest-resource-design](../lessons/api/rest-resource-design.md), [dto-vs-domain](../lessons/architecture/dto-vs-domain.md) |

### 02 Threats & invariants

**Why load / decision unlocked:** Names how Alice hurts Bob and what must always stay true. IDOR, authn/authz, TOCTOU, mass assignment, and injection lessons turn vague “be secure” into concrete invariants and 403/404 policy. Unlock: threat table + enforceable invariants.

| Concepts |
|----------|
| [idor](../lessons/security/idor.md), [toctou](../lessons/database/toctou.md), [authn-vs-authz](../lessons/security/authn-vs-authz.md), [email-enumeration-and-timing](../lessons/security/email-enumeration-and-timing.md), [mass-assignment](../lessons/security/mass-assignment.md), [sql-injection-prevention](../lessons/security/sql-injection-prevention.md), [defense-in-depth](../lessons/security/defense-in-depth.md), [threat-modeling-stride](../lessons/security/threat-modeling-stride.md), [ssrf](../lessons/security/ssrf.md), [path-traversal](../lessons/security/path-traversal.md), [pii-gdpr-basics](../lessons/security/pii-gdpr-basics.md) |

### 03 Shape API

**Why load / decision unlocked:** Picks routes, statuses, validation boundary, and client-retry semantics. Status semantics and validation lessons prevent “everything is 500”; idempotency / OpenAPI decide retry and contract truth. Unlock: route list + auth matrix + status map.

| Concepts |
|----------|
| [rest-resource-design](../lessons/api/rest-resource-design.md), [http-status-semantics](../lessons/api/http-status-semantics.md), [api-versioning](../lessons/api/api-versioning.md), [validation-boundary](../lessons/api/validation-boundary.md), [cors](../lessons/api/cors.md), [payload-limits](../lessons/api/payload-limits.md), [idempotency](../lessons/api/idempotency.md), [openapi-contract-first](../lessons/api/openapi-contract-first.md), [pagination-filtering](../lessons/api/pagination-filtering.md), [bulk-endpoints](../lessons/api/bulk-endpoints.md), [etags-conditional-requests](../lessons/api/etags-conditional-requests.md), [webhooks](../lessons/api/webhooks.md), [file-uploads](../lessons/api/file-uploads.md), [graphql-basics](../lessons/api/graphql-basics.md), [grpc-vs-rest](../lessons/api/grpc-vs-rest.md), [error-model-and-app-errors](../lessons/architecture/error-model-and-app-errors.md) |

### 04 Data model

**Why load / decision unlocked:** Tables become the last referee under race. Migrations, FKs/UNIQUE/CHECK, soft-delete, and UTC clocks decide what the DB will refuse even if the app regresses. Unlock: migration sketch + constraints that match invariants.

| Concepts |
|----------|
| [migrations](../lessons/database/migrations.md), [constraints-and-fk](../lessons/database/constraints-and-fk.md), [indexing](../lessons/database/indexing.md), [transactions](../lessons/database/transactions.md), [soft-delete-and-invariants](../lessons/database/soft-delete-and-invariants.md), [pagination](../lessons/database/pagination.md), [jsonb-document-fields](../lessons/database/jsonb-document-fields.md), [audit-tables](../lessons/database/audit-tables.md), [prepared-statements](../lessons/database/prepared-statements.md), [utc-timestamps-and-clocks](../lessons/database/utc-timestamps-and-clocks.md) |

### 05 Layers

**Why load / decision unlocked:** Places each rule in route/controller/service/repo so authz doesn’t drift into SQL strings in controllers. Layered architecture + DI + DTO-vs-domain keep HTTP, domain, and persistence separable. Unlock: file map + “what may import what.”

| Concepts |
|----------|
| [layered-architecture](../lessons/architecture/layered-architecture.md), [composition-root-di](../lessons/architecture/composition-root-di.md), [dto-vs-domain](../lessons/architecture/dto-vs-domain.md), [n-plus-one](../lessons/database/n-plus-one.md), [modular-monolith](../lessons/architecture/modular-monolith.md), [hexagonal-ports-adapters](../lessons/architecture/hexagonal-ports-adapters.md), [ddd-aggregates-bounded-context](../lessons/architecture/ddd-aggregates-bounded-context.md), [solid-in-backends](../lessons/architecture/solid-in-backends.md), [error-model-and-app-errors](../lessons/architecture/error-model-and-app-errors.md) |

### 06 Concurrency & failure

**Why load / decision unlocked:** Two requests and dead deps are where designs die. Locking, OCC, isolation, fail-closed limits, retries, and degradation teach which tool fits which interleaving. Unlock: race plan + tx boundary + 409/503 map.

| Concepts |
|----------|
| [locking-kinds](../lessons/database/locking-kinds.md), [pessimistic-locking](../lessons/database/pessimistic-locking.md), [optimistic-concurrency](../lessons/database/optimistic-concurrency.md), [isolation-levels](../lessons/database/isolation-levels.md), [deadlocks-deep](../lessons/database/deadlocks-deep.md), [toctou](../lessons/database/toctou.md), [fail-closed-rate-limits](../lessons/security/fail-closed-rate-limits.md), [rate-limit-algorithms](../lessons/api/rate-limit-algorithms.md), [retry-backoff-timeouts](../lessons/ops/retry-backoff-timeouts.md), [circuit-breaker](../lessons/ops/circuit-breaker.md), [backpressure](../lessons/ops/backpressure.md), [graceful-degradation](../lessons/ops/graceful-degradation.md), [at-least-once-and-idempotency-keys](../lessons/architecture/at-least-once-and-idempotency-keys.md) |

### 07 Tests

**Why load / decision unlocked:** Turns invariants into CI. Testing-as-proof and isolation/fixtures match this repo’s `resetDb` + Alice/Bob style; pyramid/contract/property tools extend when HTTP alone isn’t enough. Unlock: property-named cases + harness plan.

| Concepts |
|----------|
| [testing-as-proof](../lessons/testing/testing-as-proof.md), [test-pyramid](../lessons/testing/test-pyramid.md), [test-isolation-and-fixtures](../lessons/testing/test-isolation-and-fixtures.md), [contract-testing](../lessons/testing/contract-testing.md), [property-based-testing](../lessons/testing/property-based-testing.md), [load-testing](../lessons/testing/load-testing.md) |

### Auth features

**Why load / decision unlocked:** Password/token hashing, refresh rotation/reuse, cookies/CSRF, and secrets decide session safety independent of CRUD modules. Unlock: token lifecycle + cookie vs Bearer + reuse detection policy.

| Concepts |
|----------|
| [password-and-token-hashing](../lessons/security/password-and-token-hashing.md), [refresh-rotation-and-reuse](../lessons/security/refresh-rotation-and-reuse.md), [cookies-xss-csrf](../lessons/security/cookies-xss-csrf.md), [secrets-management](../lessons/security/secrets-management.md), [tls-https](../lessons/security/tls-https.md), [outbox-events](../lessons/architecture/outbox-events.md), [oauth2-oidc](../lessons/security/oauth2-oidc.md), [pkce](../lessons/security/pkce.md), [mfa](../lessons/security/mfa.md), [api-keys](../lessons/security/api-keys.md), [security-headers](../lessons/security/security-headers.md) |

### Async / integration

**Why load / decision unlocked:** Side effects that must survive crashes need outbox, queues, or sagas — not “fire email inside the request tx.” At-least-once + idempotency keys prevent double charges/notifications. Unlock: sync vs async boundary + delivery semantics.

| Concepts |
|----------|
| [message-queues](../lessons/architecture/message-queues.md), [pub-sub](../lessons/architecture/pub-sub.md), [outbox-events](../lessons/architecture/outbox-events.md), [at-least-once-and-idempotency-keys](../lessons/architecture/at-least-once-and-idempotency-keys.md), [webhooks](../lessons/api/webhooks.md), [saga-orchestration](../lessons/architecture/saga-orchestration.md), [cdc-change-data-capture](../lessons/database/cdc-change-data-capture.md), [websockets-sse](../lessons/api/websockets-sse.md) |

### Ops

**Why load / decision unlocked:** Boot, health, pools, logs/traces, and correlation ids decide whether you can *operate* the feature. Request-id lessons tie a 500 to one user journey; blameless postmortems turn escapes into catalog improvements. Unlock: readiness + log fields + on-call story.

| Concepts |
|----------|
| [boot-and-graceful-shutdown](../lessons/ops/boot-and-graceful-shutdown.md), [health-readiness](../lessons/ops/health-readiness.md), [connection-pooling](../lessons/database/connection-pooling.md), [structured-logging-metrics-tracing](../lessons/ops/structured-logging-metrics-tracing.md), [request-id-and-correlation](../lessons/ops/request-id-and-correlation.md), [12-factor-app](../lessons/ops/12-factor-app.md), [alerting](../lessons/ops/alerting.md), [on-call-runbooks](../lessons/ops/on-call-runbooks.md), [sli-slo-error-budgets](../lessons/ops/sli-slo-error-budgets.md), [blue-green-canary](../lessons/ops/blue-green-canary.md), [chaos-engineering](../lessons/ops/chaos-engineering.md), [audit-logging](../lessons/security/audit-logging.md), [blameless-postmortems](../lessons/ops/blameless-postmortems.md) |

### Scale later

**Why load / decision unlocked:** Caching, CQRS, sharding, and gateways are easy to reach for too early — and painful to skip when lists grow. Load these when pagination/indexes aren’t enough or multi-tenant isolation becomes a product line. Unlock: “not yet” vs ADR-backed scale bet.

| Concepts |
|----------|
| [cqrs-lite](../lessons/architecture/cqrs-lite.md), [caching](../lessons/architecture/caching.md), [pagination](../lessons/database/pagination.md), [replication](../lessons/database/replication.md), [sharding-partitioning](../lessons/database/sharding-partitioning.md), [horizontal-scaling](../lessons/architecture/horizontal-scaling.md), [multi-tenancy](../lessons/architecture/multi-tenancy.md), [full-text-search](../lessons/database/full-text-search.md), [event-sourcing](../lessons/architecture/event-sourcing.md), [monolith-vs-microservices](../lessons/architecture/monolith-vs-microservices.md), [api-gateway](../lessons/api/api-gateway.md), [bff-pattern](../lessons/architecture/bff-pattern.md), [capacity-planning](../lessons/ops/capacity-planning.md), [load-balancing](../lessons/ops/load-balancing.md), [cdn-edge](../lessons/ops/cdn-edge.md), [feature-flags](../lessons/architecture/feature-flags.md), [adrs](../lessons/architecture/adrs.md) |

---

## Checklist: “Did we forget a concept?”

Before PR, skim:

- [ ] Transaction boundary clear?  
- [ ] Indexes for new queries?  
- [ ] Locks or OCC if concurrent writes?  
- [ ] Constraints for invariants?  
- [ ] Validation allow-list (no mass assignment)?  
- [ ] Authn + authz + IDOR cases?  
- [ ] Idempotency if client retries POST?  
- [ ] Pagination if list can grow?  
- [ ] Secrets not logged?  
- [ ] Failure mode: fail-closed vs degrade?  
- [ ] Error model (`AppError`) mapped to HTTP?  
- [ ] Test proves the dangerous case?  
- [ ] Fixtures/`resetDb` updated for new tables?  
- [ ] Outbox if side effects need reliability?  
- [ ] Webhook/SSRF fences if calling URLs?  
- [ ] Multi-tenant / project isolation on every query?  
- [ ] UTC timestamps / clock skew considered?  
- [ ] Request id / correlation on the path?  
- [ ] OpenAPI/contract updated if public?  
- [ ] ADR written for non-obvious decisions?  
- [ ] STRIDE skim done?  
- [ ] Observability: logs + future metrics/alerts considered?  
- [ ] If it escaped to prod: blameless postmortem → new checklist item?  

Full catalog: [../lessons/README.md](../lessons/README.md) (~100 dedicated lessons).

---

## Interview Q&A

**Q: How do you use a concept catalog when designing a feature?**  
**A:** Walk 01–09; at each step open only the lessons that unlock that decision (e.g. 02 → IDOR/TOCTOU; 06 → OCC vs `FOR UPDATE`; 07 → testing-as-proof). Don’t binge-read the catalog — load with intent and write the decision down.

**Q: What’s an example of a concept this repo doesn’t implement yet but you still load?**  
**A:** Outbox, sagas, OpenAPI-contract-first, or blameless postmortems — when the ticket’s reliability/ops needs exceed “request/response + Postgres.” The lesson teaches the decision even before the folder exists in `src/`.

**Q: How does this map relate to how-to-debug?**  
**A:** Building applies concepts on purpose; debugging maps symptoms back to concepts ([../how-to-debug/11-symptom-to-concept.md](../how-to-debug/11-symptom-to-concept.md)). Same catalog, opposite direction.

---

## Glossary

| Term | Meaning |
|------|---------|
| **Concept coverage** | Intentional lesson load list for a feature |
| **Unlock** | Decision you can make after reading that cluster |
| **Scale later** | Concepts deferred until evidence demands them |
| **Catalog** | `docs/functions/lessons/**` dedicated topics |

---

## Optional further reading

- Process: [09-checklist.md](./09-checklist.md) · [README.md](./README.md) · [_STANDALONE_PROCESS.md](./_STANDALONE_PROCESS.md)  
- Lessons home: [../lessons/README.md](../lessons/README.md)  
- Debug mirror: [../how-to-debug/11-symptom-to-concept.md](../how-to-debug/11-symptom-to-concept.md)

---

## Teach pointer

> “Building is applying a catalog of concepts on purpose — not discovering them in production.”
