# Lesson: OpenAPI contract-first

**Standalone ✓** — You do not need any other doc to use and extend this API’s OpenAPI contract and Swagger UI.

**After this file you can:** explain contract-first vs code-first, navigate `backend/docs/openapi.yaml`, use `/api/docs`, keep ErrorMessage/`requestId` aligned, and interview on API contracts.

---

## 1. First principles

An **API contract** is the shared agreement of routes, shapes, status codes, and auth — readable by humans and tools **without reading Express source**.

**Contract-first** means you treat the OpenAPI document as the source of truth (or peer truth) and implement/verify against it. **Code-first** generates the doc from annotations after the fact.

**The problem it solves:** Frontend/backend arguing about field names; missing 409 docs; no try-it-out sandbox; drift between “what we think we built” and “what we shipped.”

---

## 2. Mental model

### Analogy

Building electrical outlets: the wall plate spec (shape, voltage) is agreed before wiring. Appliances (clients) plug in without opening the wall (server code).

### Diagram

```text
openapi.yaml  ──► Swagger UI at /api/docs (non-production)
      │
      ├── humans: browse paths, schemas, try requests
      ├── clients: generate types/SDK (optional)
      └── tests: contract tests compare responses (optional gap)

Express routes should match paths/methods/status in the yaml
```

---

## 3. Core rules (must / must-not)

1. **MUST** document public `/api/v1` endpoints in `backend/docs/openapi.yaml`.  
2. **MUST** keep schema names aligned with real JSON (`message`, `requestId`, task enums).  
3. **MUST** declare bearer auth where routes require JWT.  
4. **MUST NOT** expose Swagger in production if the app disables it (this repo: only when `nodeEnv !== "production"`).  
5. **MUST** update OpenAPI in the same change as breaking response/request changes.  
6. **MUST NOT** document fields you never return (e.g. password hashes).  
7. **SHOULD** use shared components (`ErrorMessage`, parameters) to avoid drift.

---

## 4. How it works (mechanics)

### Spec location

File: `backend/docs/openapi.yaml`  
OpenAPI version: **3.0.3**  
Title: Task Management API  
Server URL example: `http://localhost:4000/api/v1`

### Key components

- `securitySchemes.bearerAuth` — HTTP bearer JWT  
- Parameters: `ProjectId`, `MemberId`, `TaskId` (UUID path params)  
- Schemas: `ErrorMessage` includes `message`, optional `requestId`, optional `errors`  
- Enums: `TaskPriority`, `TaskStatus` match Zod enums in `task.schema.ts`

### Serving Swagger UI (real)

`backend/src/app.ts`:

```ts
if (env.nodeEnv !== "production") {
  const raw = readFileSync(
    join(import.meta.dirname, "../docs/openapi.yaml"),
    "utf8",
  );
  const spec = parse(raw);
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(spec));
}
```

Dev/test: open `http://localhost:4000/api/docs`.  
Production: docs route not mounted.

### Contract-first workflow (practical)

1. Sketch path + request body + responses in YAML.  
2. Implement route/controller/Zod to match.  
3. Hit Swagger “Try it out” or automated tests.  
4. On change: edit YAML and code together.

This repo is **hybrid**: code and YAML both maintained by hand (not generated). Discipline matters.

---

## 5. When to use / when not to use

| Situation | OpenAPI? |
|-----------|----------|
| Public/partner HTTP API | **Yes** |
| Internal-only spike prototype | Optional short-term |
| WebSocket-heavy realtime | OpenAPI covers HTTP; WS needs other docs |
| Highly unstable week-one WIP | Draft YAML still helps FE parallelize |
| Production admin debug UI | Often disable or protect docs |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Resource + verb (`POST /projects`).  
2. Request schema (allow-list fields).  
3. Success status (201/200) + body.  
4. Error responses (401/403/404/409) referencing `ErrorMessage`.  
5. Security: bearer or none.

### Implement

1. Add/update path in `openapi.yaml`.  
2. Mirror Zod schema + controller.  
3. Ensure status codes match service `AppError`s.

