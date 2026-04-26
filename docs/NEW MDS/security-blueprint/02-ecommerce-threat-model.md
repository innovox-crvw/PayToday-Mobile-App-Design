# 02 · E-Commerce Threat Model

> A practical threat model for an e-commerce platform, where each threat is mapped to the **specific NedAccess control(s)** that mitigate it. If you implement the NedAccess stack, you cover most of OWASP, OWASP API Top 10, and the bulk of PCI DSS technical controls.

---

## How To Read This Document

Each threat is presented in a consistent format:

```
THR-NNN  Threat Name
┌─ Description: …
├─ Likelihood: Low / Medium / High / Very High
├─ Impact:     Low / Medium / High / Critical
├─ NedAccess control(s) that mitigate it
└─ E-commerce additions (if any) needed on top
```

Likelihood is *for an internet-facing e-commerce platform doing >$1M GMV/year*. Impact is *worst credible case*.

---

## 1. Authentication & Account Threats

### THR-001 — Credential Stuffing
- **Description**: Attackers replay leaked username/password pairs from breach corpora against the login form.
- **Likelihood**: **Very High** (every public e-commerce site sees this daily)
- **Impact**: **Critical** (ATO → gift-card drain, redirect shipments, data exfil)
- **NedAccess controls**:
  - Login rate limit: **10 attempts/min per IP** (`backend/src/middleware/rateLimit.ts`)
  - Account lockout: **5 failed attempts → 15 min ban** (`backend/src/services/accountSecurity.ts`)
  - Common-password blocklist (10k+ entries) refused at signup and password change
  - bcrypt cost 12 → infeasible to brute-force offline if hashes leak
  - Unified error messages → no user-enumeration via login response
- **E-commerce additions**:
  - **Have I Been Pwned**-style check on signup/password change (k-anon API)
  - **CAPTCHA** (hCaptcha / reCAPTCHA Enterprise / Cloudflare Turnstile) on login after first failure
  - Device fingerprint + risk score (FingerprintJS, Sift, Stytch)

---

### THR-002 — Brute Force
- **Description**: Attackers iterate passwords against a known username.
- **Likelihood**: High
- **Impact**: Critical
- **NedAccess controls**: Lockout, rate limit, bcrypt(12), Fail2Ban at nginx layer (banning the IP outside the app).
- **E-commerce additions**: Step-up MFA after lockout (force email/SMS/TOTP).

---

### THR-003 — Account Takeover via Password Reset
- **Description**: Attacker triggers password reset, intercepts/guesses token.
- **Likelihood**: Medium
- **Impact**: Critical
- **NedAccess controls**:
  - OTP for inactive users (30+ days): **6 digits, bcrypt-hashed (cost 10), 10-min expiry, 5-attempt limit**
  - Tokens single-use, server-side revocation
  - Reset tokens invalidate all existing sessions on use (via `revoked_tokens`)
