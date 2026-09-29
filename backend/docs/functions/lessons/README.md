# Lessons — categorized concept catalog

All concepts live **inside** `lessons/`, grouped by folder. Each lesson is **Standalone ✓** (one file is enough). The **order below is guidance** — not required prerequisites.

Standard: [_STANDALONE_STANDARD.md](./_STANDALONE_STANDARD.md) · Gold: [database/transactions.md](./database/transactions.md).

Optional process maps: [../how-to-think/10-concept-coverage.md](../how-to-think/10-concept-coverage.md) · [../how-to-debug/11-symptom-to-concept.md](../how-to-debug/11-symptom-to-concept.md).

| Folder | Topics | Start here |
|--------|--------|------------|
| [architecture/](./architecture/) | Layers, errors, DI, queues, scale | [layered-architecture](./architecture/layered-architecture.md) |
| [api/](./api/) | REST, HTTP, CORS, idempotency | [rest-resource-design](./api/rest-resource-design.md) |
| [database/](./database/) | Transactions, locks, migrations | [transactions](./database/transactions.md) |
| [security/](./security/) | Authn/z, IDOR, tokens, threats | [authn-vs-authz](./security/authn-vs-authz.md) |
| [testing/](./testing/) | Proof tests, pyramid, fixtures | [testing-as-proof](./testing/testing-as-proof.md) |
| [ops/](./ops/) | Boot, health, logs, SLOs | [boot-and-graceful-shutdown](./ops/boot-and-graceful-shutdown.md) |

---

## Recommended reading order (whole catalog)

Follow **phases A→G** for this app’s core. Then pick a **breadth track**. Within each folder README, the same order is repeated for that category alone.

### Phase A — Shape of the system
1. [layered-architecture](./architecture/layered-architecture.md)  
2. [error-model-and-app-errors](./architecture/error-model-and-app-errors.md)  
3. [dto-vs-domain](./architecture/dto-vs-domain.md)  
4. [composition-root-di](./architecture/composition-root-di.md)  
5. [modular-monolith](./architecture/modular-monolith.md)  
6. [solid-in-backends](./architecture/solid-in-backends.md)  
7. [stateless-services](./architecture/stateless-services.md)  

### Phase B — HTTP contract
8. [rest-resource-design](./api/rest-resource-design.md)  
9. [http-status-semantics](./api/http-status-semantics.md)  
10. [validation-boundary](./api/validation-boundary.md)  
11. [openapi-contract-first](./api/openapi-contract-first.md)  
12. [cors](./api/cors.md)  
13. [payload-limits](./api/payload-limits.md)  
14. [api-versioning](./api/api-versioning.md)  

### Phase C — Data basics
15. [transactions](./database/transactions.md)  
16. [constraints-and-fk](./database/constraints-and-fk.md)  
17. [migrations](./database/migrations.md)  
18. [prepared-statements](./database/prepared-statements.md)  
19. [utc-timestamps-and-clocks](./database/utc-timestamps-and-clocks.md)  
20. [connection-pooling](./database/connection-pooling.md)  
21. [soft-delete-and-invariants](./database/soft-delete-and-invariants.md)  

### Phase D — Auth & access
22. [authn-vs-authz](./security/authn-vs-authz.md)  
23. [password-and-token-hashing](./security/password-and-token-hashing.md)  
24. [cookies-xss-csrf](./security/cookies-xss-csrf.md)  
25. [refresh-rotation-and-reuse](./security/refresh-rotation-and-reuse.md)  
26. [idor](./security/idor.md)  
27. [least-privilege](./security/least-privilege.md)  
28. [email-enumeration-and-timing](./security/email-enumeration-and-timing.md)  
29. [mass-assignment](./security/mass-assignment.md)  
30. [sql-injection-prevention](./security/sql-injection-prevention.md)  
31. [secrets-management](./security/secrets-management.md)  
32. [tls-https](./security/tls-https.md)  

### Phase E — Races & safety
33. [toctou](./database/toctou.md)  
34. [locking-kinds](./database/locking-kinds.md)  
35. [pessimistic-locking](./database/pessimistic-locking.md)  
36. [optimistic-concurrency](./database/optimistic-concurrency.md)  
37. [isolation-levels](./database/isolation-levels.md)  
38. [deadlocks-deep](./database/deadlocks-deep.md)  
39. [fail-closed-rate-limits](./security/fail-closed-rate-limits.md)  
40. [rate-limit-algorithms](./api/rate-limit-algorithms.md)  
41. [defense-in-depth](./security/defense-in-depth.md)  
42. [idempotency](./api/idempotency.md)  
43. [at-least-once-and-idempotency-keys](./architecture/at-least-once-and-idempotency-keys.md)  

