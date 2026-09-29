# Lesson: DDD — aggregates & bounded contexts

**Standalone ✓** — Domain-Driven Design essentials applied to auth, projects, and tasks.

**After this file you can:** draw bounded contexts, define aggregates and invariants, choose consistency boundaries, and interview without DDD jargon overload.

---

## 1. First principles

**Bounded context** is a boundary within which a domain model has consistent meaning. **User** in auth (credentials, sessions) differs from **Member** in projects (role, status)—related but not identical concepts.

An **aggregate** is a cluster of entities/value objects treated as one **consistency unit** with a **root** through which all changes flow. External references use IDs, not mutable innards.

The problem it solves: god tables and cross-module updates that break invariants (project with zero owners, task assigned to removed member). Aggregates define **transaction boundaries**; bounded contexts define **language and ownership**.

---

## 2. Mental model

### Analogy

**Bounded context:** HR department vs Engineering department—both say “employee,” different forms and rules.  
**Aggregate:** One purchase order—you don’t edit line items without going through the order header; supplier only stores `orderId`, not each line’s internal state.

### Diagram

```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Auth context   │     │ Projects context │     │  Tasks context  │
│  User, Session  │     │ Project, Member  │     │ Task            │
└────────┬────────┘     └────────┬─────────┘     └────────┬────────┘
         │ userId (id ref)       │ projectId               │ member ids
         └───────────────────────┴─────────────────────────┘
                    same Postgres — logical boundaries
```

---

## 3. Core rules (must / must-not)

1. **MUST** enforce aggregate invariants inside one transaction when possible.  
2. **MUST** reference other aggregates by **ID** only.  
3. **MUST NOT** update another context’s tables without its owning service/repo.  
4. **SHOULD** one aggregate root per transaction (avoid multi-root unless small).  
5. **SHOULD** align module folders with bounded contexts (this repo does).  
6. **MUST** use DB constraints as backstop (`one active owner`, FK on assignee).

---

## 4. How it works (mechanics)

**This repo’s contexts:**

| Context | Root entities | Invariants (examples) |
|---------|---------------|------------------------|
| Auth | User, Session | Unique email; refresh rotation; verified active |
| Projects | Project, Member | ≥1 active owner; unique name per creator |
| Tasks | Task | Assignee is active member of same project |

**Task aggregate** references `creatorMemberId`, `assigneeMemberId`—membership IDs from projects context, not embedded member rows.

**Cross-context rule:** `TaskService` validates assignee via `MemberRepository`—anticorruption at application layer.

**Ubiquitous language:** OWNER/MEMBER, ACTIVE/REMOVED, task status enums—keep terms consistent in code and API.

---

## 5. When to use / when not to use

| Situation | DDD depth |
|-----------|-----------|
| Modular monolith with clear modules | Bounded contexts + aggregate thinking |
| Tiny CRUD | Context map light; skip event storm |
| Complex lifecycle (orders, billing) | Rich aggregates + domain events |
| Analytics | Separate read context |

---

## 6. Step-by-step: design → implement → verify

1. Event storm / noun verb list for feature.  
2. Draw context map—who owns which table.  
3. Pick aggregate roots; list invariants.  
4. Map each invariant to transaction + constraint.  
5. Implement via service on root, not scattered controllers.  
6. Test invariant violations (zero owners, bad assignee).

---

## 7. Worked example A — this project

**Project + owner aggregate (creation):** `ProjectServices.create` in one transaction creates project and OWNER membership—no ownerless project.

**Ownership transfer:** Single service orchestrates demote/promote with constraints (`009_one_active_owner_per_project` migration mindset).

**Task creation:** Root = task row; invariants: caller active member; assignee active member of `projectId`; locks on membership during update.

**Auth register:** User + verification token aggregate in one transaction—user not left without verification row.

---

## 8. Worked example B — self-contained mini scenario

**Order aggregate:**

```ts
class Order {
  private lines: Line[] = [];
  addLine(sku: string, qty: number) {
    if (this.status !== "DRAFT") throw new Error("closed");
    if (qty <= 0) throw new Error("qty");
    this.lines.push({ sku, qty });
  }
  submit() {
    if (this.lines.length === 0) throw new Error("empty");
    this.status = "SUBMITTED";
  }
}
```

External code calls `order.addLine`, not mutates `lines` array directly. Persist entire aggregate in one transaction.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Anemic domain (only SQL, no rules) | Invariants duplicated |
| Mega-aggregate spanning all tables | Long locks, contention |
| Direct cross-context table UPDATE | Broken ownership |
| Same word, different meanings | Communication bugs |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Zero owners | Broken aggregate tx | Migrations 008/009/011 | Transaction + constraint |
| Bad assignee | Cross-aggregate rule skipped | TaskService | lockById + project match |
| Duplicate owners | Race | DB unique partial index | Transaction + constraint |

---

## 11. Interview Q&A (with strong answers)

**Q: Bounded context vs module?**  
**A:** Context is domain boundary; module is code organization—often aligned, not identical.

**Q: Aggregate root?**  
**A:** Entry point enforcing invariants for a consistency cluster—e.g. Project creation includes owner membership.

**Q: Reference other aggregates?**  
**A:** By ID; validate through owning context’s API/repo.

**Q: Example invariant in tasks?**  
**A:** Assignee must be ACTIVE member of the task’s project—checked in `TaskService` with member repo.

**Q: DDD without events?**  
**A:** Yes—aggregates and contexts stand alone; events optional.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Bounded context | Model boundary with shared language |
| Aggregate | Consistency cluster with root |
| Aggregate root | Only entry for mutations |
| Invariant | Rule always true |
| Ubiquitous language | Shared domain terms |
| Anticorruption layer | Translation at context boundary |

---

## 13. Teach pointer

> “Contexts draw map lines; aggregates draw transaction lines.”

---

## 14. Optional further reading (not required)

- [modular-monolith](./modular-monolith.md) · [../database/constraints-and-fk.md](../database/constraints-and-fk.md)  
- [event-sourcing](./event-sourcing.md)

Repo paths: `backend/src/modules/projects/project.service.ts`, `backend/src/modules/tasks/task.service.ts`, `backend/db/migrations/009_one_active_owner_per_project.sql`.
