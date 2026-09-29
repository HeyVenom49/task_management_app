# Lesson: Structured logging, metrics, and tracing

**Standalone ✓** — You do not need any other doc to design observability for this API.

**After this file you can:** choose logs vs metrics vs traces, use `pino` and `requestId` correctly, know what this repo lacks (metrics/traces), and interview on cardinality and redaction.

---

## 1. First principles

**Observability** answers: *What broke? For whom? How often? Where did time go?*

Three pillars:

- **Logs** — discrete events with context fields  
- **Metrics** — aggregated counters/histograms over time  
- **Traces** — request paths across components (spans)

**The problem it solves:** `console.log("error")` without correlation IDs makes production debugging guesswork; you can’t SLO what you can’t measure.

---

## 2. Mental model

### Analogy

- **Logs** = diary entries (“request X failed validation”).  
- **Metrics** = dashboard gauges (“500 errors per minute”).  
- **Traces** = GPS route of one trip across cities (HTTP → middleware → SQL).

### Diagram

```text
Request ──► requestId middleware ──► handler ──► response
                │                         │
                ├── requestLogger (pino)  └── errorHandler (+ requestId in JSON)
                └── (future: trace span)
Metrics: aggregate duration/status (not in repo yet)
```

---

## 3. Core rules (must / must-not)

1. **MUST** use **structured** fields (JSON), not string concatenation only.  
2. **MUST** propagate **requestId** on errors returned to clients.  
3. **MUST NOT** log passwords, refresh tokens, full `Authorization`, or raw cookies.  
4. **MUST NOT** use unbounded label cardinality in metrics (e.g. per-userId counters).  
5. **SHOULD** log one line per request with method, path, status, duration.  
6. **SHOULD** keep test logs silent to reduce noise (`level: silent` in test).

---

## 4. How it works (mechanics)

**Pino** writes JSON log lines to stdout by default; `pino-pretty` is a dev transport only when resolvable.

**requestId:** middleware assigns or forwards `X-Request-Id`; `errorHandler` includes `requestId` in JSON body for 4xx/5xx.

**requestLogger:** logs after response finishes with duration — suitable for deriving latency metrics later.

**Metrics (typical):** Prometheus `http_request_duration_seconds` histogram with labels `method`, `route`, `status` — low cardinality routes only.

**Tracing (typical):** OpenTelemetry auto-instrument Express; propagate W3C `traceparent`; child span around DB `begin`.

---

## 5. When to use / when not to use

| Need | Tool |
|------|------|
| Debug one failed request | Logs + requestId |
| Page on error rate | Metrics + alert |
| Find slow dependency | Traces or detailed timing logs |
| Audit security event | Structured audit log (separate stream) |
| Unit test output | Silent/minimal logs |

---

## 6. Step-by-step: design → implement → verify

1. Add requestId early in middleware stack.  
2. Configure logger level by `NODE_ENV`.  
3. Log request completion once (avoid duplicate access logs).  
4. Redact sensitive fields in serializers.  
5. (Future) Export `/metrics` and OTel exporter.  
6. Verify: trigger 404, grep logs by requestId; match client JSON.

---

## 7. Worked example A — this project

**Logger:**

```15:25:backend/src/shared/logger/logger.ts
export const logger = pino({
  level: env.nodeEnv === "test" ? "silent" : "info",
  ...(canUsePretty()
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }
    : {}),
});
```

**Middleware order in `app.ts`:** `requestId` → `requestLogger` → routes → `errorHandler`.

**Error responses include requestId** (see `errorHandler.ts`) so support can tie user report to logs.

**Gap (honest):** No Prometheus metrics endpoint; no OpenTelemetry traces yet. SLO work in [sli-slo-error-budgets](./sli-slo-error-budgets.md) assumes future metrics.

---

## 8. Worked example B — mini scenario (self-contained)

Redaction + metric sketch:

```ts
logger.info({ requestId, userId, action: "login_failed" }, "auth failure");
// never: logger.info({ password: req.body.password })

// histogram.observe({ method: "GET", route: "/projects", status: "200" }, durationSec);
```

Trace: span `http.request` → child `pg.query` with same trace id.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Risk |
|--------------|------|
| Log full JWT | Credential leak in log aggregator |
| Metric label `userId` | Cardinality explosion, cost |
| 10 log lines per request | Noise, cost |
| Pretty logs in prod | Hard to parse, breaks parsers |
| No requestId on 500 JSON | Users can’t help you debug |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Can't find user's error | Missing id | client JSON `requestId` | ensure middleware + handler |
| Log volume $$$ | debug in prod | `level` | info/warn in prod |
| Tests noisy | pino info | NODE_ENV=test | silent (already) |
| Slow requests invisible | no duration | requestLogger fields | add durationMs (present) |

---

## 11. Interview Q&A (with strong answers)

**Q: Logs vs metrics vs traces?**  
**A:** Logs are high-detail events; metrics are cheap aggregates for alerting and trends; traces show per-request latency breakdown across services.

**Q: High-cardinality danger?**  
**A:** Labels like userId create millions of time series — expensive and slow. Prefer bounded labels (route template, status class).

**Q: What never to log?**  
**A:** Secrets, passwords, refresh tokens, raw Authorization headers, PII beyond policy.

**Q: What does this repo do today?**  
**A:** Pino structured logs, requestId on requests/errors, requestLogger with duration; metrics/traces not implemented.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Structured log | JSON key-value fields |
| Cardinality | Number of unique metric label combinations |
| Span | One timed operation in a trace |
| requestId | Correlation id for one HTTP request |
| Redaction | Removing sensitive fields before log |

---

## 13. Teach pointer

> “If you can’t find one request across logs, you don’t have observability — you have print statements.”

---

## 14. Optional further reading (not required)

- [alerting](./alerting.md) · [sli-slo-error-budgets](./sli-slo-error-budgets.md)  
- Repo: `backend/src/shared/logger/logger.ts`, `backend/src/shared/middleware/requestId.ts`, `requestLogger.ts`, `errorHandler.ts`
