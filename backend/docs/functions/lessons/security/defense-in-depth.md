# Lesson: Defense in depth

**Standalone ✓** — You do not need any other doc to layer security controls so single failures do not become breaches.

**After this file you can:** explain layered defenses, map this API’s layers (validation, authn, authz, DB constraints, rate limits), prioritize controls, and interview on “one control failed — then what?”

---

## 1. First principles

**Defense in depth** stacks **independent** controls so no single bug, misconfig, or stolen credential owns the whole system.

If middleware auth is wrong, service authz still blocks. If authz misses, DB CHECK/FK may still reject. If injection slips, parameterization still binds.

**Problem it removes:** “We have JWT, we’re secure.”

---

## 2. Mental model

### Analogy

Castle: moat, wall, gate, guards, treasure locked in vault. Climbing one wall should not empty the treasury.

### Diagram (this API request)

```text
Edge: TLS (deployment), CORS, body size limit
  │
Middleware: requestId, rate limits (auth), authenticate (JWT)
  │
Controller: Zod parse
  │
Service: membership, field rules, transactions
  │
Repository: parameterized SQL
  │
Database: UNIQUE, FK, CHECK (assignee in project)
```

---

## 3. Core rules (must / must-not)

1. **MUST** not rely on one layer (UI hiding, UUID, JWT alone).  
2. **MUST** enforce invariants at the lowest practical layer (DB constraints for laws).  
3. **MUST** validate at boundary **and** enforce authz in domain.  
4. **MUST NOT** skip service checks because “route is obscure.”  
5. **SHOULD** monitor and rate-limit abuse paths.

---

## 4. How it works (mechanics)

### Layers in this repo (concrete)

| Layer | Example |
|-------|---------|
| Transport | HTTPS in prod (`COOKIE_SECURE`) |
| HTTP limits | `express.json({ limit: "100kb" })` |
| Abuse | `loginLimiter`, fail-closed Redis |
| Authn | `authenticate` + JWT verify |
| Input | Zod schemas per route |
| Authz | `requireActiveMember`, task parent match |
| Field authz | `assertCanUpdateTask` |
| Crypto | Argon2, hashed refresh tokens |
| DB | Migrations with FK/CHECK on assignee |

Failure of **one** layer should be contained by others.

---

## 5. When to use / when not to use

| Add layer | Skip redundant layer |
|-----------|----------------------|
| New invariant | Exact duplicate check with no new guarantee |
| High-value ops | Over-engineering on static health OK |

---

## 6. Step-by-step: design → implement → verify

1. Threat sketch (STRIDE — optional lesson).  
2. List invariant for feature.  
3. Assign: validation, authz, transaction, constraint.  
4. Test negative paths per layer.  
5. Red-team: “If I remove check X, what breaks?”

---

## 7. Worked example A — this project

**Task assignee IDOR + invalid member**

1. Zod ensures UUID shape on input.  
2. `requireActiveMemberLocked` in transaction.  
3. `assertAssigneeInProject` checks project + ACTIVE.  
4. DB CHECK/trigger (migration `010_member_assignee_invariants`) rejects invalid assignee if app regresses.

**Files:** `backend/src/modules/tasks/task.service.ts`, `backend/src/app.ts` (JSON limit), `backend/src/shared/middleware/authenticate.ts`, `backend/src/shared/auth/rate-limit.ts`.

---

## 8. Worked example B — mini scenario (self-contained)

**Withdraw money**

App balance check + DB `CHECK (balance >= 0)` + row `FOR UPDATE` in transaction. Three layers against double spend.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Single point of failure |
|--------------|-------------------------|
| “Frontend validates email” | Direct API |
| Only DB constraint, no authz | Leak existence |
| Security only in WAF | Origin still vulnerable |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Bad data in DB | Missing constraint | Migrations | Add CHECK/FK |
| 200 IDOR | Missing service check | Tests | authz |
| Auth works, abuse high | No rate limit | Redis limiters | Enable login limit |

---

## 11. Interview Q&A (with strong answers)

**Q: What is defense in depth?**  
**A:** Multiple independent security controls so one failure does not fully compromise the system.

**Q: Example in REST API?**  
**A:** JWT authn + project membership authz + SQL parameterization + DB foreign keys.

**Q: Does depth replace threat modeling?**  
**A:** No — depth implements mitigations; modeling finds what to mitigate.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Defense in depth | Layered controls |
| Invariant | Rule that must always hold |
| Boundary validation | Input check at API edge |
| Backstop | DB constraint when app bugs |

---

## 13. Teach pointer

> “Assume every layer will fail once — design so ‘once’ is not game over.”

---

## 14. Optional further reading (not required)

- STRIDE: [threat-modeling-stride](./threat-modeling-stride.md)  
- IDOR: [idor](./idor.md)
