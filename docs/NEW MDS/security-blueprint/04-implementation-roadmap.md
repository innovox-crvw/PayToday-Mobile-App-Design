# 04 · Implementation Roadmap (Phased)

> You don't have to build everything at once. This roadmap takes the NedAccess control set and sequences it across **4 phases** with clear gates so you can ship a secure-enough MVP and iterate without ever falling behind a regulator or a determined attacker.

---

## Phase Gates At A Glance

| Phase | Gate name | Goal | Time-box | Cannot launch without |
|---|---|---|---|---|
| 1 | **Launch-Safe** | Open the doors without negligence | Weeks 0–6 | TLS, auth, RBAC, parameterized SQL, secure cookies, logging |
| 2 | **Audit-Ready** | Pass an external pen-test and PCI SAQ A | Weeks 6–14 | CSP, file scanning, audit log, HMAC receipts, refund workflow |
| 3 | **Adversary-Resistant** | Survive carding, ATO, scraping at scale | Months 4–7 | Bot mgmt, step-up MFA, fraud signals, idempotency everywhere, JIT admin |
| 4 | **Mature / Continuous** | Sustained operation under regulator + adversary pressure | Ongoing | IR runbook, red-team, key rotation cadence, training, SOC integration |

> **Hard rule**: Phase 1 is non-negotiable. Phases 2–4 are sequenced; you may start work in parallel but must close earlier gates first.

---

## Phase 1 · Launch-Safe (Weeks 0–6)

The minimum viable security baseline. Anything below this is **negligent** and will fail an audit.

### 1.1 — Network & Edge

- [ ] HTTPS everywhere; TLS 1.2+ with HSTS (1-year max-age)
- [ ] Redirect 80 → 443
- [ ] CDN/WAF in front of origin (even a free Cloudflare tier)
- [ ] Default-deny VPC security groups (ingress + egress)
- [ ] Bastion / Session Manager for any operational access — no public SSH
- [ ] Backups encrypted; daily full + hourly incremental; restore tested at least once

### 1.2 — Authentication

- [ ] bcrypt(12) or argon2id password hashing
- [ ] Account lockout (5 fails → 15 min)
- [ ] Login rate limit: per-IP + per-email
- [ ] Email verification on signup
- [ ] Password reset flow with single-use tokens, 30-min expiry, all sessions revoked on use
- [ ] JWT (or session) with **server-side revocation** on logout / password change
- [ ] `httpOnly`, `Secure`, `SameSite=lax` cookies (use `__Host-` prefix)
- [ ] Absolute session age cap (≤7 days for customers, ≤8h for admins)
- [ ] Pwned-password check at signup/change

### 1.3 — Authorization

- [ ] Roles defined and enforced via middleware (`requireRole(...)`)
- [ ] Resource ownership middleware on **every** read/write of customer-owned data
- [ ] Server is sole source of truth for `userId`/`tenantId`/`sellerId` (never read from request body)
- [ ] Admin endpoints behind `requireRole('admin')` AND a separate URL prefix (`/api/admin/*`)
- [ ] Workflow state machine for orders + refunds + returns; transitions require role+state check

### 1.4 — Input & Storage

- [ ] Zod (or equivalent) schema validation on every endpoint
- [ ] 100% parameterized SQL; raw query construction linted away
- [ ] Body size limits (e.g., 256 KB JSON); upload size limit per route
- [ ] Server-authoritative pricing (cart line stores `unitPriceMinor` set server-side)
- [ ] Database user with least privilege (CRUD only)
- [ ] TLS to database; verify-full

### 1.5 — Payments (PCI scope reduction)

- [ ] Use payment provider's hosted fields (Stripe Elements / Adyen / Braintree) — **PAN never touches your servers**
- [ ] Tokenize cards; store only token + last4 + brand + expiry
- [ ] 3-D Secure 2 enabled for EU/UK
- [ ] PCI SAQ A applicable (verify with QSA)

### 1.6 — Headers, CSP, Cookies

- [ ] Helmet (or equivalent) on every response
- [ ] HSTS preload candidate
- [ ] Strict CSP: no `unsafe-inline`, explicit `script-src` allowlist
- [ ] `X-Frame-Options: DENY` / `frame-ancestors 'none'`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] `Permissions-Policy` denies camera/mic/geolocation by default
- [ ] CORS allowlist; never `*` for credentialed routes

### 1.7 — Observability

- [ ] Correlation ID per request, propagated to PSP/courier/etc.
- [ ] Structured JSON logs with redaction (no PAN, no password, no token)
- [ ] Audit log table with at least: `LOGIN_SUCCESS`, `LOGIN_FAILED`, `PASSWORD_CHANGED`, `ROLE_CHANGED`, `ORDER_CREATED`, `ORDER_REFUNDED`, `ADMIN_ACTION`
- [ ] Centralized log shipping (Datadog/Splunk/Elastic/Loki)
- [ ] Health checks `/healthz` (LB) and `/readyz` (private)

