# Reliability & operations concepts

Part of [../README.md](../README.md) · Cross-catalog path: [phase G](../README.md#phase-g--run-it).

Order is **recommended**, not required — every file is Standalone ✓.

---

## Read in this order

### Core (do first) — this process
1. [boot-and-graceful-shutdown](./boot-and-graceful-shutdown.md) — migrate → listen → SIGTERM  
2. [health-readiness](./health-readiness.md) — liveness vs readiness  
3. [request-id-and-correlation](./request-id-and-correlation.md) — client ↔ logs  
4. [structured-logging-metrics-tracing](./structured-logging-metrics-tracing.md) — what to log  
5. [12-factor-app](./12-factor-app.md) — config / process / backing services  

### Resilience
6. [retry-backoff-timeouts](./retry-backoff-timeouts.md)  
7. [circuit-breaker](./circuit-breaker.md)  
8. [backpressure](./backpressure.md)  
9. [graceful-degradation](./graceful-degradation.md)  

### Incidents & quality of service
10. [alerting](./alerting.md)  
11. [on-call-runbooks](./on-call-runbooks.md)  
12. [sli-slo-error-budgets](./sli-slo-error-budgets.md)  
13. [blameless-postmortems](./blameless-postmortems.md)  

### Deploy & scale (later)
14. [blue-green-canary](./blue-green-canary.md)  
15. [load-balancing](./load-balancing.md)  
16. [cdn-edge](./cdn-edge.md)  
17. [capacity-planning](./capacity-planning.md)  
18. [chaos-engineering](./chaos-engineering.md)  

---

## Catalog (same order)

| # | Lesson | Standalone |
|---|--------|------------|
| 1 | [boot-and-graceful-shutdown](./boot-and-graceful-shutdown.md) | ✓ |
| 2 | [health-readiness](./health-readiness.md) | ✓ |
| 3 | [request-id-and-correlation](./request-id-and-correlation.md) | ✓ |
| 4 | [structured-logging-metrics-tracing](./structured-logging-metrics-tracing.md) | ✓ |
| 5 | [12-factor-app](./12-factor-app.md) | ✓ |
| 6 | [retry-backoff-timeouts](./retry-backoff-timeouts.md) | ✓ |
| 7 | [circuit-breaker](./circuit-breaker.md) | ✓ |
| 8 | [backpressure](./backpressure.md) | ✓ |
| 9 | [graceful-degradation](./graceful-degradation.md) | ✓ |
| 10 | [alerting](./alerting.md) | ✓ |
| 11 | [on-call-runbooks](./on-call-runbooks.md) | ✓ |
| 12 | [sli-slo-error-budgets](./sli-slo-error-budgets.md) | ✓ |
| 13 | [blameless-postmortems](./blameless-postmortems.md) | ✓ |
| 14 | [blue-green-canary](./blue-green-canary.md) | ✓ |
| 15 | [load-balancing](./load-balancing.md) | ✓ |
| 16 | [cdn-edge](./cdn-edge.md) | ✓ |
| 17 | [capacity-planning](./capacity-planning.md) | ✓ |
| 18 | [chaos-engineering](./chaos-engineering.md) | ✓ |
