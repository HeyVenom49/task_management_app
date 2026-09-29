# Step 2 — Threats and invariants

**Standalone ✓** — You do not need other how-to-think steps or lessons to *list abuse cases and always-true laws* for a feature and choose how they are enforced.

**After this file you can:** fill a threat table, write 2–5 plain-language invariants, split soft (app) vs hard (DB) enforcement, pick a 403 vs 404 denial strategy, and defend those choices in an interview.

---

## 1. Why this step exists

Step 01 named *who* and *done*. None of that survives contact with a curious client, a stolen refresh cookie, or two tabs.

If you skip this step you ship:

- IDOR: Alice uses Bob’s task UUID and reads or mutates it  
- privilege escalation: assignee PATCHes title because the body allow-list was forgotten  
- TOCTOU: “safe to remove member” then an open task appears before deactivate  
- email enumeration and timing oracles on auth  
- invariants that only live in a code comment and fail under race  

**Artifact you leave with:** threat rows that apply + invariants with app and/or DB enforcement notes + a status strategy for denials.

---

## 2. Mental model

### Analogy

Invariants are **laws of physics** for your product (“you cannot remove the last owner”).  
Threats are **how someone tries to break physics** (guess UUIDs, replay tokens, race two requests).  
Defense in depth is **guards at the door and locks on the vault** — app checks *and* DB constraints.

### Where this sits

```text
01 brief
   │
   ▼
02 threats & invariants  ← you are here
   │
   ▼
03 API shape → 04 schema → 05 layers → 06 concurrency → 07 tests
```

### Inputs → outputs

| In | Out |
|----|-----|
| Actors + success criteria (01) | Abuse cases per actor / outsider |
| Product promises (“members only”) | Invariants in plain language |
| Sensitivity of resources | 403 vs 404 / generic-message policy |
| Known shared state | Which laws need locks/OCC later (06) |

---

## 3. Core rules (must / must-not)

1. **MUST** consider IDOR on every new id-bearing route (resource UUID is not a capability).  
2. **MUST** write ≥2 invariants in plain language before routes or tables.  
3. **MUST** mark each invariant: app enforcement, DB enforcement, or both.  
4. **MUST** decide denial shape: **403** (authenticated but not allowed) vs **404** (don’t confirm existence under wrong parent) vs generic auth messages.  
5. **MUST** name at least one concurrency-sensitive invariant if two requests can touch the same row (detail in step 06).  
6. **MUST NOT** treat “UUID looks random” as authorization.  
7. **MUST NOT** rely only on soft app checks for uniqueness or one-time redeem.  
8. **MUST NOT** return different messages that let attackers enumerate emails or private resources when the product policy is “hide existence.”

---

## 4. Decision questions — with how to answer

### Q1. What are the abuse cases?

**Why:** Happy-path-only design is how IDOR and stuffing land in prod.

**How:** Fill only rows that apply — but force IDOR + authz every time:

| # | Attacker / mistake | What they try | Harm | Defense idea |
|---|--------------------|---------------|------|--------------|
| 1 | Alice (member of A) | Use task id from project B | Read/mutate foreign task | Membership + `task.projectId === projectId` else `NotFoundError` |
| 2 | Assignee | PATCH privileged fields | Privilege escalation | Field allow-list (`assertCanUpdateTask`) |
| 3 | Script | Stuff passwords / spam writes | Takeover / cost | Rate limit **fail-closed** |
| 4 | Thief | Steal / replay refresh | Session hijack | Rotation + reuse → revoke all |
| 5 | Prober | Enumerate emails | Phishing list | Generic messages + timing care |
| 6 | XSS | Read tokens from JS | Long session steal | httpOnly refresh; short JWT |

**Bad:** “We’ll authenticate everyone.”  
**Good:** “Cross-project task id → 404; assignee may only send `status`; login limiter fail-closed on Redis down.”

### Q2. What must always stay true?

**Why:** Invariants are the product promises concurrency and tests must protect.

**How:** Write laws a PM would understand. Examples already in this app:

1. Active project access requires active membership.  
2. You cannot remove the last active owner.  
3. Inactive member must not hold open task assignments.  
4. A refresh token redeems at most once; reuse of a revoked refresh kills the session family.  
5. Task updates apply only if `expectedUpdatedAt` matches.  
6. Passwords and opaque tokens are never stored raw (hashes only).

**Bad:** “Be careful with members.”  
**Good:** “Deactivating a member MUST fail if they still have open assigned tasks — app check + DB trigger (`23514`).”

### Q3. Soft check vs hard law?

**Why:** App checks give friendly errors; DB laws survive races and bugs.

| Soft (app) | Hard (DB / atomic SQL) |
|------------|-------------------------|
| Zod lengths, field allow-lists | `UNIQUE`, `FK`, `CHECK`, triggers |
| `requireActiveMember` | Partial unique / owner constraints |
| Friendly `ConflictError` messages | Conditional `UPDATE … WHERE used_at IS NULL` |

