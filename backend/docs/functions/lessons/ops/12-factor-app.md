# Lesson: 12-factor app methodology

**Standalone ✓** — You do not need any other doc to map this codebase to deployable SaaS practices.

**After this file you can:** explain each factor in plain language, audit a repo against the checklist, and defend env-based config and disposability in interviews.

---

## 1. First principles

The **12-factor app** is a checklist for building **SaaS** that runs on modern platforms (Heroku, Kubernetes, PaaS): one codebase, explicit dependencies, config in environment, stateless processes, logs as streams, etc.

**The problem it solves:** “Works on my machine” snowflakes, secret-in-repo disasters, and apps that can’t scale horizontally because state lives on disk in one container.

---

## 2. Mental model

### Analogy

A food truck fleet: every truck uses the **same recipe repo** (codebase), buys ingredients from attached suppliers (DB/Redis URLs), takes orders on a **standard window height** (port binding), and can be replaced anytime (disposability) without customers caring which truck served them.

### Diagram

```text
Code ──► build ──► release (code + config) ──► run (N stateless processes)
                         │
                         └── config = env vars only (not in image)
Backing services: Postgres, Redis (attached, swappable)
```

---

## 3. Core rules (must / must-not)

1. **MUST** store config in **environment**, not committed secrets.  
2. **MUST** treat DB/Redis as **attached resources** (URL in env).  
3. **MUST** keep app processes **stateless** (session in DB/Redis, not local RAM).  
4. **MUST** log to **stdout** as structured events (aggregator collects).  
5. **MUST** separate **build**, **release**, and **run** stages.  
6. **MUST NOT** SSH-edit production code.  
7. **MUST NOT** rely on local filesystem for durable user data.

---

## 4. How it works (mechanics)

| Factor | One-line meaning |
|--------|------------------|
| I Codebase | One repo per app; many deploys |
| II Dependencies | Explicit manifest (package.json) + lockfile |
| III Config | Env vars per deploy |
| IV Backing services | DB/queue as attached URLs |
| V Build, release, run | Immutable release artifact |
| VI Processes | Execute as one or more stateless processes |
| VII Port binding | Export HTTP via port (self-contained) |
| VIII Concurrency | Scale out processes, not threads in one box |
| IX Disposability | Fast start, graceful stop |
| X Dev/prod parity | Same backing services types, minimize gaps |
| XI Logs | Event stream to stdout |
| XII Admin processes | One-off tasks (migrate) as separate run |

---

## 5. When to use / when not to use

| Situation | 12-factor lens |
|-----------|----------------|
| New HTTP API on K8s | **Strong fit** |
| Embedded firmware | Not applicable |
| Heavy local GPU state | Needs adaptation (not classic 12-factor) |
| Monorepo many services | Still one codebase per **deployable** unit |

---

## 6. Step-by-step: design → implement → verify

1. List secrets → env + secret manager, validate with Zod at boot.  
2. Dockerfile: build deps, run `node`/`bun` CMD, no config baked in.  
3. Stateless: JWT + DB sessions, Redis rate limit — not in-memory only.  
4. Migrations as Job, not manual SQL on prod SSH.  
5. Verify: new container from image + env starts without local files.

---

## 7. Worked example A — this project

| Factor | How this repo aligns |
|--------|----------------------|
| Config | `backend/src/config/env.ts` reads `process.env`, Zod-validated |
| Backing services | `DATABASE_URL`, Redis URL in env |
| Port binding | `server.ts` listens on `env.port` |
| Processes | HTTP server process; tests import `app` without listen |
| Disposability | SIGTERM shutdown closes HTTP, Redis, SQL pool |
| Logs | `pino` → stdout; silent in test |
| Admin | DB migrate as separate command (see migrate tooling) |
| Build/run | `backend/Dockerfile` containerizes API |

**Logger (logs as streams):**

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

Pretty transport is dev-only; production stays JSON-friendly stdout.

---

## 8. Worked example B — mini scenario (self-contained)

Anti-pattern fix: move `JWT_SECRET=hardcoded` from Dockerfile `ENV` to orchestrator secret:

```dockerfile
# BAD: secret in image layers
ENV JWT_SECRET=prod-secret

# GOOD: only at run
# docker run -e JWT_SECRET=... 
```

Release pipeline: `git sha` tag → build image → deploy with env from vault → run migrate Job → roll Deployment.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Violates |
|--------------|----------|
| Config in git | III Config |
| Uploads on local disk only | VI Processes / VIII |
| `console.log` only, no structure | XI Logs |
| No graceful SIGTERM | IX Disposability |
| Prod-only Redis vendor API | X Parity |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Works locally, prod crash on boot | Missing env | Zod error at import | Set env in platform |
| Can't scale horizontally | Sticky local state | sessions in memory | Redis/DB sessions |
| Secret in image scan | Dockerfile ENV | layer history | inject at runtime |
| Logs lost | File inside container | logging driver | stdout + aggregator |

---

## 11. Interview Q&A (with strong answers)

**Q: Why config in env?**  
**A:** Config varies per deploy (staging vs prod) while the build artifact stays identical; secrets never belong in the image or repo.

**Q: Disposability?**  
**A:** Processes start fast and stop gracefully on SIGTERM so orchestrators can replace instances without manual babysitting.

**Q: Dev-prod parity?**  
**A:** Use the same kinds of backing services (Postgres, Redis) and the same env validation path; differences (scale, secrets) should be explicit, not accidental.

**Q: How does this API bind ports?**  
**A:** `server.listen(env.port)` — platform sets `PORT` or equivalent via env mapping.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Backing service | DB, cache, queue accessed via URL |
| Release | Immutable deploy unit (build + config) |
| Stateless process | No durable in-memory user state |
| Attached resource | Swappable provider without code change |

---

## 13. Teach pointer

> “12-factor is a checklist for deployable, replaceable processes — this repo already speaks a lot of it.”

---

## 14. Optional further reading (not required)

- [boot-and-graceful-shutdown](./boot-and-graceful-shutdown.md)  
- [structured-logging-metrics-tracing](./structured-logging-metrics-tracing.md)  
- [../architecture/stateless-services.md](../architecture/stateless-services.md)
