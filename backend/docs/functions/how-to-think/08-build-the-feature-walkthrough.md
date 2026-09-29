# Step 8 — Walkthrough: build “task comments” from scratch

**Standalone ✓** — You can rehearse designing task comments end-to-end without opening steps 01–07 or the lessons catalog. Brief decision rationale is inlined at each stage.

**After this file you can:** narrate a full design (clarify → threats → API → schema → layers → concurrency → tests) for a nested resource in this codebase, and defend tradeoffs in an interview.

> **Not implemented in the repo** — teaching design only. Patterns mirror auth / projects / tasks.

---

## 1. Why this step exists

Steps 01–07 teach *one decision stage each*. Interviews and real tickets demand the **full arc** in one sitting.

If you skip a synthesis walkthrough you can:

- recite “IDOR matters” but freeze when asked to design comments  
- leave gaps between API shape and table FKs  
- forget to name the first test before inventing folders

**Artifact you leave with:** a complete design sketch (this file’s shape) you could paste into a PR description or whiteboard.

---

## 2. Mental model

### Analogy

Steps 01–07 are individual instrument checks. This walkthrough is the **full flight**: takeoff checklist through landing, narrated once so the sequence sticks.

### Where this sits

```text
01→07 = skills
   │
   ▼
08 walkthrough  ← assemble all skills on one feature (you are here)
   │
   ▼
09 ship checklist (gate before PR)
```

### Inputs → outputs

| In | Out |
|----|-----|
| Ticket: “add task comments” | Filled brief → threats → routes → SQL → layers → races → tests |
| Repo patterns (tasks, members) | Reuse map (don’t invent parallel auth) |

---

## 3. Core rules (must / must-not)

1. **MUST** narrate in order 01→07; don’t jump to Zod or React.  
2. **MUST** nest under `/projects/:id/tasks/:taskId/...` like existing tasks.  
3. **MUST** bind every write to *active membership* + *task.projectId === URL project*.  
4. **MUST** store author as **member id** (project-scoped identity), not bare user id.  
5. **MUST** name IDOR tests before creating `modules/comments/`.  
6. **MUST NOT** invent a global `/api/v1/comments` that skips project scope.  
7. **MUST NOT** treat “has JWT” as “can comment on any task.”  
8. **MUST NOT** silently expand scope (edits, threads, notifications) without updating non-goals.

---

## 4. Decision questions — with how to answer

Use these as a live checklist while walking the feature. Each includes the *inline decision* so you don’t need the sibling step open.

### Q1. Clarify — who / job / non-goals / done?

**Why:** Two engineers with different briefs build different products.

**Inline decision for comments:**

| Prompt | Answer |
|--------|--------|
| Actors | Active **MEMBER** create/list; **AUTHOR** or project **OWNER** delete; platform ADMIN out of scope |
| Job | “As an active project member, I discuss a task via comments.” |
| Non-goals | No edits, reactions, @mentions, threads, markdown XSS deep-dive, notifications |
| Success | Member comments on accessible tasks; Alice ⊄ Bob’s project; wrong task id under Alice’s project → 404; delete only author/owner |
| Reuse | `authenticate`, membership helpers, nested routes, `AppError`, Zod UUIDs, Alice/Bob tests |

**Bad:** “Add comments API.”  
**Good:** table above, written in the ticket.

### Q2. Threats & invariants?

**Why:** Security is a design input, not a QA phase.

| Attack | Defense |
|--------|---------|
| Alice posts to Bob’s task URL | Membership check → 403 |
| Alice uses Bob’s taskId under her project | `task.projectId` bind → 404 |
| Non-author deletes | Service authz |
| Huge body spam | JSON limit + Zod max + optional write limiter |

**Invariants:**

1. Comment’s task belongs to URL `projectId`.  
2. Creator is active membership; store `author_member_id`.  
3. Delete iff actor is OWNER or `author_member_id`.  
4. Task delete → comments **CASCADE** (v1 simplicity).

### Q3. API shape?

**Why:** URL structure encodes tenancy and IDOR surface.

```text
POST   /api/v1/projects/:id/tasks/:taskId/comments
GET    /api/v1/projects/:id/tasks/:taskId/comments
DELETE /api/v1/projects/:id/tasks/:taskId/comments/:commentId
```

