# Lesson: Deadlocks (deep dive)

**Standalone ✓** — You do not need any other doc to understand deadlock cycles, prevention in this app, and Postgres `40P01` handling.

**After this file you can:** draw wait-for graphs, order locks consistently, diagnose deadlocks from logs, and answer interview questions.

---

## 1. First principles

A **deadlock** is a **cycle** of transactions each waiting for a lock held by another in the cycle. Postgres detects this and **aborts one victim** (`deadlock_detected`, SQLSTATE `40P01`).

**Why it happens:** Two+ transactions lock resources in **different orders** while holding locks the other needs.

**The problem it solves (by aborting):** Without detection, txs would wait forever.

---

## 2. Mental model

### Analogy

Two cars meet nose-to-nose on a one-lane bridge — each waits for the other to reverse. Deadlock detector **tows one car away** (rollback).

### Diagram

```text
Tx1: lock row A ──► wait row B
Tx2: lock row B ──► wait row A
         ╲___________╱
              cycle → abort one tx
```

---

## 3. Core rules (must / must-not)

1. **MUST** acquire multiple row locks in a **global total order** (e.g. sort UUIDs).  
2. **MUST** keep lock count minimal and hold time short.  
3. **MUST** retry idempotent operations on `40P01` when rare.  
4. **MUST NOT** lock parent then child in one path and child then parent in another.  
5. **MUST NOT** user-interaction inside locked transaction.

---

## 4. How it works (mechanics)

### Detection

Postgres periodically checks wait-for graph; picks **victim** (often less work done).

### Client behavior

Driver throws error; entire transaction rolled back — retry whole `sql.begin` if safe.

### Prevention strategies

| Strategy | Idea |
|----------|------|
| Lock ordering | Always lock `(min_id, max_id)` order |
| Single lock | Redesign to one row (aggregate) |
| Serializable | May abort more — different tradeoff |
| Avoid unnecessary locks | Less edges in graph |

### Transfer example (from transactions lesson)

Sort wallet user_ids before `FOR UPDATE` — classic deadlock prevention.

---

## 5. When to use / when not to use

| Situation | Action |
|-----------|--------|
| Multi-row FOR UPDATE | Sort ids |
| Rare 40P01 on retry-safe op | Retry with backoff |
| Frequent deadlocks | Redesign access pattern |
| DDL during traffic | Schedule off-peak |

---

## 6. Step-by-step: design → implement → verify

### Design

1. List all rows locked per use case.  
2. Define sort key (UUID lexical).  
3. Document retry policy.

### Implement

```ts
const ids = [memberA, memberB].sort();
for (const id of ids) {
  await tx`SELECT … FROM members WHERE id = ${id} FOR UPDATE`;
}
```

### Verify

1. Stress test parallel ops.  
2. Log `40P01` rate → near zero after ordering fix.

---

## 7. Worked example A — this project

### Task flows

Typically lock **caller membership** then **assignee member** via sequential calls. Risk if another path locks assignee then caller in reverse under different features.

**Mitigation:** When both members locked, sort member ids before `lockById`:

```ts
const toLock = [callerMemberId, assigneeMemberId].filter(Boolean).sort();
for (const id of toLock) {
  await this.memberRepo.lockById(id, tx);
}
```

(Current code locks caller via user+project then assignee — usually consistent order if assignee ≠ caller; review when adding cross-member admin tools.)

### Project + task concurrency

Member deactivation and task update both touch member rows — triggers + locks; keep transactions short to shrink deadlock window.

---

## 8. Worked example B — mini scenario (self-contained)

```ts
// BAD — transfer between Alice and Bob both ways concurrent
await tx`SELECT … FROM wallets WHERE user_id = ${alice} FOR UPDATE`;
await tx`SELECT … FROM wallets WHERE user_id = ${bob} FOR UPDATE`;

// GOOD
for (const id of [alice, bob].sort()) {
  await tx`SELECT … FROM wallets WHERE user_id = ${id} FOR UPDATE`;
}
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Random lock order | 40P01 under load |
| Lock two tables both directions | Cycle |
| Ignore 40P01 | User sees 500 |
| Huge lock scope | More deadlock edges |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Intermittent 500 `deadlock detected` | Cycle | Postgres log detail | Lock ordering |
| Same two endpoints | Conflicting txs | Traces | Unify lock sequence |
| After new feature | New lock path | Code review | Sort locks |
| High 40P01 rate | Hot row | Design | Queue or atomic UPDATE |

---

## 11. Interview Q&A (with strong answers)

**Q: What is a deadlock?**  
**A:** Circular wait where each transaction holds a lock another needs; DB aborts one to break the cycle.

**Q: How prevent?**  
**A:** Consistent lock ordering, fewer locks, shorter transactions, sometimes redesign.

**Q: Should apps retry deadlocks?**  
**A:** Yes for idempotent whole-transaction retries with small backoff on 40P01.

**Q: Relation to this app?**  
**A:** Uses `FOR UPDATE` on members in task/project services — multi-member flows should lock in sorted id order to avoid cycles.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Wait-for graph | Nodes txs, edges waiting for locks |
| Victim | Transaction chosen to rollback |
| 40P01 | deadlock_detected |
| Lock ordering | Deterministic acquisition order |
| Cycle | Circular wait chain |

---

## 13. Teach pointer

> “Deadlocks are a traffic problem — fix the intersection, not just tow cars forever.”

---

## 14. Optional further reading (not required)

- Lock basics: [locking-kinds](./locking-kinds.md)  
- Pessimistic flows: [pessimistic-locking](./pessimistic-locking.md)
