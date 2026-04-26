# 05 · PCI DSS v4.0 — Requirement-by-Requirement Evidence

> Map each PCI DSS v4.0 requirement to the NedAccess control(s) that satisfy it (or describe what the e-commerce platform must add). Use this as your **internal evidence pack** before engaging a QSA.

> **Disclaimer**: This is a technical alignment guide, not a substitute for a Qualified Security Assessor (QSA). Always validate scope and SAQ type with a QSA. PCI DSS v4.0.1 became mandatory March 31, 2025; new requirements (e.g., 6.4.3, 11.6.1) apply specifically to e-commerce.

---

## 0. Scope Reduction (Read This First)

PCI DSS scope is **a function of where the PAN goes**. The single most impactful security decision an e-commerce platform makes is:

> **Use the payment provider's hosted fields / iframe / redirect so the cardholder PAN never touches your servers.**

If you do this:
- Eligible for **SAQ A** (≈22 controls)
- PAN is never in your DB, logs, or memory
- Most of Requirements 3, 4, 9 become not-applicable
- Implementation effort drops by ~80%

If you don't (you self-host the card form / proxy the PAN), you're in **SAQ A-EP** or **SAQ D** territory — much more onerous.

**Recommendation**: Stripe Elements / Adyen Web Drop-in / Braintree Hosted Fields / Checkout.com Frames.

---

## 1. Build and Maintain a Secure Network

### 1.1 — Network security controls processes

- ✅ Documented in [`02-architecture-and-deployment.mdc`](../.cursor/rules/02-architecture-and-deployment.mdc) (NedAccess Cursor rule).
- 🛒 E-commerce: Document VPC topology, security groups, egress rules in `infrastructure/README.md`.

### 1.2 — Network security controls configurations

- ✅ NedAccess: UFW deny-by-default; only 80/443 public, 51820/udp VPN, 22 from VPN.
- 🛒 E-commerce: VPC SG + NACLs; ALB only public; backend SG accepts only ALB SG; DB SG accepts only backend SG; deny-all egress except payment provider, KMS, S3, observability.

### 1.3 — Network access between trusted/untrusted networks restricted

- ✅ NedAccess: Internal services (4001 backend, 1433 SQL) not exposed publicly.
- 🛒 E-commerce: Backend, DB, cache, queue all in private subnets; only ALB in public subnet.

### 1.4 — Network connections between trusted/untrusted networks controlled

- ✅ NedAccess: WireGuard VPN required for SSH; Fail2Ban for IDS.
- 🛒 E-commerce: SSM/Tailscale/Teleport for ops access; WAF + bot mgmt at edge.

### 1.5 — Risks to CDE from computing devices in/out controlled

- ✅ NedAccess: SSH key-only; Fail2Ban; deployer non-root.
- 🛒 E-commerce: MDM-managed laptops for any cardholder-data access; FDE; OS auto-updates; YubiKey-required SSO.

---

## 2. Apply Secure Configurations

### 2.1 — Configuration standards

- ✅ NedAccess: `.cursor/rules/03-deployment-rules.mdc` covers config standards (UTF-8 no BOM, Yarn linker, PM2 host, etc.).
- 🛒 E-commerce: Same — Infrastructure-as-Code (Terraform) with `tfsec`/`checkov` in CI.

### 2.2 — System components configured securely

- ✅ NedAccess: Helmet, CSP, HSTS, secure cookies, error sanitization.
- 🛒 E-commerce: Same plus image hardening (distroless containers, read-only rootfs).

### 2.3 — Wireless environments configured securely

- 🛒 N/A in cloud; covered by office MDM if applicable.

---

## 3. Protect Stored Account Data

> **The big one.** With SAQ A scope reduction, most of this is N/A.

### 3.1 — Storage minimized

- ✅ NedAccess: No PAN stored; only token + last4 + brand + expiry (if at all).
- 🛒 E-commerce: Same. Never store CVV (forbidden post-authorization). Truncate PAN to last4 in any logs/analytics.

