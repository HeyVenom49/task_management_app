# Lesson: Feature flags

**Standalone ✓** — Feature toggles for safe rollout, kill switches, and experiments—plus where this repo stands.

**After this file you can:** design flag keys, avoid flag debt, combine flags with auth/modules safely, and interview on rollout patterns.

---

## 1. First principles

A **feature flag** (toggle) chooses behavior at runtime without redeploying—often backed by config service, env vars, or database.

The problem it solves: big-bang releases and “revert means redeploy.” Flags enable **gradual rollout**, **A/B tests**, and **kill switches** when a feature misbehaves in production.

The problem flags create: **technical debt**—long-lived `if (flag)` spaghetti, untested combinations, stale flags nobody removes.

---

## 2. Mental model

### Analogy

Circuit breaker labeled “new kitchen line”—flip off and diners still get food from the old line; flip on for 5% of tables first.

### Diagram

```text
  Request ──► Flag service / env ──► branch A (old) or B (new)
                      │
                      ├── userId hash % 100 < rollout
                      └── kill switch OFF → always A
```

---

## 3. Core rules (must / must-not)

1. **MUST** default safe path when flag service unavailable (define per flag: old behavior vs fail-closed).  
2. **MUST** name flags clearly (`tasks.status_v2_enabled`).  
3. **MUST** log/metric flag evaluations in production debugging.  
4. **MUST NOT** use flags to skip authz permanently.  
5. **SHOULD** time-box flags—ticket to remove after full rollout.  
6. **SHOULD** test both paths or use automated matrix sparingly.  
7. **MUST NOT** store secrets in flag payloads.

---

## 4. How it works (mechanics)

**Types:**

| Type | Use |
|------|-----|
| Release toggle | Hide incomplete feature |
| Ops kill switch | Disable expensive endpoint |
| Experiment | A/B metric comparison |
| Permission | Entitlements (prefer real authz for security) |

**Evaluation:** At request start or service entry—consistent per request (don’t flip mid-transaction).

**Storage:** Env vars (simple), Redis, LaunchDarkly, etc.

**This project:** No centralized feature flag system. Behavior toggles exist via `NODE_ENV` (rate limits passthrough in test, Swagger in non-prod). Task status field exists in schema—product feature, not flag-driven.

---

## 5. When to use / when not to use

| Situation | Flags? |
|-----------|--------|
| Rolling out new task workflow | **Yes** |
| Permanent tenant tiers | Use **authz/roles**, not flags alone |
| Local dev convenience | Env vars OK |
| Security control | **No** — proper permissions |
| One-line UI tweak | Overkill |

---

## 6. Step-by-step: design → implement → verify

1. Define flag key, owner, removal date.  
2. Choose default (off in prod usually).  
3. Wrap **service** branch, not scattered in repos.  
4. Add metrics: `flag.tasks_v2` evaluated true/false.  
5. Rollout: 1% → 10% → 100%.  
6. Remove flag + dead code when stable.

---

## 7. Worked example A — this project

**Env-based toggles today:**

- `NODE_ENV=test` → rate limiters passthrough (`rate-limit.ts`).  
- `NODE_ENV!==production` → Swagger UI at `/api/docs`.

**Hypothetical flag — task status transitions v2:**

```ts
// project.service or task.service
if (flags.isEnabled("task_status_workflow_v2", { userId })) {
  return this.updateWithWorkflow(input);
}
return this.updateLegacy(input);
```

Keep authz identical on both paths—flag only changes **business rules**, not who may call.

**Module boundary:** Flag evaluation in **service layer**; controllers unchanged HTTP contract unless versioned API.

---

## 8. Worked example B — self-contained mini scenario

```ts
type Flags = { checkout_v2: boolean; rolloutPct: number };

function enabled(flags: Flags, userId: string): boolean {
  if (!flags.checkout_v2) return false;
  if (flags.rolloutPct >= 100) return true;
  const bucket = hash(userId) % 100;
  return bucket < flags.rolloutPct;
}

async function checkout(userId: string, cart: Cart) {
  if (enabled(config.flags, userId)) {
    return checkoutV2(cart);
  }
  return checkoutV1(cart);
}
```

Kill switch: set `checkout_v2=false` in config—instant revert without deploy if config is dynamic.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| 50 nested flags | Untestable combinations |
| Flag in repository SQL | Hidden behavior |
| Never removing flags | Permanent complexity |
| Different auth per flag path | Security hole |
| Per-request random flip | Broken UX |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Feature “random” | Inconsistent bucketing | userId stable? | Hash userId once per request |
| Prod shows dev behavior | Wrong env | `config/env.ts` | Separate flag store |
| 503 after flag on | New path untested | Logs/metrics | Rollback flag |
| Stale code paths | Old flag | Grep flag key | Delete flag |

---

## 11. Interview Q&A (with strong answers)

**Q: Feature flag vs config?**  
**A:** Flags imply temporary rollout/kill; config is stable settings—overlap exists, intent differs.

**Q: Where evaluate?**  
**A:** Service/application layer once per request; avoid deep nested repo checks.

**Q: Safe default when flag service down?**  
**A:** Product decision—usually old stable path for release toggles; fail-closed for risky experiments.

**Q: This repo?**  
**A:** Env-based toggles for test rate limits and Swagger—not a full flag platform yet.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Feature flag | Runtime behavior switch |
| Kill switch | Fast disable |
| Rollout percentage | Gradual exposure |
| Flag debt | Stale toggles left in code |
| Bucketing | Stable user→variant assignment |

---

## 13. Teach pointer

> “Flags are for moments, not for years—schedule their funeral when you ship.”

---

## 14. Optional further reading (not required)

- [../ops/blue-green-canary.md](../ops/blue-green-canary.md)  
- [modular-monolith](./modular-monolith.md)

Repo path: `backend/src/config/env.ts`, `backend/src/shared/auth/rate-limit.ts`.
