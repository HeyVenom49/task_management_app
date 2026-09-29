# Lesson: gRPC vs REST

**Standalone ✓** — You do not need any other doc to compare gRPC and HTTP/JSON APIs like this Express service.

**After this file you can:** explain protobuf, HTTP/2, streaming, when gRPC wins internally, and why this browser-facing task API uses REST + JSON.

---

## 1. First principles

**REST** (this project): resources over **HTTP/1.1 or HTTP/2**, usually **JSON** text, widespread browser and curl support.

**gRPC:** RPC framework over **HTTP/2**, **Protocol Buffers** binary contracts, strong typing, first-class **streaming**.

**The problem each solves:**

- REST: human-friendly public HTTP APIs, easy debugging, OpenAPI.  
- gRPC: low-latency **service-to-service** calls with strict schemas and codegen.

---

## 2. Mental model

### Analogy

REST = postal mail with standardized envelopes anyone can open. gRPC = inter-office pneumatic tubes with custom canisters — fast inside the building, awkward for customers at the front desk (browsers).

### Diagram

```text
Browser SPA ──HTTPS JSON──► Express /api/v1  (this app)

Service A ──gRPC protobuf──► Service B   (internal mesh, not this repo)
```

---

## 3. Core rules (must / must-not)

1. **MUST** use **REST/JSON** (or GraphQL) for **browser-first** public APIs unless you add gRPC-Web with extra complexity.  
2. **MUST** use **gRPC** (or similar) when you need **strong contracts**, high RPS internal calls, or bidirectional streams.  
3. **MUST NOT** expose raw gRPC to the public internet without TLS and auth (mTLS common).  
4. **SHOULD** generate clients from **proto** or **OpenAPI** — avoid hand-written drift.  
5. **MUST** version protobuf messages carefully (field numbers never reused).

---

## 4. How it works (mechanics)

| Aspect | REST (this app) | gRPC |
|--------|-----------------|------|
| Payload | JSON | Protobuf binary |
| Contract | OpenAPI yaml | `.proto` files |
| Streaming | SSE/WebSockets optional | Native unary/stream |
| Browser | Native fetch | gRPC-Web proxy needed |
| Status | HTTP codes | `grpc-status` codes |

**This stack entry:**

```ts
app.use(express.json({ limit: "100kb" }));
app.use("/api", apiRouter);
```

Controllers parse Zod → services — no protobuf codegen.

---

## 5. When to use / when not to use

| Situation | Choice |
|-----------|--------|
| SPA + mobile HTTP clients | REST |
| Internal microservice chatter | gRPC |
| File streaming bulk export | gRPC stream or HTTP chunked |
| Third-party webhooks | REST JSON |
| Low-latency trading internal | gRPC |

---

## 6. Step-by-step: design → implement → verify

### Pick REST (this project)

1. Model resources in OpenAPI.  
2. Express routers + Zod.  
3. JWT/cookie auth.

### If adding gRPC later

1. Define proto services mirroring domain services, not HTTP controllers 1:1.  
2. Share business logic in TypeScript services called by both transports.  
3. mTLS between pods.

### Verify

1. Contract tests OpenAPI or proto breaking-change detection.  
2. Load compare latency internal only.

---

## 7. Worked example A — this project

**Public API surface:**

```text
POST /api/v1/auth/login     JSON body, Zod loginSchema
GET  /api/v1/projects       authenticate middleware
PATCH /api/v1/projects/:id/tasks/:taskId   mergeParams + taskParamsSchema
```

**Error mapping** (`errorHandler.ts`): HTTP status + JSON `{ message, requestId }` — gRPC would map to `INVALID_ARGUMENT`, `NOT_FOUND`, etc.

**Dev experience:** Swagger UI at `/api/docs` — gRPC would use `grpcurl` or Buf Studio instead.

---

## 8. Worked example B — mini scenario (self-contained)

`task.service.proto`:

```protobuf
service TaskService {
  rpc ListTasks(ListTasksRequest) returns (ListTasksResponse);
}
```

Go worker calls gRPC; Express gateway still exposes REST to SPA — **anti-corruption layer** translates DTOs.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| gRPC to browser directly | Poor tooling |
| REST without schema | Drift |
| Two diverging business logics | Bugs |
| JSON inside proto bytes | Worst of both |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| DEADLINE_EXCEEDED gRPC | Timeout | Server latency | Tune deadlines |
| REST 404 vs gRPC NOT_FOUND | Mapping | Error layer | Document map |
| Proto breaking change | Field reuse | Buf breaking check | New field numbers |

---

## 11. Interview Q&A (with strong answers)

**Q: Why REST for this task app?**  
**A:** Browser clients, cookie auth, OpenAPI docs, and standard HTTP debugging — sufficient for domain CRUD without protobuf toolchain.

**Q: gRPC advantages?**  
**A:** Binary efficiency, HTTP/2 multiplexing, strict interfaces, streaming — excellent internal east-west traffic.

**Q: Can one service do both?**  
**A:** Yes — shared domain services; REST and gRPC are transport adapters.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Protobuf | Binary serialization format |
| mTLS | Mutual TLS — client and server certs |
| Unary RPC | Single request/response |
| OpenAPI | REST API description format |

---

## 13. Teach pointer

> “Pick transport for your client: humans and browsers want HTTP+JSON; datacenter services want contracts and speed.”

---

## 14. Optional further reading (not required)

- REST resources: [./rest-resource-design.md](./rest-resource-design.md)  
- API gateway: [./api-gateway.md](./api-gateway.md)
