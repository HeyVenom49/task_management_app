# Lesson: Idempotency (safe retries)

**Standalone ✓** — You do not need any other doc to design idempotent HTTP operations and payment-style retries.

**After this file you can:** classify methods by idempotency, use keys for POST deduplication, relate DELETE/GET semantics to retries, and connect optimistic concurrency to conflict handling in this app.

---

## 1. First principles

An operation is **idempotent** if performing it **once or many times** leaves the system in the **same state** (from the client’s perspective).

Networks retry. Users double-click. Mobile apps replay requests after timeouts. Without idempotency, retries create **duplicate projects, double charges, or twin tasks**.

**The problem it solves:** “I’m not sure the server got my request” should not force the client to choose between **lost work** and **duplicate work**.

---

## 2. Mental model

### Analogy

Light switch labeled “ON”: pressing ON repeatedly stays ON. A button labeled “toggle” is **not** idempotent — each press flips state.

### Diagram

```text
Client                    Server
  │ POST /pay  (no key)      │
  │─────────────────────────►│ charge #1
  │ timeout (unknown)        │
  │ POST /pay  (retry)       │
  │─────────────────────────►│ charge #2  ← duplicate
```

With **Idempotency-Key: abc**:

```text
  │ POST + Key abc ─────────►│ process, store result for abc
  │ retry + Key abc ────────►│ return stored result, no second charge
```

---

## 3. Core rules (must / must-not)

1. **MUST** treat **GET, PUT, DELETE** (by definition in REST practice) as idempotent **when implemented correctly** — DELETE twice → second returns 404 OK.  
2. **MUST NOT** assume **POST** is idempotent — use **idempotency keys** or natural unique constraints.  
3. **MUST** store idempotency records with **TTL** and return the **same status/body** on replay.  
4. **MUST** use **DB UNIQUE** constraints as backstop (e.g. email on register → 409 on duplicate).  
5. **SHOULD** use **optimistic concurrency** (version field) so retried PATCHes don’t silently overwrite — this app uses `expectedUpdatedAt`.  
6. **MUST NOT** use GET for state-changing actions — breaks caching and idempotency expectations.

---

## 4. How it works (mechanics)

### HTTP methods (typical)

| Method | Idempotent? | Safe? |
|--------|-------------|-------|
| GET | Yes | Yes |
| PUT | Yes (replace target) | No |
| DELETE | Yes | No |
| PATCH | **Often no** unless carefully designed | No |
| POST | **No** | No |

### Idempotency-Key pattern

1. Client sends header `Idempotency-Key: <uuid>` on POST.  
2. Server begins transaction: insert key row if absent; if present, return cached response.  
3. Complete work; persist response snapshot; commit.

### This project (partial idempotency without header)

- **Register:** UNIQUE email → second register → **409 Conflict**, not two users.  
- **Task update:** `expectedUpdatedAt` → stale retry → **409**, client reloads.  
- **DELETE task:** second delete → likely **404** — acceptable idempotent delete semantics.

No global `Idempotency-Key` middleware yet — design gap if you add payment-like POSTs.

---

## 5. When to use / when not to use

| Situation | Mechanism |
|-----------|-----------|
| POST create payment / order | Idempotency-Key + store |
| POST register user | UNIQUE constraint + 409 |
| PATCH with merge semantics | Version token / ETag |
| GET poll status | Naturally safe to retry |
| Fire-and-forget webhook delivery | Event id dedup at consumer |

---

## 6. Step-by-step: design → implement → verify

### Design

1. List POST endpoints that must survive retries.  
2. Choose key source (client header vs deterministic hash of body).  
3. Define TTL (24–72h common for payments).

### Implement

1. Middleware or service wrapper: `begin → insert key → work → save response`.  
2. On duplicate key: return saved response.  
3. Add UNIQUE constraints for domain uniqueness.

### Verify

1. Send same POST twice with same key → one side effect.  
2. Send with different keys → two resources (if intended).  
3. Concurrent duplicate keys → one wins, one waits or conflicts.

---

## 7. Worked example A — this project

**Registration** (`auth.service.ts` pattern): duplicate email throws `ConflictError` (409) thanks to DB UNIQUE — retry after timeout doesn’t create two accounts if the first commit succeeded (client should treat 409 as “already exists”).

**Task PATCH** (`task.schema.ts`):

```ts
export const updateTaskSchema = createTaskSchema.partial().extend({
  expectedUpdatedAt: z.string().datetime(),
});
```

Service compares `expectedUpdatedAt` to row `updated_at`; mismatch → **409**. Retry with stale version fails loudly instead of clobbering.

**DELETE** task: first delete removes row; second → **404** — idempotent outcome “resource absent.”

---

## 8. Worked example B — mini scenario (self-contained)

```ts
async function createOrder(sql, userId, key: string, cart) {
  await sql.begin(async (tx) => {
    const existing = await tx`
      SELECT response FROM idempotency_keys
      WHERE key = ${key} AND user_id = ${userId}
    `;
    if (existing.length) return existing[0].response;

    const order = await tx`INSERT INTO orders ... RETURNING id`;
    const response = { orderId: order.id };
    await tx`
      INSERT INTO idempotency_keys (key, user_id, response)
      VALUES (${key}, ${userId}, ${response})
    `;
    return response;
  });
}
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Retry POST without key | Duplicates |
| PUT creates new row each time | Not idempotent |
| PATCH without version | Last writer wins |
| Idempotency key only in memory | Lost on restart |
| Same key, different body | Undefined — reject with 422 |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Duplicate rows on retry | No key/UNIQUE | DB counts | Add constraint or key store |
| 409 on first PATCH | Wrong `expectedUpdatedAt` | Client clock/cache | Reload resource |
| Stuck “processing” on key | Crash mid-flight | Key row state | Pending → complete or expire |
| GET mutated data | Side effects in GET | Handler | Move to POST |

---

## 11. Interview Q&A (with strong answers)

**Q: Is POST idempotent?**  
**A:** Not by default. You add idempotency keys or natural uniqueness to make retries safe.

**Q: Why 409 for OCC?**  
**A:** Request was valid but state changed; distinct from 400 (bad syntax) and 403 (not allowed).

**Q: DELETE twice?**  
**A:** Idempotent: resource absent after first delete; second typically 404 — end state “deleted.”

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Idempotency-Key | Client header naming a logical operation instance |
| Safe method | HTTP method not expected to change server state (GET) |
| OCC | Optimistic concurrency — detect conflicts before write |
| At-least-once delivery | Network may duplicate — consumers must dedupe |

---

## 13. Teach pointer

> “Design for at-least-once delivery — assume the request happened until you can prove otherwise.”

---

## 14. Optional further reading (not required)

- ETags: [./etags-conditional-requests.md](./etags-conditional-requests.md)  
- DB UNIQUE: [../database/constraints-and-fk.md](../database/constraints-and-fk.md)
