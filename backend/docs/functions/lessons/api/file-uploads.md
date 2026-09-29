# Lesson: File uploads (HTTP)

**Standalone ✓** — You do not need any other doc to handle files safely outside JSON body parsers.

**After this file you can:** explain why uploads differ from `express.json`, choose multipart vs presigned URLs, set size/type limits, and know why this JSON API does not upload binaries in-band.

---

## 1. First principles

**File uploads** move **binary or large blobs** from client to storage. They must **not** flow through the same path as small JSON CRUD — memory spikes, slow parsing, and virus scanning need different pipelines.

**The problem it solves:** Task title JSON belongs in `express.json({ limit: "100kb" })`; a 20MB screenshot does not.

This project stores **text fields** (project info, task title/description) — **no multipart upload endpoints** today. Attachments would be a new bounded feature.

---

## 2. Mental model

### Analogy

JSON API = mailbox slot. File upload = loading dock with weigh station, manifest check, and forklift — different entrance.

### Diagram

```text
Option A: multipart/form-data ──► API ──► object storage (S3)
Option B: POST /upload-url ──► presigned PUT ──► client uploads direct to S3
Option C: base64 in JSON ──► ✗ avoid
```

---

## 3. Core rules (must / must-not)

1. **MUST NOT** embed large files as base64 in JSON for production APIs.  
2. **MUST** enforce **max file size** at parser/stream and at reverse proxy.  
3. **MUST** validate **content type** and **magic bytes** — not only `Content-Type` header.  
4. **MUST** store files in **object storage**, not Postgres BYTEA, for large media.  
5. **MUST** authorize **who** may upload to **which** resource (project/task scope).  
6. **MUST** generate **non-guessable** object keys or use signed URLs.  
7. **SHOULD** scan malware async; block obvious failures at edge.

---

## 4. How it works (mechanics)

### Multipart (`multipart/form-data`)

Middleware like `multer` or `busboy` streams parts — field + file — with per-file limits.

### Presigned URL (common at scale)

1. Client asks API for upload permission.  
2. API returns short-lived PUT URL + expected metadata.  
3. Client uploads directly to storage.  
4. Client notifies API to attach metadata row in DB.

### Download

Serve via signed GET URLs — API checks authz before signing.

---

## 5. When to use / when not to use

| Situation | Approach |
|-----------|----------|
| Avatar, task attachment | Presigned or multipart + S3 |
| Tiny config JSON | `express.json` |
| Virus scan required | Async queue after upload |
| Public CDN assets | Separate bucket policy |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Max size per tier; allowed MIME list.  
2. Storage backend and key layout `projects/{id}/tasks/{id}/{uuid}`.  
3. DB row: `file_key`, size, uploader, created_at.

### Implement

1. New route **not** covered by generic JSON only — dedicated router.  
2. Reuse auth: `authenticate` + project membership like `task.routes.ts`.  
3. Never exec user filenames — sanitize display name only.

### Verify

1. Oversize → 413.  
2. Wrong magic bytes → 400.  
3. IDOR: other project’s presign denied.

---

## 7. Worked example A — this project (context)

**JSON stack** (`app.ts`):

```ts
app.use(express.json({ limit: "100kb" }));
```

Task descriptions max **500** chars in Zod — intentional text-only scope.

**If adding attachments**, nest like tasks:

```text
POST /api/v1/projects/:id/tasks/:taskId/attachments
```

Mirror patterns from `task.routes.ts`:

```ts
const taskRouter = Router({ mergeParams: true });
taskRouter.use(authenticate);
```

Controller would **not** use `createTaskSchema` on files — separate `attachmentMetaSchema` for JSON metadata after presigned upload completes.

---

## 8. Worked example B — mini scenario (self-contained)

```ts
// 1) Client requests slot
POST /projects/p1/attachments/presign
{ "filename": "scan.pdf", "contentType": "application/pdf", "size": 120000 }

// 2) API checks membership, size ≤ 5MB, returns { uploadUrl, fileKey }

// 3) Client PUTs bytes to uploadUrl

// 4) Client confirms
POST /projects/p1/attachments
{ "fileKey": "...", "title": "scan.pdf" }
```

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Base64 in JSON | 33% bloat + parser memory |
| Trust client MIME | Malware disguised |
| User-controlled path | Path traversal |
| Store on app disk | Scaling nightmare |
| No auth on presign | Anyone uploads to your bucket |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| 413 | Limit | multer/nginx | Align limits |
| Corrupt file | Truncated upload | Content-Length | Retry logic |
| CORS on S3 PUT | Bucket CORS | S3 policy | Allow origin PUT |
| Orphan objects | No confirm step | Lifecycle rule | GC unlinked keys |

---

## 11. Interview Q&A (with strong answers)

**Q: Why presigned URLs?**  
**A:** Upload bandwidth bypasses app servers; scale storage independently; short-lived credentials reduce exposure.

**Q: JSON API vs upload endpoint?**  
**A:** Different parsers, limits, and threat models — keep them separate.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Multipart | HTTP encoding mixing fields and files |
| Presigned URL | Time-limited authorized storage URL |
| Magic bytes | File signature identifying true type |

---

## 13. Teach pointer

> “Files are streams and storage problems — don’t squeeze them through the JSON letter slot.”

---

## 14. Optional further reading (not required)

- Payload limits: [./payload-limits.md](./payload-limits.md)  
- Path traversal: [../security/path-traversal.md](../security/path-traversal.md)
