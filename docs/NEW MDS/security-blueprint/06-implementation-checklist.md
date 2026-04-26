# 06 · Implementation Checklist (Sign-off Ready)

> Single-document, fully tickable checklist covering **every** NedAccess control mapped onto an e-commerce platform. Use as the security gate for new releases or a fresh build.

> **Format**: Each item is binary (done / not done). Where multiple sub-items appear, all must be ticked.
> **Reference**: Numbers refer back to features in [`03-feature-mapping.md`](./03-feature-mapping.md) (e.g., **F-104**).

---

## A · Network & Edge

- [ ] **F-001** Admin / SSH access only via bastion (SSM, Tailscale, Teleport) or VPN
- [ ] **F-002** VPC default-deny ingress + egress; security groups chained tier-by-tier
- [ ] **F-002** Backend egress allowlist (PSP, KMS, S3, observability — no arbitrary internet)
- [ ] **F-003** WAF + bot-management at edge (Cloudflare/Akamai/AWS WAF)
- [ ] **F-004** TLS 1.2+; ECDHE/DHE PFS; modern cipher suite
- [ ] **F-004** HSTS preload (`max-age=31536000; includeSubDomains; preload`) + submitted to hstspreload.org
- [ ] **F-004** OCSP stapling enabled
- [ ] **F-004** HTTP→HTTPS 301 redirect; HTTP fully closed for API hosts
- [ ] **F-005** Per-route rate limits at edge (browse / search / login / checkout / gift-card-balance / refund)
- [ ] **F-006** Helmet equivalent on all responses
- [ ] **F-006** Strict CSP: no `unsafe-inline`; `script-src` allowlist with nonces or SRI
- [ ] **F-006** `X-Frame-Options: DENY` / `frame-ancestors 'none'`
- [ ] **F-006** `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] **F-006** `Permissions-Policy` denying camera/mic/geolocation by default
- [ ] **F-006** `Cross-Origin-Opener-Policy: same-origin` on payment pages
- [ ] **F-007** Body-size limits per route; checkout body capped (<64 KB)
- [ ] CDN signed-URL validation for all user-uploaded media
- [ ] No directory listing on any static origin
- [ ] `Server` / `X-Powered-By` headers stripped

---

## B · Authentication

- [ ] **F-101** `auth_source` per user; SSO and local both supported safely
- [ ] **F-102** bcrypt(12) or argon2id(64MB, t=3, p=4)
- [ ] **F-102** Common-password blocklist (10k+ entries) on signup + password change
- [ ] **F-102** HIBP k-anon API check on signup + password change
- [ ] **F-103** Account lockout (5 fails → 15 min); customer notified by email
- [ ] **F-104** Login rate-limit per IP **and** per email **and** per device
- [ ] **F-104** CAPTCHA after first failure (hCaptcha / Turnstile / reCAPTCHA Enterprise)
- [ ] **F-105** Risk-based step-up MFA (new device, new geo, large basket, address change, password change, gift-card redemption, large refund)
- [ ] **F-105** WebAuthn / passkey support
- [ ] **F-106** Two-token model: access (15min–1h) + refresh (7–30d) with rotation + reuse-detection
- [ ] **F-106** Absolute session age cap (≤7 days customer, ≤8h admin)
- [ ] **F-107** Server-side revocation list (Redis), checked on every authenticated request
- [ ] **F-107** Revoke on logout, password change, role change, fraud signal, support intervention
- [ ] **F-108** `__Host-` prefix; `httpOnly`; `Secure`; `SameSite=lax` (admin: `strict`)
- [ ] **F-109** `Clear-Site-Data: "cache","cookies","storage"` on session expiry
- [ ] **F-110** Account-deletion check on every authenticated request (cached 60s)
- [ ] Email verification mandatory before full account access
- [ ] Password reset: single-use token, 30-min expiry; previous email + phone notified; all sessions revoked
- [ ] Cool-off period (24h) before high-value actions after credential change
- [ ] Refresh-token rotation with reuse-detection → revoke entire family
- [ ] Impossible-travel detection (geo + time) → step-up MFA
- [ ] **Mandatory MFA on every admin/staff/finance role**

---

## C · Authorization

- [ ] **F-201** RBAC roles defined: `customer`, `seller`, `csa`, `merchandiser`, `finance`, `admin`, `integration`
- [ ] **F-202** `requireOwnerOrRole` (or equivalent) on every resource read/write
- [ ] **F-202** Server is sole source for `userId`/`tenantId`/`sellerId` (never read from body/query)
- [ ] **F-203** Multi-tenant scoping at row level (brand/region/store/warehouse/seller)
- [ ] **F-204** Order/refund/return state machine codified; transitions guarded by role + state
- [ ] **F-204** Two-person approval for refunds above threshold + bulk admin actions
- [ ] **F-205** API keys: public (`pk_*`, read-only) + secret (`sk_*`, scoped)
- [ ] **F-205** API keys SHA-256 hashed at rest; **timing-safe compare**; shown once at creation
- [ ] **F-205** Per-API-key rate limit; usage tracking (`last_used_at`); rotatable in <1h
- [ ] **F-206** Partner integration tokens with scopes; rotated quarterly
- [ ] Admin endpoints behind separate URL prefix (`/api/admin/*`) with `requireRole('admin')` AND `requireMFA`
- [ ] `FORBIDDEN_ACCESS` event logged on every authorization denial

---

## D · Input Validation & Sanitization

- [ ] **F-301** Zod (or equivalent) schema validation on every endpoint (params + query + body)
- [ ] **F-301** Reject any field not declared in the schema (no mass-assignment)
- [ ] **F-301** Max 200 fields per request (DoS guard)
- [ ] **F-302** Custom validators: country-aware tax IDs, postal codes, phone (libphonenumber), currency (ISO 4217 allowlist), BIN ranges
- [ ] **F-303** Product-attribute schema per category; enforced on listing create/update
- [ ] **F-304** DOMPurify (server-side) on rich-text reviews / descriptions / messages
- [ ] **F-304** URL protocol allowlist (http/https only); block link-local, RFC1918, IPv6 ULA, cloud metadata IP
- [ ] Server-authoritative pricing — client sends `productId + qty` only; server resolves price
- [ ] Promo codes: validity window + max usage + per-user cap

---

## E · File Upload Security

- [ ] **F-401** Filename sanitized (traversal, null byte, control chars, Windows reserved names, Unicode normalize, max 255 chars)
- [ ] **F-401** Server-generated random storage filename (UUID); original kept for display only
- [ ] **F-402** Magic-byte verification — reject mismatched MIME
- [ ] **F-402** Re-encode images server-side (strips EXIF, payloads, polyglots)
- [ ] **F-403** Content scanner: PE/ELF/Mach-O signatures, script patterns, dangerous PDF tags (`/JS`, `/JavaScript`, `/Launch`, `/EmbeddedFile`, `/OpenAction`)
- [ ] **F-403** ZIP-bomb detection (compression-ratio cap)
- [ ] **F-403** Polyglot detection
- [ ] **F-403** Office-doc macro detection (`vbaProject.bin`, `oleObject*`)
- [ ] **F-404** ClamAV (or commercial AV) in pipeline
- [ ] **F-405** Per-route size cap (5–10 MB images, larger only with stricter checks)
- [ ] **F-405** Max files per request cap (e.g., 5)
- [ ] **F-405** Extension allowlist; double-extension detection (`receipt.pdf.exe`)
- [ ] **F-406** User-uploaded media → private bucket → signed URL or processed thumbnail only

---

## F · API Security

- [ ] **F-501** 100% parameterized SQL; raw query construction linted away
- [ ] **F-501** SQL centralized in `src/queries/` (or equivalent); `check:queries` in CI
- [ ] **F-501** DB user least-privilege (CRUD only); separate migrator user
- [ ] **F-502** CSRF tokens on cookie-authenticated state-change requests
- [ ] **F-503** CORS allowlist; never `*` for credentialed routes
- [ ] **F-504** `Idempotency-Key` required on `/checkout`, `/refunds`, `/payments`, `/coupons/redeem`, `/gift-cards/redeem`
- [ ] **F-504** Idempotency store keyed by `(key, request-hash)` for ≥24h
- [ ] **F-505** Correlation ID per request; propagated to PSP/courier/ERP and into logs
- [ ] HMAC verification on all inbound webhooks; replay window ±5 min; idempotency by `event_id`

---

## G · Data Protection

- [ ] **F-601** bcrypt(12) or argon2id for passwords; re-hash on login if cost factor raised
- [ ] **F-602** API keys SHA-256 hashed; timing-safe compare
- [ ] **F-603** Application secrets in **AWS KMS / GCP KMS / Azure Key Vault** (HSM-backed)
- [ ] **F-603** AES-256-GCM (or ChaCha20-Poly1305) for application-level encryption — never CBC w/o HMAC, never ECB
- [ ] **F-603** Separate keys per data class (passwords, secrets, PII, tokens)
- [ ] **F-604** HMAC-SHA256 on receipts, refund authorizations, gift-card codes, courier label URLs
- [ ] **F-605** **PAN never stored or proxied** — use PSP hosted fields (Stripe Elements / Adyen / Braintree)
- [ ] **F-605** Store only token + last4 + brand + expiry
- [ ] **F-605** CVV never persisted (forbidden post-authorization)
- [ ] **F-606** TLS to DB (`sslmode=verify-full`); IAM auth where possible
- [ ] PII columns encrypted with column-level keys (separate keys for email, phone, address, DOB)
- [ ] Backups encrypted with separate key from production
- [ ] Documented retention per data class (orders 7y, logs 1y, carts 30d)

---

## H · Database

- [ ] **F-701** Three DB users: `app_rw`, `app_ro`, `migrator`
- [ ] **F-701** Application user has `SELECT/INSERT/UPDATE/DELETE` only — no DDL
- [ ] **F-702** Connection pooler (PgBouncer / RDS Proxy); bounded pool sizes; 30s timeouts
- [ ] **F-703** `audit_log` table with predefined event-type enum; metadata JSON column
- [ ] **F-703** Audit log indexed on `(event_type, user_id, created_at)`; partitioned monthly
- [ ] **F-703** Audit log shipped to SIEM (Datadog/Splunk/Elastic) for long-term retention
- [ ] **F-704** Soft-delete via `deleted_at` for users / sellers / admins
- [ ] **F-704** Right-to-erasure: pseudonymize PII columns; preserve order rows for tax/AML

---

## I · Monitoring, Audit & Alerting

- [ ] **F-801** Predefined `SecurityEventType` enum covering at minimum: `LOGIN_*`, `PASSWORD_*`, `OTP_*`, `TOKEN_*`, `FORBIDDEN_ACCESS`, `UNAUTHORIZED_ACCESS`, `RATE_LIMIT_EXCEEDED`, `MALICIOUS_FILE_BLOCKED`, `VIRUS_DETECTED`, `PRIVILEGE_ESCALATION`, `ADMIN_ACTION`, `DATA_EXPORT`
- [ ] **F-801** Plus commerce events: `PAYMENT_*`, `REFUND_*`, `CHARGEBACK_RECEIVED`, `COUPON_*`, `GIFT_CARD_*`, `ADDRESS_*`, `EMAIL_CHANGED`, `PHONE_CHANGED`, `CARD_TESTING_DETECTED`
- [ ] **F-802** Structured JSON logs; **redaction** for PAN, CVV, password, OTP, token, full PII
- [ ] **F-802** No request-body logging on `/auth/*` and `/checkout` and `/payments`
- [ ] **F-803** `/healthz` (LB) public; `/readyz` and `/metrics` private (only ops + Prometheus)
- [ ] **F-804** Alerts on critical events: `ACCOUNT_LOCKED`, `PRIVILEGE_ESCALATION`, `MALICIOUS_FILE_BLOCKED`, `CARD_TESTING_DETECTED`, `BULK_REFUND_BY_ADMIN`, `BULK_DELETION`, `ADMIN_LOGIN_FROM_NEW_GEO`, `BACKUP_FAILED`, `CHECKOUT_ERROR_RATE_SPIKE`
- [ ] Alerts on **rates** of events, not just absolute counts
- [ ] On-call rotation; pager integration (PagerDuty/Opsgenie)

---

## J · External Services

- [ ] **F-901** One IAM role per integration; least-privilege; rotated quarterly
- [ ] **F-902** S3 bucket private + SSE (KMS preferred); versioning; access logs; lifecycle rules
- [ ] **F-903** All outbound HTTPS; explicit timeouts; retry with idempotency-key; circuit breaker for non-critical
- [ ] **F-904** Inbound webhooks: signature verified; idempotency by provider event ID; replay window enforced
- [ ] PSP keys + courier creds + ERP creds + tax-engine keys all encrypted at rest with separate keys

---

## K · Anti-Fraud / Anti-Bot (E-Commerce-Specific)

- [ ] Bot-management WAF on login + checkout + search + product-detail
- [ ] Device fingerprinting bound to session
- [ ] Risk scoring at signup, login, checkout, refund
- [ ] PSP velocity rules (Stripe Radar / Adyen RevenueProtect) — max attempts per BIN/device/email/hour
- [ ] 3-D Secure 2 mandatory for high-risk geos / amounts
- [ ] Honeypot fields + invisible CAPTCHA on checkout
- [ ] Distinct rate-limit bucket for `POST /payments`
- [ ] Block known proxy/VPN/datacenter ASNs from new-account creation
- [ ] Gift-card numbers ≥128 bits + check digit
- [ ] Gift-card balance API rate-limited per IP + per card; lock after N invalid PIN attempts
- [ ] Reviews only allowed by users with a `delivered` order for that SKU
- [ ] Reserve inventory at *checkout-start* not *add-to-cart*
- [ ] Per-customer purchase caps for limited drops
- [ ] One-coupon-per-customer enforcement (payment instrument + shipping address + device fingerprint)

---

## L · Payment-Page Hardening (Magecart Defense)

- [ ] PSP hosted fields / iframe — PAN never on your DOM
- [ ] **PCI 6.4.3**: inventory of every script on the payment page
- [ ] **PCI 11.6.1**: monitoring + alerting for unauthorized changes to payment-page scripts
- [ ] **Subresource Integrity (SRI)** with version-pinned hashes on every external script
- [ ] No tag manager / A-B-testing tools / third-party widgets on payment page
- [ ] CSP nonce-based; report-uri configured to capture violations
- [ ] **Trusted Types** enabled on payment page (where browser supports)

---

## M · Secure SDLC

- [ ] Pre-commit hooks: secret scanner (gitleaks/trufflehog), `yarn audit`, `check:queries`
- [ ] PR template with security checklist for new endpoints
- [ ] Threat modelling on new features touching: auth / payments / PII / admin / file-upload / integrations
- [ ] SAST in CI (Semgrep / CodeQL / SonarQube)
- [ ] DAST in CI (OWASP ZAP / Nuclei) on a staging environment
- [ ] SCA in CI (Snyk / Dependabot / Socket.dev)
- [ ] Container/image scanning (Trivy)
- [ ] IaC scanning (`tfsec` / `checkov`)
- [ ] Quarterly dependency upgrade window
- [ ] Annual external pen-test
- [ ] Bug-bounty program

---

## N · Operations

- [ ] Backups: daily full + hourly incremental; encrypted; restore tested monthly
- [ ] Documented RTO/RPO (NedAccess: 4h / 1h)
- [ ] Quarterly access review (terminate dormant admin / API keys)
- [ ] Quarterly key rotation (or KMS-managed where keys auto-rotate)
- [ ] JIT production-data access (ticket + approver + time-boxed)
- [ ] Break-glass admin procedure documented + tested

---

## O · Privacy & Compliance

- [ ] Documented data classification (Public / Internal / Sensitive / Critical)
- [ ] Documented retention per class
- [ ] DSAR (Data Subject Access Request) self-service portal — 30-day SLA
- [ ] Right-to-erasure endpoint (pseudonymize, preserve legal-basis records)
- [ ] Cookie banner integrated with CSP — no tracking until consent
- [ ] DPIA on new features touching PII
- [ ] DPAs with all TPSPs (PSP, courier, tax engine, marketing, analytics)
- [ ] Cross-border transfer mechanism (SCCs) where applicable
- [ ] Annual privacy review

---

## P · PCI DSS Touchpoints (if applicable)

- [ ] SAQ type confirmed with QSA (target: SAQ A via hosted fields)
- [ ] Quarterly ASV scans
- [ ] Annual SAQ + AOC submission to acquirer
- [ ] All TPSPs hold valid AOCs on file
- [ ] PCI 6.4.3 + 11.6.1 implemented (Magecart defense)
- [ ] Phishing-resistant MFA for admin (WebAuthn)
- [ ] All PCI roles defined; quarterly access review

---

## Q · Incident Response

- [ ] IR runbook with severity levels + SLAs
  - SEV1 (PII / payment-data exposure): 1h response, 4h breach-notification draft
  - SEV2 (large-scale fraud / outage): 1h response
  - SEV3 (targeted attack contained): 4h response
- [ ] On-call rotation
- [ ] Tabletop exercises quarterly
- [ ] Forensic-grade logging (immutable, time-synced, tamper-evident)
- [ ] Documented breach-notification template per jurisdiction (POPIA, GDPR Art 33/34, CCPA, state laws)
- [ ] Communication plan: customer email, status page, regulator filing

---

## R · The "Nine Yes-Or-No" Final Gate

If you cannot answer **YES** to every one of these, you are not ready to handle real customer data:

- [ ] Can we prove every request was authenticated, authorized, validated, and logged?
- [ ] If a single password leaks, is the blast radius strictly that one account?
- [ ] If a single API key leaks, is the blast radius strictly that key's scopes?
- [ ] If a single admin is compromised, is the blast radius strictly their product/region scope?
- [ ] If our database is dumped, is no PII readable without the application's encryption keys?
- [ ] Can we revoke a session within seconds of detecting compromise?
- [ ] Can we trace any user-visible action to a request ID, IP, user ID, and timestamp for ≥365 days?
- [ ] Can we detect brute force, ATO, carding, scraping, and bot traffic in near real time?
- [ ] Does every state transition check the previous state and the actor's authority to make that transition?

---

## Sign-off Block

| Role | Name | Date | Signature |
|---|---|---|---|
| Engineering Lead | | | |
| Security Lead | | | |
| Privacy / Compliance Officer | | | |
| Head of Payments | | | |
| CTO | | | |

---

**End of blueprint.** Cross-references:
- [`README.md`](./README.md) — index
- [`01-security-mandate.md`](./01-security-mandate.md) — why this bar exists
- [`02-ecommerce-threat-model.md`](./02-ecommerce-threat-model.md) — what we're defending against
- [`03-feature-mapping.md`](./03-feature-mapping.md) — feature-by-feature implementation
- [`04-implementation-roadmap.md`](./04-implementation-roadmap.md) — phased delivery plan
- [`05-pci-dss-compliance.md`](./05-pci-dss-compliance.md) — PCI DSS evidence pack
