# Lesson: SOLID in backends

**Standalone ✓** — SOLID principles with backend examples tied to auth, projects, and tasks.

**After this file you can:** apply S/O/L/I/D to new endpoints, spot violations in reviews, and answer interviews with concrete file-level examples.

---

## 1. First principles

**SOLID** is five design guidelines for maintainable object-oriented code:

- **S**ingle Responsibility — one reason to change per module/class.  
- **O**pen/Closed — extend behavior without editing core logic endlessly.  
- **L**iskov Substitution — subtypes honor contracts.  
- **I**nterface Segregation — small, focused dependencies.  
- **D**ependency Inversion — depend on abstractions, not concretions.

The problem it solves: “god services” and tangled imports that make every feature touch twenty files. SOLID nudges **cohesion** and **stable dependencies** in layered backends.

---

## 2. Mental model

### Analogy

Kitchen stations: grill chef only grills (S). Add vegan menu by new recipes, not rewiring the grill (O). Any sous-chef following the recipe card produces acceptable dish (L). Recipe cards only list needed steps (I). Head chef orders from suppliers through contracts, not hunting cows (D).

### Diagram

```text
         Dependency Inversion
    Service ──────► Repository (abstraction/concrete seam)
        ▲
        │ depends on capability, not pg driver details

Single Responsibility
    Controller = HTTP only
    Service = rules + transactions
    Repository = SQL only
```

---

## 3. Core rules (must / must-not)

1. **S:** Controllers change when API shape changes; services when rules change; repos when schema changes—not all three in one class.  
2. **O:** Prefer new methods/strategies over giant `if (featureFlag)` in one function— or use policy objects.  
3. **L:** If you introduce `FakeMemberRepository`, it must throw same `NotFoundError` semantics as real repo.  
4. **I:** Do not force services to implement unused repo methods—split repos if needed.  
5. **D:** Services receive repos via constructor; routes construct concretes.  
6. **MUST NOT** treat SOLID as mandatory interfaces everywhere—pragmatism over ceremony.

---

## 4. How it works (mechanics)

| Principle | This repo example |
|-----------|-------------------|
| **S** | `TaskService` task rules; `TaskController` HTTP; `TaskRepository` SQL |
| **O** | New task status workflow: extend service methods + schema, not rewrite auth |
| **L** | Test doubles implementing repo methods used by service |
| **I** | `MemberRepository` focused on membership, not entire projects surface |
| **D** | `new TaskService(sql, taskRepo, memberRepo)` in `task.routes.ts` |

**Common backend mapping:** S ≈ layers; D ≈ DI/composition root; O ≈ modular features.

---

## 5. When to use / when not to use

| Situation | Apply SOLID |
|-----------|-------------|
| Long-lived product codebase | **Yes** — guide reviews |
| One-off script | No — keep flat |
| Over-abstracting 3-table CRUD | Light S + D only |
| Multiple entrypoints (HTTP + jobs) | **S + D** strongly |

---

## 6. Step-by-step: design → implement → verify

1. Ask “what reason to change?” for new class.  
2. Split if answer contains “and”.  
3. Inject dependencies from composition root.  
4. Keep repository surface minimal for service needs.  
5. Review PR: grep controller for SQL, service for `res.json`.

---

## 7. Worked example A — this project

**S — Task update rules:** `assertCanUpdateTask` in `TaskService` encodes owner/creator vs assignee field restrictions—controller does not duplicate.

**D — Project wiring:** `ProjectServices` receives repos; does not `new ProjectRepository()` internally.

**I — Repositories split:** Auth has separate session/email/password repos instead of one 2000-line `AuthRepository` god object (segregation by aggregate/table group).

**O — Rate limits:** New limiter = new `buildLimiter` export, not editing login handler internals.

---

## 8. Worked example B — self-contained mini scenario

**Violation (S):**

```ts
class UserHandler {
  async register(req, res) {
    const hash = await bcrypt.hash(...);
    await sql`INSERT ...`;
    res.status(201).json(...);
  }
}
```

**Fix:** `AuthController` + `AuthService` + `AuthRepository`—three change reasons separated.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | SOLID break |
|--------------|-------------|
| God service 2000 lines | S, O |
| Service imports `pg` directly | D |
| Fat interface on repo | I |
| Subclass repo that throws generic Error | L |
| Subclass changes throw behavior | L |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Fix direction |
|---------|--------------|---------------|
| Every PR touches same file | S violation | Split responsibilities |
| Feature flags nested 10 deep | O violation | Strategy/policy module |
| Tests brittle | D violation | Inject fakes |
| Unused repo methods | I violation | Split port |

---

## 11. Interview Q&A (with strong answers)

**Q: Single Responsibility in APIs?**  
**A:** Separate HTTP, business rules, persistence—each changes for different reasons.

**Q: Dependency Inversion without interfaces?**  
**A:** Constructor-injected concrete repos still invert who constructs; interfaces added when needed.

**Q: Example Open/Closed?**  
**A:** Add new auth limiter or task field via extension points (schema + service method) rather than editing unrelated code paths.

**Q: Liskov in repositories?**  
**A:** Test fake must honor same pre/post conditions—e.g. `lockById` returns null when missing, not throw randomly.

**Q: SOLID vs pragmatism?**  
**A:** Principles guide structure; avoid interface explosion on tiny apps.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| SRP | One reason to change |
| OCP | Open for extension, closed for modification |
| LSP | Substitutable subtypes |
| ISP | Small interfaces |
| DIP | Depend on abstractions |
| God object | Class doing everything |

---

## 13. Teach pointer

> “SOLID is how you keep a monolith readable years later—not how you win design-pattern bingo.”

---

## 14. Optional further reading (not required)

- [layered-architecture](./layered-architecture.md) · [composition-root-di](./composition-root-di.md)  
- [hexagonal-ports-adapters](./hexagonal-ports-adapters.md)

Repo paths: `backend/src/modules/tasks/task.service.ts`, `backend/src/modules/projects/project.routes.ts`.
