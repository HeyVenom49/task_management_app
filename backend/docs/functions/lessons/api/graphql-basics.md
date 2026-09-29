# Lesson: GraphQL basics (and when REST fits better)

**Standalone ✓** — You do not need any other doc to understand GraphQL tradeoffs vs this Express REST API.

**After this file you can:** explain schema/query/mutation/resolver, name N+1 and complexity risks, compare to `/api/v1` resource routes, and answer “why REST here?” confidently.

---

## 1. First principles

**GraphQL** is a **query language** and runtime where clients request a **tree of fields** in one HTTP POST, and the server **resolvers** fetch data for each field.

**Why it exists:** Mobile apps wanted **one round trip** with exactly the fields needed — avoid over-fetching `/users` then `/users/1/posts`.

**The problem it solves:** Rigid REST responses that bundle too much or too little data per screen.

**Cost:** Server must guard **query cost**, caching is harder at HTTP layer, and errors are partial inside `200 OK`.

---

## 2. Mental model

### Analogy

Restaurant custom combo: you list exact items on one order ticket (query). Kitchen (resolvers) assembles each item — if grill is slow for every burger, one ticket can still overwhelm the kitchen (N+1).

### Diagram

```text
POST /graphql
{ project(id) { name tasks { title assignee { email } } } }
        │
        ▼
Root resolver ──► tasks resolver ──► assignee resolver (× N tasks)
```

### REST equivalent (this project)

```text
GET /api/v1/projects/:id
GET /api/v1/projects/:id/tasks
```

Multiple requests or a tailored BFF aggregate — simpler caching, explicit routes.

---

## 3. Core rules (must / must-not)

1. **MUST** enforce **max query depth/complexity** in production GraphQL.  
2. **MUST** solve **N+1** with dataloaders/batch queries.  
3. **MUST NOT** expose GraphQL without **authz per field** — introspection leaks schema.  
4. **MUST** treat mutations as **non-idempotent** unless designed with keys.  
5. **SHOULD** use **persisted queries** for mobile in production.  
6. **MUST NOT** assume GraphQL replaces validation — args still need schemas.

---

## 4. How it works (mechanics)

| Concept | Role |
|---------|------|
| Schema | Types, Query, Mutation definitions |
| Resolver | Function fetching field data |
| Context | Per-request `{ user, db }` |
| Introspection | Schema discovery — disable in prod often |

Single endpoint `POST /graphql` vs REST’s many URLs (`v1.ts` mounts).

---

## 5. When to use / when not to use

| Situation | GraphQL | REST (this app) |
|-----------|---------|-----------------|
| Many clients, diverse field needs | Strong | BFF or include params |
| Public HTTP caching CDN | Harder | GET resources easy |
| Strict resource authz boundaries | Needs field guards | Natural in URL nesting |
| Small team, one SPA | Optional | **REST + OpenAPI** sufficient |
| File upload / binary | Awkward | Separate routes |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Model types aligned with domain (Project, Task, Member).  
2. Auth rules per type/field.  
3. Complexity budget.

### Implement

1. Apollo/Yoga on Express alongside or instead of REST.  
2. Share **services** with REST controllers — don’t duplicate business logic.  
3. Dataloader for members by id.

### Verify

1. Deep nested query rejected.  
2. Non-member cannot resolve `project.tasks`.  
3. Load test vs equivalent REST.

---

## 7. Worked example A — this project (REST contrast)

**Express REST** (`api/v1.ts`):

```ts
v1Router.use("/projects", projectRouter);
v1Router.use("/projects/:id/tasks", taskRouter);
```

**Validation boundary** (`auth.controller.ts` pattern):

```ts
const parsed = registerSchema.safeParse(req.body);
```

GraphQL would move parsing to **arg types** + Zod in resolvers — same untrusted input, different entry shape.

**OpenAPI:** Dev docs at `/api/docs` from `openapi.yaml` — REST contract is explicit per path; GraphQL uses schema SDL instead.

**Why REST chosen here (typical):** Clear nested authz for project-scoped tasks, cookie auth, rate limits on auth routes, straightforward integration tests hitting `/api/v1/...`.

---

## 8. Worked example B — mini scenario (self-contained)

Query:

```graphql
query {
  me { projects { id info tasks(status: IN_PROGRESS) { title } } }
}
```

Resolver anti-pattern: `tasks` resolver runs `SELECT * FROM tasks WHERE project_id = $1` per project inside loop → N+1. Fix: batch `WHERE project_id = ANY($ids)`.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Public introspection | Attackers map surface |
| Unbounded nested query | DoS |
| Resolver calls HTTP per field | Latency explosion |
| GraphQL as ORM bypass | SQL injection in raw strings |
| 200 with errors ignored | Client misses partial failure |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Slow list screen | N+1 | Trace SQL count | DataLoader |
| Random 401 | Context user missing | Auth middleware | Wire context |
| Huge response | Client over-fetchs fields | Query review | Persisted queries |

---

## 11. Interview Q&A (with strong answers)

**Q: GraphQL vs REST?**  
**A:** GraphQL optimizes flexible reads and aggregation; REST optimizes simple caching, explicit routes, and standard HTTP semantics. Many teams use REST for CRUD APIs like task management unless client diversity demands GraphQL.

**Q: N+1?**  
**A:** One resolver invocation per child object each triggering a query — fix by batching loads.

**Q: HTTP status in GraphQL?**  
**A:** Often 200 with `{ data, errors }` — clients must inspect `errors` array.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Resolver | Function providing a field’s value |
| N+1 | One query per item in a list |
| DataLoader | Batching/caching loader utility |
| BFF | Backend-for-frontend aggregating APIs |

---

## 13. Teach pointer

> “GraphQL trades URL simplicity for query flexibility — pay for that flexibility with complexity limits and batching discipline.”

---

## 14. Optional further reading (not required)

- REST design: [./rest-resource-design.md](./rest-resource-design.md)  
- BFF: [../architecture/bff-pattern.md](../architecture/bff-pattern.md)
