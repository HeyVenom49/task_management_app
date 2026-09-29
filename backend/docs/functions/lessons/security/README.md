# Security concepts

Part of [../README.md](../README.md) · Cross-catalog path: [phases D + E](../README.md#phase-d--auth--access).

Order is **recommended**, not required — every file is Standalone ✓.

---

## Read in this order

### Core (do first) — this app’s auth story
1. [authn-vs-authz](./authn-vs-authz.md) — who vs what they’re allowed  
2. [password-and-token-hashing](./password-and-token-hashing.md) — Argon2 + opaque token hashes  
3. [cookies-xss-csrf](./cookies-xss-csrf.md) — httpOnly refresh, SameSite  
4. [refresh-rotation-and-reuse](./refresh-rotation-and-reuse.md) — rotate + revoke-all  
5. [idor](./idor.md) — membership + parent bind  
6. [least-privilege](./least-privilege.md) — field-level / role-level  
7. [email-enumeration-and-timing](./email-enumeration-and-timing.md) — generic messages + dummy hash  
8. [mass-assignment](./mass-assignment.md) — Zod allow-lists  
9. [sql-injection-prevention](./sql-injection-prevention.md) — parameterized SQL  
10. [secrets-management](./secrets-management.md) — env / JWT secret  
11. [tls-https](./tls-https.md) — Secure cookies  

### Hardening (still high value here)
12. [fail-closed-rate-limits](./fail-closed-rate-limits.md)  
13. [defense-in-depth](./defense-in-depth.md)  
14. [input-output-encoding](./input-output-encoding.md)  
15. [threat-modeling-stride](./threat-modeling-stride.md)  

### Later / providers & edges
16. [oauth2-oidc](./oauth2-oidc.md)  
17. [pkce](./pkce.md)  
18. [mfa](./mfa.md)  
19. [api-keys](./api-keys.md)  
20. [mtls](./mtls.md)  
21. [ssrf](./ssrf.md)  
22. [path-traversal](./path-traversal.md)  
23. [security-headers](./security-headers.md)  
24. [pii-gdpr-basics](./pii-gdpr-basics.md)  
25. [audit-logging](./audit-logging.md)  

---

## Catalog (same order)

| # | Lesson | Standalone |
|---|--------|------------|
| 1 | [authn-vs-authz](./authn-vs-authz.md) | ✓ |
| 2 | [password-and-token-hashing](./password-and-token-hashing.md) | ✓ |
| 3 | [cookies-xss-csrf](./cookies-xss-csrf.md) | ✓ |
| 4 | [refresh-rotation-and-reuse](./refresh-rotation-and-reuse.md) | ✓ |
| 5 | [idor](./idor.md) | ✓ |
| 6 | [least-privilege](./least-privilege.md) | ✓ |
| 7 | [email-enumeration-and-timing](./email-enumeration-and-timing.md) | ✓ |
| 8 | [mass-assignment](./mass-assignment.md) | ✓ |
| 9 | [sql-injection-prevention](./sql-injection-prevention.md) | ✓ |
| 10 | [secrets-management](./secrets-management.md) | ✓ |
| 11 | [tls-https](./tls-https.md) | ✓ |
| 12 | [fail-closed-rate-limits](./fail-closed-rate-limits.md) | ✓ |
| 13 | [defense-in-depth](./defense-in-depth.md) | ✓ |
| 14 | [input-output-encoding](./input-output-encoding.md) | ✓ |
| 15 | [threat-modeling-stride](./threat-modeling-stride.md) | ✓ |
| 16 | [oauth2-oidc](./oauth2-oidc.md) | ✓ |
| 17 | [pkce](./pkce.md) | ✓ |
| 18 | [mfa](./mfa.md) | ✓ |
| 19 | [api-keys](./api-keys.md) | ✓ |
| 20 | [mtls](./mtls.md) | ✓ |
| 21 | [ssrf](./ssrf.md) | ✓ |
| 22 | [path-traversal](./path-traversal.md) | ✓ |
| 23 | [security-headers](./security-headers.md) | ✓ |
| 24 | [pii-gdpr-basics](./pii-gdpr-basics.md) | ✓ |
| 25 | [audit-logging](./audit-logging.md) | ✓ |
