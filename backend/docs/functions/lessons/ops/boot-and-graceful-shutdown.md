# Lesson: Boot order and graceful shutdown

**Standalone ✓** — You do not need any other doc to reason about startup, SIGTERM, and clean teardown.

**After this file you can:** explain dependency-first boot, implement ordered shutdown, relate probes to drain behavior, and interview on Kubernetes disposability.

---

## 1. First principles

**Boot order** is the sequence in which a process connects to dependencies and only then accepts traffic.

**Graceful shutdown** is the reverse: stop accepting new work, finish or cut off in-flight HTTP cleanly, release Redis/DB pools, exit with a meaningful code.

**The problem it solves:** Deployments and scale events send SIGTERM. Hard kills drop requests, leak connections, and confuse orchestrators (exit 0 on broken boot hides failure).

---

## 2. Mental model

### Analogy

Startup = assemble an airplane on the runway **before** passengers board.  
Shutdown = land: stop boarding, finish taxiing, shut engines, park.

### Diagram

```text
BOOT:     connectRedis ──► listen(PORT) ──► accept traffic

SHUTDOWN: SIGTERM ──► server.close() ──► disconnectRedis ──► sql.end ──► exit(0)
                              │
                              └── no new HTTP; in-flight may complete
```

---

## 3. Core rules (must / must-not)

1. **MUST** connect **required** dependencies before `listen` (or fail fast with non-zero exit).  
2. **MUST** handle SIGTERM and SIGINT for container platforms.  
3. **MUST** close HTTP server before tearing down DB pool (in-flight handlers may still use DB).  
4. **MUST** exit non-zero when `start()` fails so the scheduler retries/reports.  
5. **MUST NOT** call `listen` in test imports — export `app` without binding a port.  
6. **MUST NOT** ignore shutdown errors silently without logging.  
7. **SHOULD** set readiness false before `server.close` in production (advanced drain).

---

## 4. How it works (mechanics)

Node `http.Server.close()` stops accepting new connections; existing connections may complete depending on keep-alive and client behavior.

`sql.end({ timeout: 5 })` (postgres.js) waits up to 5s for pool queries to finish, then forces end.

Env validation in this repo runs at import of `config/env.ts` — invalid production config fails before listen (fail-fast boot).

Signal handlers should avoid double-shutdown races (guard with a `shuttingDown` flag in larger apps).

Kubernetes: `terminationGracePeriodSeconds` must exceed your worst-case `close + sql.end + Redis quit`.

---

## 5. When to use / when not to use

| Situation | Graceful shutdown |
|-----------|-------------------|
| Docker / Kubernetes deploy | **Required** |
| Local dev Ctrl+C | Same handlers — good habit |
| One-shot CLI migrate job | Exit after work; no HTTP |
| Tests importing `app` | No `start()` — no shutdown needed |

---

## 6. Step-by-step: design → implement → verify

1. Draw dependency graph: Redis? DB pool lazy or eager?  
2. Implement `start()` async: deps → listen.  
3. Implement `shutdown(signal)`: close HTTP → Redis → SQL → exit 0.  
4. Register SIGTERM/SIGINT.  
5. `start().catch` → log → exit 1.  
6. Verify: send SIGTERM while request in flight; watch connections drop cleanly.

---

## 7. Worked example A — this project

**`server.ts` boot:**

```12:20:backend/src/server.ts
async function start() {
  await connectRedis();
  await new Promise<void>((resolve) => {
    server.listen(PORT, () => {
      console.log(`Server is running on the http://localhost:${PORT}`);
      resolve();
    });
  });
}
```

**Why Redis before listen:** login rate limits use Redis (`rate-limit-redis`). Fail-closed behavior returns 503 when Redis is unavailable — better to fail boot or connect first than serve ambiguous first requests.

**Shutdown:**

```22:29:backend/src/server.ts
async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down...`);
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await disconnectRedis();
  await sql.end({ timeout: 5 });
  process.exit(0);
}
```

**Signals and boot failure:**

```32:43:backend/src/server.ts
start().catch((err) => {
  console.error("Failed to start server: ", err);
  process.exit(1);
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
```

**Tests:** import `app` from `app.ts` only — supertest never runs `start()`, so no port collision and no Redis boot requirement in every test file (preload + helpers manage test env).

---

## 8. Worked example B — mini scenario (self-contained)

Production-hardening pattern with drain flag:

```ts
let ready = true;

app.get("/ready", (_req, res) => {
  if (!ready) return res.status(503).end();
  res.status(200).json({ ok: true });
});

async function shutdown() {
  ready = false;
  await sleep(5000); // LB propagation
  await closeServer();
  await closePools();
  process.exit(0);
}
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Outcome |
|--------------|---------|
| Listen before Redis | First auth hits fail-closed 503 spikes |
| `kill -9` every deploy | Dropped requests, DB connection leaks |
| Boot failure but exit 0 | Orchestrator marks healthy dead process |
| Shutdown without `server.close` | Abrort mid-request |
| Infinite hang on `sql.end` | Pod killed after grace period anyway |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Deploy 502 spike | No drain; too-short grace | LB logs, grace period | readiness fail + longer grace |
| Hang on shutdown | Stuck keep-alive / SSE | open connections | `server.closeAllConnections()` (Node 18+) |
| Redis errors after deploy | Quit before close finished | order of teardown | close HTTP first |
| Tests flake on port | `start()` in test | import path | use `app` only |
| Boot loop exit 1 | Bad env / Redis down | start logs, env Zod | fix config/deps |

---

## 11. Interview Q&A (with strong answers)

**Q: Walk through start and shutdown here.**  
**A:** Start connects Redis, then listens on `env.port`. Shutdown on SIGTERM closes HTTP, disconnects Redis, ends SQL pool with 5s timeout, exits 0. Boot failure logs and exits 1.

**Q: Why Promise-wrap `listen`?**  
**A:** So `start()` is async-await friendly and callers can chain post-listen work; errors surface in one place.

**Q: Why close HTTP before DB?**  
**A:** Request handlers may still be executing SQL; closing HTTP first stops new work, then pools drain.

**Q: Liveness vs readiness in shutdown?**  
**A:** Ideally fail readiness first to drain LB; liveness can stay up until process exits.

**Q: Why split `app` and `server.ts`?**  
**A:** Tests and tooling import Express app without binding ports or running full production boot.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| SIGTERM | Polite terminate signal from orchestrator |
| Disposability | Fast start/stop expectation (12-factor) |
| Grace period | K8s time allowed for shutdown |
| `server.close` | Stop accepting new HTTP connections |
| Fail-fast | Crash early on invalid config |

---

## 13. Teach pointer

> “Startup is assembling the plane. Shutdown is landing it. Both are part of the product.”

---

## 14. Optional further reading (not required)

- [health-readiness](./health-readiness.md)  
- [12-factor-app](./12-factor-app.md)  
- Repo: `backend/src/server.ts`, `backend/src/app.ts`
