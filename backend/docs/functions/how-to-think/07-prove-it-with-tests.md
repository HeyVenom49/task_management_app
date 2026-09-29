# Step 7 — Prove it with tests

**Standalone ✓** — You do not need other how-to-think steps or lessons to *name* the proofs, pick the right test file style, and write cases that catch lies in this repo’s harness.

**After this file you can:** turn invariants into property-named tests, copy the correct suite pattern from `src/test/**`, sketch a red→green order, and defend the test plan in an interview.

---

## 1. Why this step exists

Steps 01–06 named *who*, *threats*, *API*, *schema*, *layers*, and *races*. None of that is real until something in CI fails when the code lies.

If you skip this step you ship:

- “Works on my machine” authz that Alice can bypass on Bob’s project  
- OCC/locks that never fire under `Promise.all`  
- 500s that leak stacks because nobody asserted safe bodies  
- A PR that asks reviewers to *trust* the design

**Artifact you leave with:** a test case list (file names + property sentences + helpers) — filled template at the end.

---

## 2. Mental model

### Analogy

A bridge engineer doesn’t “feel” the span is strong — they load it until the design says it should hold.  
Your tests are the **load truck**. The property sentence is the **rated capacity**. Mocks of your own authz are a truck made of cardboard.

### Where this sits

```text
01 brief → 02 invariants → 03 API → 04 schema → 05 layers → 06 races
                                                                    │
                                                                    ▼
                                                          07 prove with tests  ← you are here
                                                                    │
                                                                    ▼
                                                          08 walkthrough / 09 ship
```

### Inputs → outputs

| In | Out |
|----|-----|
| Invariants from step 02 | One test (or case) that would fail if broken |
| Race plan from step 06 | Parallel / conflict case with *invariant* assertion |
| Auth matrix from step 03 | 401 / 403 / 404 / field-level cases |
| Repo harness | File name + helpers (`resetDb`, Alice/Bob, `api()`) |

---

## 3. Core rules (must / must-not)

1. **MUST** name the *lie* first: finish “A stranger / Alice / two parallel requests must never …” — that sentence *is* the test name.  
2. **MUST** prefer black-box HTTP (`api()` + real DB) for authz and IDOR — not mocked membership.  
3. **MUST** use `beforeEach(resetDb)` for isolation in every suite that touches Postgres.  
4. **MUST** assert *invariants* under concurrency, not which request won the race.  
5. **MUST** include at least one security case (401 or IDOR/authz) and one happy path before calling the feature “tested.”  
6. **MUST NOT** invent a parallel harness when `registerVerifiedUser` / `seedAliceBobProjects` already exist.  
7. **MUST NOT** disable assertions on body shape for error paths — safe messages are part of the contract (`failures.test.ts`).  
8. **MUST NOT** ship a known race from step 06 without naming a proof (or an explicit deferred gap).

---

## 4. Decision questions — with how to answer

### Q1. What property are we proving?

**Why:** Tests without properties are scripts that green-wash.

**How:** One sentence per case, in product language:

```text
Alice with a valid JWT must not read Bob’s project (403).
After two parallel refreshes with the same token, at most one success.
On unknown route, body must not contain stack / SQL.
```

**Bad:** “Test create comment.”  
**Good:** “Alice cannot POST a comment on Bob’s project task → 403.”

### Q2. Which existing suite style do we copy?

| Property | Copy from (`src/test/`) | Why |
|----------|-------------------------|-----|
| Happy auth / 401 anonymous | `auth.api.test.ts` | `registerVerifiedUser` + Bearer |
| Cross-user / wrong-id IDOR | `tasks.idor.test.ts` | `seedAliceBobProjects` |
| Field- or role-level authz | `tasks.authz.test.ts` | matrix in one case or few |
| Business conflict (409) | `members.removal.test.ts` | domain rule → status |
| Parallel race invariant | `concurrency.test.ts`, removal race | `Promise.all` + final DB/state |
| No info leak | `failures.test.ts` | safe error bodies |

**Bad:** “New folder of unit tests for the repository only.”  
**Good:** “IDOR → `comments.idor.test.ts` next to `tasks.idor.test.ts`.”

### Q3. What helpers and harness rules apply?

**This repo:**

1. `preload.ts` — sets `NODE_ENV=test`, JWT/DB defaults; rate limiters become passthrough in test.  
2. `beforeEach(resetDb)` — `TRUNCATE … RESTART IDENTITY CASCADE` on users/projects/members/tasks/sessions/tokens.  
3. Prefer `registerVerifiedUser` (register → SQL force ACTIVE+verified → login) over fragile email flows.  
4. Prefer `seedAliceBobProjects` for two-tenant IDOR.  
5. Hit real `app` via `api()` (supertest); auth with `authHeader(accessToken)`.  
6. Refresh-in-body flows need `X-Client: mobile` (cookie vs body).  
7. If you add a table, **extend `resetDb` TRUNCATE list** or the next suite flakes on FKs.

