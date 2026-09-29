# Standalone lesson standard (gold bar)

**Goal:** After reading **one** lesson file, a learner understands that concept well enough to explain it, use it, debug it, and interview on it — **without** opening other docs, blogs, or function guides.

Related lessons may be listed as *optional further reading*, never as required prerequisites.

---

## Required sections (every upgraded lesson)

### 1. Title + one-line promise
What you will be able to do after this file.

### 2. First principles
Plain-language definition. Why the concept exists. What problem disappears when you use it.

### 3. Mental model
Analogy + simple diagram (ASCII/Mermaid). How pieces relate.

### 4. Core rules (must / must-not)
Numbered invariants. No hand-waving.

### 5. How it works (mechanics)
Enough detail that they don’t need Postgres manuals / RFCs for *working knowledge* (not every edge of the spec).

### 6. When to use / when not to use
Decision table.

### 7. Step-by-step: design → implement → verify
Checklist they can follow on a new feature.

### 8. Worked example A — this project
Inline code (or faithful reconstruction) + why each line matters. File paths as citations, not “go read auth.md.”

### 9. Worked example B — self-contained mini scenario
If the project example is incomplete for teaching, invent a small complete scenario (still copy-pasteable mentally).

### 10. Wrong world / anti-patterns
Concrete failures.

### 11. Failure modes & debugging (self-contained)
Symptom → likely cause → what to check → fix. Don’t say “see how-to-debug.”

### 12. Interview Q&A
Each question includes a **strong answer** (not just the question).

### 13. Glossary
Every non-obvious term used in this lesson.

### 14. Optional further reading
Links to sibling lessons / repo paths — clearly marked optional.

---

## Depth bar

| Too shallow (old style) | Standalone (required) |
|-------------------------|------------------------|
| “Use `sql.begin`” | Explain begin/commit/rollback, ACID, what rolls back, how errors propagate |
| “See auth.md” | Paste the relevant pattern and narrate it |
| Questions only | Questions + answer keys |
| One-liner “not in project” | Full mini design with steps |

---

## Rollout

1. Gold sample: `database/transactions.md`  
2. Then remaining `database/`  
3. Then `security/` → `api/` → `architecture/` → `ops/` → `testing/`  

Mark upgraded lessons in category READMEs with **Standalone ✓**.
