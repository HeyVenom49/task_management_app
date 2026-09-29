# Lesson: Property-based testing

**Standalone ✓** — You do not need any other doc to apply generated-input testing to auth and validation.

**After this file you can:** contrast properties vs examples, describe shrinking, propose properties for IDOR and parsers, and relate to this repo’s race invariants.

---

## 1. First principles

**Property-based tests** generate many random inputs and assert **universal properties** (“for all valid X, Y holds”) instead of one hand-picked example.

Tools: **fast-check** (JS/TS), Hypothesis (Python).

**The problem it solves:** You only imagined `test@example.com`; attacker tries Unicode homoglyphs, huge strings, weird UUIDs — examples miss edges.

---

## 2. Mental model

### Analogy

Example test: “this one key opens the door.”  
Property test: “**no** key except owner’s opens the door” — try 1000 random keys.

### Diagram

```text
Generator ──► many inputs ──► property function ──► pass / fail
                                    │
                                    └── fail → shrink to minimal counterexample
```

---

## 3. Core rules (must / must-not)

1. **MUST** state property clearly: “∀ … holds.”  
2. **MUST** use generators matching domain (email format, UUID).  
3. **MUST NOT** use unbounded generators without preconditions (filter smartly).  
4. **SHOULD** combine with **example tests** for readability.  
5. **SHOULD** run fewer iterations in CI if slow — more locally.

---

## 4. How it works (mechanics)

**fast-check** `fc.assert(fc.property(generator, (input) => { ... }))`.

On failure, **shrinking** finds smallest input still failing — e.g. `"aa"` not `"aaa...aaa"`.

Properties for APIs:

- IDOR: random user pairs never cross-read 200 with data.  
- Parsers: only `^\d+[smhd]$` accepted.  
- Invariants: balance never negative after transfer.

---

## 5. When to use / when not to use

| Target | Property-based |
|--------|----------------|
| Pure validation/parser | **Great** |
| Authz matrix | Possible but heavy — integration + property hybrid |
| Snapshot UI | Poor fit |
| SQL race winner | Assert invariant, not winner — same as concurrency tests |

---

## 6. Step-by-step: design → implement → verify

1. Identify invariant.  
2. Write generator for inputs.  
3. Wrap HTTP or pure function in property.  
4. Run fast-check with seed logging for replay.  
5. Fix bug; keep shrunk counterexample as regression example.

---

## 7. Worked example A — this project

**Today:** primarily **example-based** integration tests in `src/test/**`.

**Same spirit as properties:** concurrency tests assert **invariants after parallel work** — not which request won:

- After `Promise.all`, at most one refresh session valid.  
- Member removal rules still hold regardless of scheduling.

**Property candidates:**

```ts
// sketch: fast-check + supertest
fc.assert(
  fc.property(fc.uuid(), fc.uuid(), async (aliceId, bobId) => {
    fc.pre(aliceId !== bobId);
    // seed users/projects; Alice token GET Bob resource → not 200 with body
  }),
);
```

**Duration/env parsing** (if extracted): property that only valid patterns parse, others reject.

**Gap:** no fast-check dependency wired yet — additive enhancement, not replacement for HTTP integration proofs.

---

## 8. Worked example B — mini scenario (self-contained)

```ts
import fc from "fast-check";

fc.assert(
  fc.property(fc.string(), (s) => {
    const ok = /^\d+[smhd]$/.test(s);
    const result = parseDurationToMs(s);
    if (ok) expect(result).toBeGreaterThan(0);
    else expect(() => parseDurationToMs(s)).toThrow();
  }),
);
```

Shrunk failure might reveal `"0m"` edge case you never hand-wrote.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Result |
|--------------|--------|
| Property too vague | Always passes |
| Unfiltered random strings | mostly `fc.pre` skips — slow |
| Replace all integration | Miss middleware bugs |
| Ignore seed on CI flake | Unreproducible |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| CI timeout | too many runs | numRuns | lower in CI |
| Flaky property | shared DB | isolation | resetDb per run |
| Shrunk nonsense input | generator too wide | filter | domain generator |
| Pass locally fail CI | env | DATABASE_URL | same as integration |

---

## 11. Interview Q&A (with strong answers)

**Q: Property vs example test?**  
**A:** Examples check specific cases you thought of; properties check universal rules over many generated inputs — finds edges you didn’t imagine.

**Q: Shrinking failures?**  
**A:** Framework minimizes failing input to simplest counterexample — speeds debugging and becomes regression example.

**Q: Good properties for authz?**  
**A:** For any two distinct users and unrelated resource id, cross-token access never returns 200 with that resource’s data; membership required for project-scoped routes.

**Q: This repo today?**  
**A:** Example-based API tests; concurrency files assert invariants akin to properties; fast-check not yet adopted — natural next step for parsers and IDOR generators.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Property | Universal rule under test |
| Generator | Random input producer |
| Shrinking | Minimize failing input |
| fast-check | TS property-based library |
| Counterexample | Input that breaks property |

---

## 13. Teach pointer

> “Examples find bugs you imagine. Properties find bugs you didn’t.”

---

## 14. Optional further reading (not required)

- [testing-as-proof](./testing-as-proof.md) · [toctou](../database/toctou.md)  
- Repo: `backend/src/test/concurrency.test.ts`, `tasks.idor.test.ts`
