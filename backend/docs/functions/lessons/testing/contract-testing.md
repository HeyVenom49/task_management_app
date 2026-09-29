# Lesson: Contract testing

**Standalone ✓** — You do not need any other doc to guard API shape between producer and consumer.

**After this file you can:** explain consumer-driven contracts, use OpenAPI as a testable artifact for this repo, and interview on Pact vs integration tests.

---

## 1. First principles

**Contract tests** verify that **API producer and consumer agree** on request/response shape — without full browser E2E.

**The problem it solves:** Backend renames `title` → `name`; frontend still reads `title` — prod break despite green unit tests on each side.

---

## 2. Mental model

### Analogy

USB-C spec: plug and port must match pinout — test the spec, not every app on the laptop.

### Diagram

```text
Consumer expectations ──► contract file ◄── Producer verification
                              │
                              └── CI fails if field removed/breaking type
```

---

## 3. Core rules (must / must-not)

1. **MUST** treat breaking API changes as **versioned** or coordinated releases.  
2. **MUST** fail CI when response **violates** published schema (if adopting schema tests).  
3. **MUST NOT** rely on Swagger alone without automated checks — docs drift.  
4. **SHOULD** prefer **consumer-driven** contracts for multi-team APIs.  
5. **SHOULD** keep OpenAPI in sync with routes ([api-versioning](../api/api-versioning.md)).

---

## 4. How it works (mechanics)

**OpenAPI:** YAML describes paths, schemas — can validate test responses against components.

**Pact:** consumer writes expected interaction; provider verifies against pact files in CI.

**vs integration test:** integration proves behavior; contract proves **shape agreement** across repos — complementary.

---

## 5. When to use / when not to use

| Situation | Contract test |
|-----------|---------------|
| Separate SPA + API teams | **Strong fit** |
| Monolith same commit | OpenAPI drift check still useful |
| Internal private method | Not contract scope |
| Security IDOR | Integration tests, not OpenAPI alone |

---

## 6. Step-by-step: design → implement → verify

1. Maintain `openapi.yaml` as source of truth.  
2. Add CI step: test responses match schema for key routes.  
3. Optional: Pact between frontend and `/api/v1`.  
4. Block PR removing required fields without major version.  
5. Publish diff review for consumers.

---

## 7. Worked example A — this project

**Artifact:** `backend/docs/openapi.yaml` describes the public API.

**Non-prod Swagger UI** loads spec from disk:

```24:31:backend/src/app.ts
if (env.nodeEnv !== "production") {
  const raw = readFileSync(
    join(import.meta.dirname, "../docs/openapi.yaml"),
    "utf8",
  );
  const spec = parse(raw);
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(spec));
}
```

**Gap:** no automated Pact or response-schema validation in CI yet — **opportunity**.

**Integration tests** already assert status/body for many routes — partial behavioral contract, not full schema coverage.

**Improvement sketch:**

```ts
// pseudo: after supertest response
validateAgainstOpenAPI(spec, "GET", "/api/v1/projects/{id}", res.body);
```

---

## 8. Worked example B — mini scenario (self-contained)

Consumer pact fragment:

```json
{
  "description": "get task",
  "request": { "method": "GET", "path": "/api/v1/tasks/abc" },
  "response": { "status": 200, "body": { "id": "...", "title": "..." } }
}
```

Provider CI replays pact — fails if `title` removed without consumer update.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Result |
|--------------|--------|
| OpenAPI never updated | Lying docs |
| Contract without CI | Drift |
| Schema test only, no authz test | IDOR still possible |
| Breaking change silent | Prod frontend crash |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Frontend undefined field | backend rename | OpenAPI diff | coordinate release |
| Pact fail on provider | intentional change | consumer version | bump contract |
| False green integration | asserts too loose | schema validate | tighten |
| Duplicate sources of truth | code vs yaml | generation pipeline | openapi-from-code or vice versa |

---

## 11. Interview Q&A (with strong answers)

**Q: Consumer-driven contracts?**  
**A:** Consumers define expected interactions; provider CI proves it satisfies them — catches breaking changes before deploy.

**Q: OpenAPI gating in CI?**  
**A:** Validate recorded responses or examples against schema; fail PR on incompatible schema change.

**Q: vs E2E?**  
**A:** Contracts are faster, focused on shape; E2E covers UX and full stack wiring — use both.

**Q: This repo?**  
**A:** OpenAPI yaml + Swagger in dev; no Pact/CI schema gate yet — integration tests cover behavior partially.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Producer | API server |
| Consumer | Client using API |
| Pact | Contract testing framework |
| Breaking change | Incompatible without client update |
| OpenAPI | Machine-readable API description |

---

## 13. Teach pointer

> “OpenAPI isn’t documentation theater — it’s a testable promise.”

---

## 14. Optional further reading (not required)

- [api-versioning](../api/api-versioning.md) · [testing-as-proof](./testing-as-proof.md)  
- Repo: `backend/docs/openapi.yaml`