### 3.2 — Sensitive Authentication Data not retained

- ✅ Never store CVV, full magnetic stripe, PIN block.
- 🛒 E-commerce: Verify your PSP integration never persists these. SDKs handle it; verify logs aren't capturing them.

### 3.3 — PAN displayed only to authorized roles

- 🛒 E-commerce: Customer sees own last4 only; CSAs see masked (`****1234`); never display full PAN. Refunds keyed by PSP transaction ID, not PAN.

### 3.4 — Cryptographic storage of PAN

- 🛒 If storing tokens: tokens are not PAN, so 3.4 doesn't strictly apply. If storing actual PAN (avoid!), use **AES-256 with HSM-managed keys**, FIPS 140-2/3 validated.
- ✅ NedAccess pattern for AES-256-GCM in `services/secrets.ts` is a starting point — but PCI requires HSM-rooted keys for PAN.

### 3.5 — Cryptographic keys protected

- ✅ NedAccess: Master keys in env, derived via SHA-256, separate keys per data class (`SECRETS_ENC_KEY`, `SFTP_ENCRYPTION_KEY`, `CERTIFICATE_SIGNING_SECRET`, etc.).
- 🛒 E-commerce: Move master keys to **AWS KMS / GCP KMS / Azure Key Vault** (HSM-backed). App holds only KMS key reference; KMS does the encrypt/decrypt.

### 3.6 — Key management documented and implemented

- 🛒 E-commerce: Document key custodian, rotation cadence, split-knowledge / dual-control for any HSM operations.

### 3.7 — Cryptographic key management policies

- 🛒 E-commerce: Annual review; documented procedures for compromise.

---

## 4. Protect Cardholder Data with Strong Cryptography During Transmission

### 4.1 — Strong cryptography over open networks

- ✅ NedAccess: TLS 1.2+, ECDHE/DHE PFS, OCSP stapling, HSTS preload.
- 🛒 E-commerce: Same. Disable TLS 1.0/1.1 entirely; aim for TLS 1.3 only on new properties.

### 4.2 — End-user PAN never sent via unencrypted messaging

- 🛒 E-commerce: Never accept PAN via email, SMS, support chat. PSP's hosted fields enforce this automatically; just don't add a "send your card details to support" channel.

---

## 5. Protect All Systems and Networks from Malicious Software

### 5.1 — Anti-malware solution

- ✅ NedAccess: ClamAV optional in upload pipeline.
- 🛒 E-commerce: Mandatory AV on any system touching cardholder data; runtime threat detection (GuardDuty/Defender).

### 5.2 — Anti-phishing mechanisms

- 🛒 E-commerce: SPF/DKIM/DMARC on all sender domains; phishing-resistant MFA (WebAuthn) for admins.

---

## 6. Develop and Maintain Secure Systems and Software

### 6.1 — Vulnerability management

- ✅ NedAccess: `yarn audit`, pinned `yarn.lock`.
- 🛒 E-commerce: Snyk / Dependabot / Socket.dev in CI; image scanning (Trivy).

### 6.2 — Bespoke and custom software developed securely

- ✅ NedAccess: ESLint enforces no inline SQL; Cursor rules document patterns; PR review.
- 🛒 E-commerce: SAST (Semgrep/CodeQL) in CI; secure-SDLC training.

### 6.3 — Security vulnerabilities identified and addressed

- 🛒 E-commerce: Documented SLA — Critical patched <30 days, High <90 days.

### 6.4 — Public-facing web applications protected

- ✅ NedAccess: WAF rate limit, Fail2Ban, Helmet, CSP.
- 🛒 E-commerce: WAF in front (Cloudflare/AWS WAF/Akamai).

### 6.4.3 (NEW in v4) — Payment-page scripts inventoried and authorized

