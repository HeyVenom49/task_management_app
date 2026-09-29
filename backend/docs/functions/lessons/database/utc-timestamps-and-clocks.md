# Lesson: UTC timestamps and clocks

**Standalone ✓** — You do not need any other doc to store times correctly, compare OCC timestamps, and reason about JWT expiry and clock skew.

**After this file you can:** choose `TIMESTAMPTZ`, explain why task updates use `date_trunc('milliseconds', updated_at)`, relate JWT `exp` to server time, and debug “stale update” / “token expired early” symptoms.

---

## 1. First principles

A timestamp is a point on the timeline. Computers also have **clocks** that can disagree by seconds or more.

Databases should store **absolute** times (`TIMESTAMPTZ` = timestamp with time zone, stored in UTC internally in Postgres). APIs should exchange unambiguous instants (ISO-8601 with `Z` or offset). Comparisons for optimistic concurrency must use the **same precision** on both sides.

**The problem it solves:** “It worked on my laptop” timezone bugs, false OCC conflicts from microsecond vs millisecond mismatch, and auth failures from clock skew.

---

## 2. Mental model

### Analogy

Airlines publish departure in **UTC** (or with explicit offset). If one person writes “3pm” without zone, New York and London disagree. Baggage systems also truncate to minutes — comparing “to the millisecond” against a display that only shows minutes causes false mismatches.

### Diagram

```text
Postgres TIMESTAMPTZ  <── stored as UTC instant
        │
        │  NOW() on update
        ▼
tasks.updated_at  ──► JSON ISO string to client
        │
        │  client sends expectedUpdatedAt back
        ▼
UPDATE ... WHERE date_trunc('milliseconds', updated_at) = $expected
```

JWT:

```text
sign: setExpirationTime("15m")  →  exp claim (UTC seconds)
verify: jwtVerify checks exp against verifier clock
```

---

## 3. Core rules (must / must-not)

1. **MUST** use `TIMESTAMPTZ` (not naive `TIMESTAMP`) for event times in this stack.  
2. **MUST** set `updated_at = NOW()` in SQL on writes that participate in OCC.  
3. **MUST** compare OCC times at an agreed precision (`date_trunc('milliseconds', ...)` here).  
4. **MUST** send/accept ISO-8601 datetimes for `expectedUpdatedAt` (Zod `.datetime()`).  
5. **MUST NOT** store “local wall time” without zone for security-sensitive expiry.  
6. **MUST** treat JWT `exp` as authoritative on the **verifying** server’s clock.  
7. **SHOULD** keep server clocks NTP-synced; document skew tolerance for clients.

---

## 4. How it works (mechanics)

### TIMESTAMPTZ in migrations

`backend/src/db/migrations/001_initial_schema.sql` (and session/token migrations) use:

```sql
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

Sessions / verification / reset tokens: `expires_at TIMESTAMPTZ`, `revoked_at` / `used_at` nullable timestamptz.

Postgres stores timestamptz in UTC; session `TimeZone` affects **display**, not the absolute instant.

### OCC truncate (real)

`backend/src/modules/tasks/task.repository.ts` `update`:

```sql
UPDATE tasks
SET ..., updated_at = NOW()
WHERE id = $taskId
  AND date_trunc('milliseconds', updated_at) = $expectedUpdatedAt
RETURNING ...
```

**Why truncate?** JS `Date` / JSON often have millisecond precision. Postgres `timestamptz` can carry microseconds. Comparing raw values makes “unchanged” updates look stale forever.

Zod side (`task.schema.ts`):

```ts
expectedUpdatedAt: z.string().datetime()
```

### JWT expiry

`backend/src/shared/auth/token.ts` uses `jose`:

```ts
new SignJWT(payload)
  .setIssuedAt()
  .setExpirationTime(env.jwtExpiresIn) // e.g. "15m"
  .sign(secret);
```

`jwtVerify` rejects expired tokens. Env default `JWT_EXPIRES_IN=15m` (`backend/src/config/env.ts`). Refresh tokens use DB `expires_at` timestamptz, not JWT exp.

### Clock skew

| Skew | Effect |
|------|--------|
| Client clock ahead | May think token still valid while server rejects; or send future `expectedUpdatedAt` |
| Client clock behind | May refresh early; usually OK |
| DB vs app host skew | Rare if same machine/Docker; bad if DB NOW() and app `Date` mixed carelessly |

Prefer **DB `NOW()`** for row timestamps; prefer **library verify** for JWT.

---

## 5. When to use / when not to use

| Situation | Approach |
|-----------|----------|
| Created/updated/expiry columns | `TIMESTAMPTZ` + `NOW()` |
| Optimistic concurrency token | Copy of `updated_at` (truncated) or version int |
| Display to humans | Convert to locale in UI — store UTC |
| “Business date” only (no time) | `DATE` type — different concept |
| Scheduling across zones | Store UTC instant + separate timezone id if needed |

---

## 6. Step-by-step: design → implement → verify

### Design

1. List every time field: event vs interval vs civil date.  
2. Choose timestamptz for instants.  
3. For OCC: version column **or** `updated_at` with defined precision.  
4. For tokens: short JWT exp + longer refresh row expiry.

### Implement

1. Migration: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`.  
2. Updates: set `updated_at = NOW()` in SQL.  
3. OCC predicate with `date_trunc` if using timestamps.  
4. API: ISO strings; Zod datetime validation.

