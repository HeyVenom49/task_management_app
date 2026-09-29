# Step 9 — Ship checklist (before PR)

**Standalone ✓** — You can gate a PR for this backend without re-opening steps 01–08: every box is a thinking prompt with enough context to decide yes/no.

**After this file you can:** run a pre-merge review on your own change, refuse to merge when a security proof is missing, and explain “done” in an interview.

---

## 1. Why this step exists

Design steps produce artifacts. Shipping without a gate turns them into optional homework.

If you skip this checklist you merge:

- routes that forgot IDOR cases  
- migrations without constraints that match invariants  
- services that look clean but have no race story  
- PRs that ask for trust instead of proof

**Artifact you leave with:** a checked list (or PR description sections mirroring it) — blank + filled templates below.

---

## 2. Mental model

### Analogy

Pilots don’t “remember most of the checklist.” They **read it**.  
This file is the pre-flight card for a feature PR: brief, threats, API, data, layers, races, tests, teachability.

### Where this sits

```text
01→07 design + proofs → 08 optional full narration
                              │
                              ▼
                    09 ship checklist  ← you are here (last gate)
                              │
                              ▼
                         open PR / merge
```

### Inputs → outputs

| In | Out |
|----|-----|
| Implemented feature + tests | Pass/fail per section |
| Deferred items | Explicitly listed (not forgotten) |
| Reviewer | PR text that shows *why*, not only *what* |

---

## 3. Core rules (must / must-not)

1. **MUST** treat unchecked security/test boxes as merge blockers, not nits.  
2. **MUST** require a written non-goals / deferred list when scope was cut.  
3. **MUST** verify new tables appear in `resetDb` TRUNCATE if tests touch them.  
4. **MUST** confirm error responses stay generic (no stacks/SQL in bodies).  
5. **MUST** align nested routes with `/api/v1/projects/:id/...` patterns.  
6. **MUST NOT** merge “we’ll add IDOR tests in a follow-up” for new id-bearing routes.  
7. **MUST NOT** put SQL in controllers or `res.status` policy in repositories.  
8. **MUST NOT** call the checklist done if step-06 races have neither a test nor an explicit N/A.

---

## 4. Decision questions — with how to answer

### Q1. Is the problem still the one we built?

Re-read actors, job sentence, non-goals, success criteria.  
**Bad:** PR title “comments” with threads half-landed.  
**Good:** non-goals match code; success criteria are observable in tests.

### Q2. Does every path id have an IDOR story?

For each `:id` / `:taskId` / `:commentId` / body id: stranger, other project member, wrong binding.  
**Statuses:** 401 anonymous; 403 no membership; 404 wrong binding under your project (IDOR-shaped miss).

### Q3. Does the API match the matrix?

Middleware authenticates; service enforces membership/roles/fields; Zod allow-lists bodies (no mass assignment); DTOs omit secrets.

### Q4. Does the schema enforce what the app claims?

FKs, UNIQUE, CHECK, soft vs hard delete — each invariant has app and/or DB teeth. Member id vs user id chosen on purpose.

### Q5. Are layer boundaries clean?

Routes → controller → service → repo; `tx` passed into repos inside `sql.begin`; mounted in `api/v1.ts` if new router.

### Q6. Are races and failures named?

Interleaving written or N/A justified; lock/OCC/unique/conditional chosen; multi-write in one tx; Postgres `23505` → 409 where relevant; safety deps fail-closed.

### Q7. Do tests prove the dangerous cases?

Happy path **and** 401 **and** IDOR/authz; race/conflict if required; `beforeEach(resetDb)`; gaps listed.

### Q8. Can a stranger learn *why* from the PR?

Brief + invariants + test names in the description; link a lesson only if introducing a new pattern.

---

## 5. Worked example A — this project (member removal PR lens)

Imagine the PR that added “cannot remove member with open tasks.”