> **Critical for e-commerce.** Specifically targets Magecart-style attacks.

- 🛒 E-commerce: Maintain inventory of every script that loads on the payment page. Justify each. Use **Subresource Integrity (SRI)** with version-pinned hashes. Use a CSP `script-src` nonce so unauthorized scripts can't run. Tooling: Source Defense, Feroot, Jscrambler, c/side, or roll-your-own SRI manifest.

### 6.5 — Vulnerabilities at code level

- ✅ NedAccess: Patterns in this blueprint cover XSS, SQLi, broken auth, broken access, SSRF.

---

## 7. Restrict Access to System Components and Cardholder Data by Business Need

### 7.1 — Access defined and assigned by business need

- ✅ NedAccess: RBAC + product-scoped OPS + ownership middleware.
- 🛒 E-commerce: RBAC + brand/region scope; PCI roles (admin, ops, csa) defined per-environment.

### 7.2 — Access control mechanisms

- ✅ NedAccess: `requireRole`, `requireOwnerOrRole`, `requireProductAccess`.
- 🛒 E-commerce: Same shape; add `requireMFA` middleware for high-risk endpoints.

### 7.3 — Access defined by job classification and function

- 🛒 E-commerce: Documented role matrix; reviewed quarterly.

---

## 8. Identify Users and Authenticate Access

### 8.1 — User identification policies

- ✅ NedAccess: Unique user IDs; soft-delete with `deleted_at`.

### 8.2 — Strong authentication

- ✅ NedAccess: bcrypt(12), lockout, rate limit, OTP for inactive users.
- 🛒 E-commerce: Same plus mandatory MFA (8.3 below).

### 8.3 — Multi-factor authentication

- 🛒 E-commerce: **Mandatory MFA for all admin/staff users**; risk-based step-up MFA for customers (login from new device, large basket, address change). WebAuthn/passkey preferred. Use Authy/Authenticator/Twilio Verify for SMS/TOTP fallback.

### 8.4 — MFA implemented securely

- 🛒 E-commerce: Phishing-resistant for admins (WebAuthn). Not SMS-only.

### 8.5 — MFA configured for all access

- 🛒 E-commerce: All admin SSH/console/DB access via MFA-protected SSO.

### 8.6 — Use of application/system accounts and authentication factors

- ✅ NedAccess: `INTEGRATION_TOKENS` env var with scopes.
- 🛒 E-commerce: Service-account credentials in KMS/secrets-manager; rotated; never in code.

---

## 9. Restrict Physical Access

- 🛒 Largely covered by cloud provider compliance (AWS/GCP/Azure SOC 2 + PCI). Office: MDM, FDE, badge access for any system with cardholder data.

---

## 10. Log and Monitor All Access

### 10.1 — Audit logs implemented

- ✅ NedAccess: `audit_log` with 30+ event types, 365-day retention, indexed on `event_type, user_id, created_at`.
- 🛒 E-commerce: Add commerce events (`PAYMENT_SUCCESS`, `REFUND_ISSUED`, `CHARGEBACK_RECEIVED`, etc.).

### 10.2 — Audit logs capture necessary detail

- ✅ NedAccess: Per event: `event_type, user_id, ip, user_agent, request_id, metadata, timestamp`.
- 🛒 E-commerce: Add `tenant_id, store_id, order_id, payment_token` where relevant.

### 10.3 — Audit logs protected

- 🛒 E-commerce: Ship logs to a separate AWS account / sink (write-only IAM); WORM (immutable) storage where possible.

### 10.4 — Time synchronisation

- 🛒 E-commerce: NTP/chrony on every host; AWS time-sync service.

### 10.5 — Audit log history retained

- ✅ NedAccess: 365 days online; offline backup (PCI requires 1 year online + 1 year archived).

### 10.6 — Time-synchronisation mechanisms reviewed

- 🛒 E-commerce: Monthly check.

### 10.7 — Failures of critical security control systems detected and responded to