**Bad:** “App checks if email exists; no UNIQUE.”  
**Good:** “App maps `23505` → conflict; `UNIQUE (email)` is the final referee under double register.”

### Q4. 403 vs 404 (and generic deny)?

**Why:** Status codes leak existence if chosen carelessly.

**How (this app’s personality):**

| Situation | Typical choice | Example |
|-----------|----------------|---------|
| Authenticated, not a member of project | **403** same message | `"You do not have access to this project"` (even if project missing in some paths) |
| Member of project A, task id belongs to B / missing | **404** | `NotFoundError("Task not found")` after membership OK |
| Wrong member id under project | **404** | `NotFoundError("Member not found")` |
| Login / verify failures | Generic | Don’t say “email not registered” |

**Bad:** “403 Task exists but not yours” vs “404” for missing — oracle.  
**Good:** “After membership, wrong-parent task always 404; non-member never learns whether the project id is real beyond the generic 403 used on project access.”

### Q5. Which threats need rate limits or token hygiene?

**Why:** Auth endpoints are abuse magnets; session theft is a threat even if CRUD authz is perfect.

**How:** Login / register / refresh → limiter + hashed tokens + httpOnly refresh cookie patterns already in auth. New write-heavy public endpoints inherit the same question.

---

## 5. Worked example A — this project

### Feature: remove project member

**Threats:**

| # | Who | Try | Harm | Defense |
|---|-----|-----|------|---------|
| 1 | Non-owner | DELETE member | Sabotage roster | `requireOwner` / locked owner path |
| 2 | Owner | Remove last owner | Orphan project | Count owners; reject |
| 3 | Owner | Remove member with open tasks | Broken assignments | Count open tasks + trigger |
| 4 | Alice | Remove member id from other project | Cross-tenant mutate | `member.projectId` bind → 404 |
| 5 | Race | Assign open task between check and deactivate | TOCTOU | `FOR UPDATE` + re-check in `sql.begin` |

**Invariants:**

1. Only an active OWNER of *this* project may soft-remove members (except self-rules as coded).  
2. At least one active OWNER remains.  
3. Soft-removed member has `status = INACTIVE` (not hard delete of history).  
4. Member with open assigned tasks cannot be deactivated.  
5. Target membership row’s `project_id` must match URL project.

**App enforcement:** `ProjectServices.removeMember` — transaction, `FOR UPDATE` on member, re-validate, owner/open-task checks, then deactivate; map failures to `NotFoundError` / `BadRequestError` / `ConflictError`.

**DB enforcement:** trigger `trg_members_no_open_tasks_on_deactivate` raises `23514`; owner uniqueness migrations (`009_…`); `UNIQUE (user_id, project_id)` on members.

**Status strategy:** wrong/missing member under project → 404; last owner → 400; open tasks → 409; non-owner caller → 403 generic access message.

---

## 6. Worked example B — mini greenfield: task comments

**Threats (v1):**

| # | Who | Try | Harm | Defense |
|---|-----|-----|------|---------|
| 1 | Non-member | POST comment on project | Spam / leak surface | `requireActiveMember` → 403 |
| 2 | Member of A | Use taskId from B under A’s URL | Cross-project write | Task load + `projectId` match → 404 |
| 3 | Other member | DELETE someone else’s comment | Harassment | Author or OWNER only |
| 4 | Assignee-only thinker | Assume task assignee rights imply comment admin | Confused deputy | Separate comment authz from task field allow-list |
| 5 | Soft-removed member | Stale JWT still posting | Writes after removal | Re-check **active** membership on every write (not cached middleware state) |
| 6 | Script | Flood comments | Cost / noise | Optional authenticated write limiter; length caps in Zod |

**Invariants:**

1. `comment.task_id` belongs to the project in the URL (via task row).  
2. Only **active** members of that project can create/list.  
3. Delete only by author member **or** project OWNER.  
4. Body length bounded (DoS + UX).  
5. No raw user password/token fields ever appear on comment DTOs.

**App vs DB:**

| Law | App | DB |
|-----|-----|-----|
| Parent bind | Service checks task.projectId | `FK comment.task_id → tasks` |
| Author is member | Set `author_member_id` from membership.id | `FK` to `members(id)`; optional `UNIQUE (id, project_id)` style bind if denormalized `project_id` |
| Active member write | `requireActiveMember` | Cannot fully express “was active at write time” after the fact — app + re-check |
| Body max length | Zod `.max(…)` | Optional `CHECK (char_length(body) <= N)` |

**Status strategy:** non-member 403; wrong task parent 404; not author/owner on delete 403; validation 400.

---

## 7. Decision template

### Blank

```text
Threats:
1. …
Invariants:
1. …
App enforcement:
DB enforcement:
Status code strategy (403 vs 404):
Concurrency-sensitive laws (for step 06):
```

### Filled (remove member — excerpt)

