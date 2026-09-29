# 07 — Authz, IDOR, and unexpected 403/404

**Standalone ✓** — You do not need idor.md, authn-vs-authz.md, or other how-to-debug guides to hunt membership / role / cross-project “not found” failures in this backend.

**After this file you can:** tell 403 from 404 on purpose, open the right service helper first, reproduce IDOR with Alice/Bob fixtures, avoid JWT rabbit holes, and explain the fix in interview language.

---

## 1. Why this habit exists

Auth bugs (guide 06) ask “who are you?” Authz/IDOR bugs ask “are you allowed to touch *this* row?” Juniors re-decode the JWT. Seniors check **membership row + parent binding** (`task.projectId === :projectId`).

Wrong first open: `authenticate.ts` when the Bearer already worked. Right first open: `TaskService.requireActiveMember` / `getById` projectId check / `ProjectServices.requireOwner`.

---

## 2. Mental model

### Analogy

Authn is the **building lobby**. Authz is **floor keys + room numbers**. IDOR is showing up with a valid lobby badge and asking for someone else’s room by guessing the number — the API must not confirm the room exists if you’re on the wrong floor.

```text
Bearer OK (authenticate)
  → requireActiveMember(user, projectId)     → 403 if no ACTIVE membership
  → requireOwner / assertCanUpdateTask       → 403 if role/field not allowed
  → task.projectId === URL projectId         → 404 if cross-project id
  → member row project_id + ACTIVE           → 404 if wrong project / inactive
```

### Neighborhood → house → room

| Signal neighborhood | House (file) | Room (function) |
|---------------------|--------------|-----------------|
| “You do not have access to this project” | `project.service.ts` / `task.service.ts` | `requireActiveMember` / `requireOwner` |
| “Task not found” on a known UUID | `task.service.ts` | `getById` / `update` / `remove` projectId bind |
| “You cannot update…” / field mix | `task.service.ts` | `assertCanUpdateTask` |
| Member remove 404 / 409 | `project.service.ts` | `removeMember` |
| Reactivate 403 | `project.service.ts` | `reactivateMember` (platform ADMIN) |
| Transfer 403 after success | `project.service.ts` | `transferOwnership` + `FOR UPDATE` |

---

## 3. Core rules (must / must-not)

1. **MUST** record: actor user id, URL `:projectId`, resource id (task/member), status, `message`, whether `/me` works with same Bearer.  
2. **MUST** treat **401** as identity (stop — go to auth) and **403/404** as authorization / existence shaping once `/me` is 200.  
3. **MUST** ask: is there an ACTIVE `members` row for `(userId, projectId)`? What `role`?  
4. **MUST** for tasks: compare `tasks.project_id` to URL project id — mismatch → **404**, not 403.  
5. **MUST NOT** “fix” IDOR by returning 200 with empty data when the client used the wrong project id.  
6. **MUST NOT** start in JWT middleware when status is 403 with an access-message about the *project*.  
7. **MUST NOT** weaken `tasks.idor.test.ts` / `tasks.authz.test.ts` expectations to green the suite.

---

## 4. Signal taxonomy (this app)

### Membership denied (403)

```json
{ "message": "You do not have access to this project", "requestId": "…" }
```

From `ProjectServices.requireActiveMember` / `requireOwner`, and `TaskService.requireActiveMember` — missing membership, `INACTIVE`, or non-OWNER when owner required. Same message deliberately for “not a member” and “not owner” on many project ops (avoid role enumeration).

### Task / member hide (404)

```json
{ "message": "Task not found", "requestId": "…" }
```

```json
{ "message": "Member not found", "requestId": "…" }
```

Task exists in DB but `task.projectId !== projectId` → still **404**. Member locked row wrong `project_id` or not `ACTIVE` → **404**.

### Field-level authz (403)

```json
{ "message": "You cannot update this task", "requestId": "…" }
```

```json
{ "message": "You cannot update one or more of these fields", "requestId": "…" }
```

Assignee-only may send `status` (+ `expectedUpdatedAt`). Mixed PATCH (e.g. `status` + `priority`) rejects the **whole** request.

### Removal conflict (409)

```json
{ "message": "Cannot remove a member who is assigned to open tasks", "requestId": "…" }
```

From `removeMember` after `countOpenAssignedTo` (or CHECK → mapped Conflict).

---

## 5. Symptom → first open