All behind `authenticate`. Router `mergeParams: true`.  
Body create: `{ body: string min 1 max 2000 }`.  
DTO: `{ comment }` / `{ comments }` / `{ message }` — no internal joins dumped raw.  
Statuses: 201/200; 400 validation; 401; 403; 404.

### Q4. Data model?

```text
comments (
  id UUID PK,
  task_id UUID FK tasks ON DELETE CASCADE,
  author_member_id UUID FK members,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
INDEX (task_id, created_at)
```

Migration: `00N_create_comments.sql`. Prefer UTC timestamps. Optional DB CHECK that author’s `project_id` matches task’s — defense in depth if easy.

### Q5. Layers?

```text
modules/comments/  (or under tasks/)
  comment.routes.ts      → mount under projects/tasks in api/v1
  comment.controller.ts  → parse + call service + res
  comment.service.ts     → membership, task bind, authz delete
  comment.repository.ts  → SQL + map() + tx-capable db arg
  comment.schema.ts      → Zod
```

**Create path (mental):** authenticate → require active member → load task by id+project → insert with `author_member_id`.  
No SQL in controllers; no `res.*` in services; no HTTP policy in repos.

### Q6. Concurrency & failure?

| Concern | Choice |
|---------|--------|
| Still-active member on create | Re-check membership on write (lock membership row if you also mutate related state) |
| Create | Single INSERT; no OCC |
| Future edit | OCC via `expectedUpdatedAt` (deferred with edits) |
| Parallel deletes | Conditional delete + authz; second → 404 |
| Double-submit POST | May create two comments in v1 — document; add idempotency only if product requires exactly-once |
| Errors | `AppError` → errorHandler; no stack in body |

### Q7. Proof tests first?

Files: `comments.idor.test.ts`, `comments.api.test.ts`, `comments.authz.test.ts`.  
Cases: Alice→Bob 403; wrong taskId 404; member 201/200; non-author delete 403 / owner 200; anonymous 401.  
Harness: `beforeEach(resetDb)`; extend TRUNCATE with `comments`; `seedAliceBobProjects`.

---

## 5. Worked example A — this project (pattern sources)

You are not inventing isolation — you are **copying** what tasks already do:

| Concern | Existing pattern |
|---------|------------------|
| Nested tenancy | `/projects/:id/tasks/...` |
| Alice/Bob IDOR | `tasks.idor.test.ts` + `seedAliceBobProjects` |
| Field/role authz | `tasks.authz.test.ts` (assignee vs owner) |
| Soft membership rules | `members.removal.test.ts` (open-task conflicts) |
| Safe errors | `failures.test.ts` |
| Bearer auth | `auth.api.test.ts` + `authHeader` |

**Teach yourself aloud:** “Comments are tasks’ younger sibling — same project fence, new table, tighter delete rule (author or owner).”

---

## 6. Worked example B — mini greenfield twist: “pinned comment”

Suppose v1 also needs “owner pins one comment per task.”

**Clarify:** only OWNER pins; one pin per task.  
**Invariant:** at most one `pinned = true` per `task_id` → `UNIQUE` partial index or “unpin others in same tx.”  
**API:** `POST .../comments/:commentId/pin` (or PATCH).  
**Concurrency:** two owners pin different comments → one tx with `FOR UPDATE` on task row, clear pins, set one — or UNIQUE + 409.  
**Test:** `parallel pin two comments -> exactly one pinned`.

This shows how the same 01→07 loop absorbs a small product twist without restarting from UI.

---

## 7. Decision template

### Blank (walkthrough one-pager)

```text
Feature:
1 Clarify: actors / job / non-goals / success / reuse
2 Threats + invariants:
3 Routes + statuses + DTO:
4 Tables + FKs + migration name:
5 Module files + service steps:
6 Races / tx / fail policy:
7 Test files + cases (red first):
Deferred:
```

### Filled (comments v1)

