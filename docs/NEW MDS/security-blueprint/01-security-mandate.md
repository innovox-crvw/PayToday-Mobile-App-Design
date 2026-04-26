# 01 · The Security Mandate

> Why NedAccess must be locked down to bank-grade levels — and why the same mandate (with different drivers) applies to any serious e-commerce platform.

---

## 1. The NedAccess Mandate

NedAccess is the customer-facing onboarding, KYC and credit-application surface for **Nedbank Namibia**. It handles, at minimum:

| Data Class | Examples | Sensitivity |
|---|---|---|
| Identity documents | National IDs, passports, driver's licenses | **Critical** (POPIA Special Personal Information) |
| Biometric data | Face liveness frames, AWS Rekognition session results | **Critical** (POPIA Section 26) |
| Financial data | Payslips, bank statements, salary, employer details, debt-to-income ratios | **Critical** (Banking secrecy) |
| Credit decisions | Affordability calculations, scorecards, approve/decline outcomes | **Critical** (NCA / consumer credit law) |
| Signed documents | Loan agreements, debit-order mandates, beneficiary nominations | **Legal evidence** |
| Operational data | Agent-client links, OPS workflow assignments, audit history | **Internal sensitive** |

### Regulatory & contractual drivers

1. **POPIA (Namibia/SA)** – Mandates encryption, breach notification, data-subject rights, and audit logging.
2. **Banking Code of Conduct (Namibia)** – Confidentiality of customer financial information.
3. **Nedbank Group Information Security Policy** – Cryptographic standards, access reviews, data residency.
4. **Reserve Bank reporting** – Operational risk events must be reportable.
5. **AML / FICA** – KYC records must be retained 5+ years and be tamper-evident.
6. **Consumer Protection** – Credit decisions must be auditable and reversible on request.

### What "tight" means in this context

Tightness is enforced not by one control but by **the conjunction of all controls failing closed**:

- A leaked password ≠ access — bcrypt(12) + lockout + OTP for inactive users + JWT revocation.
- A leaked JWT ≠ persistent access — server-side revocation + 5-day absolute session age + Clear-Site-Data on expiry.
- A leaked API key ≠ unrestricted access — SHA256 hashed at rest + scoped permissions + usage tracking + timing-safe compare.
- A compromised OPS user ≠ full data access — product-scoped + role-scoped + workflow-state-scoped + audit-logged.
- A malicious upload ≠ RCE — magic bytes + content scan + executable detection + sandboxed BLOB storage + CSP-protected viewers.
- A SQL injection attempt ≠ data exfil — 100% parameterized queries enforced by ESLint + centralized in `backend/src/queries/`.

If any one of those fails, the next one stops the bleed. That is what "defense in depth" actually means.

---

## 2. The E-Commerce Mandate (Same Posture, Different Drivers)

E-commerce platforms are **not lower-stakes than banking** — they are differently-stakes. The data is similar in volume and worse in adversarial pressure:

| Data Class | E-Commerce Examples | Why It's Critical |
|---|---|---|
| Payment data | PANs, expiry, CVV (transient), tokens, BIN, billing address | **PCI DSS** — fines up to ~$500k/incident, scheme penalties, brand bans |
| Identity data | Name, email, phone, DOB, government ID for age-gated SKUs | **GDPR / POPIA / CCPA** — up to 4% global turnover |
| Behavioural data | Browsing, basket, search history, recommendations, location | **GDPR / CCPA** opt-out + sensitive profiling |
| Loyalty / wallet | Reward points, store credit, gift-card balances | Liquid; equivalent to cash; primary fraud target |
| Order history | Addresses, deliveries, returns, refunds | Used for stalking, ATO confirmation, social engineering |
| Seller / merchant data | Bank details, tax IDs, KYB documents, payouts | Marketplace fraud, money mules |
| API tokens | Storefront keys, headless commerce keys, partner integrations | Equivalent to admin access if scoped wrong |
| Pricing & catalog | Per-customer pricing, B2B contracts, promo codes | Competitive intel + coupon abuse |

### Regulatory & contractual drivers for e-commerce

1. **PCI DSS v4.0** – Mandatory if you touch a PAN at all. Stricter from March 2025.
2. **PSD2 / Strong Customer Authentication (SCA)** – EU/UK; multi-factor on most card-not-present transactions.
3. **GDPR / UK GDPR / CCPA / POPIA / LGPD** – Privacy-by-design, breach notification (72h), data-subject rights.
4. **Consumer Rights Act / DSA** – Withdrawal periods, transparent pricing, no dark patterns.
5. **Tax authorities** – e-Invoicing mandates (e.g., SARS, ZATCA, SAT, India e-Invoice) require **tamper-evident** receipts.
6. **App-store / payment scheme contracts** – Visa/Mastercard/Apple Pay/Google Pay each impose security warranties.
7. **Anti-fraud regulations** – PSR (UK) shifts liability to firms for APP fraud; chargeback rules under Reg E (US).