**Phase 1 exit criteria**: A pen-tester can't trivially own a single customer with a stolen password (lockout + revocation), can't enumerate users, can't read another customer's orders, and can't get the database via SQLi.

---

## Phase 2 · Audit-Ready (Weeks 6–14)

Pass an external pen-test and PCI SAQ A audit. Add the controls that examiners specifically look for.

### 2.1 — File Upload Hardening

- [ ] Filename sanitization (traversal, null byte, reserved names, Unicode normalize)
- [ ] **Magic-byte verification** — reject mismatched MIME
- [ ] Re-encode images server-side (strips EXIF, payloads, polyglots)
- [ ] Content scanner: PE/ELF/Mach-O signatures, script patterns, dangerous PDF tags
- [ ] Double-extension detection
- [ ] Per-route size + count caps
- [ ] User-uploaded media → private bucket → signed URLs only
- [ ] Optional: ClamAV or commercial AV in the pipeline

### 2.2 — Anti-Forgery & Anti-Replay

- [ ] CSRF tokens for cookie-authenticated state changes
- [ ] **Idempotency-Key** required on `POST /checkout`, `POST /refunds`, `POST /payments`, `POST /coupons/redeem`, `POST /gift-cards/redeem`
- [ ] HMAC verification on **inbound** webhooks (Stripe-Signature, Adyen HMAC, etc.)
- [ ] HMAC-signed **outbound** artifacts: receipts, refund authorizations, courier label URLs

### 2.3 — Refunds, Disputes, Workflow

- [ ] Workflow state machine codified for orders + refunds + returns
- [ ] Two-person approval for refunds above threshold
- [ ] Audit trail per state transition (who, when, why, IP, request ID)
- [ ] Chargeback evidence-pack auto-generation

### 2.4 — Data Protection

- [ ] PII column encryption (separate keys per column class: email, phone, address, DOB)
- [ ] KMS-managed master keys (AWS KMS / GCP KMS / Azure Key Vault); app holds only references
- [ ] Backup encryption with separate key from production
- [ ] Documented retention per data class (orders: 7 years; logs: 1 year; carts: 30 days; etc.)
- [ ] Right-to-erasure flow (pseudonymize; preserve order data for tax/AML)

### 2.5 — API Security

- [ ] API keys: `pk_*` (public, read-only) and `sk_*` (server, scoped); SHA-256 hashed at rest; timing-safe compare
- [ ] Per-API-key rate limit + scope check
- [ ] Storefront keys can be domain-pinned (Origin allowlist)
- [ ] Partner integration tokens with scopes; rotated quarterly

### 2.6 — Pen-Test Hardening

- [ ] All errors return generic messages in production (no stack traces, no DB error text)
- [ ] Information-leak audit: 404 vs 403 timing, response sizes, header leakage (server version, framework)
- [ ] Disable directory listing on any static origin
- [ ] Disable `OPTIONS *` reflection on backend
- [ ] Strip `X-Powered-By`, `Server` headers

### 2.7 — Admin Hardening

- [ ] Mandatory MFA on every admin / staff role
- [ ] Admin sessions ≤8h absolute, ≤30 min idle
- [ ] Admin audit log shipped to a separate index/sink (read-only)
- [ ] Admin scope: brand / region / store; never global unless `admin` role explicitly

**Phase 2 exit criteria**: External pen-test report has no Critical or High findings; PCI SAQ A signed off; legal can sign DPAs.

---

## Phase 3 · Adversary-Resistant (Months 4–7)

Survive sustained adversary pressure: carding, ATO bots, scraping, refund-fraud rings, gift-card draining.

### 3.1 — Bot & Fraud Management

- [ ] Bot-management WAF (Cloudflare/Akamai/DataDome) on login + checkout + search + product detail
- [ ] Device fingerprint (FingerprintJS / Sift / Stytch) bound to session
- [ ] Risk scoring at:
  - signup
  - login (force step-up MFA on high-risk)
  - checkout (force 3DS challenge on high-risk)
  - refund request (queue for review on high-risk)
- [ ] Behavioural biometrics on long-form fields (typing rhythm) for fraud-rich flows

### 3.2 — Step-Up MFA

- [ ] WebAuthn/passkey support
- [ ] Force step-up on:
  - login from new device / new geo / new ASN
  - cart total > threshold
  - adding new shipping address
  - changing email / phone
  - redeeming gift card / store credit
  - large refund

### 3.3 — Anti-Carding

- [ ] Honeypot fields on checkout (invisible inputs that bots fill)
- [ ] Distinct rate-limit bucket for `POST /payments`
- [ ] Velocity rules at PSP (Stripe Radar / Adyen RevenueProtect)
- [ ] Block known proxy/VPN/datacenter ASNs from new-account creation

### 3.4 — Account Takeover Resistance

- [ ] Notify previous email + phone on email/phone change
- [ ] Cool-off period (e.g., 24h) before high-value actions after credential change
- [ ] Compromised-credential check on login (HIBP k-anon API)
- [ ] Detect impossible-travel (geo + time) → step-up MFA
- [ ] Refresh-token rotation with reuse-detection → revoke entire family

