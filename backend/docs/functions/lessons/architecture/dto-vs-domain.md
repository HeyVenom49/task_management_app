# Lesson: DTO vs domain (PublicUser and allow-lists)

**Standalone ✓** — You do not need any other doc to keep secrets out of API responses and stop mass assignment.

**After this file you can:** separate public DTOs from internal auth rows, use Zod as an allow-list, never return password hashes, and answer interview questions on mass assignment.

---

## 1. First principles

A **DTO** (Data Transfer Object) is the shape you **send or accept at the API boundary**.  
A **domain / internal model** is what the server needs to **enforce rules** (including secrets).

They must not be the same object blindly. If you serialize the internal user row, you ship `hash_password` to the browser.

**The problem it solves:** Over-posting (`role: "ADMIN"`) and over-sharing (hashes, tokens) — classic mass-assignment and data-leak bugs.

---

## 2. Mental model

### Analogy

Restaurant:

- **Menu / receipt (DTO):** dish name, price — what the guest sees.  
- **Kitchen ticket (internal):** recipes, supplier codes, cost — never handed to the guest.

### Diagram

```text
HTTP JSON body
    │  Zod schema (allow-list fields only)
    ▼
Controller ──► Service
                 │
                 ├── UserAuthRow (has hashPassword)  ← login / verify only
                 └── PublicUser (no hash)            ← JSON responses
```

---

## 3. Core rules (must / must-not)

1. **MUST** define a **public** type for responses (`PublicUser`) without secrets.  
2. **MUST** use a separate **auth row** type when password verification needs the hash.  
3. **MUST** SELECT only needed columns for public reads (do not `SELECT *` then hope).  
4. **MUST** validate inputs with Zod objects that list **allowed** fields only.  
5. **MUST NOT** pass `req.body` straight into SQL/ORM updates.  
6. **MUST NOT** return `hashPassword`, raw tokens, or session hashes in JSON.  
7. **MUST** treat unknown JSON keys as ignored (Zod object default) — never as writable columns.

---

## 4. How it works (mechanics)

### Two user shapes (real)

`backend/src/modules/auth/auth.types.ts`:

```ts
export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "INACTIVE";
  createdAt: Date;
};

export type UserAuthRow = {
  id: string;
  name: string;
  email: string;
  hashPassword: string; // internal only
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "INACTIVE";
  createdAt: Date;
};
```

### Repository discipline

`AuthRepository.createUser` / `findById` **RETURNING / SELECT** without `hash_password` → map to `PublicUser`.

`findByEmail` / `findAuthById` **SELECT** `hash_password` → map to `UserAuthRow` for argon2 verify only.

### Zod allow-lists

Examples:

- `registerSchema`: `name`, `email`, `password` only — not `role`, not `status`.  
- `createProjectSchema`: `info` only.  
- `updateTaskSchema`: partial task fields + `expectedUpdatedAt` — not `id`, not `creatorMemberId`.

Controllers call `schema.safeParse(req.body)` and pass **`parsed.data`**, never raw body.

### Mass assignment

Attacker sends:

```json
{ "info": "Hack", "creator_id": "victim-uuid", "role": "OWNER" }
```

Zod drops unknown keys; service uses authenticated `userId` for creator — body cannot choose owner identity.

---

## 5. When to use / when not to use

| Situation | Public DTO vs internal |
|-----------|----------------------|
| `GET /auth/me`, register response | **PublicUser** |
| Login password check | **UserAuthRow** (hash in memory only) |
| Create project body | Zod DTO → service input |
| Admin-only field changes | Separate schema + authz — not “extra JSON fields” |
| Logging | Log ids/emails carefully; **never** log password or hash |

---

## 6. Step-by-step: design → implement → verify

### Design

1. List fields clients may **see**.  
2. List fields server needs **internally**.  
3. List fields clients may **write** on create/update.  
4. Ensure write list ∩ secret list = empty.

### Implement

1. Types: `PublicX` vs `XAuthRow` / `XRecord`.  
2. Zod schemas for write paths.  
3. Repositories: explicit column lists.  
4. Controllers: `safeParse` → service.

### Verify

1. Register/login responses: assert no `hash` / `password` keys.  
2. POST with extra fields: behavior unchanged (ignored).  
3. Attempt to set `role` via register body: still `USER` / INACTIVE per server rules.

---

## 7. Worked example A — this project

