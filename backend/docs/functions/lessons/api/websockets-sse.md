# Lesson: WebSockets and SSE (server push)

**Standalone ✓** — You do not need any other doc to choose between polling, SSE, and WebSockets for live updates.

**After this file you can:** explain SSE vs WebSocket tradeoffs, integrate with Express, and state why this task API is request/response today.

---

## 1. First principles

**Polling:** Client repeatedly `GET`s — simple, wasteful.

**SSE (Server-Sent Events):** One **long-lived HTTP** connection; server pushes **text events** downstream only.

**WebSockets:** Full **duplex** channel after upgrade — client and server send anytime.

**The problem they solve:** Task board updates, notifications, typing indicators — without refresh spam.

This Express app serves **JSON REST** only — no `ws` or SSE routes in `app.ts`. Live UI would poll `GET /api/v1/projects/:id/tasks` or add push later.

---

## 2. Mental model

### Analogy

SSE = radio broadcast (listen only). WebSocket = phone call (both talk). Polling = calling every minute to ask “news yet?”

### Diagram

```text
Polling:  GET ──► GET ──► GET ──►

SSE:      GET (open) ◄── event ◄── event ◄──

WebSocket: upgrade ◄──► ◄──► bidirectional
```

---

## 3. Core rules (must / must-not)

1. **MUST** authenticate **before** upgrade or on first SSE message — same JWT/cookie rules as `authenticate` middleware.  
2. **MUST** scope channels by **project id** — mirror URL authz (`/projects/:id/tasks`).  
3. **SHOULD** prefer **SSE** for one-way “task updated” feeds (simpler, HTTP-friendly).  
4. **USE WebSockets** when client sends frequent messages (collab cursors).  
5. **MUST NOT** broadcast all tasks globally — leak cross-tenant data.  
6. **MUST** handle **reconnect** with `Last-Event-ID` (SSE) or client resync via GET.  
7. **MUST** scale with **pub/sub** (Redis) when multiple Node instances — local `EventEmitter` isn’t enough.

---

## 4. How it works (mechanics)

### SSE (Express sketch)

```ts
res.setHeader("Content-Type", "text/event-stream");
res.write(`data: ${JSON.stringify(payload)}\n\n`);
```

Proxies: disable buffering (`X-Accel-Buffering: no`).

### WebSocket

Upgrade handshake; frame protocol; heartbeats for NAT timeouts.

### vs this REST list

```ts
taskRouter.get("/", (req, res, next) => controller.list(req, res, next));
```

Push replaces repeated list GET after initial snapshot + events.

---

## 5. When to use / when not to use

| Situation | Mechanism |
|-----------|-----------|
| Task list refresh | SSE or poll |
| Chat comments live | WebSocket |
| Admin metrics dash | SSE |
| Mobile background | Push notifications (FCM), not raw WS |
| Rare updates | Poll + ETag |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Event types: `task.created`, `task.updated`.  
2. Channel: `project:{uuid}`.  
3. Fallback poll interval.

### Implement

1. Redis pub/sub: service publishes after successful `TaskService.create`.  
2. SSE route under `/api/v1/projects/:id/events` with membership check.  
3. CORS: SSE cross-origin needs same `cors` origin allowlist as `app.ts`.

### Verify

1. User A’s socket never sees project B events.  
2. Reconnect receives missed events or client refetches list.  
3. Load test connection count.

---

## 7. Worked example A — this project (integration points)

**Auth:** `taskRouter.use(authenticate)` — SSE route would reuse same middleware before switching to stream response.

**CORS** (`app.ts`):

```ts
cors({ origin: env.frontendUrl, credentials: true }),
```

Browser `EventSource` with cookies requires allowed origin + credentials — same as fetch.

**After write push (hypothetical):**

```ts
// inside TaskService.create after commit
await redis.publish(`project:${projectId}`, JSON.stringify({ type: "task.created", task }));
```

**Validation stays on REST writes** — push carries server-generated payloads, not trusted client shapes.

---

## 8. Worked example B — mini scenario (self-contained)

```ts
// SSE handler
const member = await memberRepo.activeMembership(userId, projectId);
if (!member) { res.status(403).end(); return; }

res.flushHeaders();
const sub = redis.subscribe(`project:${projectId}`, (msg) => {
  res.write(`event: task\ndata: ${msg}\n\n`);
});
req.on("close", () => sub.unsubscribe());
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Push without authz | IDOR stream |
| In-memory only events | Missed on other instance |
| WebSocket for one-way | Extra complexity |
| No heartbeat | Silent disconnects |
| Huge payloads in every event | Bandwidth |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Events stop | Proxy buffer | nginx buffering | Disable buffer |
| CORS on EventSource | Origin | cors config | Match frontend URL |
| Stale UI | Missed events | Reconnect logic | Snapshot GET on connect |
| CPU high | Poll fallback too fast | Interval | Backoff |

---

## 11. Interview Q&A (with strong answers)

**Q: SSE vs WebSocket?**  
**A:** SSE is HTTP one-way, auto-reconnect, works through many proxies; WebSocket is duplex for interactive apps.

**Q: Why not WebSocket everywhere?**  
**A:** Operational and auth complexity; one-way notifications fit SSE.

**Q: How scale push?**  
**A:** Pub/sub backbone; sticky sessions alone insufficient for broadcast across nodes.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| SSE | Server-Sent Events |
| Duplex | Two-way communication |
| Last-Event-ID | SSE resume header |
| Pub/sub | Publish subscribe messaging |

---

## 13. Teach pointer

> “Push is still your API’s authz model — streaming bits doesn’t stream permission checks.”

---

## 14. Optional further reading (not required)

- CORS: [./cors.md](./cors.md)  
- Redis pub/sub: [../architecture/pub-sub.md](../architecture/pub-sub.md)
