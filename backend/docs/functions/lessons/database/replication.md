# Lesson: Database replication

**Standalone ✓** — You do not need any other doc to understand primary/replica topology, read scaling, failover basics, and lag pitfalls.

**After this file you can:** explain streaming replication, read-your-writes issues, choose sync vs async, and answer interview questions.

---

## 1. First principles

**Replication** copies data from a **primary** Postgres to one or more **standbys (replicas)** so reads scale and hardware failure doesn’t destroy the only copy.

**Why it exists:** Durability beyond one machine, read offload, high availability.

**The problem it solves:** “Survive node loss and spread read load — with eyes open about lag and consistency.”

---

## 2. Mental model

### Analogy

Primary is **live lecture**; replicas are **delayed video streams** — usually milliseconds behind, sometimes more under load.

### Diagram

```text
        writes / commits
              │
         [ Primary ]
              │ WAL stream
      ┌───────┴───────┐
      ▼               ▼
 [ Replica A ]   [ Replica B ]
   read-only        read-only
```

---

## 3. Core rules (must / must-not)

1. **MUST** send **all writes** to primary (this app’s single `DATABASE_URL`).  
2. **MUST** assume **replication lag** — replica read may be stale.  
3. **MUST NOT** read-your-writes to replica immediately after register/login without routing stickiness or primary read.  
4. **MUST** test failover runbooks — promotion, connection string update.  
5. **MUST NOT** treat replica as backup alone — need PITR/backup strategy too.

---

## 4. How it works (mechanics)

### Physical streaming replication

Primary ships WAL records; replicas apply them — byte-level copy of cluster.

### Logical replication

Selected tables/publications — useful for integrations, not full HA mirror alone.

### Sync vs async

| Mode | Durability | Latency |
|------|------------|---------|
| Async (common) | Possible small loss on primary crash | Lower |
| Sync quorum | Stronger | Higher write latency |

### Lag metrics

`pg_stat_replication.replay_lag` — monitor in prod.

### Connection routing

App or proxy (PgBouncer, RDS proxy) sends `SELECT` to replica, `INSERT/UPDATE` to primary — must be explicit.

---

## 5. When to use / when not to use

| Situation | Replication |
|-----------|-------------|
| Production HA Postgres | Yes — managed RDS/Cloud SQL |
| This learning repo local Docker | Single instance OK |
| Heavy read dashboards | Replica reads |
| Strong read-after-write UX | Primary or causal routing |
| Cross-region DR | Async replica far region |

---

## 6. Step-by-step: design → implement → verify

### Design

1. RPO/RTO targets.  
2. Which reads can tolerate lag.  
3. Failover owner (operator vs automatic).

### Implement

1. Managed service with replicas.  
2. Separate read URL env var if used.  
3. Health checks on replication lag.

### Verify

1. Failover drill.  
2. Load test — lag under SLA.

---

## 7. Worked example A — this project

### Single connection string

`backend/src/db/client.ts` creates one `postgres(env.databaseUrl)` pool — **all traffic to one endpoint**.

Local dev (`backend/src/test/preload.ts`) points to single Postgres — no read replica split.

**Implication:** Architecture is **single-primary** mentally model; scaling reads via replicas would need:

- `DATABASE_READ_URL` optional pool  
- Repository read methods using read pool — write methods stay on primary  
- After `AuthService.register`, force primary read for session if replica used

No code change required for learning deploy; document for production hardening.

---

## 8. Worked example B — mini scenario (self-contained)

User registers → immediately `GET /me` hits replica 200ms lag → 404 user.

**Fixes:**

- Route session-critical reads to primary  
- Or client retry with backoff  
- Or sticky sessions to primary for short window

---

## 9. Wrong world / anti-patterns

| Anti-pattern | What goes wrong |
|--------------|-----------------|
| All reads to replica after write | Stale UI |
| Replica for backup only | Corruption propagates |
| Ignore lag alerts | Silent stale analytics |
| Two primaries (split brain) | Divergent data |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| User missing after signup | Read replica lag | Which host query hit | Primary read |
| Replica disconnect | Network/WAL | `pg_stat_replication` | Rebuild replica |
| Failover app down | Old primary URL | Config | Update DNS/URL |
| High lag | Heavy writes | Disk, sync mode | Scale primary, tune |

---

## 11. Interview Q&A (with strong answers)

**Q: Why replicate Postgres?**  
**A:** High availability and read scaling by applying WAL from primary to standbys.

**Q: Read-after-write issue?**  
**A:** Async replication lag means replica may not yet have committed write — route critical reads to primary.

**Q: Sync vs async replication?**  
**A:** Sync waits for standby ack before commit confirm — safer, slower; async commits when primary has WAL locally.

**Q: This app and replicas?**  
**A:** Single `databaseUrl` pool — one primary assumption; replicas would be an ops + optional read pool extension.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Primary | Writable leader |
| Standby/replica | Read copy applying WAL |
| WAL | Write-ahead log |
| Replication lag | Delay on replica |
| Failover | Promote replica to primary |
| RPO/RTO | Recovery point/time objectives |

---

## 13. Teach pointer

> “Replicas copy the truth — but ‘eventually’ is not ‘immediately’.”

---

## 14. Optional further reading (not required)

- CAP / consistency: [eventual-consistency-cap](./eventual-consistency-cap.md)  
- Pooling: [connection-pooling](./connection-pooling.md)
