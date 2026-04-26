# Security Blueprint: NedAccess → E-Commerce

> **Purpose**: A practical, exhaustive blueprint that explains **why NedAccess security is tight**, what controls make it tight, and **how every one of those controls maps onto an e-commerce platform** (B2C marketplace, D2C storefront, or omni-channel commerce).

**Version**: 1.0
**Last Updated**: April 2026
**Audience**: Security engineers, platform architects, CTOs, e-commerce product owners
**Classification**: Internal

---

## How To Use This Blueprint

This blueprint is split into focused files so individual concerns can be reviewed, exported, or shared with stakeholders independently.

| # | File | Audience | Purpose |
|---|------|----------|---------|
| 1 | [`01-security-mandate.md`](./01-security-mandate.md) | Execs, Compliance | Why NedAccess is treated as **bank-grade** and which legal/contractual mandates demand this posture |
| 2 | [`02-ecommerce-threat-model.md`](./02-ecommerce-threat-model.md) | Architects, AppSec | Threat model for e-commerce, mapped against NedAccess controls |
| 3 | [`03-feature-mapping.md`](./03-feature-mapping.md) | Engineers | Feature-by-feature translation: every NedAccess control → equivalent e-commerce implementation |
| 4 | [`04-implementation-roadmap.md`](./04-implementation-roadmap.md) | PMs, Tech Leads | Phased delivery plan (MVP → mature) so you don't have to build everything at once |
| 5 | [`05-pci-dss-compliance.md`](./05-pci-dss-compliance.md) | Compliance, Payments | PCI DSS v4.0 requirement-by-requirement evidence using NedAccess patterns |
| 6 | [`06-implementation-checklist.md`](./06-implementation-checklist.md) | Engineers, QA | Boxed checklist suitable for sign-off / audit |

> Where this blueprint references the running NedAccess system, see also: [`../SECURITY_ARCHITECTURE.md`](../SECURITY_ARCHITECTURE.md), [`../security/`](../security/), and [`../GDPR_POPIA_COMPLIANCE_PLAN.md`](../GDPR_POPIA_COMPLIANCE_PLAN.md).

---

## Executive Summary (TL;DR)

NedAccess is a customer onboarding, KYC and credit-application platform handling **government IDs, biometric liveness checks, payslips, bank statements, salary data, and signed contracts** for Nedbank Namibia. A breach is not a ticketing problem — it is a regulatory event under POPIA (Protection of Personal Information Act) and the Banking Code.

To meet that bar, NedAccess implements **defense-in-depth across 7 layers**:

1. **Network perimeter** – WireGuard VPN, UFW firewall, Fail2Ban
2. **Reverse proxy** – Nginx with TLS 1.2+, HSTS, CSP, rate limiting
3. **Application security** – JWT + revocation, RBAC, ownership checks, Zod validation, file scanning
4. **Data protection** – bcrypt(12), AES-256-GCM, AES-256-CBC, HMAC-SHA256, SHA-256 with timing-safe compare
5. **Database** – Least-privilege DB user, TLS connections, parameterized queries enforced by ESLint, optional TDE
6. **Monitoring & audit** – 30+ security event types, immutable audit log, correlation IDs, log retention 30–365 days
7. **External services** – AWS (Rekognition, Textract, S3), Keycloak SSO, SendGrid — all over HTTPS with encrypted credentials

**Every one of those controls translates 1:1 to an e-commerce platform** because e-commerce handles equivalently sensitive data (payment cards, addresses, order history, account credentials, loyalty points, age-gated products) and faces an even more **adversarial threat landscape** (carding, account takeover, scraping, fraud, gift-card abuse, return fraud, refund attacks).

The rest of this blueprint shows how.

---

## At-A-Glance Mapping

| NedAccess Control | E-Commerce Equivalent | Why It Matters in E-Commerce |
|---|---|---|
| KYC + biometric liveness | Strong Customer Authentication (SCA / 3-D Secure 2) | PSD2/SCA mandates, fraud reduction |
| Application document upload + magic-byte scan | Product image / return-evidence uploads, seller verification | Stops malware in marketplace listings |
| Agent–client relationship guard | Multi-tenant seller / store / sub-account isolation | Prevents cross-tenant data leakage |
| Application workflow state guard | Order state machine guard (cart → paid → fulfilled → returned) | Prevents replay / double-spend / refund abuse |
| Product-scoped OPS access | Brand- / category- / region-scoped admin access | Limits insider blast radius |
| Income-verification PDF signing (HMAC) | Order receipt / invoice / refund authorization signing | Tamper-evidence for finance and tax |
| OTP for inactive users | Step-up auth on high-risk events (new device, big basket, password reset) | Reduces ATO impact |
| API key with scopes | Storefront / partner / RPA API tokens | Safe integrations with third-party apps |
| Audit log (365 days) | Order audit trail + admin audit log | Chargeback evidence, fraud investigation |
| Encrypted secrets at rest (AES-256-GCM) | Encrypted payment provider keys, courier creds, ERP creds | PCI DSS 3.5/3.6 |
| Parameterized queries enforced by ESLint | Same — no raw SQL anywhere near checkout | OWASP A03 |
| File-upload security (magic bytes, content scan, ZIP-bomb, polyglot) | Same — applied to listing media, return evidence, support attachments | Stops malware-in-listing campaigns |

---

## Core Principle: "Tightness" Is A Property Of The Whole System

Tight security is **not** any single control. It is the property that emerges when:

- **Every layer assumes the layer above it has been compromised.**
- **Every request is authenticated, authorized, validated, rate-limited and logged** — even internal ones.
- **Every secret is encrypted at rest with a different key than every other class of secret.**
- **Every state transition is checked against a workflow** — you cannot refund an order that was never paid; you cannot dispatch one that is unpaid; you cannot review a product you never bought.
- **Every action is traceable to a user, an IP, a request ID, and a timestamp** for at least 365 days.
- **Every failure mode is closed by default** — when in doubt, deny.

The remainder of this blueprint operationalizes that principle.

---

## Reading Order

If you are…

- **An exec** asking "do we need to do all of this?" → read **01** (mandate) and the executive summary above.
- **An architect** scoping a new e-commerce platform → read **02** (threat model) → **03** (feature mapping) → **04** (roadmap).
- **An engineer** about to build it → read **03** (feature mapping) → **06** (checklist).
- **A compliance officer** preparing for PCI DSS / POPIA / GDPR audit → read **01** + **05** + **06**.

---

**Document owner**: Security Architecture
**Next review**: 6 months from `Last Updated`
**Source code references**: All file paths in subsequent docs are relative to repository root unless stated otherwise.
