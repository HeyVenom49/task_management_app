# Projects & members — every function, thinking, and interview bank

Covers `modules/projects/**`.

**Core product problem:** Multi-user workspaces where JWT identity is not enough — access is **membership-scoped**, ownership is privileged, removal is soft, and concurrency must not leave illegal states (zero owners, inactive member with open tasks).

---

## Architecture map

```
project.routes.ts (all routes behind authenticate)
  → ProjectController
    → ProjectServices
        → ProjectRepository
        → MemberRepository
        → AuthRepository (lookup users by email / admin role)
        → TaskRepository (open-task counts for removal rules)
```

**Developer thinking:** “Logged in” ≠ “can see this project.” Always check **active membership** (and role when needed). Prefer **403** for “not a member” so you don’t confirm project existence to strangers (IDOR style). Use **row locks** (`FOR UPDATE`) when mutating ownership/membership under concurrency.

---

# Schemas (`project.schema.ts`)

## `createProjectSchema` / `updateProjectSchema`

1. **What:** `info` string trim 1..500.  
2. **Problem:** Bound payload size/content for project “name/description” field.  
3. **Interview:** Why one field `info` not title+description; max length DoS.

## `projectIdParamsSchema` / `memberParamsSchema`

1. **What:** UUID path params.  
2. **Problem:** Reject non-UUID early (400) vs hitting DB with junk.  
3. **Interview:** UUID v4 validation vs DB type errors; mass assignment N/A.

## `addMemberSchema` / `transferOwnershipSchema`

1. **What:** Email (normalized); `newOwnerMemberId` UUID.  
2. **Interview:** Invite-by-email vs by-user-id; why member id not user id for transfer (membership is the role carrier).

---

# Types (`project.types.ts`)

## `Project`, `CreateProjectInput`, `UpdateProjectInput`

1. **What:** Domain project shape; snake_case stays in DB mapping.  
2. **Interview:** `creatorId` vs current OWNER (can diverge after transfer — discuss).

## `Member`, `MemberRole`, `MemberStatus`, `MemberWithUser`, `CreateMemberInput`

1. **What:** Membership is a first-class entity (`members` row), not a user flag.  
2. **Problem:** Same user can have different roles on different projects; soft-deactivate without deleting history.  
3. **Interview:** RBAC modeling; ACTIVE/INACTIVE; why role on membership not on user.

---

# `project.routes.ts`

1. **What:** `projectRouter.use(authenticate)` then CRUD + members + transfer + reactivate.  
2. **Problem:** No anonymous project access.  
3. **Interview bank:**  
   - Route order: `/` vs `/:id` — why list/create before param routes.  
   - Why reactivate is POST not PATCH.  
   - Nesting members under projects.  
   - Wiring `TaskRepository` into project service — coupling OK?

---

# `ProjectController`

Same HTTP pattern as auth: auth gate, Zod, service, status codes, `next(err)`.

## Methods

| Method | Status | Notes |
|--------|--------|-------|
| `create` | 201 | body `info` |
| `list` | 200 | only projects where I’m active member |
| `getById` | 200 | membership required |
| `update` | 200 | owner |
| `remove` | 200 | owner delete |
| `listMember` | 200 | active members + user info |
| `addMember` | 201 | owner; by email |
| `removeMember` | 200 | soft deactivate |
| `reactivateMember` | 200 | **platform ADMIN only** (enforced in service) |
| `transferOwnership` | 200 | owner → another active member |

**Interview (all):** Why controller checks `req.user` again; validation error shape consistency; mapping domain errors via AppError.

---

# `ProjectServices`

## `requireActiveMember` (private)

1. **What:** Load membership; must be ACTIVE; load project; if missing membership/project → **same** `ForbiddenError` message.  
2. **Problem:** Uniform denial; avoid leaking whether project id exists.  
3. **Interview:** 403 vs 404 debate; timing side channels; why check project after membership.

## `requireOwner` (private)

1. **What:** Active member + role OWNER.  
2. **Interview:** Why reuse same Forbidden message (don’t reveal “you’re member but not owner”).

## `isUniqueViolation` / `isCheckViolation` (private)

1. **What:** Detect Postgres `23505` / `23514`.  
2. **Problem:** Translate DB constraints into HTTP 409/conflict messages.  
3. **Interview:** Why catch DB codes in service not repository; fragile across DBs; constraint names.

## `requireOwnerLocked` (private)

1. **What:** `lockByUserAndProject` FOR UPDATE; must be ACTIVE OWNER; project exists.  
2. **Problem:** Serialize critical sections (update/delete/add member) so two owners don’t race nonsense.  
3. **Interview:** Pessimistic locking; lock order deadlocks; hold lock only inside transaction.

## `create`

1. **What:** Transaction: insert project + OWNER membership for creator.  
2. **Problem:** Never create orphan project without owner membership.  
3. **Interview:** Unique on `info`? (Conflict message suggests uniqueness — confirm schema in migrations mentally); creatorId immutability after transfer.