### Phase F — Prove it
44. [testing-as-proof](./testing/testing-as-proof.md)  
45. [test-isolation-and-fixtures](./testing/test-isolation-and-fixtures.md)  
46. [test-pyramid](./testing/test-pyramid.md)  
47. [contract-testing](./testing/contract-testing.md)  

### Phase G — Run it
48. [boot-and-graceful-shutdown](./ops/boot-and-graceful-shutdown.md)  
49. [health-readiness](./ops/health-readiness.md)  
50. [request-id-and-correlation](./ops/request-id-and-correlation.md)  
51. [structured-logging-metrics-tracing](./ops/structured-logging-metrics-tracing.md)  
52. [12-factor-app](./ops/12-factor-app.md)  

### After core — breadth tracks (pick any)

| Track | Start → continue |
|-------|------------------|
| **Query performance** | [indexing](./database/indexing.md) → [pagination](./database/pagination.md) → [n-plus-one](./database/n-plus-one.md) → [pagination-filtering](./api/pagination-filtering.md) |
| **Async / integration** | [outbox-events](./architecture/outbox-events.md) → [message-queues](./architecture/message-queues.md) → [pub-sub](./architecture/pub-sub.md) → [webhooks](./api/webhooks.md) → [saga-orchestration](./architecture/saga-orchestration.md) |
| **Auth providers** | [oauth2-oidc](./security/oauth2-oidc.md) → [pkce](./security/pkce.md) → [mfa](./security/mfa.md) → [api-keys](./security/api-keys.md) → [mtls](./security/mtls.md) |
| **Threat surface** | [threat-modeling-stride](./security/threat-modeling-stride.md) → [ssrf](./security/ssrf.md) → [path-traversal](./security/path-traversal.md) → [security-headers](./security/security-headers.md) → [pii-gdpr-basics](./security/pii-gdpr-basics.md) |
| **Scale & data** | [caching](./architecture/caching.md) → [replication](./database/replication.md) → [eventual-consistency-cap](./database/eventual-consistency-cap.md) → [horizontal-scaling](./architecture/horizontal-scaling.md) → [multi-tenancy](./architecture/multi-tenancy.md) |
| **Production ops** | [retry-backoff-timeouts](./ops/retry-backoff-timeouts.md) → [circuit-breaker](./ops/circuit-breaker.md) → [alerting](./ops/alerting.md) → [sli-slo-error-budgets](./ops/sli-slo-error-budgets.md) → [blameless-postmortems](./ops/blameless-postmortems.md) |

---

## database/

Read order inside this folder: see [database/README.md](./database/README.md).

| # | Lesson | In repo? |
|---|--------|----------|
| 1 | [transactions](./database/transactions.md) | Yes |
| 2 | [constraints-and-fk](./database/constraints-and-fk.md) | Yes |
| 3 | [migrations](./database/migrations.md) | Yes |
| 4 | [prepared-statements](./database/prepared-statements.md) | Via driver |
| 5 | [utc-timestamps-and-clocks](./database/utc-timestamps-and-clocks.md) | Yes |
| 6 | [connection-pooling](./database/connection-pooling.md) | Yes |
| 7 | [soft-delete-and-invariants](./database/soft-delete-and-invariants.md) | Yes |
| 8 | [toctou](./database/toctou.md) | Yes |
| 9 | [locking-kinds](./database/locking-kinds.md) | FOR UPDATE |
| 10 | [pessimistic-locking](./database/pessimistic-locking.md) | Yes |
| 11 | [optimistic-concurrency](./database/optimistic-concurrency.md) | Yes |
| 12 | [isolation-levels](./database/isolation-levels.md) | Default + locks |
| 13 | [deadlocks-deep](./database/deadlocks-deep.md) | Order discipline |
| 14 | [indexing](./database/indexing.md) | Design for it |
| 15 | [pagination](./database/pagination.md) | Example to add |
| 16 | [n-plus-one](./database/n-plus-one.md) | Joins avoid |
| 17 | [jsonb-document-fields](./database/jsonb-document-fields.md) | Example |
| 18 | [full-text-search](./database/full-text-search.md) | Example |
| 19 | [audit-tables](./database/audit-tables.md) | Example |
| 20 | [replication](./database/replication.md) | Example |
| 21 | [eventual-consistency-cap](./database/eventual-consistency-cap.md) | Conceptual |
| 22 | [sharding-partitioning](./database/sharding-partitioning.md) | Example |
| 23 | [cdc-change-data-capture](./database/cdc-change-data-capture.md) | Example |
| 24 | [two-phase-commit-and-sagas-data](./database/two-phase-commit-and-sagas-data.md) | Example |