**Bad:** “Share one Alice across files without reset.”  
**Good:** “Every `describe` owns `beforeEach(resetDb)`.”

### Q4. What is the red→green order?

**Why:** Happy path last teaches the least about security.

**Practical TDD order:**

1. IDOR / 401 (red) → membership gate (green)  
2. Authz matrix if field/role sensitive  
3. Conflict / race if step 06 named one  
4. Happy path create/list  
5. Failure-body safety if new error shapes

**Bad:** “Only 201 then ship.”  
**Good:** “403/404 red first; 201 second.”

### Q5. How do we assert races without flaking?

**How:** Fire parallel requests; assert *allowed outcome sets* and/or final DB:

- exactly one `200` and one `401` / `409`, **or**  
- final row count / owner count / session chain satisfies the invariant  

**Bad:** `expect(results[0].status).toBe(200)` (order-dependent).  
**Good:** `expect(successes).toBe(1)` after counting both responses (see `concurrency.test.ts`).

### Q6. What gaps are we willing to ship?

**Why:** Honest gaps beat fake coverage.

Name them: “no load test,” “no fail-closed Redis in CI (limiter disabled in test),” “edit OCC deferred with edits.” Track in PR.

---

## 5. Worked example A — this project

### A1. IDOR suite pattern (`tasks.idor.test.ts`)

**Property:** Alice must not touch Bob’s project or Bob’s task id under Alice’s URL.

```ts
describe("task/project IDOR", () => {
  beforeEach(async () => { await resetDb(); });

  test("Alice cannot GET Bob's project", async () => { /* 403 */ });
  test("Alice cannot list Bob's project", async () => { /* 403 */ });
  test("Alice cannot access Bob's taskId under Project A", async () => { /* 404 */ });
});
```

Fixture: `seedAliceBobProjects()` → `alice`, `bob`, `projectA`, `projectB`.

### A2. Authz matrix (`tasks.authz.test.ts`)

**Property:** assignee may status-only; mixed PATCH rejected; other member blocked.

One dense case can encode the matrix — still name the *forbidden* outcomes in the test title.

### A3. Conflict + race (`members.removal.test.ts`)

```text
test("cannot remove member assigned to open task -> 409; ok after complete")
test("parallel remove vs assign -> never inactive with open assignment")
```

Second case is the step-06 interleaving turned into CI proof.

### A4. Concurrency suite (`concurrency.test.ts`)

| Case name | Invariant asserted |
|-----------|-------------------|
| `parallel duplicate register -> one success, one conflict` | UNIQUE / 409 |
| `parallel refresh with same token -> at most one success` | rotation |
| `parallel transferOwnership to two members -> one owner left active` | single owner |
| `transfer then former owner transfer again -> 403 and still one owner` | authz after role change |

### A5. Failures (`failures.test.ts`)

```text
test("unknown route does not leak internals")
test("invalid JWT -> 401 with safe message")
```

Security of *error channels*, not just happy authz.

### A6. Auth happy + anonymous (`auth.api.test.ts`)

```text
test("register + login + GET /me")
test("GET /projects without token -> 401")
```

Baseline: identity works; anonymous is denied.

---

## 6. Worked example B — mini greenfield: task comments

**Properties to name before coding:**

1. Alice cannot POST comment on Bob’s project task → **403**.  
2. Alice cannot POST with Bob’s `taskId` under Alice’s project → **404**.  
3. Active member can POST + GET on own project → **201/200**.  
4. Other member cannot DELETE author’s comment → **403**; owner can → **200**.  
5. Anonymous POST → **401**.  
6. (If denormalized `comment_count`) parallel creates never leave count wrong — or defer and note gap.

**File plan:**

```text
comments.idor.test.ts   — cases 1–2 (copy tasks.idor)
comments.api.test.ts    — cases 3, 5 (copy auth.api style)
comments.authz.test.ts  — case 4 (copy tasks.authz)
```

**Helpers:** `seedAliceBobProjects` + create task under project A/B; extend `resetDb` with `comments` when the table exists.

**Red first:** case 1 and 2 before the service membership/task binding exists.

---

## 7. Decision template

### Blank

```text
Feature:
Test files:
Cases (property → expected status / DB invariant):
  1)
  2)
  3)
Helpers: registerVerifiedUser / seedAliceBobProjects / other:
Harness notes (resetDb tables, X-Client, rate limit):
Race/conflict proofs (from step 06):
Known gaps deferred:
Red→green order:
```

### Filled (comments — excerpt)

