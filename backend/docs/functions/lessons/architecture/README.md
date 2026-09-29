# Architecture & system design concepts

Part of [../README.md](../README.md) · Cross-catalog path: [phase A](../README.md#phase-a--shape-of-the-system).

Order is **recommended**, not required — every file is Standalone ✓.

---

## Read in this order

### Core (do first) — this app’s shape
1. [layered-architecture](./layered-architecture.md) — route → controller → service → repo  
2. [error-model-and-app-errors](./error-model-and-app-errors.md) — AppError → status  
3. [dto-vs-domain](./dto-vs-domain.md) — PublicUser / allow-lists  
4. [composition-root-di](./composition-root-di.md) — wiring in one place  
5. [modular-monolith](./modular-monolith.md) — modules without microservices  
6. [solid-in-backends](./solid-in-backends.md) — practical SOLID  
7. [stateless-services](./stateless-services.md) — JWT + external session store  

### Reliability of writes / side effects
8. [at-least-once-and-idempotency-keys](./at-least-once-and-idempotency-keys.md)  

### Design vocabulary (when growing)
9. [hexagonal-ports-adapters](./hexagonal-ports-adapters.md)  
10. [ddd-aggregates-bounded-context](./ddd-aggregates-bounded-context.md)  
11. [adrs](./adrs.md)  
12. [feature-flags](./feature-flags.md)  

### Async & scale (later / examples)
13. [caching](./caching.md)  
14. [outbox-events](./outbox-events.md)  
15. [message-queues](./message-queues.md)  
16. [pub-sub](./pub-sub.md)  
17. [cqrs-lite](./cqrs-lite.md)  
18. [saga-orchestration](./saga-orchestration.md)  
19. [event-sourcing](./event-sourcing.md)  
20. [bff-pattern](./bff-pattern.md)  
21. [multi-tenancy](./multi-tenancy.md)  
22. [horizontal-scaling](./horizontal-scaling.md)  
23. [monolith-vs-microservices](./monolith-vs-microservices.md)  

---

## Catalog (same order)

| # | Lesson | Standalone |
|---|--------|------------|
| 1 | [layered-architecture](./layered-architecture.md) | ✓ |
| 2 | [error-model-and-app-errors](./error-model-and-app-errors.md) | ✓ |
| 3 | [dto-vs-domain](./dto-vs-domain.md) | ✓ |
| 4 | [composition-root-di](./composition-root-di.md) | ✓ |
| 5 | [modular-monolith](./modular-monolith.md) | ✓ |
| 6 | [solid-in-backends](./solid-in-backends.md) | ✓ |
| 7 | [stateless-services](./stateless-services.md) | ✓ |
| 8 | [at-least-once-and-idempotency-keys](./at-least-once-and-idempotency-keys.md) | ✓ |
| 9 | [hexagonal-ports-adapters](./hexagonal-ports-adapters.md) | ✓ |
| 10 | [ddd-aggregates-bounded-context](./ddd-aggregates-bounded-context.md) | ✓ |
| 11 | [adrs](./adrs.md) | ✓ |
| 12 | [feature-flags](./feature-flags.md) | ✓ |
| 13 | [caching](./caching.md) | ✓ |
| 14 | [outbox-events](./outbox-events.md) | ✓ |
| 15 | [message-queues](./message-queues.md) | ✓ |
| 16 | [pub-sub](./pub-sub.md) | ✓ |
| 17 | [cqrs-lite](./cqrs-lite.md) | ✓ |
| 18 | [saga-orchestration](./saga-orchestration.md) | ✓ |
| 19 | [event-sourcing](./event-sourcing.md) | ✓ |
| 20 | [bff-pattern](./bff-pattern.md) | ✓ |
| 21 | [multi-tenancy](./multi-tenancy.md) | ✓ |
| 22 | [horizontal-scaling](./horizontal-scaling.md) | ✓ |
| 23 | [monolith-vs-microservices](./monolith-vs-microservices.md) | ✓ |