```text
Feature: task comments v1
1 MEMBER create/list; AUTHOR|OWNER delete; no edits/threads/notify
2 IDOR 403/404; author_member_id; CASCADE on task delete
3 POST/GET/DELETE under /projects/:id/tasks/:taskId/comments
4 comments(task_id, author_member_id, body, timestamps); idx(task_id, created_at)
5 comment.* module; service binds membership+task; repo map()+tx
6 re-check membership; no OCC on create; double POST may dup; AppErrors
7 comments.idor/api/authz tests; resetDb+=comments
Deferred: edits+OCC, idempotency keys, pins, rate limit
```

---

## 8. Wrong world / anti-patterns

| Anti-pattern | What breaks |
|--------------|-------------|
| Global `/comments` by task UUID only | Cross-project enumeration / weaker mental model |
| `author_user_id` only | Harder “was member at write time?” and project-scoped authz |
| Implement folders before IDOR test names | Security becomes optional homework |
| Edits slip in without OCC | Silent overwrites |
| Skip `mergeParams` | `projectId`/`taskId` undefined → confused 500s |
| CASCADE vs RESTRICT undecided | Surprise delete failures or orphan rows |

---

## 9. Exit criteria

You may treat the walkthrough as done (and move to implementation / step 09) when:

- [ ] Brief + non-goals written  
- [ ] Threat table + ≥3 invariants  
- [ ] Three routes + status map  
- [ ] Table + FK + index + migration name  
- [ ] Layer file list + create/delete service steps  
- [ ] Concurrency/failure paragraph  
- [ ] Test file/case list with IDOR first  
- [ ] Deferred list explicit  

---

## 10. Interview Q&A

**Q: Walk me through designing comments for this codebase.**  
**A:** Clarify actors (member create/list; author/owner delete) and non-goals (no edits/threads). Threat-model Alice on Bob’s URLs (403) and Bob’s taskId under Alice’s project (404). Nest routes under `/projects/:id/tasks/:taskId/comments` with `authenticate`. Table `comments` FK to `tasks` CASCADE and `author_member_id` → `members`. Service re-checks active membership and task.project bind; delete authz in service. No OCC on create; document duplicate POST. Tests: `comments.idor` first (Alice/Bob), then authz delete, then happy path — same harness as `tasks.idor.test.ts`.

**Q: Why `author_member_id` not `user_id`?**  
**A:** Authorization is project-membership-scoped. Storing the membership row ties the comment to “who they were in this project,” matches how removals/roles work, and keeps joins aligned with `requireActiveMember` thinking. You can still expose public user fields via join in the DTO.

**Q: What test do you write first and why?**  
**A:** Alice cannot POST on Bob’s project task → 403 (and wrong taskId → 404). Those fail closed on missing gates; happy 201 can pass with a dangerously open query.

**Q: What did you explicitly defer?**  
**A:** Edits (would need OCC), reactions, notifications, threads, markdown sanitization deep-dive, idempotency keys for exactly-once create, pin feature. Written so reviewers don’t expect them.

**Q: CASCADE or RESTRICT when a task is deleted?**  
**A:** CASCADE for v1 — comments are meaningless without the task; matches nested resource lifetime. RESTRICT would force an explicit delete-comments step; only choose it if you need archival independent of tasks.

---

## 11. Glossary

| Term | Meaning |
|------|---------|
| **Walkthrough** | Full 01→07 narration on one feature |
| **Nested resource** | URL scoped under project (and task) |
| **Member identity** | `author_member_id` — project-scoped actor |
| **Bind** | Ensure path ids refer to the same tenant row |
| **Deferred** | Explicit non-goal carried into the PR |
| **Teaching design** | Spec not yet in `src/` |

---

## 12. Optional further reading

- Process steps (optional depth): [01](./01-clarify-the-problem.md) … [07](./07-prove-it-with-tests.md) · Next: [09-checklist.md](./09-checklist.md)  
- Pattern sources (optional): [../tasks.md](../tasks.md), [../projects.md](../projects.md), [../testing.md](../testing.md)  
- Lessons (optional): [idor](../lessons/security/idor.md), [rest-resource-design](../lessons/api/rest-resource-design.md), [optimistic-concurrency](../lessons/database/optimistic-concurrency.md), [testing-as-proof](../lessons/testing/testing-as-proof.md)

---

## Teach pointer

> “Narrate this walkthrough in an interview and you sound like you ship production — even before typing SQL.”
