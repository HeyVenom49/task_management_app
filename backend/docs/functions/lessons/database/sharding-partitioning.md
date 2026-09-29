# Lesson: Sharding and partitioning

**Standalone ✓** — You do not need any other doc to distinguish table partitioning from application sharding and know when this task app doesn’t need them yet.

**After this file you can:** explain range/list/hash partitioning, shard keys, cross-shard query costs, and answer interview questions.

---

## 1. First principles

**Partitioning** splits one logical **table** into physical chunks **inside one Postgres** instance (by range, list, hash).

**Sharding** splits data **across multiple databases** — application routes by **shard key**.

**Why they exist:** Tables or write throughput exceed one machine’s comfortable capacity.

**The problem they solve:** “Keep queries and storage manageable at very large scale.”

---

## 2. Mental model

### Analogy

**Partitioning:** one filing cabinet with labeled drawers (still one room).  
**Sharding:** several buildings; you must know **which building** holds client X’s folder.

### Diagram

```text
Partitioning (single DB):
  tasks_2024_q1 | tasks_2024_q2 | …  ──► one query planner

Sharding (multi DB):
  router(project_id) ──► shard A (projects 0-999)
                      └──► shard B (projects 1000+)
```

---

## 3. Core rules (must / must-not)

1. **MUST** choose shard/partition key aligned with **query patterns** (often `project_id` here).  
2. **MUST** avoid cross-shard joins in hot paths — design aggregates per shard.  
3. **MUST NOT** shard prematurely — ops complexity is high.  
4. **MUST** plan rebalancing and global IDs (UUID OK).  
5. **MUST NOT** confuse partitioning with backup — still one failure domain unless sharded.

---

## 4. How it works (mechanics)

### Postgres declarative partitioning

```sql
CREATE TABLE tasks (
  …
) PARTITION BY RANGE (created_at);

CREATE TABLE tasks_2026 PARTITION OF tasks
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
```

Queries with `created_at` prune partitions.

### Application sharding

Router maps `tenant_id` / `project_id` → connection pool. Cross-shard transactions **avoid** or use 2PC rarely.

### vs indexing + read replicas

Often enough before sharding: indexes, pagination, replicas, archival.

---

## 5. When to use / when not to use

| Situation | Approach |
|-----------|----------|
| This learning task app scale | Single Postgres + indexes |
| tasks table billions of rows | Partition by time or hash |
| Multi-tenant SaaS huge tenants | Shard by tenant_id |
| Archive old tasks | Detach old partitions |
| Global SQL analytics | Warehouse, not more shards |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Measure size/QPS — prove need.  
2. Pick key (`project_id` colocated tasks/members).  
3. List cross-shard operations — eliminate or async.

### Implement

1. Start with partitioning on one DB.  
2. Only then split databases if still bound.

### Verify

1. Queries hit partition pruning (`EXPLAIN`).  
2. Load test shard hotspot — even distribution?

---

## 7. Worked example A — this project

### Schema today

`tasks.project_id`, `members.project_id` — natural **colocation key** if ever sharding: all tasks for a project live together.

Single database URL in `backend/src/db/client.ts` — **no shard router**.

### Scale path before sharding

1. [pagination](./pagination.md) on task lists  
2. Index `(project_id, created_at DESC)`  
3. [replication](./replication.md) read replicas  
4. Partition old tasks by `created_at` if table huge  
5. Shard only if primary exceeds vertical scale

### FK complexity

Composite FKs to `members(id, project_id)` assume **same DB** — cross-shard FKs don’t work; use app-level checks or per-shard schema.

---

## 8. Worked example B — mini scenario (self-contained)

**Monthly partitions for events:**

```sql
CREATE TABLE events (
  id UUID,
  created_at TIMESTAMPTZ NOT NULL,
  …
) PARTITION BY RANGE (created_at);

CREATE TABLE events_2026_03 PARTITION OF events
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
```

Drop partition `events_2025_01` to archive cheaply.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| Shard day one | Operational pain |
| Random shard key | Every query hits all shards |
| Cross-shard JOIN | Latency explosion |
| Forget rebalance | Hot shard |
| Partition without query prune | Same as one big table |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| One shard CPU 100% | Skewed key | Distribution | Rehash / split hot tenant |
| Slow time-range query | No prune | EXPLAIN partitions | Add WHERE on partition key |
| FK errors after shard | Cross-shard reference | Design | Colocate related rows |
| Migration complexity | Many physical tables | Automation | Partition management |

---

## 11. Interview Q&A (with strong answers)

**Q: Partitioning vs sharding?**  
**A:** Partitioning splits table inside one database; sharding splits across multiple database instances with app routing.

**Q: Good shard key for task app?**  
**A:** Often `project_id` or `tenant_id` so project tasks and members colocate.

**Q: When partition?**  
**A:** Very large single-table time-series or archival needs — prune/drop old partitions.

**Q: Does this repo shard?**  
**A:** No — single Postgres; project_id is the logical colocation key if scaling later.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Partition | Sub-table of one logical table |
| Shard | Separate database instance |
| Shard key | Routing column |
| Partition pruning | Skip irrelevant partitions |
| Hotspot | Uneven shard load |
| Colocation | Related rows same shard |

---

## 13. Teach pointer

> “Shard when the database is the bottleneck and your key keeps queries local — not when your query is missing an index.”

---

## 14. Optional further reading (not required)

- Indexing: [indexing](./indexing.md)  
- Pagination: [pagination](./pagination.md)  
- Replication: [replication](./replication.md)
