# Lesson: Audit logging

**Standalone ✓** — You do not need any other doc to design tamper-evident records of security-relevant actions.

**After this file you can:** distinguish audit logs from debug logs, choose what to log for auth and admin events, correlate with request IDs, avoid logging secrets, and plan upgrades for this app’s pino setup.

---

## 1. First principles

**Audit logs** answer: *Who did what, to which resource, when, from where, and did it succeed?* — for security, compliance, and incident response.

They differ from **debug logs** (verbose, developer-focused). Audit events should be **structured**, **immutable** (append-only store in mature systems), and **free of secrets**.

**Problem it removes:** “Someone deleted all tasks — we have no idea who.”

---

## 2. Mental model

### Analogy

Cash register tape: each sale recorded with cashier id and timestamp — not the same as kitchen debug prints.

### Diagram

```text
Request ──► requestId middleware ──► handler ──► business action
                      │                              │
                      └──────── audit event ──────────┘
                              (actor, action, target, outcome)
```

---

## 3. Core rules (must / must-not)

1. **MUST** log security events: login failure/success (careful), password change, role change, member remove.  
2. **MUST** include correlation id (`requestId`).  
3. **MUST NOT** log passwords, raw tokens, or full JWT.  
4. **MUST NOT** rely on audit in client browser only.  
5. **SHOULD** log actor user id from `req.user`, not client-supplied id.  
6. **SHOULD** separate audit sink from noisy debug in production.

---

## 4. How it works (mechanics)

### Current repo baseline

- `requestId` middleware assigns/propagates id.  
- `requestLogger` logs HTTP metadata via pino.  
- `logger` in `backend/src/shared/logger/logger.ts` — level silent in test.

**Gap (honest):** dedicated immutable audit table/stream is not fully implemented — lesson describes target state + what exists.

### What to add (design)

```ts
audit.log({
  requestId: req.requestId,
  actorUserId: req.user?.id,
  action: "project.member.remove",
  targetProjectId: projectId,
  targetUserId: removedUserId,
  outcome: "success",
});
```

Emit on successful mutations in services (authoritative).

---

## 5. When to use / when not to use

| Audit log | Debug log |
|-----------|-----------|
| Password reset, delete project | Variable dumps |
| Permission denied (sampled) | Every SELECT |

| Full PII in audit | Pseudonym id |
|-------------------|----------------|
| Legal need | Minimize retention |

---

## 6. Step-by-step: design → implement → verify

1. List auditable actions for product.  
2. Schema fields: time, actor, action, resource, outcome, requestId, ip (if policy allows).  
3. Hook in service after success (and optional denial sampling).  
4. Redact secrets in logger config.  
5. Test: action produces one audit row/event.

---

## 7. Worked example A — this project

### A1. Request correlation

```ts
// requestId middleware attaches id used across logs
```

**Where:** `backend/src/shared/middleware/requestId.ts`, used in `backend/src/app.ts` before `requestLogger`.

### A2. Structured logger

```ts
export const logger = pino({
  level: env.nodeEnv === "test" ? "silent" : "info",
  ...
});
```

**Where:** `backend/src/shared/logger/logger.ts`.

### A3. Auth events (service-level hook point)

Password change revokes all sessions — auditable action:

```ts
await this.repo.updatePassword(user.id, passwordHash);
await this.sessionRepo.revokeAllForUser(user.id);
```

**Where:** `backend/src/modules/auth/auth.service.ts` — `changePassword` / `resetPassword` (add explicit audit call here in future).

### A4. Do not log tokens

Non-prod only:

```ts
if (process.env.NODE_ENV !== "production") {
  console.log(`Verify token for ${user.email}: ${rawToken}`);
}
```

Production must not log raw tokens — pattern to avoid in audit.

---

## 8. Worked example B — mini scenario (self-contained)

**Append-only audit table**

```sql
CREATE TABLE audit_events (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  metadata JSONB,
  request_id TEXT
);
```

Application role: INSERT only, no UPDATE/DELETE.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Problem |
|--------------|---------|
| Log refresh token | Credential leak |
| Client-only analytics | Tampered |
| Log only failures | Missing success trail |
| Same logger no structure | Hard to query |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Cannot trace incident | No requestId | Headers/logs | Enable middleware |
| Logs contain secrets | Debug in auth path | grep production | Redact |
| Too noisy | All 403 logged | Sampling policy | Audit successes on mutations |

---

## 11. Interview Q&A (with strong answers)

**Q: Audit log vs application log?**  
**A:** Audit is security/compliance focused, structured, retention-policy driven; app logs are operational debugging.

**Q: What auth events to audit?**  
**A:** Login outcomes (without password), password change, session revoke-all, role/membership changes, failed admin attempts.

**Q: Where emit audit — controller or service?**  
**A:** Service after business success so all entry paths covered.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Audit trail | Chronological security record |
| Correlation id | Links logs for one request |
| Append-only | No in-place edits to history |
| Repudiation | Denying an action — audit counters |

---

## 13. Teach pointer

> “Debug logs help you fix bugs; audit logs help you fix trust.”

---

## 14. Optional further reading (not required)

- STRIDE Repudiation: [threat-modeling-stride](./threat-modeling-stride.md)  
- PII in logs: [pii-gdpr-basics](./pii-gdpr-basics.md)
