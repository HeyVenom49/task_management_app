# Lesson: Bulk endpoints

**Standalone ✓** — You do not need any other doc to design batch APIs without melting the database.

**After this file you can:** decide when bulk beats many single calls, shape request/response for partial success, enforce limits and authz per item, and relate bulk design to this project’s REST style.

---

## 1. First principles

A **bulk endpoint** applies one operation to **many resources** in a single HTTP request — e.g. create 50 tasks, delete 10 ids, patch status on a batch.

**Why:** Fewer round trips, transactional grouping, efficient mobile sync.

**Risk:** Huge payloads, long transactions, partial failures, and **one slow item blocking the batch**.

**The problem it solves:** N+1 HTTP chatter — not “one SQL statement” magic unless you design for it.

This task management API currently uses **single-resource** routes (`POST /projects/:id/tasks` per task) — bulk is a **future pattern** when clients need import/sync.

---

## 2. Mental model

### Analogy

School bus vs 30 separate car trips — efficient if everyone fits and the route plan handles one kid absent without cancelling the whole bus (partial success policy).

### Diagram

```text
POST /projects/:id/tasks/bulk
{ "items": [ {...}, {...} ] }
        │
        ▼
Validate array max length ──► authz once for project ──► per-item or single tx
        │
        ▼
{ "results": [ { "id", "status": "created" }, { "error": "..." } ] }
```

---

## 3. Core rules (must / must-not)

1. **MUST** cap **array length** (e.g. max 100 items) at validation boundary.  
2. **MUST** cap **total payload size** (`express.json` limit + item count).  
3. **MUST** define **all-or-nothing vs partial success** in the contract.  
4. **MUST** apply **same authz** as single create — project membership on every item’s scope.  
5. **MUST NOT** run unbounded loop in one DB transaction without timeout awareness.  
6. **SHOULD** use **RETURNING** / multi-row insert for homogeneous creates.  
7. **MUST** return **207 Multi-Status** or structured 200 with per-item errors — document choice.

---

## 4. How it works (mechanics)

### All-or-nothing (transaction)

```ts
await sql.begin(async (tx) => {
  for (const item of items) {
    await taskRepo.create(item, tx);
  }
});
```

One failure → rollback entire batch — good for imports that must be atomic.

### Partial success

Process each item; collect errors; no single transaction across all — good for “delete these 10 tasks” where some may already be gone.

### Idempotency

Bulk POST especially needs **Idempotency-Key** — retries must not duplicate half the batch.

---

## 5. When to use / when not to use

| Situation | Bulk? |
|-----------|-------|
| Mobile offline sync queue flush | **Yes** |
| Admin CSV import | **Yes** (async job better for huge) |
| User creates one task in UI | **No** — single POST |
| Cross-project batch | **Rare** — strict per-item authz |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Max items, max bytes.  
2. Atomic vs partial semantics.  
3. Response shape for errors.  
4. Rate limit bulk heavier than single.

### Implement

1. Zod: `z.array(createTaskSchema).max(100)`.  
2. Reuse `TaskService.create` logic in loop or batch SQL.  
3. Nest under `/projects/:id/tasks/bulk` — same authz as tasks router.

### Verify

1. 101 items → 400.  
2. One invalid row in atomic mode → none persisted.  
3. Load test memory.

---

## 7. Worked example A — this project (extension point)

**Today:** Single create validated like:

```ts
const parsed = createTaskSchema.safeParse(req.body);
await this.service.create(projectId, userId, parsed.data);
```

**Bulk add (hypothetical)** under existing mount ` /api/v1/projects/:id/tasks`:

```ts
// task.schema.ts
export const bulkCreateTasksSchema = z.object({
  items: z.array(createTaskSchema).min(1).max(50),
});

// task.routes.ts
taskRouter.post("/bulk", (req, res, next) =>
  controller.bulkCreate(req, res, next),
);
```

**Service:** `sql.begin` + loop with shared membership check — mirror single-create invariants.

**Why nested path:** `projectId` from URL + `authenticate` on router — same IDOR boundary as single task routes (`task.routes.ts`).

---

## 8. Worked example B — mini scenario (self-contained)

```json
POST /projects/p1/tasks/bulk
{
  "items": [
    { "title": "A", "priority": "HIGH" },
    { "title": "", "priority": "LOW" }
  ]
}
```

Atomic response on validation fail entire request **400** at boundary if any item fails Zod **before** service — or per-item validation with 207 — pick one and document.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| No max array size | DoS |
| 5000 sequential INSERTs one tx | Long locks |
| Different authz than single route | IDOR |
| Silent skip failures | Client data loss |
| Bulk GET returning entire table | Same as no pagination |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Timeout | Big tx | Duration | Chunk batches or async job |
| Partial DB state | Mixed tx policy | Logs | Clarify atomicity |
| 413 | Payload | limit | Reduce batch size |

---

## 11. Interview Q&A (with strong answers)

**Q: 207 vs 200 with errors array?**  
**A:** Both communicate partial success; 207 is HTTP-native multi-status — many JSON APIs use 200 + structured errors for simpler clients.

**Q: One transaction or many?**  
**A:** One transaction for atomic business rules; many for independent operations where partial success is OK.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Bulk / batch | Many operations in one request |
| 207 | Multi-Status |
| Atomic batch | All succeed or none persist |

---

## 13. Teach pointer

> “Bulk is a multiplier — it multiplies both efficiency and failure blast radius, so cap it and define partial failure upfront.”

---

## 14. Optional further reading (not required)

- Payload limits: [./payload-limits.md](./payload-limits.md)  
- Transactions: [../database/transactions.md](../database/transactions.md)
