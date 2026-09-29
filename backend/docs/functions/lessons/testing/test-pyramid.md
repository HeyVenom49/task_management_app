# Lesson: Test pyramid

**Standalone ✓** — You do not need any other doc to choose test types for this API.

**After this file you can:** explain pyramid tradeoffs, justify this repo’s integration-heavy shape, and interview on authz test placement.

---

## 1. First principles

The **test pyramid** suggests **many fast unit tests**, **fewer integration tests**, **fewest end-to-end UI tests** — balancing speed, cost, and confidence.

**The problem it solves:** All E2E → slow flaky CI; all mocked units → green tests while IDOR ships to prod.

**Pyramid is guidance, not law** — domain drives shape.

---

## 2. Mental model

### Analogy

Building inspection: many cheap socket checks (units), several room wiring tests (integration), one full walkthrough (e2e) — not only walkthroughs.

### Diagram

```text
        ┌───────┐
        │  E2E  │  few
       ┌┴───────┴┐
       │ Integr. │  some
      ┌┴─────────┴┐
      │   Unit     │  many (typical pyramid)
      └────────────┘

This repo: wide integration band for authz/security
```

---

## 3. Core rules (must / must-not)

1. **MUST** test **properties that matter** at the lowest level that still catches real bugs.  
2. **MUST NOT** mock away the layer you’re trying to prove (DB for IDOR).  
3. **SHOULD** keep unit tests for pure logic (parsers, validators).  
4. **SHOULD** avoid 100% E2E for every field matrix.  
5. **MUST** name tests after **threat or property** (`tasks.idor`, `concurrency`).

---

## 4. How it works (mechanics)

| Layer | Scope | Speed | Catches |
|-------|-------|-------|---------|
| Unit | Function/class | Fast | Logic bugs |
| Integration | HTTP + DB + middleware | Medium | Authz, SQL, races |
| E2E | Full browser stack | Slow | Wiring, UX |

For **authorization** and **concurrency**, integration at HTTP boundary beats isolated service mocks.

---

## 5. When to use / when not to use

| Property | Best layer here |
|----------|-----------------|
| IDOR on tasks | Integration (`tasks.idor.test.ts`) |
| PATCH field matrix | Integration (`tasks.authz.test.ts`) |
| Duration parser regex | Unit (if extracted) |
| SPA button color | E2E (frontend repo) |
| Refresh rotation race | Integration (`concurrency.test.ts`) |

---

## 6. Step-by-step: design → implement → verify

1. State property: “Alice never reads Bob’s project.”  
2. Choose layer: real HTTP + DB.  
3. Use `preload.ts` + `resetDb()` + fixtures.  
4. One file per major property.  
5. CI runs `bun test` with Postgres available.

---

## 7. Worked example A — this project

**Harness:**

```text
preload.ts → env for test
  → supertest `api()` against Express `app` (no listen)
    → resetDb() truncate
      → registerVerifiedUser / seedAliceBobProjects
```

**Integration-heavy files (middle/top of pyramid for this domain):**

| File | Property |
|------|----------|
| `auth.api.test.ts` | Auth happy path; anonymous → 401 |
| `tasks.idor.test.ts` | Cross-user/project denied |
| `tasks.authz.test.ts` | PATCH field matrix |
| `members.removal.test.ts` | Removal rules + races |
| `concurrency.test.ts` | Register unique, refresh winner |
| `failures.test.ts` | No internal leak on errors |

Fewer pure unit tests of services — **intentional** for authz proof ([testing-as-proof](./testing-as-proof.md)).

**Why not only units:** Mocked repo always returns “member: true” — IDOR never fails in CI.

---

## 8. Worked example B — mini scenario (self-contained)

Team adds `parseDurationToMs`:

- **Unit:** 100 cases generated — property-style locally.  
- **Integration:** one login with `JWT_EXPIRES_IN` from env — not 100 JWT unit mocks.

Keep pyramid **wide where risk is**.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Result |
|--------------|--------|
| Only E2E | 45min CI, flakes |
| Only mocked units | False green IDOR |
| No concurrency tests | Race in prod |
| Pyramid dogma | Wrong layer for security |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Slow CI | too many E2E | layer mix | more integration, less browser |
| IDOR shipped | no test | file list | add idor test |
| Flaky pyramid top | timing | concurrency tests | assert invariants after `Promise.all` |
| Units pass, API fails | bypass middleware | test via `api()` | black-box HTTP |

---

## 11. Interview Q&A (with strong answers)

**Q: Where do authz tests live in the pyramid?**  
**A:** Integration/API layer with real DB — authz emerges from routing, middleware, SQL, and membership together; mocking hides IDOR.

**Q: Cost of 100% E2E?**  
**A:** Slow feedback, flaky UI, expensive maintenance — use targeted E2E plus strong API integration tests.

**Q: What to unit test here?**  
**A:** Pure helpers (duration parsing, validation pure functions); not “is user authorized” with fake repos.

**Q: This repo’s shape?**  
**A:** Heavy `src/test/**` API integration with preload/resetDb; concurrency and IDOR files prove security properties.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Integration test | Multiple real components |
| E2E | Full user-facing stack |
| IDOR | Insecure direct object reference |
| Fixture | Reusable test data setup |
| Black-box test | HTTP in, status/body out |

---

## 13. Teach pointer

> “Pyramid is guidance. For IDOR, prefer tests that can’t lie — real HTTP + real DB.”

---

## 14. Optional further reading (not required)

- [testing-as-proof](./testing-as-proof.md) · [property-based-testing](./property-based-testing.md)  
- Repo: `backend/src/test/preload.ts`, `backend/docs/functions/testing.md` (optional deep index)
