# Lesson: ETags and conditional requests

**Standalone ✓** — You do not need any other doc to use HTTP validators for caching and optimistic updates.

**After this file you can:** explain ETag/If-Match flow, compare ETags to this app’s `expectedUpdatedAt`, implement 304 Not Modified, and avoid lost updates in interviews.

---

## 1. First principles

An **ETag** (entity tag) is an opaque **version identifier** for a representation of a resource. Clients send **`If-None-Match`** (cache) or **`If-Match`** (updates) to ask: “only proceed if version still matches.”

**The problem it solves:** Bandwidth waste re-downloading unchanged JSON, and **lost updates** when two clients PATCH without knowing the resource changed.

This project uses **`expectedUpdatedAt` in JSON body** for task PATCH — same **optimistic concurrency** idea as `If-Match` with an ETag derived from `updated_at`.

---

## 2. Mental model

### Analogy

Library book checkout card stamped with revision number — you may only replace the sheet if your stamp matches the current one.

### Diagram

```text
GET /task/1  ──► 200 ETag: "v3"
PATCH /task/1  If-Match: "v3"  ──► 200 new ETag "v4"

PATCH /task/1  If-Match: "v3"  (after someone else edited)
              ──► 412 Precondition Failed
```

---

## 3. Core rules (must / must-not)

1. **MUST** generate ETags from **stable version data** (revision, `updated_at`, hash of content).  
2. **MUST** require precondition on PATCH/DELETE when conflicts are costly.  
3. **MUST** return **412 Precondition Failed** or **409 Conflict** consistently on mismatch (pick one API-wide).  
4. **MUST NOT** use weak ETags incorrectly for byte-identical but semantically different bodies without care.  
5. **SHOULD** support **`If-None-Match`** on GET for caching (304).  
6. **MUST NOT** rely on client clocks for versioning — use server revision.

---

## 4. How it works (mechanics)

### Strong ETag

Often `"\"{updated_at}-{id}\""` or hash of canonical JSON.

### Conditional GET

```http
GET /api/v1/projects/:id/tasks/:taskId
If-None-Match: "abc"

→ 304 Not Modified (empty body) if ETag matches
→ 200 with body + new ETag if changed
```

### Conditional write

```http
PATCH ... 
If-Match: "abc"
```

Server compares to current ETag before applying patch.

### This project’s equivalent

Task responses include `updatedAt`; update schema requires:

```ts
expectedUpdatedAt: z.string().datetime(),
```

Service compares to DB column → mismatch throws `ConflictError` (**409**).

---

## 5. When to use / when not to use

| Situation | Mechanism |
|-----------|-----------|
| Frequently polled GET | ETag + 304 |
| Collaborative edit (tasks) | If-Match or body version field |
| Immutable resources after create | ETag optional |
| Real-time sync | WebSockets/SSE instead of poll |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Choose version source (`updated_at` timestamptz).  
2. Expose in GET JSON and/or `ETag` header.  
3. Require on PATCH.

### Implement

1. Middleware sets `ETag` on GET responses.  
2. PATCH reads `If-Match` or body field; SQL `UPDATE ... WHERE id = $1 AND updated_at = $2`.  
3. `rowCount === 0` → conflict response.

### Verify

1. Two concurrent PATCHes — one succeeds, one 409/412.  
2. GET with matching If-None-Match → 304.  
3. CDN/proxy respects cache headers if used.

---

## 7. Worked example A — this project

**Schema** (`task.schema.ts`):

```ts
export const updateTaskSchema = createTaskSchema.partial().extend({
  expectedUpdatedAt: z.string().datetime(),
});
```

**Controller flow:** validate body + params with Zod → `TaskService.update`.

**Service pattern:** update with version check; failure message *"Task was modified; reload and try again"* → **409**.

**Future HTTP-native variant:** on GET task, add:

```ts
res.setHeader("ETag", `"${task.updatedAt.toISOString()}"`);
```

PATCH accepts `If-Match` instead of body field — same SQL WHERE clause.

---

## 8. Worked example B — mini scenario (self-contained)

```ts
const updated = await sql`
  UPDATE notes SET body = ${body}, rev = rev + 1
  WHERE id = ${id} AND rev = ${ifMatchRev}
  RETURNING rev
`;
if (!updated.length) throw new PreconditionFailedError();
```

Client sends `If-Match: "7"` mapped to `rev`.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| PATCH without version | Last writer wins |
| ETag from non-canonical JSON | Spurious mismatches |
| 200 on failed If-Match | Client thinks save succeeded |
| Client uses local clock | Skew breaks checks |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Always 409 | Stale client copy | GET before PATCH | Reload |
| Never 304 | ETag changes every GET | Random ETag | Stable hash/version |
| 412 vs 409 mix | Inconsistent API | Docs | Standardize |

---

## 11. Interview Q&A (with strong answers)

**Q: ETag vs Last-Modified?**  
**A:** Last-Modified is second-precision time; ETag can be any revision token — better for fast updates and non-timestamp versioning.

**Q: 412 vs 409?**  
**A:** 412 Precondition Failed is HTTP-native for If-Match failure; 409 Conflict is common in JSON APIs for business/state conflicts — be consistent.

**Q: How does this relate to idempotency?**  
**A:** Retrying a PATCH with old version should fail safely with conflict, not duplicate side effects.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| ETag | Response header identifying representation version |
| If-Match | Request header carrying expected ETag for writes |
| If-None-Match | Request header for conditional GET |
| 304 | Not Modified — use cached body |
| Optimistic concurrency | Detect conflict at write time, not lock at read |

---

## 13. Teach pointer

> “Version tokens turn silent overwrites into explicit conflicts the client can resolve.”

---

## 14. Optional further reading (not required)

- Idempotency: [./idempotency.md](./idempotency.md)  
- DB OCC: [../database/optimistic-concurrency.md](../database/optimistic-concurrency.md)
