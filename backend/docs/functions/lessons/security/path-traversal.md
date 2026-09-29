# Lesson: Path traversal

**Standalone ✓** — You do not need any other doc to prevent `../` escapes when serving or reading files by user-supplied paths.

**After this file you can:** explain directory traversal, canonicalize paths safely, avoid string concat file APIs, assess this JSON API’s risk, and design safe file upload/download later.

---

## 1. First principles

**Path traversal** tricks file operations into reading or writing **outside** the intended directory using sequences like `../../../etc/passwd` or encoded variants (`..%2f`).

Defense: **never** use raw user input as path; map ids to server-controlled names; resolve paths and ensure result stays under a **root jail**.

**This API** does not expose arbitrary file read/write — only reads OpenAPI spec from fixed path in dev. Risk rises if you add attachments export/import.

---

## 2. Mental model

### Analogy

Filing cabinet: clerk must fetch folder **by record id from index**, not by whatever path the customer writes on a slip.

### Diagram

```text
UNSAFE: open(BASE + userInput)
SAFE:   id ──► lookup stored_filename ──► open(join(root, stored_filename))
              verify resolved.startsWith(root)
```

---

## 3. Core rules (must / must-not)

1. **MUST** use basenames or opaque ids, not user path strings.  
2. **MUST** resolve with `path.resolve` and check prefix under root.  
3. **MUST NOT** pass `req.params.filename` directly to `readFile`.  
4. **MUST** reject `..`, absolute paths, and NUL bytes in names.  
5. **SHOULD** store uploads outside web root with random object keys (S3-style).

---

## 4. How it works (mechanics)

### Node pitfall

```ts
// BAD
readFileSync(`./uploads/${req.query.name}`);

// BETTER
const safe = path.basename(req.query.name);
const full = path.resolve(UPLOAD_ROOT, safe);
if (!full.startsWith(UPLOAD_ROOT + path.sep)) throw forbidden();
```

### This repo (fixed path only)

```ts
readFileSync(
  join(import.meta.dirname, "../docs/openapi.yaml"),
  "utf8",
);
```

No user-controlled segment — **not vulnerable** to traversal for that read.

**Where:** `backend/src/app.ts` (non-production Swagger).

---

## 5. When to use / when not to use

| Path jail + id indirection | User chooses path |
|----------------------------|-------------------|
| Downloads, exports | Never |

| Object storage (S3) | Local FS |
|---------------------|----------|
| Keys not paths | Need strict jail |

---

## 6. Step-by-step: design → implement → verify

1. Prefer cloud object keys over filesystem.  
2. If local: random uuid filename on upload.  
3. Download by uuid through authz check.  
4. Unit test `../../etc/passwd` → 400.  
5. WAF optional, not primary control.

---

## 7. Worked example A — this project

Swagger load uses constant relative path — no user input:

```ts
if (env.nodeEnv !== "production") {
  const raw = readFileSync(
    join(import.meta.dirname, "../docs/openapi.yaml"),
    "utf8",
  );
  ...
}
```

**Where:** `backend/src/app.ts`.

Task/project data flows through Postgres ids (UUID), not filesystem paths — traversal class mitigated for current scope.

Authz still required on those ids ([idor](./idor.md) — optional).

---

## 8. Worked example B — mini scenario (self-contained)

```ts
function openUserFile(userId: string, fileId: string) {
  const meta = db.files.get(fileId);
  if (meta.userId !== userId) throw forbidden();
  const full = path.resolve(STORAGE_ROOT, meta.storageKey);
  if (!full.startsWith(STORAGE_ROOT)) throw badRequest();
  return fs.createReadStream(full);
}
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Result |
|--------------|--------|
| `sendFile(req.params.path)` | Read any file |
| Zip slip on extract | Write outside dir |
| Decode once only | `..%252f` bypass |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| Secret file leaked | Traversal in download | Handler path build | Jail + basename |
| Works on Windows only | `\` vs `/` | normalize | resolve + prefix check |
| 404 for valid file | Wrong root | STORAGE_ROOT env | Config |

---

## 11. Interview Q&A (with strong answers)

**Q: What is path traversal?**  
**A:** Supplying path metacharacters to escape intended directory and access other files.

**Q: Primary fix?**  
**A:** Do not use user input as path; map to server-controlled names and verify resolved path stays under root.

**Q: Does UUID task id prevent traversal?**  
**A:** UUIDs help IDOR context; traversal applies to filesystem operations, not SQL ids.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Path traversal | Directory escape via `..` |
| Canonical path | Fully resolved absolute path |
| Jail/root | Allowed directory prefix |
| Zip slip | Traversal via archive extract |

---

## 13. Teach pointer

> “Users name files; servers name storage locations.”

---

## 14. Optional further reading (not required)

- File uploads API: [../api/file-uploads.md](../api/file-uploads.md)  
- IDOR: [idor](./idor.md)
