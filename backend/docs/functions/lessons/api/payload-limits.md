# Lesson: Payload limits (request body size)

**Standalone ✓** — You do not need any other doc to cap JSON bodies and defend against abuse in Express.

**After this file you can:** explain why body limits exist, configure `express.json({ limit })`, relate limits to validation max lengths, and debug 413/payload errors.

---

## 1. First principles

Every HTTP request body consumes **memory and CPU** to parse. Attackers (or buggy clients) can send **multi-megabyte JSON** to exhaust workers.

**Payload limits** reject oversize bodies **before** your controllers and Zod run — cheap defense at the edge.

**The problem it solves:** Without a cap, a few huge POSTs can DoS a small Node process; validation `max(500)` on a string doesn’t help if the parser already loaded 50MB.

---

## 2. Mental model

### Analogy

Mailbox slot size: letters only through the slot; packages go to the loading dock (different mechanism — multipart/file uploads). JSON API “letters” get a strict slot width.

### Diagram

```text
Client POST body
      │
      ▼
express.json({ limit: "100kb" })  ──► too large? reject early
      │
      ▼
req.body (parsed object)
      │
      ▼
Zod max lengths (second line of defense)
```

---

## 3. Core rules (must / must-not)

1. **MUST** set a global JSON body limit appropriate for your largest legitimate endpoint.  
2. **MUST** align limit with **Zod `max()`** on string fields — limit ≥ worst-case structured payload, not single field alone.  
3. **MUST NOT** assume “our UI never sends big JSON” — scripts and attackers do.  
4. **MUST** use **separate** upload paths (multipart/streaming) for files — not giant base64 in JSON.  
5. **SHOULD** return clear **413 Payload Too Large** (Express default behavior for limit exceeded).  
6. **MUST NOT** increase limit without reviewing memory and reverse-proxy timeouts.

---

## 4. How it works (mechanics)

Express `body-parser` (via `express.json`) reads the stream until size exceeds `limit`, then aborts with an error passed to error middleware.

**This project:** `100kb` — plenty for auth payloads, project info, task title/description with metadata.

**Layered defense:**

| Layer | What it stops |
|-------|----------------|
| `express.json` limit | Huge raw bodies |
| Zod `max(500)` etc. | Absurd field values within parsed JSON |
| DB column types | Oversize at persistence |

---

## 5. When to use / when not to use

| Situation | Approach |
|-----------|----------|
| Typical REST JSON CRUD | Global `express.json({ limit })` |
| File uploads | Multipart with per-file cap, not JSON |
| Admin bulk import | Dedicated endpoint + streaming + auth |
| Webhooks with large payloads | Separate route limit or raw body parser |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Estimate largest JSON document (all fields + arrays).  
2. Add safety margin; pick limit (e.g. 100kb).  
3. Document for API consumers.

### Implement

1. Set limit in `app.ts` before routes.  
2. Mirror field max in Zod schemas.  
3. Ensure proxy (nginx) `client_max_body_size` ≥ app limit.

### Verify

1. Send 200kb JSON → expect rejection before controller.  
2. Send valid max-length strings → 200/201.  
3. Load test: confirm memory stable under attack-shaped traffic.

---

## 7. Worked example A — this project

`backend/src/app.ts`:

```ts
app.use(express.json({ limit: "100kb" }));
```

Mounted **after** cookie parser and logging, **before** `/api` router — all JSON API routes inherit the cap.

**Schemas** (examples):

```ts
// project.schema.ts
info: z.string().trim().min(1).max(500),

// task.schema.ts
title: z.string().trim().min(1).max(200),
description: z.string().trim().max(500).optional().nullable(),
```

Even if limit were 1MB, a 10,000-character title still fails Zod at the controller with **400** — two independent guards.

---

## 8. Worked example B — mini scenario (self-contained)

**Bug:** Team sets `limit: "10mb"` “to be safe” but never adds field limits — attacker sends 10MB string in one field → memory spike per request.

**Fix:** `limit: "256kb"` globally + Zod per-field max + rate limiting on write endpoints.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| No body limit | Easy memory DoS |
| Base64 file in JSON | Blows limit and CPU |
| Huge limit “just in case” | Weak protection |
| Limit only in nginx, not app | Inconsistent behavior dev vs prod |
| Only DB TEXT limit | Parse already happened |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| 413 / payload error | Body > limit | Request size | Shrink payload or raise limit deliberately |
| 400 Validation failed | Field max | Zod errors | Client obeys schema |
| Empty `req.body` | Wrong Content-Type | Headers | `application/json` |
| Works locally, fails in prod | Stricter proxy | nginx config | Align limits |

---

## 11. Interview Q&A (with strong answers)

**Q: Why both parser limit and Zod max?**  
**A:** Parser limit bounds total request size early; Zod enforces per-field contract and returns field-level 400 for clients.

**Q: Where to handle file uploads?**  
**A:** Separate multipart/stream pipeline with file size limits and virus scanning — not `express.json`.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Body parser | Middleware that reads HTTP body into `req.body` |
| 413 | Payload Too Large |
| DoS | Denial of service — exhausting resources |

---

## 13. Teach pointer

> “Cap the pipe before you parse the JSON — field validation is the second fence.”

---

## 14. Optional further reading (not required)

- File uploads: [./file-uploads.md](./file-uploads.md)  
- Rate limits: [./rate-limit-algorithms.md](./rate-limit-algorithms.md)
