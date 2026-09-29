# Standalone process standard — How to think

**Goal:** After reading **one** step file, a learner can run that design step on a new feature — decide, write artifacts, defend the choice in interview — **without** opening lessons, function guides, or other how-to-think steps.

Optional links at the end are further reading, never required.

This is the **process** cousin of [../lessons/_STANDALONE_STANDARD.md](../lessons/_STANDALONE_STANDARD.md).  
Lessons teach *what a concept is*. These files teach *how to decide when the ticket lands*.

---

## Required sections (every upgraded step)

### 1. Title + one-line promise
What you can *do* after this file (not “what this step is about”).

### 2. Why this step exists
First principles: what goes wrong if you skip it; what artifact you must leave with.

### 3. Mental model
Analogy + ASCII/Mermaid of where this step sits in the 01→09 path and what inputs/outputs it has.

### 4. Core rules (must / must-not)
Numbered invariants for *this* decision stage.

### 5. Decision questions — with how to answer
Each question gets: why it matters, how to answer in this product’s language, a bad answer vs good answer.

### 6. Worked example A — this project
Fill the step’s template for a real (or faithful) feature already in the repo. Inline enough code/SQL/routes that the reader doesn’t need auth.md.

### 7. Worked example B — mini greenfield
A small invented feature (e.g. task comments / labels) walked through *only this step*, fully filled.

### 8. Decision template (blank + filled)
Copy-paste blank; show one filled copy from example A or B.

### 9. Wrong world / anti-patterns
Concrete failures from skipping or half-doing the step.

### 10. Exit criteria
Binary checklist: “you may proceed to next step when …”

### 11. Interview Q&A
Every question includes a **strong answer** (not “hits”).

### 12. Glossary
Terms introduced in this file.

### 13. Optional further reading
Sibling steps, lessons, function guides — marked optional.

---

## Depth bar

| Too shallow (old style) | Standalone (required) |
|-------------------------|------------------------|
| Bullet questions only | Questions + how to answer + good/bad |
| “See transactions lesson” | Teach the decision enough to choose; link optional |
| Interview questions only | Full answer keys |
| “Prefer FOR UPDATE” | When / when not + project example + race diagram |
| ~80–100 lines of outline | ~180–350 lines of teachable process |

---

## Index / map files (`10-concept-coverage`)

Maps stay maps, but each major row needs a **one-paragraph “why load this / what decision it unlocks”** so the map alone is useful without opening every lesson.

---

## Rollout

1. Gold: `06-concurrency-and-failure.md`  
2. Remaining `01`–`05`, `07`–`09`  
3. Deepen `10-concept-coverage.md`  
4. Mark **Standalone ✓** in README  

If a step needs a concept the catalog lacks, **add a new Standalone lesson** under `lessons/` and link it as optional further reading.
