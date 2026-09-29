# Lesson: Least privilege

**Standalone ✓** — You do not need any other doc to grant minimum permissions for users, tokens, and processes.

**After this file you can:** apply least privilege to project roles, task field updates, JWT claims, DB credentials, and ops access; debug “user could do too much.”

---

## 1. First principles

**Least privilege** means every actor (user, service account, token) gets the **minimum** access needed for the job — no more, for no longer than necessary.

Reduces blast radius when credentials leak or accounts are compromised.

**Problem it removes:** Every member is de facto admin.

---

## 2. Mental model

### Analogy

Hospital badge: nurses enter patient floors; only surgeons enter OR. Not everyone gets master key because they work in the building.

### Diagram

```text
Project role
  OWNER ──► manage members, delete tasks (with rules), full task fields
  MEMBER ──► work on tasks, limited updates

Task update
  CREATOR/OWNER ──► many fields
  ASSIGNEE ──► status only
```

---

## 3. Core rules (must / must-not)

1. **MUST** default new users to lowest global role (`MEMBER` in schema).  
2. **MUST** separate project OWNER vs MEMBER capabilities.  
3. **MUST** restrict partial updates by role (field allowlist).  
4. **MUST NOT** put unnecessary claims in JWT.  
5. **MUST NOT** run DB as superuser in app (use limited DB role in production).  
6. **SHOULD** revoke sessions on password change (this app does).

---

## 4. How it works (mechanics)

### Global user role

Stored in DB; not elevated via register body (mass assignment blocked).

### Project membership role

`OWNER` vs `MEMBER` — owner-only routes use `requireOwner` / `requireOwnerLocked`.

### Task operations

- Delete: owner or creator only (`TaskService.remove`).  
- Update fields: `assertCanUpdateTask` caps assignee to `status`.

### Tokens

Access JWT: identity only. Refresh: session row scoped to user.

---

## 5. When to use / when not to use

| Fine-grained role checks | Single “is logged in” |
|--------------------------|------------------------|
| Multi-tenant data | Public read-only catalog |

| Time-bound elevation | Permanent admin |
|----------------------|-----------------|
| Break-glass | Audit |

---

## 6. Step-by-step: design → implement → verify

1. List actions per resource.  
2. Map roles → allowed actions.  
3. Implement in service (not UI).  
4. Tests per role negative/positive.  
5. Review JWT and env for excess scope.

---

## 7. Worked example A — this project

### A1. Assignee-only status

```ts
const allowed: readonly (keyof UpdateTaskInput)[] =
  isOwner || isCreator
    ? (["title", "description", "priority", "status", "assigneeMemberId"] as const)
    : (["status"] as const);
```

**Where:** `backend/src/modules/tasks/task.service.ts`.

### A2. Owner-only project operations

```ts
private async requireOwner(userId: string, projectId: string) {
  const ctx = await this.requireActiveMember(userId, projectId);
  if (ctx.membership.role !== "OWNER") {
    throw new ForbiddenError("You do not have access to this project");
  }
  return ctx;
}
```

**Where:** `backend/src/modules/projects/project.service.ts`.

### A3. Minimal JWT

```ts
export type AccessTokenPayload = {
  sub: string;
  email: string;
};
```

**Where:** `backend/src/shared/auth/token.ts` — no admin flag in token.

---

## 8. Worked example B — mini scenario (self-contained)

**S3 upload**

IAM policy: `s3:PutObject` only on `uploads/${userId}/*`, not `*`.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Result |
|--------------|--------|
| Shared admin password | No attribution |
| DB user is SUPERUSER | SQL injection → schema drop |
| assignee edits title | Scope creep |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Member deletes project | Missing requireOwner | Route service | Add owner gate |
| Assignee changed priority | Field guard | sent keys | assertCanUpdateTask |
| Stale admin in JWT | Overclaiming token | Payload | DB lookup for roles |

---

## 11. Interview Q&A (with strong answers)

**Q: Define least privilege.**  
**A:** Grant only the permissions required to perform a function, minimizing damage if abused or stolen.

**Q: Example in task app?**  
**A:** Assignees may update status only; owners manage membership; JWT carries identity not project admin.

**Q: Least privilege vs deny by default?**  
**A:** Deny by default is the policy; least privilege is sizing each allow rule minimally.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Least privilege | Minimum necessary access |
| Blast radius | Harm from one compromise |
| Role | Named bundle of permissions |
| Elevation | Temporary extra access |

---

## 13. Teach pointer

> “Give the key that opens one door, not the building.”

---

## 14. Optional further reading (not required)

- Mass assignment: [mass-assignment](./mass-assignment.md)  
- Authz: [authn-vs-authz](./authn-vs-authz.md)
