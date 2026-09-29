# Database & data-store concepts

Part of [../README.md](../README.md) · Cross-catalog path: [phases C + E](../README.md#phase-c--data-basics).

**Standalone standard:** [../_STANDALONE_STANDARD.md](../_STANDALONE_STANDARD.md)  
**Gold sample:** [transactions.md](./transactions.md) **Standalone ✓**

Order is **recommended**, not required — every file is Standalone ✓.

---

## Read in this order

### Core (do first)
1. [transactions](./transactions.md) — ACID, `sql.begin`, atomic multi-write  
2. [constraints-and-fk](./constraints-and-fk.md) — UNIQUE / FK / CHECK as last line of defense  
3. [migrations](./migrations.md) — schema change safely  
4. [prepared-statements](./prepared-statements.md) — parameterization / injection boundary  
5. [utc-timestamps-and-clocks](./utc-timestamps-and-clocks.md) — `timestamptz`, OCC truncation, JWT time  
6. [connection-pooling](./connection-pooling.md) — pool size, exhaustion  
7. [soft-delete-and-invariants](./soft-delete-and-invariants.md) — status flags vs hard delete  

### Concurrency (after core)
8. [toctou](./toctou.md) — check-then-act races  
9. [locking-kinds](./locking-kinds.md) — what locks exist  
10. [pessimistic-locking](./pessimistic-locking.md) — `FOR UPDATE`  
11. [optimistic-concurrency](./optimistic-concurrency.md) — `expectedUpdatedAt`  
12. [isolation-levels](./isolation-levels.md) — read phenomena  
13. [deadlocks-deep](./deadlocks-deep.md) — lock order, `40P01`  

### Query shape (when lists grow)
14. [indexing](./indexing.md)  
15. [pagination](./pagination.md)  
16. [n-plus-one](./n-plus-one.md)  

### Later / not in this repo yet
17. [jsonb-document-fields](./jsonb-document-fields.md)  
18. [full-text-search](./full-text-search.md)  
19. [audit-tables](./audit-tables.md)  
20. [replication](./replication.md)  
21. [eventual-consistency-cap](./eventual-consistency-cap.md)  
22. [sharding-partitioning](./sharding-partitioning.md)  
23. [cdc-change-data-capture](./cdc-change-data-capture.md)  
24. [two-phase-commit-and-sagas-data](./two-phase-commit-and-sagas-data.md)  

---

## Catalog (same order)

| # | Lesson | Depth |
|---|--------|-------|
| 1 | [transactions](./transactions.md) | **Standalone ✓** |
| 2 | [constraints-and-fk](./constraints-and-fk.md) | **Standalone ✓** |
| 3 | [migrations](./migrations.md) | **Standalone ✓** |
| 4 | [prepared-statements](./prepared-statements.md) | **Standalone ✓** |
| 5 | [utc-timestamps-and-clocks](./utc-timestamps-and-clocks.md) | **Standalone ✓** |
| 6 | [connection-pooling](./connection-pooling.md) | **Standalone ✓** |
| 7 | [soft-delete-and-invariants](./soft-delete-and-invariants.md) | **Standalone ✓** |
| 8 | [toctou](./toctou.md) | **Standalone ✓** |
| 9 | [locking-kinds](./locking-kinds.md) | **Standalone ✓** |
| 10 | [pessimistic-locking](./pessimistic-locking.md) | **Standalone ✓** |
| 11 | [optimistic-concurrency](./optimistic-concurrency.md) | **Standalone ✓** |
| 12 | [isolation-levels](./isolation-levels.md) | **Standalone ✓** |
| 13 | [deadlocks-deep](./deadlocks-deep.md) | **Standalone ✓** |
| 14 | [indexing](./indexing.md) | **Standalone ✓** |
| 15 | [pagination](./pagination.md) | **Standalone ✓** |
| 16 | [n-plus-one](./n-plus-one.md) | **Standalone ✓** |
| 17 | [jsonb-document-fields](./jsonb-document-fields.md) | **Standalone ✓** |
| 18 | [full-text-search](./full-text-search.md) | **Standalone ✓** |
| 19 | [audit-tables](./audit-tables.md) | **Standalone ✓** |
| 20 | [replication](./replication.md) | **Standalone ✓** |
| 21 | [eventual-consistency-cap](./eventual-consistency-cap.md) | **Standalone ✓** |
| 22 | [sharding-partitioning](./sharding-partitioning.md) | **Standalone ✓** |
| 23 | [cdc-change-data-capture](./cdc-change-data-capture.md) | **Standalone ✓** |
| 24 | [two-phase-commit-and-sagas-data](./two-phase-commit-and-sagas-data.md) | **Standalone ✓** |
