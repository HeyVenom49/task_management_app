# How to think — build software / a feature from scratch

This folder is a **process playbook**: the questions and order of decisions a strong backend engineer uses *before* and *while* writing code.

It is not a copy of [../lessons/](../lessons/) (concepts) or the function guides (what each function does).  
Those answer “what is X?” and “what does this file do?”  
**This** answers “what do I do on Monday when the ticket says *add feature Y*?”

Grounded in how *this* task-management backend was shaped.

**Standalone process:** each step below meets [_STANDALONE_PROCESS.md](./_STANDALONE_PROCESS.md) — after one file you can run that design stage without opening lessons or sibling steps. Optional links at the end of each file are further reading only.

**Gold example:** [06-concurrency-and-failure.md](./06-concurrency-and-failure.md) (**Standalone ✓**).

## When to use it

- Greenfield module (new resource)  
- Non-trivial feature on an existing module  
- Interview: “How would you design …?”  
- Teaching someone to stop coding from the UI inward without a model

## Path (do in order)

| Step | File | Standalone | Outcome before you move on |
|------|------|------------|----------------------------|
| 1 | [01-clarify-the-problem.md](./01-clarify-the-problem.md) | Standalone ✓ | Actors, job, non-goals, success criteria written down |
| 2 | [02-threats-and-invariants.md](./02-threats-and-invariants.md) | Standalone ✓ | Threat list + invariants that must always hold |
| 3 | [03-shape-the-api.md](./03-shape-the-api.md) | Standalone ✓ | Routes, status codes, authn/authz matrix |
| 4 | [04-data-model-first.md](./04-data-model-first.md) | Standalone ✓ | Tables, FKs, constraints, migrations sketched |
| 5 | [05-slice-the-layers.md](./05-slice-the-layers.md) | Standalone ✓ | What lives in route/controller/service/repo |
| 6 | [06-concurrency-and-failure.md](./06-concurrency-and-failure.md) | Standalone ✓ | Race plan, locks vs OCC, fail-closed choices |
| 7 | [07-prove-it-with-tests.md](./07-prove-it-with-tests.md) | Standalone ✓ | Property tests named (write them before or with code) |
| 8 | [08-build-the-feature-walkthrough.md](./08-build-the-feature-walkthrough.md) | Standalone ✓ | Worked example: task comments (full 01→07 narration) |
| 9 | [09-checklist.md](./09-checklist.md) | Standalone ✓ | Ship checklist before PR |
| 10 | [10-concept-coverage.md](./10-concept-coverage.md) | Standalone ✓ | Which dedicated lessons to pull in while building |

Steps 1–9 are the process. Step 10 maps broader concepts (transactions, indexing, locking, caching, outbox, …) — including ones **not yet in this repo**.

## Teach pointer

> “Code is the last 30%. The first 70% is naming who can hurt whom and what must stay true.”

## How this links to the rest of the docs

| After you decide… | Open |
|-------------------|------|
| A concept you don’t know yet | [../lessons/](../lessons/) |
| Where similar code already lives | [../auth.md](../auth.md), [../projects.md](../projects.md), [../tasks.md](../tasks.md) |
| How this repo boots / cross-cuts | [../shared-bootstrap.md](../shared-bootstrap.md) |
| How we prove properties | [../testing.md](../testing.md), [../lessons/testing/testing-as-proof.md](../lessons/testing/testing-as-proof.md) |
| How to deepen a step | [_STANDALONE_PROCESS.md](./_STANDALONE_PROCESS.md) |

## Interview framing

If an interviewer says “Design a feature for this app,” narrate **steps 1→7** out loud (or the [08 walkthrough](./08-build-the-feature-walkthrough.md)), then sketch code. That *is* senior thinking — not jumping to Zod schemas first.
