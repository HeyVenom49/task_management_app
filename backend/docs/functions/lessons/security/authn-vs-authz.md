# Lesson: Authentication vs authorization

**Standalone ✓** — You do not need any other doc to separate identity from permission and wire both in an API.

**After this file you can:** define authn vs authz, place checks in middleware vs services, explain JWT access vs membership checks, debug 401 vs 403, and interview on fail-closed patterns.

---

## 1. First principles

**Authentication (authn)** answers: *Who is this caller?*  
**Authorization (authz)** answers: *May this caller do this to this resource?*

Valid authn without authz → logged-in users access each other’s data (IDOR). Authz without authn → anonymous access or confused identity.

**Problem it removes:** Treating “has a Bearer token” as “may do anything.”

---

## 2. Mental model

### Analogy

**Authn:** Show government ID at the building lobby.  
**Authz:** Your badge only opens certain floors.

### Diagram

```text
HTTP request
    │
    ▼
authenticate middleware ──► 401 if no/invalid JWT
    │
    ▼
controller (user id from req.user)
    │
    ▼
service authz ──► 403/404 if not member / wrong row
    │
    ▼
repository (SQL with constraints)
```

---

## 3. Core rules (must / must-not)

1. **MUST** authenticate before exposing protected resources.  
2. **MUST** authorize in domain logic for every resource id.  
3. **MUST** use **401** for bad/missing credentials; **403** for known user denied.  
4. **MUST NOT** encode project membership inside JWT for this app (membership changes must apply immediately).  
5. **MUST NOT** trust client claims like `role: admin` in body without server lookup.  
6. **MUST** fail closed: unknown → deny.

---

## 4. How it works (mechanics)

### This stack’s authn

- Access JWT (HS256, short TTL) in `Authorization: Bearer`.  
- Middleware verifies signature and expiry, sets `req.user = { id, email }`.  
- Refresh cookie/body handled separately on auth routes (not on every API call).

### This stack’s authz

- **Project scope:** `requireActiveMember(userId, projectId)`.  
- **Owner-only:** `requireOwner`.  
- **Task scope:** membership + `task.projectId === projectId` + field rules (`assertCanUpdateTask`).  
- **Auth routes:** e.g. change password requires `authenticate`; login does not.

### JWT contents vs DB

JWT proves identity at issue time. Membership and task ownership are **always** read from DB at request time so revocations and removals take effect without waiting for token expiry.

---

## 5. When to use / when not to use

| Check | Where |
|-------|--------|
| Bearer present & valid | Middleware (`authenticate`) |
| Project membership | Service on every project/task handler |
| Role (OWNER) | Service method for destructive admin actions |
| Rate limits | Route middleware (abuse, not identity) |

| Avoid | Why |
|-------|-----|
| One giant authz middleware with every rule | Hard to test; misses nested rules |
| Authz only in frontend router | API still public |
| Long-lived JWT with embedded permissions | Stale permissions |

---

## 6. Step-by-step: design → implement → verify

1. Mark routes public vs protected.  
2. Add `authenticate` to protected routers.  
3. Pass `req.user.id` into services — never trust `userId` from body.  
4. Add resource-specific checks before reads/writes.  
5. Tests: no token → 401; wrong member → 403; wrong child id → 404.

---

## 7. Worked example A — this project

### A1. Authentication middleware

```ts
export async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedError();
    }
    const token = header.slice("Bearer ".length).trim();
    const payload = await verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    next(new UnauthorizedError());
  }
}
```

**Where:** `backend/src/shared/middleware/authenticate.ts`.

### A2. Protected route wiring

```ts
authRouter.get("/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});

authRouter.post("/change-password", authenticate, (req, res, next) => {
  controller.changePassword(req, res, next);
});
```

**Where:** `backend/src/modules/auth/auth.routes.ts`.

### A3. Authorization after authn (tasks)

```ts
public async list(userId: string, projectId: string) {
  await this.requireActiveMember(userId, projectId);
  const tasks = await this.taskRepo.listByProjectId(projectId);
  return { tasks };
}
```

**Where:** `backend/src/modules/tasks/task.service.ts` — JWT alone insufficient.

### A4. Token signing (identity claims only)

```ts
return new SignJWT(payload)
  .setProtectedHeader({ alg: "HS256" })
  .setExpirationTime(env.jwtExpiresIn)
  .sign(secret);
```

**Where:** `backend/src/shared/auth/token.ts` — `sub` + `email`, not project roles.

---

## 8. Worked example B — mini scenario (self-contained)

**Doc sharing API**

- Authn: session cookie.  
- Authz: `document.ownerId === user.id OR share.granteeId === user.id`.

```ts
async function getDocument(userId: string, docId: string) {
  const doc = await db.documents.find(docId);
  if (!doc) throw notFound();
  if (doc.ownerId === userId) return doc;
  const share = await db.shares.find(userId, docId);
  if (!share) throw forbidden();
  return doc;
}
```

Two layers: identity from session, permission from DB.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Result |
|--------------|--------|
| `if (req.headers.authorization) { /* ok */ }` | No signature verify |
| User id from JSON body | Spoofing |
| 403 for missing token | Wrong semantics; use 401 |
| Admin flag in JWT without DB | Stale or forged privilege |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| 401 on all routes | Clock skew / wrong secret | `JWT_SECRET`, token expiry | Align env |
| 403 for owner | Membership not ACTIVE | `project_members.status` | Fix invite flow |
| 200 cross-tenant | Missing authz | Service entry | Add membership |
| Works in Postman, not browser | CORS/cookie not authz | Network tab | Separate issue from 403 |

---

## 11. Interview Q&A (with strong answers)

**Q: Difference between 401 and 403?**  
**A:** 401 means authentication failed or is missing. 403 means the caller is authenticated but not allowed to perform the action on the resource.

**Q: Where should authorization live?**  
**A:** In domain/services (and enforced with DB constraints), close to invariants, not only in UI or optional middleware.

**Q: Why not put roles in JWT for this task app?**  
**A:** Project membership and roles change; DB checks on each request avoid stale access until token expiry.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Authn | Authentication — identity |
| Authz | Authorization — permission |
| Principal | Authenticated subject (user id) |
| Bearer token | Opaque/JWT credential in Authorization header |
| Fail closed | Deny when uncertain |

---

## 13. Teach pointer

> “JWT tells you who knocked. Membership tells you which room they may enter.”

---

## 14. Optional further reading (not required)

- IDOR: [idor](./idor.md)  
- Least privilege on fields: [least-privilege](./least-privilege.md) · [mass-assignment](./mass-assignment.md)
