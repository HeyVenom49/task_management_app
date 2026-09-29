# Lesson: PII and GDPR basics

**Standalone ✓** — You do not need any other doc to recognize personal data in this API, apply minimization, and handle retention/deletion concepts.

**After this file you can:** define PII/personal data, map fields in this app, minimize logs and responses, explain lawful bases at a high level, and interview on erasure vs anonymization.

---

## 1. First principles

**PII (personally identifiable information)** is data that identifies or can identify a natural person — alone or combined (name, email, IP in some contexts).

**GDPR** (EU) governs processing of personal data: lawfulness, purpose limitation, minimization, accuracy, storage limitation, security, accountability.

Even non-EU products often adopt similar practices for trust and customer contracts.

**Problem it removes:** Collecting and leaking more personal data than needed — regulatory and breach harm.

---

## 2. Mental model

### Analogy

Medical forms: collect only what the appointment needs; lock the cabinet; shred when retention period ends.

### Diagram

```text
Client ──► API collects { name, email, ... }
              │
              ├── store in Postgres (users)
              ├── logs (must minimize)
              └── email provider (processor) — future
```

---

## 3. Core rules (must / must-not)

1. **MUST** know which fields are personal data in your schema.  
2. **MUST** minimize data in API responses (`PublicUser` shapes).  
3. **MUST NOT** log emails/passwords/tokens unnecessarily.  
4. **MUST** secure data at rest/transit (TLS, access control).  
5. **SHOULD** support account deletion/export when product requires (design ahead).  
6. **MUST** have legal basis for processing (contract, consent, etc.) — product/legal owns wording.

---

## 4. How it works (mechanics)

### Personal data in this app

| Field | Table / location | Notes |
|-------|------------------|-------|
| `name`, `email` | `users` | Core identity |
| Password hash | `users.hash_password` | Not PII but sensitive |
| Task title/description | `tasks` | May contain personal content |
| IP (if logged) | HTTP logs | PII in GDPR view — avoid or shorten retention |

### Minimization examples

- Register returns user without password hash.  
- Auth errors generic on login.  
- Non-prod token logs gated by `NODE_ENV`.

### Data subject rights (overview)

- **Access/export:** provide copy of user data.  
- **Erasure:** delete or anonymize — watch FK constraints (projects, tasks).  
- **Rectification:** profile update endpoints.

Implementation is product/legal — backend needs **designed** delete cascade or anonymize jobs.

---

## 5. When to use / when not to use

| Collect field | Skip field |
|---------------|------------|
| Needed for feature | “Nice to have” marketing |
| Has retention policy | Forever logs of email |

| Pseudonymize analytics | Raw email in events |
|------------------------|---------------------|

---

## 6. Step-by-step: design → implement → verify

1. Data inventory (tables, logs, backups).  
2. Mark sensitive columns in docs/runbooks.  
3. Redact logs; structured logging without bodies on auth.  
4. Plan deletion API + cascade rules.  
5. DPA with processors (email, hosting).

---

## 7. Worked example A — this project

### A1. Public user shape (no hash)

Login/register return user fields from service mapping — not `hashPassword`.

### A2. Email normalization

```ts
email: z.email().trim().toLowerCase(),
```

**Where:** `backend/src/modules/auth/auth.schema.ts` — consistency for subject access requests.

### A3. Avoid production token logging

```ts
if (process.env.NODE_ENV !== "production") {
  console.log(`Verify token for ${user.email}: ${rawToken}`);
}
```

**Where:** `backend/src/modules/auth/auth.service.ts` — PII + secret in dev only.

### A4. Access control on personal task content

```ts
await this.requireActiveMember(userId, projectId);
```

**Where:** `backend/src/modules/tasks/task.service.ts` — other users must not read tasks (personal/business content).

---

## 8. Worked example B — mini scenario (self-contained)

**Account erasure job**

```ts
async function eraseUser(userId: string) {
  await sql.begin(async (tx) => {
    await tx`DELETE FROM sessions WHERE user_id = ${userId}`;
    await tx`UPDATE tasks SET title = 'deleted', description = NULL WHERE creator ...`;
    await tx`UPDATE users SET email = ${anonEmail(userId)}, name = 'Deleted', ... WHERE id = ${userId}`;
  });
}
```

Choose delete vs anonymize per legal advice.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Risk |
|--------------|------|
| Full request body in logs | PII leak |
| Retain deleted user rows with email | Erasure failure |
| Send GDPR export to unauthenticated endpoint | Disclosure |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| PII in Sentry | Error middleware attaches body | Scrubbing config | Redact keys |
| Cannot delete user | FK blocks | Migrations | ON DELETE plan |
| Duplicate subject requests | No export API | Backlog | Implement export |

---

## 11. Interview Q&A (with strong answers)

**Q: PII vs sensitive data?**  
**A:** PII identifies a person; sensitive data (health, biometrics) gets stricter rules; password hashes are sensitive security data.

**Q: GDPR minimization in API design?**  
**A:** Return only fields clients need; avoid logging identifiers; document retention.

**Q: Erasure vs anonymization?**  
**A:** Erasure removes or irreversibly de-identifies so person is no longer identifiable; anonymization may keep statistics without linking to person.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| PII | Personally identifiable information |
| Data subject | Identified or identifiable person |
| Processor | Third party processing on your behalf |
| Minimization | Collect/process only what’s needed |
| DPA | Data processing agreement |

---

## 13. Teach pointer

> “If you don’t need the data to run the feature, don’t store it — and never spill it into logs.”

---

## 14. Optional further reading (not required)

- Audit logs: [audit-logging](./audit-logging.md)  
- Secrets: [secrets-management](./secrets-management.md)
