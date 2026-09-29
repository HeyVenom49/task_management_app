# Step 1 — Clarify the problem

**Standalone ✓** — You do not need other how-to-think steps or lessons to *write a feature brief* that two engineers would implement the same way.

**After this file you can:** name actors in this product’s language, write one job sentence, list non-goals and observable success criteria, identify what to reuse (`authenticate`, `requireActiveMember`, `AppError`, `PublicUser`), sketch a safe public response, and defend the brief in an interview.

---

## 1. Why this step exists

Code is cheap to type and expensive to undo. If you skip the brief you ship:

- endpoints shaped like a UI mock (“comment panel API”) instead of a resource
- authz invented mid-PR (“oops, assignees can delete”)
- scope creep (mentions, threads, edit history) that bloated v1
- two PRs that solve different products under the same ticket title

**Artifact you leave with:** a short written brief (template at the end) that answers who, what job, what’s out, what “done” looks like, and what already exists to reuse.

---

## 2. Mental model

### Analogy

A brief is the **order ticket at a kitchen**: dish name, allergens (non-goals), how you know it’s plated (success). Without it, two cooks invent two meals.

### Where this sits

```text
01 clarify the problem  ← you are here
        │
        ▼
02 threats & invariants → 03 API → 04 schema → 05 layers
        → 06 concurrency → 07 tests → 08/09 ship
```

### Inputs → outputs

| In | Out |
|----|-----|
| Ticket / interview prompt / product ask | Actors + roles in *this* app |
| Vague feature name (“comments”) | One job sentence in user language |
| Pressure to “just start coding” | Explicit non-goals + deferred questions |
| Existing modules (auth/projects/tasks) | Reuse list (`authenticate`, membership, DTO style) |

---

## 3. Core rules (must / must-not)

1. **MUST** name every actor who might touch the feature using product roles (Anonymous, JWT user, active MEMBER, OWNER, platform ADMIN, system/cron).  
2. **MUST** write one job sentence: “As a …, I can … so that ….”  
3. **MUST** write non-goals or they will sneak into the PR.  
4. **MUST** define success as *observable* outcomes (status codes, who can/cannot, what the client sees).  
5. **MUST** list reuse candidates before inventing parallel authz or error types.  
6. **MUST NOT** equate “logged in” (`authenticate`) with “allowed on this project” (`requireActiveMember`).  
7. **MUST NOT** start with Zod schemas or table columns before actors and the job are clear.  
8. **MUST NOT** leave open questions silent — answer them or mark deferred with an owner.

---

## 4. Decision questions — with how to answer

### Q1. Who is the actor?

**Why:** Authn and authz matrices (step 03) are impossible without a role list.

**How:** Use this product’s vocabulary:

| Actor | What it means here |
|-------|--------------------|
| Anonymous | No Bearer token |
| Authenticated user | Passed `authenticate`; JWT has `sub` / email — **not** yet a project member |
| Active MEMBER | Row in `members` with `status = ACTIVE`, `role = MEMBER` |
| Active OWNER | Same, `role = OWNER` |
| Platform ADMIN | `users.role = ADMIN` (e.g. reactivate member) |
| System / cron | No browser; rare in this app today |

**Bad:** “Users.”  
**Good:** “Active project MEMBER creates; OWNER or creator deletes; platform ADMIN only for reactivate-style ops if any.”

### Q2. What job are they hiring the feature to do?

**Why:** Separates product intent from HTTP shapes.

**How:** One sentence, user language — not route names.

**Bad:** “POST /api/v1/projects/:id/tasks/:taskId/comments with Zod.”  
**Good:** “As an active project member, I can leave a comment on a task so the team can discuss work in context.”

### Q3. What is explicitly out of scope?

**Why:** Unwritten non-goals become accidental scope in review.

**How:** List 3+ things you will *refuse* in v1 (notifications, threads, history, search, …).

**Bad:** “We’ll see.”  
**Good:** “No @mentions, no nested threads, no edit history in v1.”

### Q4. What does “done” look like?

**Why:** Success criteria become tests in step 07 and acceptance in PR.

**How:** Observable bullets — who gets 201/403/404; soft rules (e.g. comments remain after author leaves).

**Bad:** “Comments work.”  
**Good:** “Active member can create/list; non-member gets 403 on that project; task id from project B under project A URL → 404 (`NotFoundError`); deleted member’s old comments stay readable.”

### Q5. What already exists that we must reuse?