- 🛒 E-commerce: Alerts on:
  - Logging pipeline failure
  - WAF down
  - DB encryption disabled
  - Backup failed
  - MFA service down

---

## 11. Test Security of Systems and Networks Regularly

### 11.1 — Network intrusion detection / prevention

- ✅ NedAccess: Fail2Ban + Nginx rate limit.
- 🛒 E-commerce: WAF + bot management; runtime detection (GuardDuty / Defender / Falco).

### 11.2 — Vulnerability scans

- 🛒 E-commerce: Internal: monthly authenticated scans. External: ASV scans **quarterly** (mandatory).

### 11.3 — External and internal penetration testing

- 🛒 E-commerce: Annual third-party pen-test; after major changes; segmentation tests semi-annually.

### 11.4 — Intrusion detection and prevention techniques

- 🛒 E-commerce: WAF + bot mgmt + SIEM alerting.

### 11.5 — Change-detection mechanism

- 🛒 E-commerce: File integrity monitoring (FIM) on production hosts (e.g., AIDE, OSSEC, Wazuh).

### 11.6 (NEW in v4) — Detect & respond to unauthorized changes on payment pages

- 🛒 E-commerce: Tools that monitor payment page for unauthorized scripts/changes and alert. Combined with 6.4.3, this is the **Magecart-defense duo**.

---

## 12. Support Information Security with Organizational Policies and Programs

### 12.1 — Information security policy

- 🛒 E-commerce: Annual review; signed acknowledgement by all staff.

### 12.2 — Acceptable use policies

- 🛒 E-commerce: BYOD, data handling, social engineering awareness.

### 12.3 — Risk assessment

- 🛒 E-commerce: Annual + on major change.

### 12.4 — Security awareness program

- 🛒 E-commerce: Annual training; phishing simulations.

### 12.5 — PCI DSS compliance program

- 🛒 E-commerce: Designated security lead; QSA engagement.

### 12.6 — Information security awareness

- 🛒 E-commerce: Onboarding security training for engineers.

### 12.7 — Personnel screening

- 🛒 E-commerce: Background checks for staff with cardholder data access.

### 12.8 — Third-party service providers

- 🛒 E-commerce: List all TPSPs (PSP, courier, tax, ERP, marketing); annual review of their AOC.

### 12.9 — TPSPs acknowledge responsibility

- 🛒 E-commerce: Written agreements (DPAs) defining responsibility split.

### 12.10 — Incident response plan

- 🛒 E-commerce: IR runbook (see Phase 4 of [`04-implementation-roadmap.md`](./04-implementation-roadmap.md)); tabletop quarterly.

---

## SAQ A Quick-Reference Checklist (Hosted-Fields Merchants)

If you use Stripe Elements / Adyen / Braintree Hosted Fields and **never receive PAN on your servers**, the SAQ A short list is:

- [ ] All payment processing outsourced to a PCI-validated TPSP
- [ ] Your website/app **only** redirects/iframes to the TPSP's PCI-compliant page
- [ ] You never store, process, or transmit PAN
- [ ] You retain the TPSP's AOC (Attestation of Compliance) on file
- [ ] Strong access control, MFA for any admin
- [ ] Audit logs for any system that interacts with the TPSP
- [ ] Quarterly ASV scans on internet-facing systems
- [ ] Vulnerability management
- [ ] **6.4.3** — script inventory + SRI on payment page
- [ ] **11.6.1** — payment-page change detection
- [ ] Annual SAQ A self-assessment + AOC

---

## What This Doesn't Cover

PCI DSS v4 has additional content for **service providers** (12.x.x.x sub-requirements), **merchants storing PAN** (full Req 3 implementation), and **call-center merchants** (different scope rules). Engage a QSA early.

---

**Next**: [`06-implementation-checklist.md`](./06-implementation-checklist.md) — single-page actionable checklist suitable for sign-off.
