# Lesson: Testing as proof (not decoration)

**Standalone ✓** — You do not need any other doc to design tests that catch real lies in this API.

**After this file you can:** write property-first tests, use the test harness correctly, name gaps honestly, and interview on integration vs mocks for authz.

---

## 1. First principles

A test is a **proof** of a property: security rule, concurrency invariant, or safe failure behavior — not a checkbox for coverage percent.

**The problem it solves:** High coverage with zero IDOR tests; mocked DB that always authorizes; races that pass because tests serialize requests.

---

## 2. Mental model

### Analogy

Security guard drill: prove the door **stays locked** when someone tries Bob’s key on Alice’s room — not prove you painted the door.

### Diagram

```text
Property: "Alice cannot GET Bob's project"
    │
    ├── seed Alice + Bob (fixtures)
    ├── HTTP GET with Alice token + Bob id
    └── assert 403/404 (never 200 with Bob data)
```

---

## 3. Core rules (must / must-not)

1. **MUST** name files/tests after the **property or threat**.  
2. **MUST** use **real HTTP + real DB** for authz and races in this codebase.  
3. **MUST NOT** assert arbitrary race “winners” — assert **safety invariants** after parallel work.  
4. **MUST** `resetDb()` between cases for isolation.  
5. **SHOULD** document **known gaps** (senior honesty).

---

## 4. How it works (mechanics)

**preload.ts** sets `NODE_ENV=test` and defaults **before** `env.ts` imports — rate limiters passthrough, JWT defaults exist.

**supertest** `api()` hits `app` without `server.listen`.

**registerVerifiedUser:** HTTP register + SQL activate user (speed) — tradeoff vs full verify-email flow.

**Parallel tests:** `Promise.all` for concurrency; final state must satisfy invariant.

---

## 5. When to use / when not to use

| Goal | Approach |
|------|----------|
| Prove IDOR | `tasks.idor.test.ts` pattern |
| Prove error leak | `failures.test.ts` |
| Prove parser | unit test |
| Prove button layout | frontend E2E |

---

## 6. Step-by-step: design → implement → verify

1. Write: “Test fails if …”  
2. Pick black-box API test.  
3. Add fixture (`seedAliceBobProjects`).  
4. Implement minimal assertion on status/body.  
5. Run CI with Postgres; fix flakes with invariant assertions.

---

## 7. Worked example A — this project

**preload env (earliest harness):**

```1:11:backend/src/test/preload.ts
process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/task_management";
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? "test-secret-at-least-16-chars";
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "15m";
process.env.REFRESH_EXPIRES_IN = process.env.REFRESH_EXPIRES_IN ?? "7d";
process.env.FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";
process.env.COOKIE_SECURE = "false";
```

**Properties proved (file → property):**

| File | Property |
|------|----------|
| `auth.api.test.ts` | Happy auth; anonymous protected routes → 401 |
| `failures.test.ts` | No stack/internal leak on 404/bad JWT |
| `tasks.idor.test.ts` | Cross-user/project access denied |
| `tasks.authz.test.ts` | Field-level PATCH authorization matrix |
| `members.removal.test.ts` | Open-task rule + removal/assign race invariant |
| `concurrency.test.ts` | Unique register, refresh single-winner, ownership races |

**Helpers:** `resetDb`, `registerVerifiedUser`, `seedAliceBobProjects`, `api()`, `authHeader`.

**Known gaps (document, don’t hide):** full verify-email HTTP path; cookie refresh E2E; automated Redis fail-closed test; exhaustive parallel PATCH OCC — candidates for future proofs.

---

## 8. Worked example B — mini scenario (self-contained)

Before shipping `DELETE /projects/:id`:

```ts
// Property: non-owner DELETE → 403
const { alice, bobProject } = await seedAliceBobProjects();
await api()
  .delete(`/api/v1/projects/${bobProject.id}`)
  .set(authHeader(alice.accessToken))
  .expect(403);
```

If this test doesn’t exist, IDOR deletion can ship with green CI.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Result |
|--------------|--------|
| Mock repo returns authorized | False green |
| Coverage % goal only | Missing threats |
| Race test picks “request 2 wins” | Brittle |
| Shared DB no truncate | Order-dependent flakes |
| SQL activate only, never test token | Miss verify bugs |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Flaky concurrency | timing assertion | final DB state | invariant after all settle |
| 401 unexpected | missing preload | NODE_ENV test | preload hook |
| Tests hit prod DB | env | DATABASE_URL | CI guard |
| Pass locally fail CI | no Postgres service | pipeline | service container |
| Parallel workers clash | shared truncate | worker isolation | single worker or separate DB |

---

## 11. Interview Q&A (with strong answers)

**Q: Why truncate between tests?**  
**A:** Deterministic empty world; tests don’t depend on order; `TRUNCATE ... CASCADE` resets related rows fast.

**Q: Why preload env?**  
**A:** Zod env parse runs at import — tests must set vars before modules load; defaults avoid missing JWT/DB URL crashes.

**Q: Why Alice/Bob fixtures?**  
**A:** Minimal two-user narrative for IDOR — two principals, two projects, clear cross-access attempts.

**Q: Integration vs unit for authz?**  
**A:** Authz is composition of middleware, service, SQL — integration proves the real path; unit mocks hide IDOR.

**Q: Why invariants under Promise.all?**  
**A:** Schedulers pick winners nondeterministically; product cares that forbidden states never occur, not which request finished first.

**Q: Known gaps here?**  
**A:** Email verify HTTP, cookie refresh path, Redis fail-closed automation — honest backlog for senior signal.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Property | Invariant tests must uphold |
| Black-box | Test via public HTTP API |
| preload | Runner hook before imports |
| resetDb | Truncate tables between tests |
| Invariant | Condition that must always hold |

---

## 13. Teach pointer

> “Don’t ask ‘did we write tests?’ Ask ‘what lie could the code tell that no test would catch?’”

---

## 14. Optional further reading (not required)

- [test-pyramid](./test-pyramid.md) · [contract-testing](./contract-testing.md)  
- Repo: `backend/src/test/**`, `backend/src/app.ts` (app without listen)