## api/

Read order: [api/README.md](./api/README.md).

| # | Lesson | In repo? |
|---|--------|----------|
| 1 | [rest-resource-design](./api/rest-resource-design.md) | Yes |
| 2 | [http-status-semantics](./api/http-status-semantics.md) | Yes |
| 3 | [validation-boundary](./api/validation-boundary.md) | Zod |
| 4 | [openapi-contract-first](./api/openapi-contract-first.md) | Yes |
| 5 | [cors](./api/cors.md) | Yes |
| 6 | [payload-limits](./api/payload-limits.md) | Yes |
| 7 | [api-versioning](./api/api-versioning.md) | v1 |
| 8 | [rate-limit-algorithms](./api/rate-limit-algorithms.md) | Yes store |
| 9 | [idempotency](./api/idempotency.md) | Partial + example |
| 10 | [pagination-filtering](./api/pagination-filtering.md) | Example |
| 11 | [etags-conditional-requests](./api/etags-conditional-requests.md) | Cousin = OCC |
| 12 | [bulk-endpoints](./api/bulk-endpoints.md) | Example |
| 13 | [file-uploads](./api/file-uploads.md) | Example |
| 14 | [webhooks](./api/webhooks.md) | Example |
| 15 | [websockets-sse](./api/websockets-sse.md) | Example |
| 16 | [api-gateway](./api/api-gateway.md) | Express as edge |
| 17 | [graphql-basics](./api/graphql-basics.md) | Example |
| 18 | [grpc-vs-rest](./api/grpc-vs-rest.md) | Conceptual |

## architecture/

Read order: [architecture/README.md](./architecture/README.md).

| # | Lesson | In repo? |
|---|--------|----------|
| 1 | [layered-architecture](./architecture/layered-architecture.md) | Yes |
| 2 | [error-model-and-app-errors](./architecture/error-model-and-app-errors.md) | Yes |
| 3 | [dto-vs-domain](./architecture/dto-vs-domain.md) | Yes |
| 4 | [composition-root-di](./architecture/composition-root-di.md) | Yes |
| 5 | [modular-monolith](./architecture/modular-monolith.md) | Yes |
| 6 | [solid-in-backends](./architecture/solid-in-backends.md) | Practical |
| 7 | [stateless-services](./architecture/stateless-services.md) | Yes |
| 8 | [at-least-once-and-idempotency-keys](./architecture/at-least-once-and-idempotency-keys.md) | Partial + example |
| 9 | [hexagonal-ports-adapters](./architecture/hexagonal-ports-adapters.md) | Cousin |
| 10 | [ddd-aggregates-bounded-context](./architecture/ddd-aggregates-bounded-context.md) | Soft |
| 11 | [adrs](./architecture/adrs.md) | Example |
| 12 | [feature-flags](./architecture/feature-flags.md) | Env cousin |
| 13 | [caching](./architecture/caching.md) | Redis≠cache |
| 14 | [outbox-events](./architecture/outbox-events.md) | Example |
| 15 | [message-queues](./architecture/message-queues.md) | Example |
| 16 | [pub-sub](./architecture/pub-sub.md) | Example |
| 17 | [cqrs-lite](./architecture/cqrs-lite.md) | Example |
| 18 | [saga-orchestration](./architecture/saga-orchestration.md) | Example |
| 19 | [event-sourcing](./architecture/event-sourcing.md) | Conceptual |
| 20 | [bff-pattern](./architecture/bff-pattern.md) | Header cousin |
| 21 | [multi-tenancy](./architecture/multi-tenancy.md) | Membership cousin |
| 22 | [horizontal-scaling](./architecture/horizontal-scaling.md) | Ready |
| 23 | [monolith-vs-microservices](./architecture/monolith-vs-microservices.md) | Monolith |

## security/

Read order: [security/README.md](./security/README.md).

