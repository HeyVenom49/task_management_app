# How to debug — read the error, then open the right file

When something breaks, **do not open every file**.  
Read the signal → classify the failure → open **one** entry point on the request path.

This folder teaches that habit for *this* backend.

**Depth:** Guides aim for [Standalone debug](./_STANDALONE_DEBUG.md) — one file is enough to hunt that failure class. **Gold standard:** [06-auth-and-token-failures.md](./06-auth-and-token-failures.md).

## Decision tree (start here)

```text
Did the process fail before serving requests?
  YES → Boot / env / migrate / Redis connect
        → 02-classify + shared-bootstrap (server.ts, env.ts)
  NO ↓

Do you have an HTTP status + JSON body?
  YES → 01-read-the-signal → 04-status-code-playbook
  NO ↓

Is it a test failure (bun:test / supertest)?
  YES → 09-test-failures
  NO ↓

Is it a Postgres / Redis / connection error in logs?
  YES → 05-postgres-and-redis-errors
  NO ↓

Auth / token / cookie weirdness?
  YES → 06-auth-and-token-failures
  NO ↓

Wrong user sees 403/404 or “missing” data?
  YES → 07-authz-idor-and-unexpected-403-404
  NO ↓

Works once, fails under parallel / “flaky”?
  YES → 08-concurrency-and-flaky-failures
  NO → 03-trace-the-request-path (slow walk) → 10-fix-protocol
```

## Files

| # | File | Depth | Use when |
|---|------|-------|----------|
| 1 | [01-read-the-signal.md](./01-read-the-signal.md) | Standalone ✓ | You have a response or log line and need to parse it |
| 2 | [02-classify-the-failure.md](./02-classify-the-failure.md) | Standalone ✓ | Boot vs request vs test vs infra |
| 3 | [03-trace-the-request-path.md](./03-trace-the-request-path.md) | Standalone ✓ | You know the URL but not which layer failed |
| 4 | [04-status-code-playbook.md](./04-status-code-playbook.md) | Standalone ✓ | You have 400/401/403/404/409/500/503 |
| 5 | [05-postgres-and-redis-errors.md](./05-postgres-and-redis-errors.md) | Standalone ✓ | SQLSTATE, connection, rate-limit 503 |
| 6 | [06-auth-and-token-failures.md](./06-auth-and-token-failures.md) | Standalone ✓ (gold) | Login/refresh/JWT/cookie/verify/reset |
| 7 | [07-authz-idor-and-unexpected-403-404.md](./07-authz-idor-and-unexpected-403-404.md) | Standalone ✓ | Access denied or “not found” surprises |
| 8 | [08-concurrency-and-flaky-failures.md](./08-concurrency-and-flaky-failures.md) | Standalone ✓ | Race / OCC / intermittent |
| 9 | [09-test-failures.md](./09-test-failures.md) | Standalone ✓ | CI or local test red |
| 10 | [10-fix-protocol.md](./10-fix-protocol.md) | Standalone ✓ | Reproduce → hypothesize → fix → prove |
| 11 | [11-symptom-to-concept.md](./11-symptom-to-concept.md) | Standalone ✓ | Symptom → which lesson/concept to study |

Guides 01–10 teach *how to hunt*. Guide 11 connects failures to the full concept catalog even when this repo only has a cousin pattern.

## Teach pointer

> “The error already points at a layer. Your job is to listen, not to search the repo alphabetically.”

## Links

- Standalone standard: [_STANDALONE_DEBUG.md](./_STANDALONE_DEBUG.md)  
- Function map: [../README.md](../README.md)  
- Concepts: [../lessons/](../lessons/)  
- Build process: [../how-to-think/](../how-to-think/)
