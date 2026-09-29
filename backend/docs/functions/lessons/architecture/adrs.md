# Lesson: ADRs (Architecture Decision Records)

**Standalone ✓** — How to capture and use architecture decisions, with examples from this backend’s implied choices.

**After this file you can:** write an ADR, know when one is worth it, supersede decisions safely, and interview on institutional memory.

---

## 1. First principles

An **Architecture Decision Record (ADR)** is a short, version-controlled document capturing **context**, **decision**, and **consequences** for a significant technical choice.

The problem it solves: six months later nobody remembers *why* refresh tokens live in Postgres, why Redis failure returns 503 on login, or why tasks nest under projects in URLs. Without ADRs, teams re-debate or rewrite working systems.

ADRs are not specs—they are **decision history** with a status (Proposed, Accepted, Deprecated, Superseded).

---

## 2. Mental model

### Analogy

Flight logbook entries: not the airplane manual, but “why we diverted to Denver” so the next crew does not assume incompetence.

### Diagram

```text
  Problem/context ──► Decision ──► Consequences (+/−)
        │                │              │
        └──────── stored in git next to code ────────┘
              ADR-001-refresh-in-db.md
              ADR-002-fail-closed-redis.md
```

---

## 3. Core rules (must / must-not)

1. **MUST** keep ADRs short (1–2 pages max).  
2. **MUST** record **alternatives considered**, not only the winner.  
3. **MUST** date and status each ADR.  
4. **MUST NOT** rewrite old ADRs in place when reversing—**supersede** with new ADR linking old.  
5. **SHOULD** write ADR when cost of reversal is high (auth, data model, public API).  
6. **SHOULD NOT** ADR every library patch—noise kills usefulness.

---

## 4. How it works (mechanics)

**Typical template:**

```markdown
# ADR-003: Fail-closed rate limiting when Redis unavailable

Status: Accepted
Date: 2026-03-01

## Context
Auth endpoints need distributed rate limits across API replicas. Redis is the shared store.

## Decision
If Redis is unreachable, reject auth writes/logins with 503 (ServiceUnavailableError), not passthrough.

## Consequences
+ Consistent security posture; no burst through limits when Redis down.
− Availability coupling: Redis outage blocks login (acceptable vs open attack window).

## Alternatives
- Fail-open: rejected (abuse risk).
- In-memory limits: rejected (per-replica multiplier).
```

**Location:** `docs/adr/` or `backend/docs/adr/`—this repo currently uses lessons + function docs as informal ADRs; formal folder is a good next step.

---

## 5. When to use / when not to use

| Situation | Write ADR? |
|-----------|------------|
| Choose refresh rotation in DB | **Yes** |
| Pick Zod over Joi | Optional (reversible) |
| Nested task routes under projects | **Yes** (API contract) |
| Rename internal private method | No |
| Multi-tenant strategy | **Yes** |
| Fix typo in README | No |

---

## 6. Step-by-step: design → implement → verify

1. Trigger: irreversible or expensive debate.  
2. Draft context (constraints, threats, scale).  
3. List 2–3 options with pros/cons.  
4. Record decision + consequences.  
5. PR ADR with implementing code.  
6. Link ADR number in commit message optional.  
7. When reversing, new ADR “Supersedes ADR-003”.

---

## 7. Worked example A — this project (decisions worth ADRs)

| Implied decision | Where visible | ADR candidate title |
|------------------|---------------|---------------------|
| Refresh sessions in Postgres with rotation | `SessionRepository`, `AuthService.refresh` | ADR: Server-side refresh rotation |
| Fail-closed Redis rate limits | `shared/auth/rate-limit.ts` | ADR: Fail-closed rate limiting |
| Modular monolith modules | `src/modules/*` | ADR: Module boundaries auth/projects/tasks |
| Tasks scoped by project membership | `TaskService`, nested routes | ADR: Task authz via membership locks |
| Email as console in dev | auth register flow | ADR: Email delivery deferred; outbox planned |

Even without files, these are **ADR-shaped** lessons—formalizing prevents drift.

---

## 8. Worked example B — self-contained mini scenario

**ADR-007: Use UUID v7 for primary keys**

Context: need time-sortable IDs for indexes.  
Decision: UUID v7 in app layer.  
Consequences: + better index locality; − need generator discipline.  
Alternatives: serial ints (merge pain across services), UUID v4 (random insert hotspots).

Future reader knows why migrations look that way.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Decisions only in Slack | Lost when people leave |
| Wiki outside git | Drifts from code |
| Editing old ADR silently | History lie |
| 40-page ADR | Nobody reads |
| ADR without implementation | Fantasy architecture |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| “Why is it like this?” loops | No ADR | Write ADR at next touch |
| Conflicting docs | Superseded ADR not marked | Status + link chain |
| Fear changing system | Unknown consequences | ADR consequences section |
| ADRs ignored | Too many trivial ADRs | Raise bar to significant |

---

## 11. Interview Q&A (with strong answers)

**Q: What’s in an ADR?**  
**A:** Context, decision, consequences, often alternatives and status—short permanent record.

**Q: When to write one?**  
**A:** Significant, hard-to-reverse choices affecting security, data, APIs, or org boundaries.

**Q: Superseding ADRs?**  
**A:** New ADR with status Supersedes ADR-N; keep old for history.

**Q: ADR vs design doc?**  
**A:** Design doc describes system; ADR records a **choice** among options.

**Q: Example from auth?**  
**A:** Storing refresh token hashes server-side enables rotation and reuse detection—document why not pure stateless JWT refresh.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| ADR | Architecture Decision Record |
| Status | Proposed / Accepted / Deprecated / Superseded |
| Consequences | Tradeoffs after decision |
| Supersede | Replace decision formally |
| Institutional memory | Team knowledge persisting beyond people |

---

## 13. Teach pointer

> “If future you will ask why, write an ADR while you still remember why.”

---

## 14. Optional further reading (not required)

- [modular-monolith](./modular-monolith.md) · [stateless-services](./stateless-services.md)  
- [../security/fail-closed-rate-limits.md](../security/fail-closed-rate-limits.md)

Suggested repo addition: `backend/docs/adr/README.md` with index.
