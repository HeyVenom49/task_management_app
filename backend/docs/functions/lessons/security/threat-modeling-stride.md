# Lesson: Threat modeling with STRIDE

**Standalone ✓** — You do not need any other doc to run a lightweight STRIDE pass on a feature or API.

**After this file you can:** name STRIDE categories, map threats to this task app, pick mitigations already in the codebase, document assumptions, and interview on threat modeling without formal tools.

---

## 1. First principles

**Threat modeling** asks: *What can go wrong? Who cares? What are we going to do about it?* before or while building.

**STRIDE** is a mnemonic for common threat classes on **components and data flows**:

| Letter | Threat |
|--------|--------|
| **S** | Spoofing identity |
| **T** | Tampering with data |
| **R** | Repudiation |
| **I** | Information disclosure |
| **D** | Denial of service |
| **E** | Elevation of privilege |

**Problem it removes:** Shipping features and only discovering IDOR or session theft in production.

---

## 2. Mental model

### Analogy

Before opening a store, walk the floor as a thief, vandal, and competitor — not only as the owner.

### Diagram (simplified data flow)

```text
[Browser] --HTTPS--> [API Express]
                         │
            authenticate / rate limit / validate
                         │
                    [Services authz]
                         │
                    [Postgres + Redis]
```

Apply STRIDE per arrow and box.

---

## 3. Core rules (must / must-not)

1. **MUST** model per **feature** or user journey, not once per decade.  
2. **MUST** tie each threat to a **mitigation** or accepted risk.  
3. **MUST NOT** treat “we use JWT” as full Spoofing coverage without refresh/cookie threats.  
4. **SHOULD** update model when adding endpoints (webhooks, file upload, etc.).  
5. **MUST** include insider/abuse cases (mass assignment, IDOR).

---

## 4. How it works (mechanics)

### STRIDE on this app (examples)

| Threat | Example | Mitigation in repo |
|--------|---------|-------------------|
| **S** | Forge JWT | HS256 + secret in env; short access TTL |
| **S** | Steal refresh | httpOnly cookie, rotation, reuse revoke-all |
| **T** | Change task without permission | Membership + field rules + transactions |
| **R** | User denies delete | Audit logging limited today — structured logs with requestId |
| **I** | Read other project | IDOR checks, 403/404 strategy |
| **I** | Email enumeration | Generic login, silent forgot |
| **D** | Login flood | loginLimiter, fail-closed Redis |
| **D** | Huge JSON body | 100kb limit |
| **E** | Set role via body | Zod allowlist, no role on register |
| **E** | Assignee edits title | assertCanUpdateTask |

### Process (lightweight)

1. Draw DFD for feature.  
2. For each element, brainstorm STRIDE.  
3. Rank by likelihood × impact.  
4. Implement/test top items.

---

## 5. When to use / when not to use

| STRIDE workshop | Ad-hoc review |
|-----------------|---------------|
| New auth, payments, PII | One-line typo fix |

| Formal tools (Microsoft TMT) | Whiteboard |
|------------------------------|------------|
| Regulated environments | Small teams OK |

---

## 6. Step-by-step: design → implement → verify

1. Scope: e.g. “refresh token flow.”  
2. List assets: users, tasks, sessions.  
3. STRIDE each step.  
4. Map to existing controls or backlog.  
5. Add test proving mitigation (e.g. `tasks.idor.test.ts`).

---

## 7. Worked example A — this project

**Feature:** `POST /projects/:id/tasks`

| STRIDE | Concern | Control |
|--------|---------|---------|
| S | Anonymous create | `authenticate` on router |
| T | Cross-project task | `requireActiveMemberLocked` + `projectId` in path |
| I | List others’ tasks | `list` after membership check |
| E | Assignee from other project | `assertAssigneeInProject` |
| D | Spam creates | (future) per-user rate limit |

**Paths:** `backend/src/modules/tasks/task.routes.ts`, `task.service.ts`, `backend/src/shared/middleware/authenticate.ts`.

---

## 8. Worked example B — mini scenario (self-contained)

**Webhook receiver (not in app yet)**

| STRIDE | Threat | Mitigation |
|--------|--------|------------|
| S | Fake webhook | HMAC signature with shared secret |
| T | Replay | Timestamp + nonce store |
| I | Log payload secrets | Redact in logs |

Design before coding endpoint.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Result |
|--------------|--------|
| Checklist once, never update | New IDOR |
| Only external attackers | Insider mass assignment |
| Threat model without tests | Paper security |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Repeated IDOR bugs | No authz in model | PR template STRIDE row | Service checks |
| Session theft | Spoofing not mitigated | Cookie flags, rotation | refresh lesson |
| No audit trail | Repudiation gap | requestId in logs | Extend audit logging |

---

## 11. Interview Q&A (with strong answers)

**Q: What is STRIDE?**  
**A:** A categorization of threats: Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege.

**Q: Example Spoofing in API?**  
**A:** Attacker presents forged or stolen credentials — mitigated by strong authn, TLS, httpOnly refresh, JWT verification.

**Q: Why threat model if you have code review?**  
**A:** Review finds bugs; modeling systematically asks what you might forget (IDOR, enumeration, abuse).

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| STRIDE | Six threat categories mnemonic |
| DFD | Data flow diagram |
| Threat | Potential attack |
| Mitigation | Control reducing risk |
| Trust boundary | Where data crosses trust levels |

---

## 13. Teach pointer

> “Name the bad thing before the bad thing names you.”

---

## 14. Optional further reading (not required)

- Defense layers: [defense-in-depth](./defense-in-depth.md)  
- IDOR: [idor](./idor.md)
