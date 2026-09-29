# 10 — Fix protocol

**Standalone ✓** — You do not need other how-to-debug guides to run a reproduce → hypothesize → fix → prove loop on this backend (though the decision tree helps pick the right specialist guide).

**After this file you can:** write one falsifiable hypothesis, place the fix in the right layer, prove with the right bun:test file, and explain the discipline in interview language.

---

## 1. Why this habit exists

Random file opens and “try this” commits create thrash: fix A breaks B; status codes drift; IDOR holes return. Seniors change **one** layer per hypothesis, keep a reproduction command, and refuse to merge without proof (often a regression test).

Wrong habit: edit controller, service, and repository in one unfocused pass. Right habit: capture signal → one hypothesis → verify at one function → smallest fix → re-run the fail case.

---

## 2. Mental model

### Analogy

Debugging is **crime-scene work**, not renovation. Preserve the crime (reproduction), name one suspect (hypothesis), check alibi (log/SQL at that function), cuff only the guilty layer, then show the jury (test/curl).

```text
Signal (status, message, requestId, stack)
  → Classify (boot | HTTP | infra | auth | authz | race | test)
  → One hypothesis (layer L, function F, because …)
  → Verify at F only
  → Smallest fix
  → Prove (same repro green + regression test)
  → Nearby scan (same pattern elsewhere?)
```

### Neighborhood → house → room

| If you classified… | First specialist / house | Prove with |
|--------------------|--------------------------|------------|
| Boot / env | `server.ts`, `env.ts` | process starts; migrate |
| Validation 400 | `*.schema.ts` + controller | curl body errors |
| Auth 401/403 verify | `auth.service.ts` | auth tests / guide 06 |
| Authz 403/404 | `task.service` / `project.service` | idor/authz/removal tests |
| OCC / race | locks + OCC WHERE | `concurrency` / removal race |
| SQLSTATE / Redis | guide 05 territory | infra + mapping |
| Test-only red | guide 09 harness | single-file bun test |

---

## 3. Core rules (must / must-not)

1. **MUST** reproduce with **one** command or **one** test before editing.  
2. **MUST** write the hypothesis in a sentence: “I think `TaskService.update` 404s because `projectId` bind …”  
3. **MUST** falsify the hypothesis with evidence at that spot — then write a new one.  
4. **MUST** prefer fixing the **service** for business rules; schema for input shape; migration+repo for constraints.  
5. **MUST** add or extend a regression test for security/concurrency bugs.  
6. **MUST NOT** catch-all and return 200 to “make it work.”  
7. **MUST NOT** change five layers when one check failed.  
8. **MUST NOT** delete failing tests to green CI.

---

## 4. Signal taxonomy (what you capture)

Before coding, write down:

| Field | Example |
|-------|---------|
| Method + URL | `PATCH /api/v1/projects/:id/tasks/:tid` |
| Status | 404 |
| Body | `{ "message": "Task not found", "requestId": "…" }` |
| Auth channel | Bearer present; refresh N/A |
| Actor / fixtures | Alice token; project B id; task from A |
| Stack / log | AppError warn vs 500 stack |
| Repro | `bun test src/test/tasks.idor.test.ts` or curl |

Missing `requestId` correlation → still proceed, but note observability gap (optional lesson later).

---

## 5. Symptom → first open (protocol view)

| Symptom class | First open | Why | If wrong, next |
|---------------|------------|-----|----------------|
| Can’t reproduce | tighten repro | no signal yet | add logging at edge |
| Zod Validation failed | controller + schema | never hit service | Content-Type / field names |
| AppError message clear | service method named by message | domain throw site | repo only if SQL mapped |
| 500 generic | `errorHandler` + stack | unmapped throw | SQLSTATE mapper |
| Test helper throw | `helper/auth.ts` / DB | harness | guide 09 |
| Parallel flake | service tx/lock | race | guide 08 |
| “Works in Postman” | channel/CORS/cookie | client differ | guide 06 |

