# Standalone debug standard — How to debug

**Goal:** After reading **one** guide file, a learner can hunt that *class* of failure: parse the signal, open the right first file, form hypotheses, prove a fix — **without** opening lessons, function guides, or other how-to-debug files.

Optional links at the end are further reading, never required.

This is the **hunt** cousin of [../lessons/_STANDALONE_STANDARD.md](../lessons/_STANDALONE_STANDARD.md).  
Lessons teach *what a concept is*. These files teach *what the error is telling you to open*.

---

## Required sections (every upgraded guide)

### 1. Title + one-line promise
What failure class you can debug after this file.

### 2. Why this habit exists
First principles: cost of random file opens; what “listening to the signal” means.

### 3. Mental model
Analogy + diagram of signal → neighborhood → house → room (status → module → function → line).

### 4. Core rules (must / must-not)
Numbered hunting invariants.

### 5. Signal taxonomy for this class
Exact shapes: JSON bodies, log lines, SQLSTATE, test diffs — as they appear in *this* app.

### 6. Symptom → first open table
Symptom | First file/function | Why that entry | Next if wrong

### 7. Reproduce recipe
Minimal steps to make the failure reliable (curl / test / env knobs).

### 8. Hypothesis ladder
Ordered guesses from most likely → least; what evidence confirms/kills each.

### 9. Worked failure A — this project
A real failure walk: signal → open → root cause → fix → prove (cite paths; paste critical snippets).

### 10. Worked failure B — mini invented
Self-contained scenario (still realistic for this stack).

### 11. False leads / anti-patterns
What juniors dig into first that wastes time.

### 12. Fix + prove checklist
After the change: what to re-run; what log/status proves it’s gone.

### 13. Interview Q&A
Questions + **strong answers**.

### 14. Glossary

### 15. Optional further reading

---

## Depth bar

| Too shallow (old style) | Standalone (required) |
|-------------------------|------------------------|
| Symptom → file table only | Table + why + next-if-wrong + reproduce |
| “See auth.md” | Paste the critical branch and narrate |
| Questions only | Answer keys |
| “Check cookies” | Attribute-by-attribute checklist with failure mode |
| ~70–100 lines | ~180–350 lines |

---

## Index / map files (`11-symptom-to-concept`)

Each row needs a short “what to check before opening the lesson” so the map is itself a hunting tool.

---

## Rollout

1. Gold: `06-auth-and-token-failures.md`  
2. Remaining `01`–`05`, `07`–`10`  
3. Deepen `11-symptom-to-concept.md`  
4. Mark **Standalone ✓** in README  

If hunting a symptom needs a concept the catalog lacks, **add a new Standalone lesson** under `lessons/` and link it optionally.