## `listMine`

1. **What:** `findForMember` join active memberships.  
2. **Interview:** Pagination missing; sorting; don’t list inactive memberships.

## `getById` / `listMember`

1. **What:** Gate with requireActiveMember; then fetch.  
2. **Interview:** listMember only ACTIVE members — soft-removed invisible.

## `update` / `remove`

1. **What:** Transaction + owner lock; update info or delete project.  
2. **remove FK 23503:** Map to Conflict “has members or related data.”  
3. **Interview:** Cascade vs restrict deletes; soft-delete projects; who can delete.

## `addMember`

1. **What:** Owner check; find ACTIVE user by email; reject self; handle existing ACTIVE/INACTIVE; transaction + owner lock; create MEMBER.  
2. **Problem:** Only verified users join; removed users need admin reactivate path.  
3. **Interview bank:**  
   - Why INACTIVE cannot self-rejoin.  
   - Invite tokens vs add-by-email.  
   - Race unique violation.  
   - Enumeration of emails via add member errors.

## `removeMember`

1. **What:** Owner; transaction; `FOR UPDATE` target member row; must belong to project + ACTIVE; cannot remove last OWNER; cannot remove if open tasks assigned; deactivate.  
2. **Problem:** Invariants: ≥1 owner; no dangling open work on inactive assignees (also DB check).  
3. **Interview:** Soft delete vs hard; countOpenAssignedTo; check violation fallback; parallel remove vs assign (see tests).

## `reactivateMember`

1. **What:** Actor must be platform `ADMIN` (users.role); project/member exist; member INACTIVE; target user ACTIVE; reactivate as MEMBER.  
2. **Problem:** Sensitive restore path elevated to platform admin.  
3. **Interview:** Project owner vs platform admin; why force role MEMBER on reactivate; audit log missing.

## `transferOwnership`

1. **What:** Current owner; not self; target active member same project; not already owner; transaction: lock actor membership; re-check still OWNER; demote self → MEMBER; promote target → OWNER; unique violation → conflict.  
2. **Problem:** Exactly-one-owner style transitions under concurrency.  
3. **Interview bank (senior):**  
   - Why lock then re-read role.  
   - Parallel transfer to two members (concurrency test).  
   - Former owner transfers again → 403.  
   - Multi-owner future vs single-owner invariant.  
   - creator_id stale after transfer.

---

# `ProjectRepository`

## `map` (private)

1. **What:** snake_case row → camelCase Project.  
2. **Interview:** Why map in repo; alternative ORM.

## `create` / `findById` / `findByCreatorId` / `update` / `delete` / `findForMember`

1. **What:** CRUD + membership join list.  
2. **Interview:** `findByCreatorId` unused by service? (Possible dead API — interview: dead code.)  
3. **delete RETURNING** boolean.  
4. **findForMember:** INNER JOIN members ACTIVE — authorization at query level for lists.

---

# `MemberRepository`

## `map` / `mapWithUser`

1. **What:** Row mapping; join adds name/email.  
2. **Interview:** Avoid N+1 by join in `listByProjectId`.

## `create` / `findById` / `findByUserAndProject` / `listByProjectId`

1. **What:** Basic membership access patterns.  
2. **Interview:** Unique (user_id, project_id) assumed; status filter on list.

## `countActiveOwners`

1. **What:** COUNT owners ACTIVE.  
2. **Interview:** Race between count and deactivate — why FOR UPDATE on member first.

## `deactivate` / `reactivate` / `updateRole`

1. **What:** Soft status flip; role updates only ACTIVE rows.  
2. **Interview:** Conditional UPDATE returning empty → false/null meaning.

## `lockById` / `lockByUserAndProject`

1. **What:** `SELECT … FOR UPDATE`.  
2. **Problem:** Critical for task assignee checks and ownership races.  
3. **Interview:** FOR UPDATE vs FOR UPDATE SKIP LOCKED; transaction requirement; lock duration.

---

# File-level interview set — projects

### Junior
- Difference between user and member.  
- Who can add members?  
- What does list projects return?

### Mid
- Why Forbidden for non-members.  
- Soft remove + reactivate policy.  
- Transaction on create project+owner.  
- Last owner protection.

### Senior
- Locking strategy for transferOwnership.  
- Invariant: inactive member never has open tasks (app + DB).  
- IDOR test expectations for Alice/Bob projects.  
- Platform ADMIN reactivate threat model.  
- Scaling membership checks (cache?).

### Testing tie-ins
- `tasks.idor.test.ts` — Alice cannot GET Bob’s project.  
- `concurrency.test.ts` — parallel transfer; transfer-then-transfer.  
- `members.removal.test.ts` — open task blocks remove; race remove vs assign.

---

# Teach script (projects)

1. Draw User ──< Member >── Project.  
2. Stamp roles OWNER/MEMBER and statuses ACTIVE/INACTIVE.  
3. Walk “Bob removed while assigned” → 409 → complete task → 200.  
4. Walk ownership transfer with two parallel requests.