- **E-commerce additions**:
  - Notify the **previous** email of the change (so a hijacked email isn't the only signal)
  - Require re-MFA before the new password is accepted
  - Rate-limit reset requests per email AND per IP

---

### THR-004 — Session Hijacking (Cookie Theft)
- **Description**: XSS or stolen device extracts session cookies.
- **Likelihood**: Medium
- **Impact**: Critical
- **NedAccess controls**:
  - `httpOnly`, `Secure`, `SameSite=lax` cookies
  - Strict CSP (no inline scripts → XSS very hard)
  - 5-day absolute session timeout (cannot be extended via refresh)
  - Server-side JWT revocation list
  - **Clear-Site-Data** header on session expiry (clears cache + cookies + storage)
- **E-commerce additions**:
  - Bind session to **device fingerprint** + IP ASN; on mismatch, force re-MFA before write actions
  - Admin sessions: shorter (e.g., 30-min idle, 8-hour absolute)

---

### THR-005 — User Enumeration
- **Description**: Login / reset / signup leak whether an email exists.
- **Likelihood**: High
- **Impact**: Medium (precondition for THR-001/002)
- **NedAccess controls**: Unified `invalid_credentials` regardless of cause; reset response is identical for known/unknown emails.
- **E-commerce additions**: Same response time for known vs. unknown (timing-side-channel safe).

---

### THR-006 — Token Replay / Theft
- **Description**: A leaked JWT or refresh token allows access until natural expiry.
- **Likelihood**: Medium
- **Impact**: Critical
- **NedAccess controls**:
  - **Server-side revocation** (`revoked_tokens` table), checked on every request via `requireAuth` (`backend/src/middleware/auth.ts`)
  - Absolute session age check (5 days)
  - User-deletion check on every request (orphan tokens denied)
  - Tokens issued via secure endpoint only (no client-side mint)
- **E-commerce additions**: Refresh-token rotation (reuse-detection → revoke entire family).

---

## 2. Payment & Financial Threats

### THR-101 — Card Testing / Carding
- **Description**: Bot tests stolen PANs against checkout, usually with $0.01–$1.00 charges.
- **Likelihood**: **Very High** (this is the #1 e-commerce abuse pattern)
- **Impact**: High (chargebacks, scheme fines, processor freeze)
- **NedAccess controls**:
  - Per-IP and per-API-key rate limiting
  - Audit log of every checkout attempt (correlation ID, IP, UA, body hash)
  - Authenticated burst allowance (`burstMultiplier`) so legit users aren't blocked
- **E-commerce additions**:
  - **Velocity rules** at the payment provider (e.g., Stripe Radar, Adyen RevenueProtect) — max N attempts per BIN per hour, per device, per email
  - **3-D Secure 2** mandatory for high-risk geos
  - Honeypot fields + invisible CAPTCHA on checkout
  - Distinct rate-limit bucket for `/checkout` (do NOT share with browse)

---

### THR-102 — Friendly Fraud / Chargeback Abuse
- **Description**: Customer disputes a legitimate charge ("I didn't receive it").
- **Likelihood**: High
- **Impact**: Medium (per incident; in aggregate Critical)
- **NedAccess controls**:
  - Immutable audit log: who, what, when, IP, device, request ID
  - HMAC-SHA256 signed receipts/contracts
  - Order workflow state log (paid → packed → shipped → delivered with timestamps)
- **E-commerce additions**:
  - Capture device fingerprint at checkout and at delivery confirmation
  - Carrier proof of delivery + signature stored against the order
  - Auto-package chargeback evidence pack on dispute

---

### THR-103 — Refund Fraud / Wardrobing / "Empty Box" Returns
- **Description**: Customer requests refund claiming non-receipt or returns an empty box.
- **Likelihood**: Medium
- **Impact**: Medium
- **NedAccess controls**:
  - Workflow state-guarded refunds (cannot refund a non-shipped order, cannot double-refund)
  - Role + ownership check on refund creation (`requireRole('ops','admin') + requireOwnerOrRole`)
  - Audit log on every refund
- **E-commerce additions**:
  - Refund risk score per customer (refund_rate, return_rate)
  - Return-evidence photo upload re-using NedAccess document upload pipeline (magic-byte + scan)
  - Two-person approval for refunds above threshold

---

### THR-104 — Gift-Card / Store-Credit Draining
- **Description**: Bot enumerates gift-card numbers and drains balance on checkout.
- **Likelihood**: High
- **Impact**: High (direct $ loss, no chargeback path)
- **NedAccess controls**: Rate limit, burst allowance, security event logging.
- **E-commerce additions**:
  - Gift-card numbers must be high-entropy (≥128 bits) + check digit
  - Balance API: per-IP + per-card rate limited and audit-logged
  - Treat gift-card balance API like a **secret-bearing endpoint**
  - Lock card on N invalid PIN attempts (mirror the account lockout pattern)

---

### THR-105 — Price Manipulation
- **Description**: Client-side price tampering ("`?price=0.01`") or replay of an old promo.
- **Likelihood**: Medium
- **Impact**: High
- **NedAccess controls**:
  - **Server is authoritative** for all monetary values (NedAccess never trusts client-computed amounts)
  - Workflow state guards: cart → checkout → captured re-validate prices server-side
  - Zod validation on every numeric field (range + precision)
- **E-commerce additions**:
  - Each cart line stores `unitPriceMinor` + `currencyCode` set at server-side; client only sends `productId + qty`
  - Promo codes have validity windows + max usage + per-user cap
  - HMAC-signed pricing snapshot for B2B contract pricing

---

### THR-106 — Coupon / Promo Abuse
- **Description**: Multi-account creation, referral cycling, expired-coupon replay.
- **Likelihood**: High
- **Impact**: Medium
- **NedAccess controls**: Audit log, rate-limit on signup, account-source tracking (local/SSO).
- **E-commerce additions**:
  - One-coupon-per-customer enforcement keyed on payment instrument + shipping address + device fingerprint
  - Risk score on signups using disposable email + new IP + new device

---

## 3. Application-Layer Threats (OWASP)

### THR-201 — SQL Injection (OWASP A03)
- **Description**: User input concatenated into SQL.
- **Likelihood**: Low (in NedAccess) / High (in commodity e-commerce)
- **Impact**: Critical
- **NedAccess controls**:
  - **100% parameterized queries** with `@0, @1` placeholders
  - All SQL **centralized** in `backend/src/queries/` — see [`../DATABASE_QUERY_ARCHITECTURE.md`](../DATABASE_QUERY_ARCHITECTURE.md)
  - **ESLint rule** prohibits `AppDataSource.query()` in `routes/`
  - `yarn check:queries` script in CI
  - DB user is least-privilege (CRUD only; no `ALTER`/`DROP`/`CREATE`)
- **E-commerce additions**: Same approach. No exceptions, ever.

---

### THR-202 — Cross-Site Scripting (OWASP A03)
- **Description**: User input rendered as HTML/JS.
- **Likelihood**: High (product reviews, marketplace listings, support messages)
- **Impact**: Critical
- **NedAccess controls**:
  - **Strict Content Security Policy** (no `unsafe-inline`, nonce-based)
  - HTML-entity escaping on all user content
  - Script-pattern removal in `utils/sanitize.ts`
  - React's default JSX escaping (frontend defense-in-depth)
- **E-commerce additions**:
  - **Subresource Integrity (SRI)** on every third-party script (Magecart defense)
  - **Trusted Types** for the checkout page
  - DOMPurify on any rich-text product descriptions/reviews

---

### THR-203 — Cross-Site Request Forgery (OWASP A03 / A05)
- **Description**: Authenticated user tricked into making a request.
- **Likelihood**: Medium
- **Impact**: High (refund triggered, email changed, address replaced)
- **NedAccess controls**:
  - Cookie-based CSRF tokens (`XSRF-TOKEN`) checked on state-changing requests
  - `SameSite=lax` cookies (blocks cross-site POST)
  - JWT-bearer requests are exempt (token isn't auto-sent by browsers)
- **E-commerce additions**: Same; ensure storefront SDKs forward the CSRF cookie.

---

### THR-204 — Server-Side Request Forgery (OWASP A10)
- **Description**: Server fetches a URL the attacker controls.
- **Likelihood**: Medium (image proxy, webhook receivers, OG-tag fetch)
- **Impact**: High (cloud-metadata exfil, internal port scan)
- **NedAccess controls**:
  - URL protocol whitelist (`http`/`https` only)
  - Internal IP blocking
  - UFW firewall denies egress to RFC1918 from app subnet
- **E-commerce additions**:
  - For any user-supplied URL (image proxy, webhooks): block **link-local** (169.254/16), loopback, RFC1918, IPv6 ULA, and the cloud metadata IP (`169.254.169.254`)
  - Resolve DNS once, then connect to the resolved IP (defeats DNS rebinding)

---

### THR-205 — Insecure Deserialization
- **Description**: Untrusted input deserialized into objects.
- **Likelihood**: Low
- **Impact**: Critical
- **NedAccess controls**: JSON-only inputs, Zod schema before any persistence.
- **E-commerce additions**: Same; never deserialize binary blobs from clients.

---

### THR-206 — Mass Assignment / Privilege Escalation
- **Description**: Client posts `role=admin` or `userId=other_user`.
- **Likelihood**: High
- **Impact**: Critical
- **NedAccess controls**:
  - Zod schemas only allow known fields
  - `req.user.id` is **always** taken from the JWT, never from the body
  - Ownership middlewares (`requireOwnerOrRole`, `requireKycSessionOwner`) check DB before write
- **E-commerce additions**: Same pattern for `customerId`, `sellerId`, `tenantId`, `addressBookId`.

---

### THR-207 — Broken Access Control (OWASP A01)
- **Description**: Order #123 owned by Alice is fetched by Bob simply changing the URL.
- **Likelihood**: Very High
- **Impact**: Critical
- **NedAccess controls**:
  - Every resource route runs through `requireAuth → requireRole → requireOwnerOrRole`
  - DB query joins with `user_id = @0` so admins can bypass but users can't
  - `FORBIDDEN_ACCESS` security event logged with `userId, resourceType, resourceId`
- **E-commerce additions**: Same enforced everywhere — orders, addresses, returns, reviews, wishlists, saved cards.

---

### THR-208 — Workflow / State Tampering
- **Description**: Order moved from `created` → `delivered` without ever being paid; refund issued without an order; review posted for an unpurchased product.
- **Likelihood**: Medium
- **Impact**: High
- **NedAccess controls**:
  - **Application workflow** with explicit state machine
  - `editableBy` per state; transitions blocked by middleware
  - Every transition audit-logged
- **E-commerce additions**: Codify order state machine: `cart → reserved → paid → fulfilling → shipped → delivered → returnable → returned → refunded`. Reject illegal transitions at the service layer.

---

## 4. Infrastructure & Network Threats

### THR-301 — DDoS
- **Description**: Volumetric or app-layer flood.
- **Likelihood**: High
- **Impact**: High
- **NedAccess controls**: Nginx rate limit (60/min/IP), express-rate-limit (300/min global), Fail2Ban, corporate IP allowlist.
- **E-commerce additions**:
  - **Cloudflare / AWS Shield / Akamai** in front (volumetric)
  - WAF rules for known bot signatures
  - Anycast CDN

---

### THR-302 — TLS Downgrade / Stripping
- **Description**: Attacker forces HTTP or weak ciphers.
- **Likelihood**: Low (with HSTS) / High (without)
- **Impact**: Critical
- **NedAccess controls**: TLS 1.2+ only, ECDHE/DHE PFS, HSTS preload, OCSP stapling, redirect 80→443.
- **E-commerce additions**: Same. Enable HSTS preload via `hstspreload.org`.

---

### THR-303 — Server-Side Compromise
- **Description**: Attacker gains shell on the app server.
- **Likelihood**: Low
- **Impact**: Critical
- **NedAccess controls**:
  - SSH only via WireGuard VPN
  - SSH key auth only, no passwords
  - Fail2Ban after 3 SSH failures
  - UFW deny-by-default; only 80/443/51820 + SSH-from-VPN open
  - PM2 runs as non-root user; deploy artifacts owned by `deployer`
- **E-commerce additions**:
  - Same plus **read-only root filesystem** for app containers
  - Image scanning in CI (Trivy / Snyk)
  - Egress allowlist (app server can only reach payment gateway, S3, DB)

---

### THR-304 — Database Compromise
- **Description**: Attacker reaches DB directly.
- **Likelihood**: Low
- **Impact**: Critical
- **NedAccess controls**: TLS to DB (`encrypt=true`), least-privilege user, IP allowlist, optional TDE.
- **E-commerce additions**:
  - Customer PII columns encrypted with **column-level keys** (different keys for email, phone, address, DOB)
  - PAN: never stored — tokenize at the payment provider; if you must store, use HSM-backed encryption (PCI DSS 3.5)

---

## 5. Supply-Chain & Third-Party Threats

### THR-401 — Magecart / Formjacking
- **Description**: Malicious JS injected via a tag manager, ad pixel, A/B-testing tool, or a compromised npm package, exfiltrating PANs from the checkout `<input>`.
- **Likelihood**: **High** (this is the dominant e-commerce attack vector)
- **Impact**: Critical (PCI scope expansion + scheme fines)
- **NedAccess controls**:
  - Strict CSP with explicit `script-src` allowlist
  - No `unsafe-inline`
- **E-commerce additions**:
  - **Subresource Integrity (SRI)** on every external script
  - Use the payment provider's **hosted fields / iframe** so the PAN never touches your DOM (Stripe Elements, Adyen Web Components, Braintree Hosted Fields) → **drops you out of PCI DSS scope** (SAQ A vs SAQ A-EP)
  - PCI DSS v4 6.4.3 + 11.6.1: track all scripts on the payment page and detect tampering
  - Third-party tag manager runs **only on non-payment pages** if at all

---

### THR-402 — Compromised npm / pip Dependency
- **Description**: Typosquat or maintainer-takeover injects malware.
- **Likelihood**: Medium
- **Impact**: Critical
- **NedAccess controls**: Pinned `yarn.lock`, immutable installs in CI, `yarn audit` in CI.
- **E-commerce additions**: Add **Socket.dev / Snyk / GitHub Dependabot** + private mirror for top dependencies.

---

### THR-403 — Compromised Webhook Receiver
- **Description**: Forged webhooks from "Stripe" or "courier" trigger refunds or order updates.
- **Likelihood**: High
- **Impact**: Critical
- **NedAccess controls**: Integration tokens with scopes; HMAC verification on inbound webhooks (e.g., admin status updates).
- **E-commerce additions**:
  - Verify provider signature (Stripe-Signature, etc.)
  - Idempotency key required (`backend/src/middleware/idempotency.ts` pattern)
  - Replay window check (timestamp ±5 min)

---

## 6. Insider & Operational Threats

### THR-501 — Malicious / Negligent Admin
- **Description**: Insider with elevated rights does damage or makes mistakes.
- **Likelihood**: Medium
- **Impact**: Critical
- **NedAccess controls**:
  - **Product-scoped OPS users** (cannot see products outside their assignments)
  - Every admin action audit-logged with `userId`, IP, request ID
  - Two-person approval pattern available (workflow states like `awaiting_supervisor_approval`)
  - Admin allowlist via `AUTH_ADMIN_USER_IDS` env var (deny by default)
- **E-commerce additions**:
  - Brand- / region- / store-scoped admin
  - Just-in-Time access (JIT) for production data, time-boxed
  - Mandatory MFA for any admin role

---

### THR-502 — Stolen / Lost Laptop
- **Description**: Admin's machine is stolen with cached credentials.
- **Likelihood**: Medium
- **Impact**: High
- **NedAccess controls**: 5-day absolute session, server-side revocation on report, Clear-Site-Data on expiry.
- **E-commerce additions**: MDM-enforced FDE on admin laptops; SSO with WebAuthn so reset is fast.

---

## 7. Privacy & Compliance Threats

### THR-601 — Excessive Data Collection
- **Description**: Storing more than needed (DOB for non-age-restricted SKUs, full address for digital-only orders).
- **Likelihood**: High
- **Impact**: Medium (GDPR fines, breach blast radius)
- **NedAccess controls**: Form schema validation enforces only declared fields; data-classification table.
- **E-commerce additions**: Conditional collection (DOB only when buying alcohol/tobacco/age-restricted).

---

### THR-602 — Right-to-Erasure Failure
- **Description**: User requests deletion; data persists in caches, backups, exports.
- **Likelihood**: High
- **Impact**: High (regulatory fines)
- **NedAccess controls**: `users.deleted_at` soft-delete; orphan-token check; documented retention.
- **E-commerce additions**: Order data retained for tax/AML (legal basis), but PII pseudonymized; CDN/cache purge on deletion.

---

### THR-603 — Cross-Border Data Transfer
- **Description**: PII flows to a non-adequate jurisdiction without SCCs.
- **Likelihood**: High (multi-region e-commerce always has this)
- **Impact**: High
- **NedAccess controls**: AWS region pinned; Keycloak / SendGrid documented.
- **E-commerce additions**: Document every processor; EU data → EU regions; SCCs in DPAs.

---

## 8. Bot & Automation Threats (Specific to E-Commerce)

### THR-701 — Inventory Denial / Sneaker-Bots
- **Description**: Bots scarce-add high-demand SKUs to baskets; legit users can't buy.
- **Likelihood**: High (for limited drops)
- **Impact**: High (revenue + brand)
- **NedAccess controls**: Rate limit, audit log.
- **E-commerce additions**:
  - Reserve stock only at *checkout-start*, not *add-to-cart*
  - Per-customer purchase caps
  - Queue (waiting room) for drops
  - Bot-management WAF (Akamai Bot Manager, DataDome, PerimeterX, Cloudflare Bot Mgmt)

---

### THR-702 — Price / Catalog Scraping
- **Description**: Competitor scrapes prices and SKUs.
- **Likelihood**: Very High
- **Impact**: Medium
- **NedAccess controls**: Rate limit, API key scopes for legitimate partners.
- **E-commerce additions**: Bot management; rotating per-customer pricing for B2B; signed catalog snapshots; honeypot SKUs.

---

### THR-703 — Review Manipulation
- **Description**: Fake reviews (paid 5⭐ or competitor 1⭐).
- **Likelihood**: High
- **Impact**: Medium
- **NedAccess controls**: Workflow state guard ("verified purchase" — equivalent to NedAccess "ownership" check).
- **E-commerce additions**: Review only allowed by users with a `delivered` order for that SKU; rate-limit reviews per IP/device/account.

---

## 9. Mapping Summary

| OWASP Top 10 (2021) | Covered By | Where |
|---|---|---|
| A01 Broken Access Control | RBAC + ownership + product scope + workflow guard | THR-201, THR-207, THR-208, THR-501 |
| A02 Cryptographic Failures | TLS 1.2+, AES-256-GCM, bcrypt(12), HMAC-SHA256 | All threats above (cross-cutting) |
| A03 Injection | 100% parameterized SQL + Zod + escaping + CSP | THR-201, THR-202 |
| A04 Insecure Design | Defense-in-depth + workflow guards + least privilege | All threats above |
| A05 Security Misconfiguration | Helmet, CSP, HSTS, secure cookies, error handler | THR-202, THR-203, THR-302 |
| A06 Vulnerable Components | Pinned lock, immutable installs, audit | THR-402 |
| A07 Auth Failures | Lockout, rate limit, OTP, JWT revocation | THR-001 to THR-006 |
| A08 Data Integrity Failures | HMAC-SHA256 receipts, deploy checksums | THR-102, THR-403 |
| A09 Logging Failures | 30+ event types, 365-day audit, correlation IDs | All threats |
| A10 SSRF | URL allowlist, internal-IP block | THR-204 |

| OWASP API Top 10 (2023) | Covered By |
|---|---|
| API1 Broken Object Authorization | `requireOwnerOrRole`, `requireKycSessionOwner` patterns |
| API2 Broken Authentication | JWT + revocation + lockout + MFA |
| API3 Broken Object Property Authorization | Zod schemas + server-derived IDs |
| API4 Unrestricted Resource Consumption | Rate limit + body-size limit + max files + max fields |
| API5 Broken Function Authorization | `requireRole` + workflow state guard |
| API6 Unrestricted Access to Sensitive Business Flows | Workflow guard + step-up auth |
| API7 SSRF | URL allowlist |
| API8 Security Misconfiguration | Helmet + secure defaults |
| API9 Improper Inventory Management | API key + scope + usage tracking |
| API10 Unsafe Consumption of APIs | HMAC verification + idempotency on inbound webhooks |

---

**Next**: [`03-feature-mapping.md`](./03-feature-mapping.md) — feature-by-feature translation of every NedAccess control into its e-commerce equivalent.