### 3.5 — Gift-Card / Loyalty Hardening

- [ ] Card numbers ≥128 bits + check digit
- [ ] Balance API rate-limited per IP + per card
- [ ] Lock card after N invalid PIN attempts
- [ ] Loyalty-points redemption requires step-up MFA above threshold

### 3.6 — Scraping & Inventory Defense

- [ ] Rate-limit search and PDP per IP + per device
- [ ] Honeypot SKUs to detect scrapers
- [ ] Reserve inventory at *checkout-start* not *add-to-cart*
- [ ] Per-customer purchase caps for limited drops
- [ ] Waiting room for high-demand drops

### 3.7 — JIT Admin Access

- [ ] Production data access gated by ticket + approver + time-box (e.g., 1h)
- [ ] All JIT sessions audit-logged separately
- [ ] Break-glass procedure documented and tested

**Phase 3 exit criteria**: 30-day automated red-team simulation (carding, ATO, scraping) shows >99% block rate without false-positive degradation of legit traffic.

---

## Phase 4 · Mature / Continuous

Sustained operation. Security becomes a property of the SDLC, not a project.

### 4.1 — Secure SDLC

- [ ] Pre-commit hooks: `yarn check:queries` (or equiv), `yarn audit`, secret-scanner (gitleaks/trufflehog)
- [ ] PR template with security checklist for new endpoints
- [ ] Threat-modelling on every new feature touching: auth, payments, PII, admin, file-upload, integrations
- [ ] Quarterly dependency upgrade window
- [ ] Annual external pen-test
- [ ] Bug-bounty program (HackerOne / Intigriti / Bugcrowd)

### 4.2 — Key Management

- [ ] All secrets in KMS / secrets-manager (never in code, never in env files in git)
- [ ] Documented rotation cadence:
  - JWT signing key: every 6 months (rolling, two-key window)
  - PSP keys: every 12 months or on personnel change
  - Encryption keys: every 12 months (envelope-encrypt → re-wrap, no re-encrypt of data)
  - DB credentials: every 90 days (or via IAM auth — no static credentials)
- [ ] Key-compromise runbook (rotate, re-issue, revoke, notify, file)

### 4.3 — Incident Response

- [ ] Documented IR runbook with severity levels and SLAs
  - SEV1: PII / payment-data exposure → 1h response, 4h customer notification draft
  - SEV2: Large-scale fraud / outage → 1h response
  - SEV3: Targeted attack contained → 4h response
- [ ] On-call rotation for security
- [ ] Tabletop exercises quarterly
- [ ] Forensic-grade logging (immutable, time-synced, tamper-evident)

### 4.4 — Privacy Operations

- [ ] DSAR (Data Subject Access Request) self-service portal — 30-day SLA
- [ ] Consent management for marketing, profiling, cross-border transfer
- [ ] Cookie banner integrated with CSP (no tracking until consent)
- [ ] DPIA (Data Protection Impact Assessment) on new features touching PII

### 4.5 — Compliance Cadence

- [ ] Annual PCI re-attestation (SAQ A or D as applicable)
- [ ] Quarterly access reviews (terminate dormant admin / API keys)
- [ ] Quarterly key rotation
- [ ] Monthly backup restore test
- [ ] Weekly review of high-severity audit events
- [ ] Daily review of error-rate spikes

### 4.6 — Continuous Verification

- [ ] DAST (OWASP ZAP / Burp / Nuclei) in CI on every PR
- [ ] SAST (Semgrep / SonarQube / CodeQL) in CI
- [ ] SCA (Snyk / Dependabot / Socket.dev) on every PR
- [ ] Container/image scanning (Trivy)
- [ ] Infrastructure-as-Code scanning (tfsec / checkov)
- [ ] Runtime threat detection (Falco / GuardDuty / Defender)

---

## "Don't Skip" Anti-Pattern Watchlist (per phase)

| Phase | Tempting shortcut | Why it kills you later |
|---|---|---|
| 1 | "We'll add CSP after launch" | Adding CSP retroactively means breaking inline scripts everywhere — ends up never strict |
| 1 | "Let's allow `*` for CORS, we'll tighten later" | Storefront partners depend on it; "later" never comes |
| 1 | "JWT without revocation, we'll add it if we need to" | First fraud incident requires logout-everywhere; you'll discover you can't |
| 2 | "We don't need idempotency, our PSP handles it" | A duplicate refund is your problem, not theirs |
| 2 | "Stack traces help debugging in production" | They also help attackers map the codebase |
| 3 | "MFA hurts conversion, skip it" | Step-up (risk-based) MFA improves conversion vs always-on |
| 3 | "Bot mgmt is too expensive" | Carding fines + chargeback ratio breach is more expensive |
| 4 | "Pen-test once and we're done" | New code = new attack surface every sprint |

---

**Next**: [`05-pci-dss-compliance.md`](./05-pci-dss-compliance.md) — PCI DSS v4.0 requirement-by-requirement evidence using NedAccess patterns.
