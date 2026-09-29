# Lesson: Validation boundary (HTTP edge)

**Standalone ✓** — You do not need any other doc to validate API input correctly in this stack.

**After this file you can:** place validation at the HTTP boundary, use Zod `safeParse` like this project’s controllers, reject bad input with 400 + field errors, and explain validation vs authorization in interviews.

---

## 1. First principles

The **validation boundary** is the line where **untrusted bytes** from the network become **trusted, typed data** your domain layer may assume.

Everything from HTTP — body, query, params, headers — is hostile until parsed: wrong types, extra fields, oversize strings, malformed UUIDs.

**The problem it solves:** Services and repositories should not defensively re-check “is this a UUID?” on every call. One choke point converts chaos into **DTOs** (Data Transfer Objects) with known shape.

**Tools:** Zod (this repo), or JSON Schema, Joi, etc. The pattern matters more than the library.

---

## 2. Mental model

### Analogy

Airport security **before** the gate: inspect luggage once; the plane cabin (service layer) assumes no weapons. You don’t search every passenger again mid-flight.

### Diagram

```text
HTTP request
    │
    ▼
Controller ──► Zod safeParse(body|params|query)
    │                │
    │ fail           │ success → typed `parsed.data`
    ▼                ▼
 400 + fieldErrors   Service (trusted input only)
```

---

## 3. Core rules (must / must-not)

1. **MUST** validate at the **controller** (HTTP edge), before calling services.  
2. **MUST** validate **body, route params, and query** when used — not just JSON body.  
3. **MUST** use `safeParse` (or equivalent) and return **400** with structured field errors — avoid uncaught Zod throws becoming 500.  
4. **MUST** infer TypeScript types from schemas (`z.infer`) so services don’t duplicate shapes.  
5. **MUST** normalize at the boundary where safe (trim strings, lowercase email) — **not** passwords (timing/normalization surprises).  
6. **MUST NOT** cast `req.body as MyType` without parsing — mass assignment and runtime crashes follow.  
7. **MUST NOT** rely on frontend validation alone — attackers bypass UI.  
8. **MUST** keep DB **constraints** as backstop (UNIQUE, CHECK) for races the boundary cannot see.

---

## 4. How it works (mechanics)

1. Define a **Zod schema** per operation (often in `*.schema.ts`).  
2. Controller calls `schema.safeParse(untrusted)`.  
3. On failure: `400` + `{ message: "Validation failed", errors: flatten().fieldErrors }`.  
4. On success: pass `parsed.data` to service — no raw `req.body`.  
5. Services throw **domain** errors (`ConflictError`, `NotFoundError`) mapped by `errorHandler` to 409/404/etc.  
6. **Partial updates:** use `.partial()` on object schemas; require concurrency fields separately when needed (see task `expectedUpdatedAt`).

---

## 5. When to use / when not to use

| Situation | At boundary? |
|-----------|----------------|
| User-submitted JSON body | **Yes** |
| `:id` UUID in path | **Yes** |
| Query pagination (when added) | **Yes** |
| Internal service-to-service call inside monolith | Often shared schema or typed function args |
| Business rule “only OWNER may transfer” | **No** — authorization in service |
| “Email already registered” | **No** — DB + service (`ConflictError`) |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Write the OpenAPI-ish contract: fields, max lengths, enums.  
2. Split schemas: create vs update (partial).  
3. Params schemas: `{ id: uuid }`, nested `{ id, taskId }`.

### Implement

1. Add `feature.schema.ts` with Zod objects and exported types.  
2. In controller: parse → 400 or call service with `parsed.data`.  
3. Wrap in try/catch; `next(err)` for unexpected errors.

### Verify

1. Send malformed UUID → 400 on params, not 500 from Postgres.  
2. Send unknown extra fields — decide `.strict()` vs strip (Zod default strips unknown keys on objects).  
3. Oversized string → 400 before hitting DB.

---

## 7. Worked example A — this project

### Auth register (`auth.controller.ts`)