| # | Lesson | In repo? |
|---|--------|----------|
| 1 | [authn-vs-authz](./security/authn-vs-authz.md) | Yes |
| 2 | [password-and-token-hashing](./security/password-and-token-hashing.md) | Yes |
| 3 | [cookies-xss-csrf](./security/cookies-xss-csrf.md) | Yes |
| 4 | [refresh-rotation-and-reuse](./security/refresh-rotation-and-reuse.md) | Yes |
| 5 | [idor](./security/idor.md) | Yes |
| 6 | [least-privilege](./security/least-privilege.md) | Yes |
| 7 | [email-enumeration-and-timing](./security/email-enumeration-and-timing.md) | Yes |
| 8 | [mass-assignment](./security/mass-assignment.md) | Zod |
| 9 | [sql-injection-prevention](./security/sql-injection-prevention.md) | Yes |
| 10 | [secrets-management](./security/secrets-management.md) | env |
| 11 | [tls-https](./security/tls-https.md) | COOKIE_SECURE |
| 12 | [fail-closed-rate-limits](./security/fail-closed-rate-limits.md) | Yes |
| 13 | [defense-in-depth](./security/defense-in-depth.md) | Yes |
| 14 | [input-output-encoding](./security/input-output-encoding.md) | JSON API |
| 15 | [threat-modeling-stride](./security/threat-modeling-stride.md) | Practice |
| 16 | [oauth2-oidc](./security/oauth2-oidc.md) | Example |
| 17 | [pkce](./security/pkce.md) | Example |
| 18 | [mfa](./security/mfa.md) | Example |
| 19 | [api-keys](./security/api-keys.md) | Example |
| 20 | [mtls](./security/mtls.md) | Example |
| 21 | [ssrf](./security/ssrf.md) | Example |
| 22 | [path-traversal](./security/path-traversal.md) | Example |
| 23 | [security-headers](./security/security-headers.md) | Example |
| 24 | [pii-gdpr-basics](./security/pii-gdpr-basics.md) | Partial |
| 25 | [audit-logging](./security/audit-logging.md) | Example |

## ops/

Read order: [ops/README.md](./ops/README.md).

| # | Lesson | In repo? |
|---|--------|----------|
| 1 | [boot-and-graceful-shutdown](./ops/boot-and-graceful-shutdown.md) | Yes |
| 2 | [health-readiness](./ops/health-readiness.md) | Yes |
| 3 | [request-id-and-correlation](./ops/request-id-and-correlation.md) | Yes |
| 4 | [structured-logging-metrics-tracing](./ops/structured-logging-metrics-tracing.md) | Logs+ids |
| 5 | [12-factor-app](./ops/12-factor-app.md) | Aligned |
| 6 | [retry-backoff-timeouts](./ops/retry-backoff-timeouts.md) | Example |
| 7 | [circuit-breaker](./ops/circuit-breaker.md) | Example |
| 8 | [backpressure](./ops/backpressure.md) | Partial |
| 9 | [graceful-degradation](./ops/graceful-degradation.md) | Contrast |
| 10 | [alerting](./ops/alerting.md) | Example |
| 11 | [on-call-runbooks](./ops/on-call-runbooks.md) | how-to-debug |
| 12 | [sli-slo-error-budgets](./ops/sli-slo-error-budgets.md) | Example |
| 13 | [blameless-postmortems](./ops/blameless-postmortems.md) | Example |
| 14 | [blue-green-canary](./ops/blue-green-canary.md) | Example |
| 15 | [load-balancing](./ops/load-balancing.md) | Ready |
| 16 | [cdn-edge](./ops/cdn-edge.md) | Example |
| 17 | [capacity-planning](./ops/capacity-planning.md) | Example |
| 18 | [chaos-engineering](./ops/chaos-engineering.md) | Example |

## testing/

Read order: [testing/README.md](./testing/README.md).

| # | Lesson | In repo? |
|---|--------|----------|
| 1 | [testing-as-proof](./testing/testing-as-proof.md) | Yes |
| 2 | [test-isolation-and-fixtures](./testing/test-isolation-and-fixtures.md) | Yes |
| 3 | [test-pyramid](./testing/test-pyramid.md) | Integration-heavy |
| 4 | [contract-testing](./testing/contract-testing.md) | OpenAPI gap |
| 5 | [property-based-testing](./testing/property-based-testing.md) | Example |
| 6 | [load-testing](./testing/load-testing.md) | Example |