| Section | Gate evidence |
|---------|----------------|
| Problem | Owner removes member; non-goal: hard-delete users |
| Threats | TOCTOU assign-vs-remove; last owner |
| API | Existing member DELETE/PATCH path; 409 on open tasks |
| Data | Status soft-remove; CHECK/counts as defense |
| Layers | `ProjectService.removeMember` + tx + `FOR UPDATE` |
| Concurrency | Interleaving in design; parallel test |
| Tests | `members.removal.test.ts` — 409 case + `parallel remove vs assign -> never inactive with open assignment` |
| Docs | PR cites invariant + test names |

If the parallel case were missing → **do not merge**.

---

## 6. Worked example B — mini greenfield: comments PR

### Checklist run (abbreviated)

- [x] Actors: MEMBER / AUTHOR / OWNER  
- [x] Non-goals: no edits/threads  
- [x] IDOR cases named + implemented in `comments.idor.test.ts`  
- [x] Routes nested; Zod max 2000  
- [x] Migration `00N_create_comments.sql`; FK CASCADE; `author_member_id`  
- [x] `resetDb` includes `comments`  
- [x] No SQL in controller  
- [x] Create: membership + task bind; delete authz in service  
- [x] Race: N/A for create; double POST documented  
- [x] Tests: idor, authz delete, happy, 401  
- [ ] OpenAPI — only if you publish contracts (check team norm)  
- [x] PR description has brief + invariants  

**Merge decision:** yes, once OpenAPI box matches team policy.

---

## 7. Decision template

### Blank (copy into PR)

```text
## Brief
Actors:
Job:
Non-goals:
Success:

## Invariants
-

## API
Routes:
Auth matrix:

## Data
Migration:
Constraints:

## Concurrency
Interleavings / N/A:
Mitigations:

## Tests
Files:
Gaps:

## Checklist
(paste section ticks from below)
```

### Filled (comments excerpt)

```text
## Brief
Actors: MEMBER create/list; AUTHOR|OWNER delete
Job: discuss task in project context
Non-goals: edits, threads, notifications
Success: IDOR 403/404; member 201; delete authz

## Invariants
- task.projectId matches URL project
- author_member_id active membership at create
- delete author or owner only

## Tests
comments.idor.test.ts / comments.authz.test.ts / comments.api.test.ts
Gaps: no OCC (no edits); idempotent POST deferred
```

---

## 8. The checklist (tick before PR)

### Problem & scope

- [ ] Actors listed in product roles (member/owner/admin/…)  
- [ ] One-sentence job statement  
- [ ] Non-goals written (so reviewers don’t expect them)  
- [ ] Success criteria observable  

### Threats & invariants

- [ ] IDOR considered for every id in path/body  
- [ ] Authn vs authz vs field-level decided  
- [ ] Invariants listed in plain language  
- [ ] Each invariant has app and/or DB enforcement  
- [ ] 403 vs 404 strategy chosen deliberately  

### API

- [ ] Routes nested consistently with `/projects/:id/...`  
- [ ] Auth matrix filled (middleware + service rules)  
- [ ] Zod schemas for params + body; max lengths set  
- [ ] Response DTOs have no secrets  
- [ ] OpenAPI updated if contract is public  

### Data

- [ ] Migration file named `00N_….sql`  
- [ ] FKs / UNIQUE / CHECK match invariants  
- [ ] Member id vs user id chosen consciously  
- [ ] Soft delete vs hard delete decided  
- [ ] Repo `map()` + tx-capable `db` args where needed  
- [ ] New tables added to `resetDb` TRUNCATE list  

### Layers

- [ ] No SQL in controllers  
- [ ] No `res.*` in services  
- [ ] No HTTP status policy in repositories  
- [ ] Reused `authenticate` / membership helpers where possible  
- [ ] Mounted in `api/v1.ts` if new router  

### Concurrency & failure