```ts
const parsed = registerSchema.safeParse(req.body);
if (!parsed.success) {
  res.status(400).json({
    message: "Validation failed",
    errors: parsed.error.flatten().fieldErrors,
  });
  return;
}
const result = await this.service.register(parsed.data);
res.status(201).json(result);
```

**Why:** Invalid email/password shape never reaches `AuthService.register`; service focuses on hashing, transactions, conflicts.

### Project params + body (`project.schema.ts` + controller)

```ts
export const projectIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const createProjectSchema = z.object({
  info: z.string().trim().min(1).max(500),
});
```

Controller parses **params** and **body** separately — a common mistake is validating only body while `:id` is garbage.

### Task update + optimistic concurrency (`task.schema.ts`)

```ts
export const updateTaskSchema = createTaskSchema.partial().extend({
  expectedUpdatedAt: z.string().datetime(),
});

export const taskParamsSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
});
```

**Why `expectedUpdatedAt` at boundary:** Client must send the version token; Zod ensures it’s an ISO datetime string before OCC logic runs.

**Where:** `backend/src/modules/auth/auth.controller.ts`, `project.controller.ts`, `task.controller.ts`, matching `*.schema.ts` files.

---

## 8. Worked example B — mini scenario (self-contained)

**Endpoint:** `POST /invites` with `{ email, role }`.

```ts
const inviteSchema = z.object({
  email: z.email().trim().toLowerCase(),
  role: z.enum(["VIEWER", "EDITOR"]),
});

export async function createInvite(req, res, next) {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.error.flatten().fieldErrors,
    });
  }
  await inviteService.create(parsed.data);
  res.status(201).json({ ok: true });
}
```

Attacker sends `role: "ADMIN"` string — if enum not in schema, rejected at boundary; if you used `as any`, mass assignment might elevate privileges.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| `req.body as RegisterInput` | Runtime type lies; crashes in service |
| Validate only in React form | curl bypasses UI |
| 500 on Zod `.parse()` throw | Client can’t distinguish bad input |
| Trim password before hash | Changes user intent; support nightmares |
| One giant schema for all endpoints | Wrong rules on PATCH vs POST |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| 400 Validation failed | Schema mismatch | Response `errors` object | Fix client payload or schema |
| 500 on bad UUID | Params not validated | Controller path | Add `paramsSchema.safeParse` |
| Field accepted but shouldn’t | Missing `.strict()` / enum | Schema definition | Tighten schema |
| Duplicate email 500 | No domain handling | Service catch `23505` | Map to `ConflictError` 409 |
| Valid client broken after deploy | Schema tightened without version bump | Changelog / API version | Coordinate client release |

---

## 11. Interview Q&A (with strong answers)

**Q: `safeParse` vs `parse`?**  
**A:** `safeParse` returns `{ success, data | error }` for controlled 400 responses. `parse` throws — fine in scripts, risky at HTTP edge without a catch.

**Q: Why validate route params?**  
**A:** Params are untrusted input. Bad IDs should fail fast with 400, not as obscure database errors or logic bugs.

**Q: Validation vs authorization?**  
**A:** Validation checks shape and local rules (max length, enum). Authorization checks whether **this principal** may perform the action on **this resource**.

**Q: Where do UNIQUE constraints fit?**  
**A:** Boundary catches obvious garbage; DB UNIQUE catches concurrent duplicates; service maps violation to 409.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| DTO | Data shape crossing a layer boundary |
| Boundary | HTTP/controller edge in this app |
| `safeParse` | Non-throwing Zod parse |
| `fieldErrors` | Per-field validation messages for clients |
| Mass assignment | Client setting fields the server didn’t intend to expose |
| Normalization | Transforming input (trim, lowercase) at parse time |

---

## 13. Teach pointer

> “The boundary turns wire format into types — everything inside the service assumes the shape is already true.”

---

## 14. Optional further reading (not required)

- Mass assignment: [../security/mass-assignment.md](../security/mass-assignment.md)  
- DB constraints: [../database/constraints-and-fk.md](../database/constraints-and-fk.md)
