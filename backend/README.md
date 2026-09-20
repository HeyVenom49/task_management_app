# backend

## Run

```bash
bun install
bun run src/server.ts
```

---

## Index kab banaye? (bahut simple rule)

Pehle ek picture socho. Kabhi nahi bhoolna.

### Lifelong story: Kitab ka index

Tumhare paas ek **badi kitab** hai (yeh database table hai).

- **Bina index:** har baar page 1 se page 1000 tak padhna padta hai.  
  "Mera friend kahan hai?" → poori kitab check. Slow.

- **Index ke saath:** peeche ek chhoti list hai:  
  `Aman → page 42`, `Riya → page 880`.  
  Seedha us page pe jump. Fast.

**Index = shortcut list.**  
Poori table copy nahi hoti. Sirf "kahan milenga" likha hota hai.

> **Yaad rakhne wali line:**  
> **Jis cheez se hum aksar DHUNDHTE hain, uspe index.**  
> **Jis cheez ko hum sirf RAKHTE / DIKHATE hain, uspe index mat do.**

---

## Decision ka formula (3 sawal)

Har column pe yeh 3 sawal poocho:

1. **Kya main isse baar-baar SEARCH / FILTER / JOIN karunga?**  
   Haan → index sochna.
2. **Kya yeh column bohot alag-alag values rakhta hai?** (email, id, project_id)  
   Haan → index useful.  
   Nahi (sirf `ACTIVE` / `INACTIVE`) → aksar mat do.
3. **Kya writes (INSERT/UPDATE) bahut zyada hain is table pe?**  
   Har index write ko thoda slow karti hai. Zyada indexes = thoda extra kaam.

Agar 1 = Haan aur 2 = Haan → **index banao**.

---

## Kab INDEX chahiye (examples apne app se)

### 1) Foreign keys / "kis project ke members?"

App aksar poochegi:

> Is `project_id` ke saare members dikhao.

```sql
SELECT * FROM members WHERE project_id = '...';
```

Bina index: Postgres members table ke har row ko dekh sakta hai.  
Index ke saath: seedha us project ke rows.

```sql
CREATE INDEX idx_members_project_id ON members (project_id);
CREATE INDEX idx_tasks_project_id ON tasks (project_id);
```

**Rule:** jis column se parent se child laate ho (`project_id`, `user_id`, `creator_id`) — wahan index socho.

### 2) Login / unique dhoondhna — `email`

```sql
SELECT * FROM users WHERE email = 'aman@example.com';
```

`email` pe `UNIQUE` already hota hai → Postgres **khud index bana deta hai**.  
Alag se dobara index ki zarurat nahi.

**Rule:** `PRIMARY KEY` aur `UNIQUE` pe index free milta hai. Dobara mat banao.

### 3) Composite — do cheezein saath

Kabhi query aisi hoti hai:

```sql
SELECT * FROM members
WHERE user_id = '...' AND project_id = '...';
```

Tumhare paas already:

```sql
UNIQUE (user_id, project_id)
```

Yeh bhi index deta hai — aur duplicate member bhi rokta hai.  
Extra same index mat banao.

---

## Kab INDEX mat do (common galti)

### 1) Bahut kam alag values — jaise `status`

```text
status = ACTIVE ya INACTIVE   (sirf 2 boxes)
```

Socho: classroom mein sirf 2 groups — "present" / "absent".  
Index se fayda kam; table chhoti / half-half ho to pura scan bhi theek.

### 2) Kabhi WHERE mein use hi nahi hota

`hash_password`, `description`, lamba `info` text —  
inhe dikhate ho, unse search nahi karte → index mat do.

### 3) Chhoti table

100 rows? Poori table padhna bhi tez hai. Index ki tension baad mein.

---

## Mini cheatsheet (wallpaper bana lo)

| Column type | Index? | Kyu |
|---|---|---|
| `id` (PRIMARY KEY) | Auto | Already indexed |
| `email` (UNIQUE) | Auto | Already indexed |
| `UNIQUE (user_id, project_id)` | Auto | Already indexed |
| `project_id` on members/tasks | **Haan** | Baar-baar filter/join |
| `creator_id` on projects | Soft haan | "mere projects" queries |
| `assignee_member_id` on tasks | Soft haan | "mere assigned tasks" |
| `status` / `role` / `priority` alone | Aksar **nahi** | Bahut kam values |
| `title` / `description` / `info` | Default **nahi** | Text search alag topic hai |
| `created_at` | Kabhi-kabhi | Agar sort/filter by date bohot ho |

---

## Ek line mein lifetime yaad

> **Index tab lagao jab tum baar-baar poochte ho:  
> "YEH WALI value kahan hai?"  
> Index tab mat lagao jab tum sirf kehte ho:  
> "Poora row dikha do."**

Kitab ka peecha wala **index page** yaad hai na?  
Database ka index bhi wahi hai — bas computer ke liye.