### A1. PublicUser on create

```ts
RETURNING id, name, email, role, status, created_at
// mapped to PublicUser — hash_password never selected
```

**Where:** `backend/src/modules/auth/auth.repository.ts` `createUser`.

### A2. Login uses auth row

`findByEmail` loads `hashPassword`; service verifies with argon2; response returns tokens + **public** user shape from login flow — not the auth row object.

**Where:** `auth.service.ts` `login`, `auth.repository.ts` `findByEmail`.

### A3. Project create allow-list

```ts
export const createProjectSchema = z.object({
  info: z.string().trim().min(1).max(500),
});
```

Creator comes from JWT/`req.user`, not body.

**Where:** `backend/src/modules/projects/project.schema.ts`, `project.controller.ts`.

### A4. Task update cannot invent creators

`updateTaskSchema` is `createTaskSchema.partial()` plus `expectedUpdatedAt`. No `creatorMemberId` field → clients cannot reassign creator via PATCH.

**Where:** `backend/src/modules/tasks/task.schema.ts`.

---

## 8. Worked example B — mini scenario (self-contained)

**Bug:** ORM returns full `User` entity; `res.json(user)` leaks hash.

**Fix:**

```ts
function toPublicUser(row: UserAuthRow): PublicUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt,
  };
}

// never: res.json(row)
res.json({ user: toPublicUser(row) });
```

Input side:

```ts
const bodySchema = z.object({ title: z.string().max(100) });
// attacker { title: "x", isAdmin: true } → isAdmin stripped
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| `SELECT *` + `res.json(row)` | Hash / internal columns leak |
| `Object.assign(entity, req.body)` | Mass assignment → privilege escalation |
| One TypeScript type for everything | Easy to accidentally return secrets |
| Trusting frontend to omit fields | Attackers are not your React app |
| Logging `parsed` password fields | Secrets in log aggregators |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Response includes `hashPassword` | Wrong mapper / SELECT * | Network tab JSON | Public mapper; strip columns |
| User became ADMIN after register | Body field accepted | Zod schema keys | Remove `role` from schema; force server default |
| `creator_id` changed via PATCH | Unvalidated body spread | Controller/service update | Allow-list + ignore unknown |
| Tests pass but security fails | Tests don’t assert absent keys | Add `expect(body.user.hashPassword).toBeUndefined()` | Negative assertions |

---

## 11. Interview Q&A (with strong answers)

**Q: What is mass assignment?**  
**A:** Binding untrusted input fields directly onto a model so attackers set privileged properties (`role`, `isAdmin`, foreign keys) the API never intended to expose for write.

**Q: How do allow-lists help?**  
**A:** Schemas and explicit DTOs define the only writable/readable fields. Unknown keys are dropped; secrets never appear on the public type.

**Q: DTO vs entity?**  
**A:** DTO is boundary-facing; entity/row may include hashes, internal flags, and join data. Map deliberately at the edge.

**Q: Why two user types in this app?**  
**A:** `PublicUser` is safe to return; `UserAuthRow` carries `hashPassword` only for verification paths.

**Q: Is TypeScript enough?**  
**A:** No — types erase at runtime. Zod (or similar) enforces the allow-list on real JSON.

**Q: What about GraphQL?**  
**A:** Same principle: resolve only permitted fields; never expose hash fields in the schema.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| DTO | Boundary data shape for input/output |
| Domain / internal model | Server-side shape including secrets |
| Allow-list | Only listed fields accepted/returned |
| Mass assignment | Attacker sets extra fields via over-posting |
| Over-posting | Sending more JSON properties than intended |
| `safeParse` | Zod parse that returns success/error without throwing |

---

## 13. Teach pointer

> “What the kitchen knows is not what the receipt shows — map on purpose.”

---

## 14. Optional further reading (not required)

- Mass assignment deep dive: [../security/mass-assignment.md](../security/mass-assignment.md)  
- Validation boundary: [../api/validation-boundary.md](../api/validation-boundary.md)  
- Password hashing: [../security/password-and-token-hashing.md](../security/password-and-token-hashing.md)  
- Layering: [layered-architecture.md](./layered-architecture.md)

Repo paths: `backend/src/modules/auth/auth.types.ts`, `auth.repository.ts`, `auth.schema.ts`, `project.schema.ts`, `task.schema.ts`, controllers under `backend/src/modules/*/`.