**Why:** Parallel authz helpers and error types fragment the codebase.

**How:** Scan before designing:

- Router authn → `authenticate` (`shared/middleware/authenticate.ts`)  
- Project access → `requireActiveMember` / `requireOwner` (services)  
- Errors → `AppError` subclasses (`ForbiddenError`, `NotFoundError`, `ConflictError`, …)  
- Nested resources → same IDOR bind as tasks (`task.projectId === projectId` or 404)  
- Public shapes → `PublicUser`-style DTOs (no hashes)

**Bad:** “We’ll throw raw Error and let Express 500.”  
**Good:** “Mount `authenticate`; service calls `requireActiveMember`; miss under wrong parent → `NotFoundError`; response `{ comment }` with no secrets.”

### Q6. What will the client need back?

**Why:** Over-returning rows leaks secrets; under-returning forces extra round trips later.

**How:** Sketch public fields only. Mirror `PublicUser`: `id`, `name`, `email`, `role`, `status`, `createdAt` — never `hashPassword` or token hashes.

**Bad:** “Return the whole joined row.”  
**Good:** “`{ comment: { id, taskId, authorMemberId, body, createdAt, updatedAt } }`.”

---

## 5. Worked example A — this project

### Feature: create a task under a project

**Actors:**

- Anonymous → 401 (no Bearer)  
- Authenticated but not a member → 403 via `requireActiveMember`  
- Active MEMBER or OWNER → may create  
- Platform ADMIN with no membership → still 403 (admin ≠ project member unless also a member)

**Job statement:**

> As an active project member, I can create a task in my project so the team can track work items.

**Non-goals (as built):**

- No attachments / comments / labels on the task create payload  
- No cross-project task move in v1  
- No bulk create  

**Success criteria (observable):**

- `POST /api/v1/projects/:id/tasks` with valid body → 201 `{ task }`  
- Missing/invalid JWT → 401  
- Non-member → 403 `"You do not have access to this project"`  
- Invalid assignee (wrong project / inactive) → 400  
- Response uses camelCase DTO; no internal SQL column dump  

**Reuse:** `authenticate` on `taskRouter`; `TaskService.requireActiveMember`; `createTaskSchema` in controller; `AppError` subclasses; `creator_member_id` from membership (not raw `users.id`); mount via `v1Router` + `mergeParams: true`.

**Public response sketch:** `{ task: { id, projectId, creatorMemberId, assigneeMemberId, title, description, priority, status, createdAt, updatedAt } }`.

**Open questions (resolved here):** assignee optional; default status `NOT_STARTED`; priority required on create.

---

## 6. Worked example B — mini greenfield: task comments

**Feature:** task comments (not in repo yet — design-only for this step).

**Actors:** Anonymous; JWT user; active MEMBER; OWNER; (no ADMIN-only path in v1).

**Job statement:**

> As an active project member, I can leave a comment on a task so the team can discuss work in context.

**Non-goals:**

- No @mentions / email notifications  
- No nested threads / replies  
- No edit history / soft-delete of comments in v1 (hard delete by author or owner only — decide in step 02)  
- No Markdown sanitization epic beyond length limits  

**Success criteria:**

- Member can create and list comments on tasks in projects they belong to  
- Non-member → 403 on that project’s comment routes  
- Comment for task in project B requested under project A’s URL → 404  
- Author (or OWNER) can delete; other members cannot  
- List returns newest-first public DTOs only  

**Reuse:**

- `authenticate` on nested router  
- `requireActiveMember` on every write/read  
- Parent bind: load task by `taskId` + assert `task.projectId === projectId` else `NotFoundError` (same as `TaskService.getById`)  
- `AppError` subclasses; Zod at controller  
- Response envelope `{ comment }` / `{ comments }` like `{ task }` / `{ tasks }`  

**Public response sketch:**

```text
{ comment: { id, taskId, authorMemberId, body, createdAt, updatedAt } }
```

**Open questions (defer with owner):** pagination vs full list for v1; whether soft-deleted members’ comments remain visible (recommend: yes, retain `authorMemberId`).

---

## 7. Decision template

### Blank

```text
Feature:
Actors:
Job statement:
Non-goals:
Success criteria:
Reuse from codebase:
Public response shape (sketch):
Open questions:
```

### Filled (create task — excerpt)