### Adversaries are **more** sophisticated against e-commerce

E-commerce sees more *automated* attack volume than retail banking does:

- **Carding / card-testing** — bots try stolen PANs against $1 charges.
- **Credential stuffing** — re-use of breach corpora (~10B+ creds).
- **Account takeover (ATO)** — drains gift cards, redirects shipments, harvests reward points.
- **Refund fraud / "wardrobing"** — return empty boxes, claim non-delivery.
- **Coupon / promo abuse** — multi-account, referral cycling.
- **Gift-card draining** — enumeration of card numbers + balance APIs.
- **Inventory denial** — bots add scarce SKUs to baskets to block real customers.
- **Scraping** — competitive price intel, SKU exfiltration, reseller targeting.
- **Marketplace fraud** — fake sellers, triangulation fraud, money mules.
- **Loyalty / points laundering** — points → gift cards → resale.
- **Friendly fraud / chargebacks** — legitimate customer disputes valid charges.
- **Supply-chain attacks** — JS injection via tag managers / third-party scripts (Magecart, formjacking).

> Magecart-style attacks against checkout pages have hit British Airways, Ticketmaster, Newegg and thousands of Magento stores. The CSP and SRI controls in NedAccess are the **same controls** that would have prevented these.

### The parallel posture

The e-commerce mandate is therefore: **adopt the NedAccess posture, then add anti-fraud controls and PCI scope reduction**.

| NedAccess Driver | E-Commerce Driver | Resulting Control |
|---|---|---|
| POPIA breach notification | GDPR Art 33/34, state laws | Audit log + alerting + IR runbook |
| Banking secrecy | PCI DSS req 3 | AES-256 at rest, key separation |
| AML / KYC retention | PCI DSS req 10, tax e-invoice retention | 365-day audit log, tamper-evident receipts |
| Credit decisions auditable | Consumer Rights / chargeback evidence | Immutable workflow log per order |
| Document tamper-evidence | Receipt / refund tamper-evidence | HMAC-signed PDFs, signed URLs |

---

## 3. The "Tight Enough" Bar

A platform meets the bar when it can answer **"yes"** to all of the following without qualifications:

- [ ] Can we prove that **every** request was authenticated, authorized, validated, and logged?
- [ ] If a single password leaks, is the blast radius **strictly that one account**?
- [ ] If a single API key leaks, is the blast radius **strictly that key's scopes**?
- [ ] If a single admin is compromised, is the blast radius **strictly their product/region scope**?
- [ ] If our database is dumped, is **no PII** readable without the application's encryption keys?
- [ ] Can we **revoke a session within seconds** of detecting compromise?
- [ ] Can we **trace any user-visible action** back to a request ID, IP, user ID, and timestamp for ≥365 days?
- [ ] Can we **detect** brute force, ATO, carding, scraping, and bot traffic in **near real time**?
- [ ] Does **every state transition** check the previous state and the actor's authority to make that transition?
- [ ] Does **every file uploaded** get scanned beyond extension and MIME type?
- [ ] Does **every external integration** use HTTPS with credentials encrypted at rest with separate keys per integration?
- [ ] Are **all SQL queries** parameterized, with raw query construction prohibited by linting?
- [ ] Are **all secrets** different per environment, never in code, rotatable in <1 hour?

If any answer is "no" or "kind of", the platform is **not tight**. The remaining files in this blueprint show how to get every answer to "yes".

---

## 4. Anti-Patterns That Break Tightness

Even with all the right controls present, tightness is **broken** by these common mistakes:

- ❌ "Internal" services that skip auth because "they're behind the firewall"
- ❌ Admin endpoints that share rate limits with public endpoints (no enumeration protection)
- ❌ JWT validity longer than 24h with no revocation list
- ❌ One shared API key for "the front-end" with full scopes
- ❌ Refunds, price overrides, or coupon application that don't re-verify role + ownership + state
- ❌ File uploads that trust `Content-Type` from the client
- ❌ Client-side price calculation accepted by the server
- ❌ "Just this once" allow-listed inline `<script>` to make a marketing tool work — kills CSP forever
- ❌ Database accounts with `db_owner` instead of least-privilege CRUD
- ❌ Logging full request bodies (writing PANs, passwords, tokens to disk)
- ❌ Treating `userId` from the client as authoritative ("change my email to userId=123")
- ❌ Stack traces returned to the browser in production

The rest of this blueprint enumerates the controls that prevent these.

---

**Next**: [`02-ecommerce-threat-model.md`](./02-ecommerce-threat-model.md) — Threat model for e-commerce, mapped against NedAccess controls.