### Verify

1. Reload `/api/docs` — operation visible.  
2. Try it out with token.  
3. Diff YAML vs a real response (field names/enums).  
4. Optionally add contract tests later.

---

## 7. Worked example A — this project

### A1. Error shape documented

```yaml
ErrorMessage:
  type: object
  required: [message]
  properties:
    message: { type: string }
    requestId: { type: string }
```

Matches `errorHandler` JSON (`message` + `requestId`).

### A2. Task authz note in description

`info.description` documents PATCH rules: OWNER/creator vs assignee status-only vs forbidden — contract carries product rules, not only types.

### A3. Non-prod docs mount

Developers explore auth/projects/tasks without Postman collections drifting.

**Where:** `backend/src/app.ts`, `backend/docs/openapi.yaml`.

---

## 8. Worked example B — mini scenario (self-contained)

**New endpoint:** `POST /api/v1/projects/{id}/labels` body `{ "name": string }`.

1. Add path + `Label` schema + 201/401/403/409 to YAML.  
2. Add `createLabelSchema` Zod.  
3. Implement service + route.  
4. Swagger try-it-out creates a label.  
5. If you skip YAML, FE invents `{ "title": ... }` and wastes a day — contract-first prevents that.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| YAML updated months later | Silent contract drift |
| Docs in production unauthenticated | Attack surface / info leak |
| Documenting internal-only debug routes publicly | Extra exposure |
| `additionalProperties` ignored while code accepts anything | False security in readers’ minds |
| Generating clients from stale YAML | Compile-time lies |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| `/api/docs` 404 | Production env or mount missing | `nodeEnv`; `app.ts` | Use development |
| Try-it-out wrong server | `servers.url` mismatch | Port/base path | Fix servers entry |
| UI shows field FE never gets | YAML drift | Compare real JSON | Update schema |
| Bearer lock icon fails | Missing security on operation | Path `security:` | Add bearerAuth |
| YAML parse crash on boot | Invalid YAML | Server startup stack | Fix syntax |

---

## 11. Interview Q&A (with strong answers)

**Q: What is OpenAPI?**  
**A:** A standard YAML/JSON description of HTTP APIs (paths, parameters, bodies, responses, auth) used for docs, codegen, and testing.

**Q: Contract-first vs code-first?**  
**A:** Contract-first designs the doc (or edits it as peer truth) before/with implementation. Code-first emits docs from code annotations. Hybrids exist; the key is preventing drift.

**Q: Why Swagger UI?**  
**A:** Interactive documentation: humans explore and execute calls against a live server.

**Q: How does this repo load the spec?**  
**A:** Reads `backend/docs/openapi.yaml` with `fs` + `yaml` parse, mounts `swagger-ui-express` at `/api/docs` when not production.

**Q: What belongs in `ErrorMessage`?**  
**A:** Stable client-safe fields — here `message` and `requestId`, not stacks.

**Q: How do you stop drift?**  
**A:** Same PR for code+YAML; contract tests; review checklists; optionally codegen from one side only.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| OpenAPI | Spec format for HTTP APIs (formerly Swagger spec) |
| Swagger UI | Browser UI rendering an OpenAPI document |
| Contract | Agreed request/response behavior |
| Component schema | Reusable `$ref`-able type in OpenAPI |
| Bearer auth | `Authorization: Bearer <jwt>` |
| Drift | Doc and implementation disagree |

---

## 13. Teach pointer

> “If it isn’t in the contract, clients can’t rely on it — and if the contract lies, everyone pays.”

---

## 14. Optional further reading (not required)

- REST shape: [rest-resource-design.md](./rest-resource-design.md)  
- Status codes: [http-status-semantics.md](./http-status-semantics.md)  
- Contract testing: [../testing/contract-testing.md](../testing/contract-testing.md)  
- Validation: [validation-boundary.md](./validation-boundary.md)

Repo paths: `backend/docs/openapi.yaml`, `backend/src/app.ts`.