| Symptom | First open | Why | If wrong, next |
|---------|------------|-----|----------------|
| Any project route 403, `/me` OK | `ProjectServices.requireActiveMember` | Membership gate | `requireOwner`; member `status` |
| Task list/get 403 | `TaskService.requireActiveMember` | Same gate, task module | Member row SQL |
| Task get/patch 404, UUID “real” | `getById` / `update` projectId check | Cross-project hide | Wrong `:projectId` in client URL |
| Assignee changes title → 403 | `assertCanUpdateTask` | Field allow-list | Confirm role/creator/assignee |
| Mixed status+priority PATCH 403 | same | Rejects entire body | Split requests |
| Add member “not verified” / fail | `addMember` | Target user must be usable | `authRepo` user status |
| Remove member 409 | `removeMember` + `countOpenAssignedTo` | Open assignments | Complete/reassign tasks |
| Remove member 404 | locked member `project_id` / status | Wrong id or already inactive | List members first |
| Transfer 403 after already transferred | `transferOwnership` re-check OWNER | Actor no longer owner | Concurrent transfer test |
| Reactivate 403 | `reactivateMember` | Needs `users.role === ADMIN` | Not project OWNER |

---

## 6. Reproduce recipes

### Alice cannot read Bob’s project (403)

Use `seedAliceBobProjects` from `src/test/helper/seed.ts`:

1. Alice owns project A; Bob owns project B.  
2. Alice `GET /api/v1/projects/{B}/tasks` with Alice Bearer → **403**.  
3. Same for Bob on A.

### Cross-project task id (404)

1. Create task T under project A.  
2. Alice (member of A) calls `GET .../projects/{B}/tasks/{T}` (or Bob’s project id) → **404** `Task not found`.  
3. Confirm row still exists under A in DB.

### Field authz

From `tasks.authz.test.ts` pattern: assignee PATCH `title` → 403; PATCH `status` only → 200; PATCH `status`+`priority` → 403.

### Member removal 409 then 200

Mirror `members.removal.test.ts`: assign open task → DELETE member → 409 → PATCH task `COMPLETED` with `expectedUpdatedAt` → DELETE → 200.

```bash
# After login as owner (Bearer $TOK), project $PID, member $MID, task $TID:
curl -s -D- -X DELETE "$BASE/api/v1/projects/$PID/members/$MID" \
  -H "Authorization: Bearer $TOK"
# expect 409 if open assignment
```

---

## 7. Hypothesis ladder

1. **Token wrong?** — `GET /api/v1/auth/me` with same Bearer. If 401 → auth guide, not this one.  
2. **Wrong project id in URL?** — Compare client path to `members.project_id` / task’s project.  
3. **No ACTIVE membership?** — Query `members` for `(user_id, project_id)`.  
4. **Role insufficient?** — OWNER required vs MEMBER; field allow-list for assignee.  
5. **IDOR-shaped 404?** — Resource exists under another project → expected 404.  
6. **Stale client after transfer/remove?** — Actor role changed; membership deactivated.  
7. **Platform ADMIN gate?** — Reactivate is not project-owner authz.

---

## 8. Worked failure A — “Task UUID works in SQL but API returns 404”

**Signal:** Support pastes task id; `SELECT * FROM tasks WHERE id = …` returns a row. Client `GET /api/v1/projects/{pid}/tasks/{tid}` → 404 `Task not found`. Bearer valid; user is ACTIVE member of `{pid}`.

**Reproduce:** Log `projectId` from URL and `task.projectId` from `TaskService.getById`.

**Hypothesis ladder:**

1. Membership — would be **403**, not 404 → kill.  
2. Cross-project bind — `!task || task.projectId !== projectId` → **404**.  
3. Soft-delete — this app deletes tasks; if missing, also 404.

**Root cause (typical):** Frontend reused a task id from project A inside project B’s URL (copy-paste, stale cache, shared link without project).

**Critical code:**

```ts
// task.service.ts — getById
await this.requireActiveMember(userId, projectId);
const task = await this.taskRepo.findById(taskId);
if (!task || task.projectId !== projectId) {
  throw new NotFoundError("Task not found");
}
```

**Fix:** Client uses correct project id. If the check were missing, that would be a **security bug** — add the bind + `tasks.idor.test.ts` case before shipping.

**Prove:** Same Bearer + correct project path → 200; cross-project path → 404; IDOR test green.

---

## 9. Worked failure B — mini invented: “Assignee can edit priority after ‘fix’”

**Signal:** Product asks assignees to update priority. Engineer changes UI to send `priority`. API → 403 `You cannot update one or more of these fields`.

**False lead:** “JWT role claim wrong” / “project OWNER check broken.”

**Actual:** `assertCanUpdateTask` — if membership is neither OWNER nor creator, allowed keys are only `status`. Sending `priority` (even mixed with `status`) fails the whole PATCH.

**Confirm:** Actor is assignee-only MEMBER; body includes forbidden keys.

