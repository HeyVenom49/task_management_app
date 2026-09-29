# Lesson: Multi-tenancy

**Standalone ✓** — Tenant isolation models, authz implications, and how this single-tenant-style task app scopes by project membership.

**After this file you can:** choose silo vs pool vs bridge models, prevent cross-tenant leaks, design schema keys, and interview on SaaS isolation.

---

## 1. First principles

**Multi-tenancy** means one software deployment serves **many customers (tenants)** with logical isolation—each tenant’s data and policies separated.

Models:

- **Silo:** DB (or schema) per tenant—strong isolation, higher cost.  
- **Pool:** shared tables with `tenant_id` column—economical, requires rigorous filters.  
- **Bridge:** hybrid (pooled app, siloed DB for big tenants).

The problem it solves: SaaS economics—one ops stack, many customers. The problem it creates: **one missing WHERE tenant_id** → catastrophic data leak.

---

## 2. Mental model

### Analogy

Apartment building (pool) vs separate houses (silo)—same city utilities, but apartment needs locked doors on every unit (tenant filter on every query).

### Diagram

```text
  Pool model:
  ┌──────────────────────────────────────┐
  │ projects (tenant_id, id, name, …)   │
  │ tasks    (tenant_id, project_id, …)  │
  └──────────────────────────────────────┘
         ▲
         └── every query: WHERE tenant_id = $currentTenant

  This app (team-scoped via projects, not tenant_id column):
  users ──membership──► projects ──► tasks
```

---

## 3. Core rules (must / must-not)

1. **MUST** resolve tenant (or equivalent scope) **once** per request from auth, not client body alone.  
2. **MUST** apply scope in **services/repositories**—defense in depth.  
3. **MUST NOT** trust `tenantId` query param without binding to authenticated principal.  
4. **SHOULD** add DB constraints (FK, composite keys) including tenant key when pooled.  
5. **SHOULD** test cross-tenant access attempts in every module.  
6. **MUST NOT** cache responses keyed without tenant/project scope.

---

## 4. How it works (mechanics)

**Pool implementation checklist:**

- JWT includes `tenant_id` or map user → tenant.  
- Middleware sets `req.tenantId`.  
- Repos: `WHERE tenant_id = ${tenantId} AND id = ${id}`.  
- Unique constraints: `UNIQUE (tenant_id, slug)`.

**This project:** Not labeled “multi-tenant SaaS.” Isolation is **project-scoped**:

- User sees projects where they have **ACTIVE membership**.  
- Tasks belong to a **project**; authz via `TaskService` + `MemberRepository`.  
- Equivalent to **resource-level tenancy** (project = team workspace) without a global `tenant_id` column.

**Adding SaaS tenant layer:** Introduce `organizations` table; projects belong to org; JWT carries `orgId`; all queries filter `org_id`.

---

## 5. When to use / when not to use

| Situation | Model |
|-----------|--------|
| B2B SaaS many small customers | Pool + tenant_id |
| Regulated big clients | Silo DB |
| Single-team task app | Project membership enough |
| Enterprise one customer | Dedicated silo |

---

## 6. Step-by-step: design → implement → verify

1. Choose model (pool/silo).  
2. Identify tenant resolver (subdomain, JWT claim).  
3. Add column + backfill + composite indexes.  
4. Centralize `requireTenant(ctx)` in services.  
5. Repository base helper adds tenant predicate.  
6. Automated tests: user A cannot read user B project/task IDs (IDOR suite).

---

## 7. Worked example A — this project

**Isolation mechanism:** Not `tenant_id`—**membership graph**.

```ts
// TaskService — simplified idea
private async requireActiveMember(userId: string, projectId: string) {
  const membership = await this.memberRepo.findByUserAndProject(userId, projectId);
  if (!membership || membership.status !== "ACTIVE") {
    throw new ForbiddenError("You do not have access to this project");
  }
  return membership;
}
```

**List projects:** returns only projects user belongs to—no global project listing.

**Tests:** `tasks.idor.test.ts`, `tasks.authz.test.ts`—prove cross-project access fails.

**Hypothetical SaaS upgrade:**

```sql
ALTER TABLE projects ADD COLUMN org_id UUID NOT NULL;
-- JWT: org_id claim; ProjectRepository list WHERE org_id = $org AND user member
```

---

## 8. Worked example B — self-contained mini scenario

**Pooled tenants:**

```ts
async function getInvoice(sql, tenantId: string, invoiceId: string) {
  const [row] = await sql`
    SELECT * FROM invoices
    WHERE tenant_id = ${tenantId} AND id = ${invoiceId}
  `;
  if (!row) throw new NotFoundError();
  return row;
}

// middleware
function resolveTenant(req) {
  const tenantId = req.user.tenantId; // from JWT, not body
  if (!tenantId) throw new UnauthorizedError();
  return tenantId;
}
```

Missing `tenant_id` in query → invoice from another tenant returned—classic CVE class.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Tenant id from client JSON only | Spoofing |
| One admin endpoint skips filter | Full leak |
| Shared cache key `project:5` | Cross-tenant stale/wrong |
| Silo promised, pool implemented | Compliance failure |
| Global sequential IDs only | Enumeration across tenants |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | Check | Fix |
|---------|--------------|-------|-----|
| User sees other team data | Missing authz filter | Service/repo SQL | Add membership/tenant predicate |
| 404 vs 403 debate | IDOR hiding | Policy | Consistent NotFound for cross-tenant |
| Duplicate slug across tenants | Wrong UNIQUE | Schema | UNIQUE(tenant_id, slug) |
| Test passes, prod fails | Different JWT claims | Staging config | Align claims |

---

## 11. Interview Q&A (with strong answers)

**Q: Silo vs pool?**  
**A:** Silo: separate DB per tenant—isolation and cost. Pool: shared schema with tenant column—needs strict query discipline.

**Q: Where enforce tenant isolation?**  
**A:** Every read/write path—middleware sets context, services/repos enforce predicates; tests prove negatives.

**Q: How does this app isolate?**  
**A:** Project membership—users only access projects/tasks where they are ACTIVE members; IDOR tests enforce.

**Q: Multi-tenancy vs multi-user?**  
**A:** Multi-user is many users in one product; multi-tenant is many customer orgs on one deployment with isolation guarantees.

**Q: BFF/gateway role?**  
**A:** Can resolve tenant from subdomain early—still must enforce in core services.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Tenant | Customer organization in SaaS |
| Silo model | Separate DB per tenant |
| Pool model | Shared tables + tenant_id |
| Row-level security | Postgres RLS policies |
| IDOR | Access object by id without authz |
| Organization | Top-level tenant container |

---

## 13. Teach pointer

> “Multi-tenancy is a WHERE clause culture—one omission is a headline breach.”

---

## 14. Optional further reading (not required)

- [../security/idor.md](../security/idor.md) · [modular-monolith](./modular-monolith.md)  
- [ddd-aggregates-bounded-context](./ddd-aggregates-bounded-context.md)

Repo paths: `backend/src/modules/tasks/task.service.ts`, `backend/src/test/tasks.idor.test.ts`.
