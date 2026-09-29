# Lesson: Blue/green and canary deploys

**Standalone ✓** — You do not need any other doc to deploy this API safely with traffic shifting.

**After this file you can:** compare blue/green vs canary, tie deploys to migrations and health checks, and interview on expand/contract.

---

## 1. First principles

**Blue/green:** two full environments; switch traffic **instantly** from old (blue) to new (green).  
**Canary:** send a **small fraction** of traffic to the new version; increase if metrics healthy.

Both need **compatible schema**, **health gates**, and **rollback**.

**The problem it solves:** Big-bang deploys where bad code takes 100% traffic before you notice; schema changes that break old code still running during rolling update.

---

## 2. Mental model

### Analogy

**Blue/green:** swap entire highway to a parallel road overnight.  
**Canary:** open one new lane with 5% of cars first; if no crashes, move everyone.

### Diagram

```text
Blue (v1) ────────────────┐
                          ├──► LB weight ──► users
Green (v2) ── canary 5% ──┘
         └── metrics OK ──► 100% green
```

---

## 3. Core rules (must / must-not)

1. **MUST** make migrations **backward compatible** during roll (expand/contract).  
2. **MUST** gate traffic on **readiness** (DB, Redis).  
3. **MUST** have **rollback** — redeploy old image or shift weights back.  
4. **MUST NOT** drop columns before **all** old code gone.  
5. **SHOULD** watch SLI during canary ([sli-slo-error-budgets](./sli-slo-error-budgets.md)).

---

## 4. How it works (mechanics)

**Rolling deploy (default K8s):** replace pods gradually — old and new coexist → schema must serve both.

**Expand/contract:**

1. Expand: add new column nullable.  
2. Dual-write or backfill.  
3. Deploy code reading new column.  
4. Contract: drop old column after no old code.

**Blue/green:** migrate once; switch LB; old stack idle for quick revert.

**Canary:** adjust traffic weight; auto rollback on error budget burn.

Deploy strategy **not specified** in this repo’s CI — patterns still apply to `Dockerfile` + migrations.

---

## 5. When to use / when not to use

| Situation | Strategy |
|-----------|----------|
| High risk auth change | Canary |
| Simple bugfix | Rolling OK |
| Major schema break | Expand/contract + canary |
| Single dev | Local restart |

---

## 6. Step-by-step: design → implement → verify

1. Write migration expand-only first PR.  
2. Deploy code handling both shapes.  
3. Backfill data.  
4. Deploy code using new shape only.  
5. Contract migration PR.  
6. Canary with health `/api/v1/health/db` and SLI dashboard.

---

## 7. Worked example A — this project

**Artifacts:** `backend/Dockerfile` builds runnable image; app listens after Redis connect; health routes for gating.

**Migration compatibility:** follow [migrations](../database/migrations.md) expand/contract — e.g. add column before renaming task fields consumers depend on.

**App/server split:** tests use `app` without listen — deploy runs `server.ts` with full boot.

**Rollback story:** redeploy previous image; if migration non-reversible, forward-fix only — plan migrations accordingly.

**Feature flags:** optional finer control [feature-flags](../architecture/feature-flags.md) alongside canary.

---

## 8. Worked example B — mini scenario (self-contained)

**Bad:** migration drops `tasks.title` while v1 still SELECTs `title` → outage during rolling deploy.

**Good:**

1. Add `tasks.name`, backfill from `title`.  
2. Deploy v2 writing both.  
3. Deploy v3 reading `name` only.  
4. Drop `title`.

Canary: 5% traffic to v3, watch 5xx and p95 on `PATCH /tasks`.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Result |
|--------------|--------|
| Breaking migration + rolling | Intermittent 500 |
| Canary without metrics | Blind ship |
| Green never drained | Cost + confusion |
| Skip health on new pods | LB sends to broken v2 |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| 500 after deploy | schema mismatch | migration order | expand/contract |
| Canary OK, full bad | rare code path | traffic mix | longer canary |
| Rollback fails | irreversible migration | migration design | forward fix |
| Old pods 503 | Redis boot order | readiness | connectRedis before listen |

---

## 11. Interview Q&A (with strong answers)

**Q: Expand/contract example?**  
**A:** Add new nullable column, deploy readers/writers, backfill, switch primary usage, then drop old column — never drop before old code gone.

**Q: Canary vs blue/green?**  
**A:** Blue/green switches all traffic at once with instant rollback to idle stack; canary ramps fraction with metric gates.

**Q: DB backward compatibility?**  
**A:** During rolling deploy, old and new code share DB — migrations must not break old queries.

**Q: This repo deploy?**  
**A:** Not fully specified; Dockerfile + health + migration discipline support standard K8s rolling/canary patterns.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Blue/green | Two envs, instant switch |
| Canary | Partial traffic to new version |
| Expand/contract | Safe schema migration pattern |
| Rollback | Revert traffic or image |
| Rolling deploy | Gradual pod replacement |

---

## 13. Teach pointer

> “Deploy safety is migration design + traffic control + a rollback story.”

---

## 14. Optional further reading (not required)

- [health-readiness](./health-readiness.md) · [migrations](../database/migrations.md)  
- [feature-flags](../architecture/feature-flags.md)