- [ ] Dangerous interleaving written down (or N/A justified)  
- [ ] Lock / OCC / unique / conditional update chosen  
- [ ] Transactions wrap multi-write operations  
- [ ] Postgres codes mapped to AppErrors where relevant  
- [ ] Rate limit considered for abuse-sensitive routes  
- [ ] Errors don’t leak internals  

### Tests

- [ ] Happy path API test  
- [ ] Unauthorized 401 test  
- [ ] IDOR / cross-user test  
- [ ] Authz matrix if field- or role-sensitive  
- [ ] Conflict/race invariant test if step 6 needed it  
- [ ] `resetDb` in `beforeEach`  
- [ ] Gaps explicitly noted if deferred  

### Docs / teachability

- [ ] PR description includes brief + invariants  
- [ ] Linked lesson concepts if introducing a new pattern  
- [ ] Someone else can explain *why* from the PR text  

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What breaks |
|--------------|-------------|
| Checklist as theater (all green, no tests) | False safety |
| “Follow-up” for IDOR on new ids | Production incident class |
| Migration without updating test truncate | Flaky suite / FK noise |
| PR with only code diff | Reviewers guess intent |
| Shipping OCC fields the client never sends | Always-409 or silent overwrite |
| Fail-open “just for this release” | Becomes permanent |

---

## 10. Exit criteria

You may open/merge the PR when:

- [ ] All security and test boxes above are checked or explicitly N/A with reason  
- [ ] Deferred gaps are written in the PR body  
- [ ] Local/CI tests covering the new cases pass  
- [ ] You would defend every unchecked box aloud without wincing  

---

## 11. Interview Q&A

**Q: What’s on your pre-merge checklist for a security-sensitive endpoint?**  
**A:** Actors and non-goals; IDOR for every id; authn vs authz vs field rules; 403 vs 404 policy; Zod allow-list; constraints matching invariants; tx/lock/OCC if concurrent; tests for 401, IDOR, and conflicts; safe error bodies; PR text that states invariants. I refuse merge without the IDOR proof for new path ids.

**Q: How do you know you’re done?**  
**A:** Success criteria from the brief are observable in tests; checklist sections pass; deferred work is named so it can’t be mistaken for unfinished accidents. “Code compiles” is not done.

**Q: What would you refuse to merge without?**  
**A:** At least one cross-user IDOR (or anonymous 401) test for new authenticated resource routes; a story for concurrency if step 6 identified a race; no secret fields in DTOs; migrations and `resetDb` kept in sync.

**Q: Checklist vs CI — isn’t CI enough?**  
**A:** CI runs what you wrote. The checklist asks whether you wrote the *right* proofs and design gates. They complement: checklist → which tests; CI → they stay green.

**Q: How do you handle honest deferrals?**  
**A:** Write them under Non-goals/Gaps in the PR (e.g. “no idempotency key on POST comments”). Don’t leave silent holes. Follow-ups get tickets with the invariant they must prove.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| **Ship checklist** | Pre-PR gate across design dimensions |
| **Merge blocker** | Unchecked security/proof item |
| **N/A justified** | Explicit reason a race/test box doesn’t apply |
| **Teachability** | PR explains why, not only what changed |
| **Observable success** | Criterion a test or manual script can verify |

---

## 13. Optional further reading

- Previous: [08-build-the-feature-walkthrough.md](./08-build-the-feature-walkthrough.md) · Map: [10-concept-coverage.md](./10-concept-coverage.md)  
- Index: [README.md](./README.md) · Lessons: [../lessons/README.md](../lessons/README.md) · Functions: [../README.md](../README.md)  
- Optional lessons: [testing-as-proof](../lessons/testing/testing-as-proof.md), [idor](../lessons/security/idor.md), [blameless-postmortems](../lessons/ops/blameless-postmortems.md) (when a miss escapes the checklist)

---

## Teach pointer

> “A PR that only shows code asks for trust. A PR that shows invariants and tests offers proof.”