**Fix (product):** Either elevate role/creator, or change **service** allow-list + tests in `tasks.authz.test.ts` — not the JWT.

**Prove:** Assignee PATCH `{ status, expectedUpdatedAt }` → 200; with `priority` → 403.

---

## 10. False leads / anti-patterns

| False lead | Reality |
|------------|---------|
| Re-checking `JWT_SECRET` on 403 project message | Authn already passed |
| Returning 403 for cross-project task ids | App uses **404** to hide existence |
| Softening IDOR tests | You removed the regression net |
| Fixing “404” by listing all tasks globally | Breaks project isolation |
| Assuming OWNER message differs from MEMBER | Many paths intentionally same 403 text |
| Debugging remove 409 in the controller | Service + `countOpenAssignedTo` |

---

## 11. Fix + prove checklist

- [ ] `/me` still 200 with same token (proves authz, not authn)  
- [ ] Alice/Bob cross-project: 403 on project, 404 on swapped task ids  
- [ ] Assignee field matrix still matches `assertCanUpdateTask`  
- [ ] `members.removal.test.ts` 409 → complete → 200 still passes  
- [ ] No change that returns other users’ project/task payloads on “not a member”

Re-run: `tasks.idor.test.ts`, `tasks.authz.test.ts`, `members.removal.test.ts`.

---

## 12. Interview Q&A

**Q: How do you debug an IDOR report?**  
**A:** Confirm the reporter’s token authenticates (`/me`). Reproduce with two users and two projects (`seedAliceBobProjects`). Attempt access with victim resource ids under attacker’s project URL and under victim’s project URL. Expect 403 without membership, 404 when the task’s `projectId` doesn’t match the URL. Read `TaskService.getById`/`update` bind and membership helpers — don’t start in JWT code. Add/keep an automated IDOR test before fixing.

**Q: Why 404 for a cross-project task id instead of 403?**  
**A:** 403 on a guessed UUID can confirm the resource exists (“forbidden” implies found). 404 collapses “missing” and “not in this project” so attackers learn less. Membership failures stay 403 because the project id in the URL is the one the client already claims to address.

**Q: Where is field-level authz enforced?**  
**A:** In `TaskService.assertCanUpdateTask` after membership lock and task load — not in Zod alone. Zod validates shape; the service decides which keys an OWNER/creator vs assignee may send. Mixed forbidden fields reject the entire request.

**Q: What’s the first SQL you run for a mysterious project 403?**  
**A:** Look up `members` for `(user_id, project_id)` and check `status` and `role`. If ACTIVE MEMBER but route needs OWNER, you’re in `requireOwner`. If no row or INACTIVE, `requireActiveMember` is doing its job.

**Q: Remove member returns 409 — is that authz?**  
**A:** It’s an invariant conflict: owner is authorized, but `countOpenAssignedTo` (or DB CHECK) blocks leaving open work assigned to a member you’re deactivating. Complete or reassign tasks first — see `members.removal.test.ts`.

**Q: Authn vs authz in one sentence?**  
**A:** Authn answers who you are (401 if unknown); authz answers what that identity may do to this project/task/member (403/404/409 once identity is known).

---

## 13. Glossary

| Term | Meaning |
|------|---------|
| **Authn** | Proving identity (JWT / session) |
| **Authz** | Allowing an action for that identity |
| **IDOR** | Insecure Direct Object Reference — access by guessing ids without ownership checks |
| **Parent binding** | Resource must belong to URL `:projectId` |
| **ACTIVE membership** | `members.status = ACTIVE` required for project access |
| **Field-level authz** | Which PATCH keys a role may send |
| **Existence hiding** | 404 instead of 403 for cross-project resources |

---

## 14. Optional further reading

- Decision tree: [README.md](./README.md) · Authn side: [06-auth-and-token-failures.md](./06-auth-and-token-failures.md) · Races: [08-concurrency-and-flaky-failures.md](./08-concurrency-and-flaky-failures.md) · Status meanings: [04-status-code-playbook.md](./04-status-code-playbook.md)  
- Lessons (optional): [idor](../lessons/security/idor.md), [authn-vs-authz](../lessons/security/authn-vs-authz.md), [least-privilege](../lessons/security/least-privilege.md), [mass-assignment](../lessons/security/mass-assignment.md)  
- Code: `task.service.ts`, `project.service.ts`, `member.repository.ts`, `tasks.idor.test.ts`, `tasks.authz.test.ts`, `members.removal.test.ts`, `helper/seed.ts`

---

## Teach pointer

> “Authz bugs live in services and member rows. The JWT only got you through the front door.”