```text
Feature: task comments v1
Test files: comments.idor.test.ts, comments.api.test.ts, comments.authz.test.ts
Cases:
  1) Alice POST on Bob’s task → 403
  2) Bob taskId under Alice project → 404
  3) Member POST+GET own → 201/200
  4) Non-author DELETE → 403; owner DELETE → 200
  5) No token → 401
Helpers: seedAliceBobProjects + createTask helper
Harness: resetDb += comments; rate limiters off via NODE_ENV=test
Race: N/A for create v1; document double-submit may duplicate
Gaps: no edit/OCC; no Redis fail-closed proof in CI
Order: idor → authz delete → happy → 401
```

---

## 8. Wrong world / anti-patterns

| Anti-pattern | What breaks |
|--------------|-------------|
| Only happy-path 201 | IDOR ships green |
| Mock `requireActiveMember` to always true | Tests prove nothing |
| Assert which parallel request finishes first | Flaky CI, false confidence |
| Share DB state across tests without `resetDb` | Order-dependent failures |
| Forget new table in `TRUNCATE` | FK errors / dirty leftovers |
| “We’ll test fail-closed Redis later” forever | Abuse path unproven |
| Property-less names (`test("works")`) | Nobody knows what failed |

---

## 9. Exit criteria

You may go to step 08/09 when:

- [ ] ≥1 security case (401 or IDOR/authz) named  
- [ ] ≥1 happy-path case named  
- [ ] Every step-06 race/conflict has a proof name or an explicit gap  
- [ ] File names follow `*.idor.test.ts` / `*.authz.test.ts` / `*.api.test.ts` / `concurrency` style  
- [ ] Helpers and `resetDb` impact listed  
- [ ] Red→green order written  

---

## 10. Interview Q&A

**Q: Why integration (HTTP + DB) tests for IDOR instead of unit-testing the service with stubs?**  
**A:** IDOR is an end-to-end wiring bug: wrong middleware order, forgotten `projectId` bind, repo query missing `project_id`. Stubs that always return “member” hide exactly those failures. Black-box `api()` + Alice/Bob fixtures catch the real hole.

**Q: How do you test a race without flaking?**  
**A:** `Promise.all` two requests; assert invariant outcomes — e.g. one success and one conflict, or final DB has one owner / at most one successful refresh — never assert response array order. Mirror `concurrency.test.ts` and the parallel remove/assign case in `members.removal.test.ts`.

**Q: What does `resetDb` buy you?**  
**A:** Truncates core tables with `RESTART IDENTITY CASCADE` so each case starts empty. Without it, leftover members/tasks cause false greens and mysterious FK failures. New tables must be added to the truncate list.

**Q: What’s a gap you’d still ship with, and how do you track it?**  
**A:** Example: rate limiters are passthrough when `NODE_ENV=test`, so fail-closed Redis isn’t proven in the default suite. Ship with a PR note / ticket: “add Redis-down unit or harness flag.” Don’t pretend the happy path covers it.

**Q: How would you test fail-closed Redis without flaking CI?**  
**A:** Don’t depend on a real flaky Redis. Inject/stub the store to throw in a focused test, or run one suite with a test double that fails `sendCommand`, expect `503` and safe message. Keep it out of the parallel Alice/Bob matrix.

**Q: Why property-named tests?**  
**A:** When CI fails, `Alice cannot access Bob's taskId under Project A` tells you the invariant. `test("comments")` does not. Properties are the design doc executable.

---

## 11. Glossary

| Term | Meaning |
|------|---------|
| **Property** | Invariant stated as a must-never / must-always sentence |
| **Black-box API test** | HTTP against real `app` + DB; no mocked authz guts |
| **IDOR fixture** | Alice/Bob projects via `seedAliceBobProjects` |
| **Authz matrix** | Roles × fields × allowed mutations in tests |
| **Invariant under concurrency** | Assertion on final state / status multiset, not winner order |
| **Harness** | `preload` + `resetDb` + helpers + `api()` |
| **Gap** | Known unproven behavior, explicitly deferred |

---

## 12. Optional further reading

- Previous: [06-concurrency-and-failure.md](./06-concurrency-and-failure.md) · Next: [08-build-the-feature-walkthrough.md](./08-build-the-feature-walkthrough.md)  
- Lessons (optional): [testing-as-proof](../lessons/testing/testing-as-proof.md), [test-pyramid](../lessons/testing/test-pyramid.md), [test-isolation-and-fixtures](../lessons/testing/test-isolation-and-fixtures.md), [contract-testing](../lessons/testing/contract-testing.md)  
- Function guide (optional): [../testing.md](../testing.md)  
- Code: `src/test/auth.api.test.ts`, `tasks.idor.test.ts`, `tasks.authz.test.ts`, `members.removal.test.ts`, `concurrency.test.ts`, `failures.test.ts`, `helper/*`

---

## Teach pointer

> “Name the lie the code could tell. Write a test that catches that lie.”