---

## 6. Reproduce recipes

### Always keep a one-liner

```bash
# Example authz
bun test src/test/tasks.idor.test.ts

# Example race
bun test src/test/concurrency.test.ts

# Example HTTP
curl -s -D- -X PATCH "$BASE/api/v1/projects/$PID/tasks/$TID" \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"status":"IN_PROGRESS","expectedUpdatedAt":"…"}'
```

### Hypothesis templates (copy)

- “Controller Zod rejects because field X …”  
- “Service throws Forbidden because membership status is INACTIVE …”  
- “404 because `task.projectId ≠` URL id …”  
- “409 because `expectedUpdatedAt` is stale …”  
- “409 remove because `countOpenAssignedTo` > 0 …”  
- “503 because Redis is down and limiter fail-closes …”  
- “500 because unique violation uncaught …”  
- “Boot fails because `COOKIE_SECURE` false in production …”  
- “Test red because `resetDb` missing new table …”

---

## 7. Hypothesis ladder (meta)

Use this order when stuck:

1. **Wrong layer?** — Validation vs service vs repo vs infra.  
2. **Wrong actor/fixture?** — Token/project/task mismatch.  
3. **Stale client / OCC?** — 409 modified.  
4. **Race?** — Only under parallel.  
5. **Mapping?** — SQLSTATE not translated → 500.  
6. **Design?** — “Bug” is intentional (logout vs access JWT TTL) — document, don’t “fix” wrongly.

---

## 8. Worked failure A — this project: PATCH task 404

**Signal:** `PATCH .../tasks/:id` → 404 `Task not found`; row exists in SQL.

**Classify:** HTTP / authz-IDOR (not auth — Bearer works on `/me`).

**Hypothesis:** URL `projectId` ≠ `task.project_id`.

**Verify:** In `TaskService.update`, compare `projectId` arg to `existing.projectId` after `findById` (same check as `getById`).

**Critical code:**

```ts
if (!existing || existing.projectId !== projectId) {
  throw new NotFoundError("Task not found");
}
```

**Fix:** Usually client URL. If check missing → **security fix** in service + `tasks.idor.test.ts`.

**Prove:** IDOR case red→green; correct project path 200 with valid `expectedUpdatedAt`.

---

## 9. Worked failure B — mini invented: “Fix” that made remove always 200

**Signal:** Product wanted fewer 409s on member remove. Engineer deleted `countOpenAssignedTo` check. Tests: `members.removal.test.ts` Expected 409 Received 200.

**False lead:** “Test is outdated; open tasks are fine.”

**Protocol application:**

1. Reproduce: removal test.  
2. Classify: authz/invariant, not flaky.  
3. Hypothesis: invariant removed in `ProjectServices.removeMember`.  
4. Verify: read method — check gone.  
5. Fix: **restore** check + keep `FOR UPDATE`; do not weaken test.  
6. Prove: 409 with open task; 200 after complete with OCC timestamp.

**Lesson:** Fix protocol includes rejecting “fixes” that delete safety tests.

---

## 10. Fix placement rules

| Bug type | Prefer fixing in |
|----------|------------------|
| Bad input accepted | `*.schema.ts` + controller |
| Wrong HTTP mapping | error class / controller map |
| Wrong business rule | **service** (`task.service` / `project.service` / `auth.service`) |
| Wrong SQL / constraint miss | migration + repository + service map |
| Leak internals on 500 | `errorHandler` |
| Race | transaction + lock/constraint + concurrency test |
| Harness only | `preload.ts` / `resetDb` / helpers |

Avoid “fix” by catching-all and returning 200.

---

## 11. False leads / anti-patterns

| False lead | Reality |
|------------|---------|
| Editing three layers at once | Can’t tell what worked |
| Logging secrets to “see the token” | Security incident |
| Skipping repro because “obvious” | Wrong file 40% of the time |
| Green only on happy path | IDOR/race returns |
| Changing Expected status in test | Hides contract break |
| Huge PR “while here” | Review can’t verify the fix |