### Verify

1. Insert row; `SELECT updated_at AT TIME ZONE 'UTC'`.  
2. PATCH with correct `expectedUpdatedAt` → 200; replay stale → 409.  
3. Wait for JWT TTL → 401; refresh still works until session expiry.  
4. Force wrong precision (omit trunc) in a spike branch — see false 409s.

---

## 7. Worked example A — this project

### A1. Schema

Users, projects, members, tasks all carry `created_at` / `updated_at` timestamptz in `001_initial_schema.sql`.

### A2. Task OCC round-trip

1. Create task → response includes `updatedAt`.  
2. Client PATCHes with `expectedUpdatedAt` equal to that value (ISO string).  
3. Repository compares truncated DB value to `new Date(input.expectedUpdatedAt)`.  
4. Success bumps `updated_at = NOW()`; concurrent writer causes 409 via service `ConflictError`.

**Where:** `task.repository.ts`, `task.service.ts`, `task.schema.ts`.

### A3. Access token TTL

Login calls `signAccessToken`; after `JWT_EXPIRES_IN`, `verifyAccessToken` fails → auth middleware → 401. Refresh uses session row `expires_at` timestamptz.

**Where:** `backend/src/shared/auth/token.ts`, auth refresh in `auth.service.ts`.

---

## 8. Worked example B — mini scenario (self-contained)

**Bug:** Store `TIMESTAMP` (no tz) as `"2026-09-29 15:00:00"` from a server in IST. Replica in UTC reads it as UTC → 5.5h shift → “meeting already started.”

**Fix:**

```sql
ALTER TABLE events
  ALTER COLUMN starts_at TYPE TIMESTAMPTZ
  USING starts_at AT TIME ZONE 'Asia/Kolkata';
```

**OCC mini:**

```sql
-- bad: false conflicts
WHERE updated_at = $1

-- good: align precision
WHERE date_trunc('milliseconds', updated_at) = $1
-- or use integer version column instead
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| `TIMESTAMP` without time zone | Ambiguous instants across hosts |
| Compare full timestamptz to JS Date blindly | Spurious OCC conflicts |
| Client generates `updated_at` | Clock skew / spoofing |
| Store JWT exp only in local memory | No source of truth; use `exp` claim |
| Display UTC strings as “local” without conversion | Users misread deadlines |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Every PATCH 409 | Precision mismatch; client sending wrong field | DB `updated_at` vs body; `date_trunc` present? | Truncate or use version int |
| Token dies immediately | Skew / wrong `JWT_EXPIRES_IN` / bad secret rotate | env; server time `date -u` | Sync NTP; fix env |
| Expiry “tomorrow” wrong | TIMESTAMP interpreted as UTC vs local | Column type; insert path | TIMESTAMPTZ + UTC discipline |
| Refresh works, access never | Access TTL too short for client skew handling | Client refresh logic | Refresh on 401; small clock tolerance if added |

---

## 11. Interview Q&A (with strong answers)

**Q: TIMESTAMPTZ vs TIMESTAMP?**  
**A:** Timestamptz stores an absolute instant (UTC). Timestamp without time zone is a wall-clock tuple that changes meaning if session timezone changes.

**Q: Why `date_trunc('milliseconds', updated_at)`?**  
**A:** To match the precision typically available after JSON/JS Date round-trips so OCC comparisons don’t fail on leftover microseconds.

**Q: Who owns `NOW()`?**  
**A:** Prefer the database for row timestamps so all writers share one clock domain.

**Q: What is clock skew?**  
**A:** Difference between two clocks. It breaks naïve expiry and client-side assumptions; servers should verify tokens against their own time.

**Q: ISO-8601 role?**  
**A:** Portable string form of an instant (`...Z` or offset) for APIs; Zod `.datetime()` validates shape.

**Q: Version column vs updated_at OCC?**  
**A:** Integer versions avoid precision issues; `updated_at` doubles as audit — this app chose truncated `updated_at`.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| UTC | Coordinated Universal Time — reference timeline |
| TIMESTAMPTZ | Postgres timestamptz — absolute instant |
| OCC | Optimistic concurrency control |
| `date_trunc` | Postgres truncate time to a precision |
| `exp` | JWT expiration claim |
| Clock skew | Disagreement between clocks |
| ISO-8601 | Standard datetime string formats |

---

## 13. Teach pointer

> “Store instants, agree on precision, trust one clock per decision.”

---

## 14. Optional further reading (not required)

- OCC: [optimistic-concurrency.md](./optimistic-concurrency.md)  
- Migrations: [migrations.md](./migrations.md)  
- Auth tokens: [../security/refresh-rotation-and-reuse.md](../security/refresh-rotation-and-reuse.md)

Repo paths: `backend/src/db/migrations/001_initial_schema.sql`, `004_create_sessions.sql`, `backend/src/modules/tasks/task.repository.ts`, `task.schema.ts`, `backend/src/shared/auth/token.ts`.