```text
Threats:
1. Non-owner removes member
2. Last owner removed
3. Open-task assignee deactivated
4. Cross-project member id
5. TOCTOU assign-then-remove
Invariants:
1. Owner-only remove
2. ≥1 active owner
3. Soft delete via INACTIVE
4. No open tasks on deactivate
5. member.project_id matches URL
App: FOR UPDATE tx + counts + AppError mapping
DB: open-task trigger 23514; owner constraints; UNIQUE user/project
Status: 403 caller; 404 wrong member; 400 last owner; 409 open tasks
Concurrency: lock member row; re-count open tasks inside tx
```

---

## 8. Wrong world / anti-patterns

| Anti-pattern | What breaks |
|--------------|-------------|
| Happy-path only | IDOR and stuffing are “prod bugs” |
| UUID as capability | Anyone with a log line owns the resource |
| Invariants only in Slack | Race and regression wipe them |
| App check without UNIQUE/trigger | Double create / illegal deactivate under load |
| Detailed 403 “task exists” | Existence oracle |
| Authn without authz | Logged-in stranger mutates projects |
| Ignoring refresh theft | XSS/session issues bypass CRUD carefulness |

---

## 9. Exit criteria

You may go to step 03 when:

- [ ] Threat table has IDOR + authz rows (and auth abuse if touching auth)  
- [ ] ≥2 invariants in plain language  
- [ ] Each invariant has app and/or DB enforcement note  
- [ ] 403 vs 404 (or generic) strategy written  
- [ ] Concurrency-sensitive laws flagged for step 06  
- [ ] No reliance on “UUID secrecy” as a control  

---

## 10. Interview Q&A

**Q: What’s an invariant in this membership system?**  
**A:** An always-true product law — e.g. you cannot deactivate a member who still has open assigned tasks, and a project must keep at least one active owner. The app enforces these in `removeMember` inside a transaction; the DB adds a trigger that raises `23514` if status flips to `INACTIVE` while open tasks remain.

**Q: How does TOCTOU show up when removing a member?**  
**A:** Time-of-check/time-of-use: request A reads “zero open tasks,” request B assigns an open task, then A deactivates. Fix: one transaction, `FOR UPDATE` the member row, re-count open tasks and owners, then deactivate. The DB trigger is defense in depth if app logic regresses.

**Q: Why both an app check and UNIQUE on email?**  
**A:** The app can return a clean conflict before insert, but under concurrent registers both requests may pass “email free.” Only `UNIQUE (email)` serializes truth; mapping Postgres `23505` to a conflict status keeps it an expected client outcome, not a 500.

**Q: Design threats for “share project via link.”**  
**A:** Link guessing/bruteforce; leaked link forwarding; privilege of link (join as MEMBER vs OWNER); revoked link reuse; enumeration of project ids via error texts; rate limit join attempts; bind token to hash at rest; expire and rotate links; never put long-lived capability in a JWT query string logged by proxies.

**Q: When do you choose 403 vs 404 for denial?**  
**A:** If the caller should not learn whether the resource exists in a context they don’t belong to, prefer 404 after you’ve established the ambiguous case (e.g. task id not in this project). If they are authenticated but lack membership for the project collection action, this app often uses a uniform 403 access message. Never return “exists but forbidden” vs “missing” with different bodies if that creates an oracle.

**Q: Why re-check active membership on every write instead of trusting middleware once?**  
**A:** Membership can change (soft-remove) while a JWT is still valid. Middleware `authenticate` only proves identity. Services call `requireActiveMember` so a just-deactivated member cannot keep POSTing comments or tasks until the access token expires.

---

## 11. Glossary

| Term | Meaning |
|------|---------|
| **Threat** | Abuse or mistake case that breaks a promise |
| **Invariant** | Law that must remain true after every successful operation |
| **IDOR** | Insecure direct object reference — authz missing on an id |
| **TOCTOU** | Gap between check and use under concurrency |
| **Defense in depth** | App policy + DB constraints/triggers together |
| **Fail-closed** | Safety dependency down → deny (e.g. login rate limit) |
| **Existence oracle** | Error differences that reveal whether a resource/email exists |
| **Soft delete** | Mark `INACTIVE` / tombstone instead of physical delete |

---

## 12. Optional further reading

- Previous: [01-clarify-the-problem.md](./01-clarify-the-problem.md) · Next: [03-shape-the-api.md](./03-shape-the-api.md)  
- Lessons (optional): [idor](../lessons/security/idor.md), [authn-vs-authz](../lessons/security/authn-vs-authz.md), [defense-in-depth](../lessons/security/defense-in-depth.md), [email-enumeration-and-timing](../lessons/security/email-enumeration-and-timing.md), [toctou](../lessons/database/toctou.md), [cookies-xss-csrf](../lessons/security/cookies-xss-csrf.md)  
- Code citations: `project.service.ts` `removeMember` / `requireActiveMember`, `task.service.ts` `assertCanUpdateTask` / getById 404 bind, `010_member_assignee_invariants.sql`, auth rate-limit fail-closed

---

## Teach pointer

> “Invariants are product promises. Threats are how promises get broken. Design both before code.”