---

## 12. Fix + prove checklist

After the change:

- [ ] Same reproduction now passes  
- [ ] Opposite case still correct (e.g. valid member still 200; cross-project still 404)  
- [ ] Related IDOR / authz / concurrency / removal test added or updated  
- [ ] No new secret logging; `requestId` still on AppError responses  
- [ ] If status codes changed, update OpenAPI / clients mentally  
- [ ] Nearby scan: same bind/lock missing on sibling methods?

Relevant proves: `tasks.idor.test.ts`, `tasks.authz.test.ts`, `members.removal.test.ts`, `concurrency.test.ts`, `auth.api.test.ts`.

---

## 13. Interview Q&A

**Q: How do you approach a production 500?**  
**A:** Capture `requestId`, status, generic client message, and server stack from logs. Classify unmapped exception vs infra. Reproduce with same payload in staging. Hypothesize the throw site (often unmapped `23505` or null deref). Fix by mapping to AppError or correcting the bug; prove with a test that used to expect 500/wrong code. Don’t ship a catch-all 200.

**Q: When do you add a test before vs after the fix?**  
**A:** For reported security/concurrency bugs, write or extend the failing test **first** (red) so you prove the hole exists, then fix to green. For obvious typos with an existing covering test, fix then re-run. Never delete the failing assertion.

**Q: How do you avoid fixing the wrong layer?**  
**A:** Name the layer in the hypothesis and verify there. Validation messages mean schema/controller. Domain messages mean service. SQLSTATE in logs means DB/repo mapping. Auth channel issues mean cookies/JWT middleware. If evidence kills the hypothesis, rewrite it — don’t spray patches.

**Q: What does “smallest fix” mean?**  
**A:** One behavioral change that restores the invariant — e.g. restore `projectId` bind — not a rewrite of the module. Refactors wait until the bug is proven fixed.

**Q: How does this relate to OCC and refresh reuse?**  
**A:** Same loop: reproduce parallel/stale case (`concurrency.test.ts`), hypothesize missing conditional UPDATE or revoke-all path, verify in `TaskRepository.update` / `AuthService.refresh`, fix, prove invariant.

**Q: What if the “bug” is intentional design?**  
**A:** Example: access JWT works after logout until `exp`. Protocol says classify, confirm design, document for the client — don’t break stateless JWT by hacking logout unless product requires a denylist. Teach the tradeoff.

---

## 14. Glossary

| Term | Meaning |
|------|---------|
| **Reproduction** | Minimal steps that reliably show the failure |
| **Hypothesis** | Single falsifiable guess about layer + cause |
| **Smallest fix** | Minimal code change that restores the invariant |
| **Regression test** | Automated case that fails if the bug returns |
| **Nearby scan** | Check sibling methods for the same hole |
| **Classify** | Bucket failure before opening files |

---

## 15. Optional further reading

- Decision tree: [README.md](./README.md) · Signal: [01-read-the-signal.md](./01-read-the-signal.md) · Auth: [06](./06-auth-and-token-failures.md) · Authz: [07](./07-authz-idor-and-unexpected-403-404.md) · Races: [08](./08-concurrency-and-flaky-failures.md) · Tests: [09](./09-test-failures.md) · Map: [11-symptom-to-concept.md](./11-symptom-to-concept.md)  
- Build process: [../how-to-think/](../how-to-think/) if the “bug” is really a missing design  
- Lessons (optional): [testing-as-proof](../lessons/testing/testing-as-proof.md), [blameless-postmortems](../lessons/ops/blameless-postmortems.md), [error-model-and-app-errors](../lessons/architecture/error-model-and-app-errors.md)

---

## Teach pointer

> “One hypothesis at a time beats ten files at a time.”
