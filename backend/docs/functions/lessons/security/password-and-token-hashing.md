# Lesson: Password hashing and token hashing

**Standalone ✓** — You do not need any other doc to choose hash algorithms, store secrets safely, or debug auth storage bugs.

**After this file you can:** explain why passwords and opaque tokens get different hash treatments, implement Argon2 + SHA-256 patterns like this stack, avoid common storage leaks, and answer interview questions on peppers, salts, and verification flows.

---

## 1. First principles

**Hashing at rest** turns a secret into a one-way fingerprint. If the DB leaks, attackers should not recover usable credentials.

Two secret classes:

| Secret type | Entropy | Attacker strategy | Storage approach |
|-------------|---------|-------------------|------------------|
| **Password** | Low (user-chosen) | Offline guessing, rainbow tables | Slow, salted password hash (**Argon2**) |
| **Opaque token** | High (`randomBytes(32)`) | Try DB lookup of hash | Fast cryptographic hash (**SHA-256**) of random bearer |

**Problem it removes:** DB dump → immediate login as any user or reuse of refresh/reset links.

---

## 2. Mental model

### Analogy

- **Password:** A weak padlock on a gym locker — thieves have time to try combinations; use a **heavy** lock (slow hash).  
- **Refresh token:** A random 256-bit vault code — guessing is infeasible; you only need a **fingerprint** to match presented codes.

### Diagram

```text
Register/login (password)
  plaintext password ──► argon2.hash ──► users.hash_password (store)

Issue refresh / verify / reset
  randomBytes(32) ──► raw (client/email once)
                   └──► SHA-256 ──► token_hash in DB (store)
Verify
  presented raw ──► SHA-256 ──► lookup by hash
  presented password ──► argon2.verify(stored, input)
```

---

## 3. Core rules (must / must-not)

1. **MUST** never store plaintext passwords or raw refresh/reset/verify tokens in the DB.  
2. **MUST** use a password hash function designed for passwords (Argon2id/bcrypt/scrypt), not bare SHA-256.  
3. **MUST** hash high-entropy tokens with a fast cryptographic hash before persistence.  
4. **MUST** return raw tokens only once to the client/channel; thereafter only hashes exist server-side.  
5. **MUST NOT** log raw tokens in production.  
6. **MUST NOT** compare secrets with `===` on stored raw values (there are none).  
7. **MUST** bound password length in validation (DoS on hash input size).

---

## 4. How it works (mechanics)

### Argon2 (passwords)

- **Salt** per password (library-generated) defeats rainbow tables.  
- **Memory/time cost** makes GPU cracking expensive.  
- **Verify:** `argon2.verify(storedHash, candidatePassword)` — constant-time enough for practical use.

### SHA-256 (tokens)

- Input is 256 bits of randomness; preimage search is impractical.  
- Hash enables indexed lookup: `WHERE token_hash = $1`.  
- Rotation/revocation is row state (`revoked_at`, `used_at`), not slower hashing.

### One-time tokens

Email verify and password reset: mark `used_at` in a transaction with the state change (password update, email verified) so replay fails.

---

## 5. When to use / when not to use

| Use Argon2/bcrypt | Use SHA-256 of random token |
|-------------------|----------------------------|
| User passwords | Refresh sessions |
| | Email verification links |
| | Password reset links |

| Do not | Why |
|--------|-----|
| SHA-256 alone for passwords | Too fast to brute force |
| Encrypt passwords reversibly | Key leak = all passwords |
| Store JWT refresh as plaintext | Same as DB compromise = session hijack |

---

## 6. Step-by-step: design → implement → verify

### Design

1. Classify each secret: low vs high entropy.  
2. Pick algorithm and column name (`hash_password`, `refresh_token_hash`).  
3. Define issuance (random length), expiry, single-use rules.  
4. Define revoke-all on password change.

### Implement

1. Zod-bound password length.  
2. `argon2.hash` on register/reset; `argon2.verify` on login/change password.  
3. `randomBytes(32).toString("base64url")` + `createHash("sha256")` for tokens.  
4. Conditional updates for `markTokenUsed` / `revoke`.

### Verify

1. DB inspection: no raw token columns.  
2. Login with wrong password fails; timing not shorter for missing user (see email-enumeration lesson).  
3. Re-present used reset token → rejected.

---