```text
Feature: create task under project
Actors: active MEMBER/OWNER create; anonymous 401; non-member 403
Job statement: As an active project member, I can create a task so the team can track work
Non-goals: no attachments, no bulk create, no cross-project move
Success criteria: 201 { task }; 401/403 as above; invalid assignee 400; DTO camelCase only
Reuse: authenticate, requireActiveMember, createTaskSchema, AppError family, mergeParams task router
Public response shape: { task: { id, projectId, creatorMemberId, ... } }
Open questions: none for v1 create
```

---

## 8. Wrong world / anti-patterns

| Anti-pattern | What breaks |
|--------------|-------------|
| Ticket is only a UI screenshot | Backend invents resources that fight the UI next sprint |
| “Logged in can do it” | IDOR / cross-project writes |
| No non-goals | Mentions and threads appear in the same PR |
| Success = “looks good in Postman once” | No denial cases; tests only happy path |
| Invent new error strings/types per module | Clients and monitors can’t rely on shape |
| Return `UserAuthRow` / hashes | Credential leak |
| Different briefs from two engineers | Two incompatible implementations |

---

## 9. Exit criteria

You may go to step 02 when:

- [ ] Actors listed in product roles (not “users”)  
- [ ] One job sentence written  
- [ ] ≥3 non-goals written  
- [ ] Success criteria are observable (who/status/DTO)  
- [ ] Reuse list names real helpers (`authenticate`, membership, `AppError`, DTO style)  
- [ ] Public response sketched without secrets  
- [ ] Open questions answered or deferred with owner  

---

## 10. Interview Q&A

**Q: How do you start a feature design?**  
**A:** Write a brief before code: actors in product roles, one job sentence, non-goals, observable success criteria, and what to reuse from the codebase. Only then move to threats, API, and schema. Jumping to Zod or tables produces the wrong product under the right ticket title.

**Q: What’s the difference between a user story and an endpoint list?**  
**A:** A user story names who and why (“as an active member, I can comment so we discuss in context”). An endpoint list is the HTTP contract that implements that story later. Designing routes first often encodes UI layout instead of resources and skips who is denied.

**Q: Give non-goals for “add file attachments to tasks.”**  
**A:** Example v1 non-goals: no virus scanning beyond content-type allow-list deferred; no image resizing CDN; no attaching to comments; no multi-GB uploads; no public unauthenticated download links. Write them so reviewers can reject scope creep.

**Q: Who can delete a project in this app, and how did you know?**  
**A:** An active OWNER of that project — `ProjectServices.remove` calls `requireOwnerLocked` inside a transaction, then deletes. Non-owners and non-members get the same access-denied style `ForbiddenError`. I know from the service policy, not from guessing REST verbs.

**Q: Why list actors before tables?**  
**A:** Tables don’t tell you who may write. Actor lists drive authn (`authenticate`) vs authz (`requireActiveMember` / owner checks) and which invariants matter. Schema without actors invites “any authenticated user can UPDATE by UUID.”

**Q: Why isn’t a valid JWT enough to create a task?**  
**A:** JWT proves identity (`authenticate` sets `req.user`). Creating a task requires active membership in that project. `TaskService.requireActiveMember` enforces that; without it you’d have IDOR by guessing project UUIDs.

---

## 11. Glossary

| Term | Meaning |
|------|---------|
| **Actor** | Role that might call the feature (Anonymous, MEMBER, OWNER, ADMIN, …) |
| **Job statement** | One-sentence “As a … I can … so that …” |
| **Non-goal** | Explicitly out of scope for this version |
| **Success criteria** | Observable outcomes that prove the feature is done |
| **Brief** | Written answers to this step’s template |
| **Public DTO** | Response shape safe for clients (e.g. `PublicUser`) |
| **Authn** | Proving who you are (`authenticate`) |
| **Authz** | Proving you’re allowed (`requireActiveMember`, field allow-lists) |

---

## 12. Optional further reading

- Next: [02-threats-and-invariants.md](./02-threats-and-invariants.md)  
- Function guides (optional): [../auth.md](../auth.md), [../projects.md](../projects.md), [../tasks.md](../tasks.md)  
- Lessons (optional): [authn-vs-authz](../lessons/security/authn-vs-authz.md), [rest-resource-design](../lessons/api/rest-resource-design.md)  
- Code citations: `authenticate.ts`, `task.routes.ts`, `task.service.ts` `requireActiveMember`, `auth.types.ts` `PublicUser`, `project.service.ts` `remove` / `requireOwnerLocked`

---

## Teach pointer

> “If two engineers write different briefs, they will build different products. Align the brief first.”
