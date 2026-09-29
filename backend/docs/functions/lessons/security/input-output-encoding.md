# Lesson: Input and output encoding

**Standalone ✓** — You do not need any other doc to treat untrusted data safely at boundaries (API, HTML, logs).

**After this file you can:** distinguish validation vs encoding, prevent XSS in future UI, handle Unicode safely in JSON APIs, avoid log injection, and interview on context-specific encoding.

---

## 1. First principles

**Validation** asks: “Is this acceptable input for our business rules?” (length, format, enum).  
**Encoding (escaping)** asks: “How do we represent this data safely in **this output context**?” (HTML, URL, SQL, shell).

Same string is safe in JSON API response but dangerous if pasted into HTML without escaping.

**Problem it removes:** Stored XSS when task titles render in a web UI; log forging; broken parsers.

---

## 2. Mental model

### Analogy

Electrical plugs differ by country. Validation = “is this a valid appliance?” Encoding = “use the right adapter for the socket.”

### Diagram

```text
Client ──JSON──► API validate (Zod) ──► store UTF-8 text
                                              │
Browser ◄── JSON ◄── API                     │
      └── frontend encodes for HTML when rendering (future UI)
```

This backend is JSON-only; **primary encoding responsibility for HTML is the frontend**. Backend still validates and avoids reflecting secrets.

---

## 3. Core rules (must / must-not)

1. **MUST** validate structure and bounds at API (Zod).  
2. **MUST** use `Content-Type: application/json` and parse with size limits.  
3. **MUST NOT** echo raw user input into HTML/email templates without escaping (when added).  
4. **MUST NOT** log unsanitized user input as structured field names without care (log injection).  
5. **SHOULD** store text as plain UTF-8; normalize email (trim, lower).  
6. **MUST** parameterize SQL (separate lesson) — not “encoding” but critical boundary.

---

## 4. How it works (mechanics)

### Input (this API)

- `express.json({ limit: "100kb" })` — DoS bound.  
- Zod: trim strings, email normalization, max password length.  
- Reject invalid JSON via Express parser → 400.

### Output

- `res.json({ task })` — JSON serializer escapes strings for JSON context.  
- Error messages are generic on auth paths (no stack to client in prod via error handler).

### Future HTML client

Use framework auto-escape (React text nodes) or explicit encode for `dangerouslySetInnerHTML` (avoid).

---

## 5. When to use / when not to use

| Validate on server | Trust client validation only |
|--------------------|------------------------------|
| Always | Never |

| Encode per context | One “sanitize” library for all |
|--------------------|--------------------------------|
| HTML vs JS vs URL | Wrong tool breaks data |

---

## 6. Step-by-step: design → implement → verify

1. Schema every body/query param.  
2. Set body size limit.  
3. Return JSON only for API.  
4. Frontend: encode on render; CSP headers when serving HTML (optional lesson).  
5. Test with `<script>alert(1)</script>` in title — stored OK in DB; must not execute in UI.

---

## 7. Worked example A — this project

### A1. JSON body limit

```ts
app.use(express.json({ limit: "100kb" }));
```

**Where:** `backend/src/app.ts`.

### A2. String normalization

```ts
name: z.string().trim().min(3),
email: z.email().trim().toLowerCase(),
```

**Where:** `backend/src/modules/auth/auth.schema.ts`.

### A3. Task title/description

Validated in task schema/types before persistence — stored as user text; JSON API returns them without HTML interpretation.

**Where:** `backend/src/modules/tasks/task.schema.ts`, controllers.

### A4. Error handler (no raw stack leak pattern)

Central `errorHandler` maps `AppError` to status — keep production responses stable.

**Where:** `backend/src/shared/middleware/errorHandler.ts`.

---

## 8. Worked example B — mini scenario (self-contained)

**Render comment in HTML**

```html
<!-- BAD -->
<div>${userComment}</div>

<!-- GOOD (template engine auto-escape) -->
<div>{{ userComment }}</div>
```

In React: `{comment}` in JSX text node — escaped by default.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Context |
|--------------|---------|
| `innerHTML = title` | XSS |
| Strip all `<` in API | Breaks legitimate text |
| URL encode in JSON body | Wrong layer |
| Reflect error stack to client | Info leak |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| XSS in UI | No HTML encode | Frontend render | Escape |
| Broken emoji | Wrong charset | DB UTF8 | Ensure UTF-8 |
| Huge body 413/400 | Limit | app.ts limit | Tune limit |
| Log lines forged | `\n` in input | Log structure | JSON logs, sanitize |

---

## 11. Interview Q&A (with strong answers)

**Q: Validation vs encoding?**  
**A:** Validation rejects bad input; encoding safely represents accepted data in a specific output format (HTML, SQL, etc.).

**Q: Is JSON.stringify enough for XSS?**  
**A:** For JSON HTTP responses yes in JSON context; XSS happens when that data is inserted into HTML/JS without HTML encoding.

**Q: Where encode task titles?**  
**A:** At HTML render time in the client (or SSR template), not necessarily at store time.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Encoding/escaping | Represent data safely in a context |
| XSS | Script injection via output context |
| Normalization | Consistent form (lowercase email) |
| Context | HTML attribute, JS string, SQL, etc. |

---

## 13. Teach pointer

> “Validate at the door; encode for the room you’re entering.”

---

## 14. Optional further reading (not required)

- XSS/cookies: [cookies-xss-csrf](./cookies-xss-csrf.md)  
- Headers: [security-headers](./security-headers.md)