## 7. Worked example A — this project

### A1. Token hashing helper

```ts
private hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
```

**Where:** `backend/src/modules/auth/auth.service.ts`.

### A2. Register: password + verification token

```ts
const passwordHash = await argon2.hash(input.password);
const { user, rawToken } = await this.sql.begin(async (tx) => {
  const user = await this.repo.createUser(
    { name: input.name, email: input.email, passwordHash },
    tx,
  );
  const rawToken = await this.issueVerificationToken(user.id, tx);
  return { user, rawToken };
});
```

`issueVerificationToken` invalidates old rows, stores **hash** only, returns **raw** for email/console in non-prod.

### A3. Login session

```ts
const rawRefresh = randomBytes(32).toString("base64url");
const tokenHash = this.hashToken(rawRefresh);
await this.sessionRepo.createSession({
  userId: user.id,
  tokenHash,
  expiresAt: refreshExpireAt,
});
```

Client receives `rawRefresh` once; DB holds `tokenHash`.

### A4. Password schema bound

```ts
password: z.string().min(8).max(72),
```

**Where:** `backend/src/modules/auth/auth.schema.ts` — limits Argon2 input size.

---

## 8. Worked example B — mini scenario (self-contained)

**Feature:** API keys for integrations.

```ts
function issueApiKey(): { raw: string; stored: string } {
  const raw = `sk_${randomBytes(24).toString("base64url")}`;
  const stored = createHash("sha256").update(raw).digest("hex");
  return { raw, stored }; // show raw once in UI
}
```

Same rule: high entropy → fast hash at rest; never store `sk_...` plaintext.

---

## 9. Wrong world / anti-patterns

| Anti-pattern | Outcome |
|--------------|---------|
| MD5/SHA-256 for passwords | Offline crack at GPU speed |
| `SELECT * WHERE refresh_token = $raw` | Requires storing raw |
| Logging reset links in prod | Link theft from logs |
| Reusing verification token forever | Stolen old link works |
| No revoke on password change | Stolen refresh still valid |

---

## 10. Failure modes & debugging (self-contained)

| Symptom | Likely cause | What to check | Fix |
|---------|--------------|---------------|-----|
| Login always fails after deploy | Wrong hash params / corrupt column | Sample row `hash_password` prefix | Re-hash on reset only |
| Refresh never matches | Hashing algorithm mismatch | Login vs refresh path | Single `hashToken` |
| Reset works twice | `markTokenUsed` not conditional | SQL `UPDATE ... WHERE used_at IS NULL` | Transaction + conditional |
| Tokens in CloudWatch | `console.log` in prod | `NODE_ENV` guards | Remove logs; rotate sessions |

---

## 11. Interview Q&A (with strong answers)

**Q: Why Argon2 for passwords but SHA-256 for refresh tokens?**  
**A:** Passwords are low-entropy and need slow hashing to resist offline guessing. Refresh tokens are high-entropy random values; SHA-256 is enough to fingerprint them for lookup without storing the raw secret.

**Q: How many bits in `randomBytes(32)`?**  
**A:** 256 bits of entropy — far beyond feasible guessing.

**Q: Pepper vs salt?**  
**A:** Salt is per-record and stored with the hash. Pepper is a server secret mixed in before hashing; compromise of DB alone does not reveal pepper. This app relies on Argon2’s salt; pepper can be added in KMS for extra defense.

**Q: Why invalidate old verification tokens on reissue?**  
**A:** Limits window if an old link was leaked; only the latest token should be valid.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Entropy | Unpredictability / guess difficulty |
| Salt | Random per-hash value defeating rainbow tables |
| Pepper | Server-side secret added before hashing |
| Argon2id | Memory-hard password hashing algorithm |
| Opaque token | Bearer secret not interpretable by client |
| base64url | URL-safe encoding without padding issues |

---

## 13. Teach pointer

> “Hash passwords slowly. Hash random tokens quickly. Never store the thing the client sends.”

---

## 14. Optional further reading (not required)

- Refresh reuse detection: [refresh-rotation-and-reuse](./refresh-rotation-and-reuse.md)  
- Login messaging: [email-enumeration-and-timing](./email-enumeration-and-timing.md)  
- Repo: `backend/src/modules/auth/auth.service.ts`, `backend/src/modules/auth/session.repository.ts`
