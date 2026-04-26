# 03 · Feature-By-Feature Mapping (NedAccess → E-Commerce)

> The exhaustive translation table. Every concrete security feature in the NedAccess codebase has an entry here showing **what it is**, **where it lives**, and **how to build the equivalent in an e-commerce platform** (with code patterns).

For each feature you'll see:
- 📍 **NedAccess location** — the actual file(s) where the control lives
- 🎯 **What it does** — concise behaviour
- 🛒 **E-commerce equivalent** — direct, practical translation
- 💡 **Reusable pattern** — generalized snippet/recipe

---

## Layer 1 — Network Perimeter

### F-001 · WireGuard VPN for SSH access

- 📍 NedAccess: SSH server only listens on the WireGuard interface; UFW denies 22/tcp on the public interface.
- 🎯 Hides admin access from internet scanners; turns every SSH attempt into a VPN-key-required attempt first.
- 🛒 E-commerce equivalent: **Bastion host** (Tailscale, AWS SSM Session Manager, Cloudflare Access, Teleport) for any production SSH/DB access. Engineers don't have IP access to anything; they get short-lived ephemeral certificates.
- 💡 Pattern: Zero-trust admin plane → no admin port is ever publicly reachable.

### F-002 · UFW deny-by-default firewall

- 📍 NedAccess: Allow 80/443 (public), 51820/udp (VPN), 22/tcp from VPN only; deny everything else, including 4001 (backend) and 1433 (DB).
- 🛒 E-commerce equivalent: **VPC security groups** with explicit allowlists. Backend SG accepts only from ALB; DB SG accepts only from backend SG. Cache (Redis) SG accepts only from backend SG. **Egress allowlist** so the backend can only reach the payment provider, S3, and the DB — not arbitrary IPs.
- 💡 Pattern: Default-deny ingress and egress at every tier.

### F-003 · Fail2Ban (IDS/IPS)

- 📍 NedAccess: 3 failed SSH → 1-hour ban; 5 nginx rate-limit violations → 1-hour ban.
- 🛒 E-commerce equivalent: WAF rate-rules + bot-management at the edge (Cloudflare, AWS WAF, Akamai, DataDome). Plus app-layer Fail2Ban for SSH bastions if any.
- 💡 Pattern: Auto-ban on N violations from any single source.

---

## Layer 2 — Reverse Proxy / Edge

### F-004 · TLS 1.2+ with PFS, OCSP stapling, HSTS preload

- 📍 NedAccess: Nginx config with `TLSv1.2 TLSv1.3`, ECDHE/DHE ciphers, `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.
- 🛒 E-commerce equivalent: Identical at your CDN/edge. Submit domain to `hstspreload.org`. Use **TLS 1.3 only** for new properties; redirect 80→443; serve over HTTP/2 or HTTP/3.
- 💡 Pattern: HTTPS-everywhere; no exceptions even for "static images". HSTS prevents protocol downgrade.

### F-005 · Edge rate limiting

- 📍 NedAccess: Nginx `limit_req` at 60 req/min/IP, burst 10, with corporate IP allowlist; 10MB zone storage.
- 🛒 E-commerce equivalent: CDN/WAF rate rules. **Distinct buckets**: browsing (generous), search (strict), login (very strict), checkout (very strict), gift-card balance (very strict).
- 💡 Pattern: One bucket per *category of risk*, never one global bucket.

### F-006 · Security headers (Helmet.js + Nginx)

- 📍 NedAccess: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, strict CSP, `Permissions-Policy`.
- 🛒 E-commerce equivalent: Same headers. CSP must include payment-provider domains explicitly (e.g., `https://js.stripe.com`). Add **`Cross-Origin-Opener-Policy: same-origin`** and **`Cross-Origin-Embedder-Policy: require-corp`** for full process isolation on payment pages.
- 💡 Pattern: All headers applied at both the edge and the app — defense in depth even for CSP.

### F-007 · Request size & connection limits

- 📍 NedAccess: `client_max_body_size: 25–50MB`, `client_body_buffer_size: 1k`, `large_client_header_buffers: 2 1k`.
- 🛒 E-commerce equivalent: Tighter — checkout body should be < 64 KB; image upload endpoint isolated with its own limit (e.g., 5–10MB) and its own subdomain.
- 💡 Pattern: Different limits per route family; isolate uploads.

---

## Layer 3 — Application Security (the core)

### Authentication

#### F-101 · Multi-source authentication with local + SSO

- 📍 NedAccess: `authSource: 'local' | 'paytoday'` in the user record; PayToday uses Keycloak OAuth2 ROPC.
- 🛒 E-commerce equivalent: Local + Apple/Google/Facebook + corporate SSO for B2B + headless commerce SSO with Auth0/Clerk/Stytch. Store `authSource` per user and prevent password login if SSO is the source of truth.
- 💡 Pattern: One canonical user table; multiple auth methods linked.

#### F-102 · bcrypt cost 12 + common-password blocklist

- 📍 NedAccess: `services/accountSecurity.ts`; bcrypt cost factor 12 (~250ms/hash on modern CPU); 10k+ common-password list refused.
- 🛒 E-commerce equivalent: bcrypt(12) **or** argon2id (preferred for new systems: 64MB memory, 3 iterations, 4 parallelism). Same blocklist + Have-I-Been-Pwned k-anon API check on every set/change.
- 💡 Pattern: Strong KDF + active password-quality enforcement, not just length rules.

#### F-103 · Account lockout (5 attempts → 15 min)

- 📍 NedAccess: `users.failed_login_attempts` counter, `users.locked_until` timestamp.
- 🛒 E-commerce equivalent: Same. Sliding-window or fixed-window both fine; combine with rate limit. **Notify** the email on lockout.
- 💡 Pattern: Failure counter + lockout window + alert.

#### F-104 · Login rate limiting (10/min/IP)

- 📍 NedAccess: `middleware/rateLimit.ts` mounted on `/api/auth/login`.
- 🛒 E-commerce equivalent: Same. Add per-email bucket too (e.g., 5 attempts per email per hour) so a botnet hitting many IPs against one account still trips it.
- 💡 Pattern: **Multi-dimensional rate limiting**: per IP, per username, per device, per ASN.

#### F-105 · OTP for inactive users

- 📍 NedAccess: 6-digit OTP, bcrypt(10) hashed, 10-min expiry, 5-attempt cap, SendGrid delivery.
- 🛒 E-commerce equivalent: OTP / WebAuthn step-up on:
  - Login from new device / new geo / new ASN
  - Cart total > threshold
  - Adding new shipping address
  - Changing email or password
  - Redeeming gift card / store credit
  - Refund > threshold
  - Connecting/disconnecting a payment method
- 💡 Pattern: **Risk-based step-up MFA**, not "always on" or "never".

#### F-106 · JWT (HS256) with access (1h) + refresh (5d) + absolute (5d)

- 📍 NedAccess: `services/jwt.ts`, `middleware/auth.ts`.
- 🛒 E-commerce equivalent: Access JWT 15min–1h; refresh 7–30 days with **rotation** + reuse-detection. Customer sessions can be longer; admin sessions much shorter (30-min idle, 8-h absolute).
- 💡 Pattern: Two-token model + absolute-cap.

#### F-107 · Server-side JWT revocation

- 📍 NedAccess: `revoked_tokens` table; checked on every `requireAuth` call (`isTokenRevoked`).
- 🛒 E-commerce equivalent: Revocation list in Redis (TTL = token expiry); revoke on logout, password change, role change, fraud signal, support intervention.
- 💡 Pattern: JWT alone is not enough — pair with revocation lookup; otherwise stolen tokens live until natural expiry.

#### F-108 · Cookie security flags

- 📍 NedAccess: `httpOnly: true`, `secure: true (prod)`, `sameSite: 'lax'`, `path: '/'`, optional `domain`.
- 🛒 E-commerce equivalent: Same. Use `__Host-` prefix for the access-token cookie (forces `Secure`, `Path=/`, no `Domain` → no subdomain leakage).
- 💡 Pattern: `__Host-` prefixed, httpOnly, Secure, SameSite=lax (or `strict` for non-payment).

#### F-109 · Clear-Site-Data on session expiry

- 📍 NedAccess: `Clear-Site-Data: "cache", "cookies", "storage"` returned with 401 on absolute timeout.
- 🛒 E-commerce equivalent: Same. Especially valuable on public/shared computers (libraries, kiosks).
- 💡 Pattern: Treat session expiry as a "scrub the device" moment.

#### F-110 · Account-deletion check on every request

- 📍 NedAccess: `middleware/auth.ts` queries `users.deleted_at` on every authenticated call.
- 🛒 E-commerce equivalent: Same. Cache the lookup with a 60-second TTL to avoid hot-pathing every request.
- 💡 Pattern: Deletion must propagate to in-flight sessions immediately.

---

### Authorization (RBAC + ownership + scope + workflow)

#### F-201 · Role-Based Access Control

- 📍 NedAccess roles: `admin`, `ops`, `agent`, `user`, `integration`. Mounted via `requireRole(...roles)`.
- 🛒 E-commerce equivalent roles:
  - `customer` — own resources only
  - `seller` (marketplace) — own listings, orders to fulfil, payouts
  - `csa` (customer service agent) — assigned tickets only, masked PII
  - `merchandiser` — catalog within their brand/category
  - `finance` — refunds, reconciliations, audit log
  - `admin` — break-glass only, MFA + 2-person rule
  - `integration` — partner/API-key holder
- 💡 Pattern: 5–7 roles is the sweet spot; more becomes unmanageable.

#### F-202 · Resource ownership check

- 📍 NedAccess: `requireOwnerOrRole` queries DB for `user_id`/`created_by_agent_id` and compares to `req.user.id`. Logs `FORBIDDEN_ACCESS` event on failure.
- 🛒 E-commerce equivalent:

```ts
// pseudo: middleware/orderOwnership.ts
export function requireOrderOwner(...allowedRoles: string[]) {
  return async (req, res, next) => {
    const orderId = String(req.params.orderId);
    const userId = req.user.id;
    const userRoles = req.user.roles || [];
    const order = await QOrders.getOrderOwnerById(orderId);
    if (!order) return res.status(404).json({ error: 'order_not_found' });

    const isOwner = String(order.customer_id) === String(userId);
    const hasAdminRole = userRoles.includes('admin') || userRoles.includes('finance');
    const hasAllowedRole = allowedRoles.some(r => userRoles.includes(r));
    const isMarketplaceSeller = order.seller_id && String(order.seller_id) === String(userId);

    if (!isOwner && !hasAdminRole && !hasAllowedRole && !isMarketplaceSeller) {
      await logSecurityEvent(SecurityEventType.FORBIDDEN_ACCESS, {
        userId, ip: req.ip, path: req.path, method: req.method,
        reason: 'not_order_owner',
        metadata: { resourceType: 'order', resourceId: orderId, userRoles },
      });
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}
```

- 💡 Pattern: Always look up the resource and compare ownership server-side; never trust client-supplied IDs.

#### F-203 · Product-scoped OPS (vertical isolation)

- 📍 NedAccess: `user_product_access` table; `requireProductAccess` middleware checks the OPS user has rights to the product family of this application.
- 🛒 E-commerce equivalent: `user_brand_access`, `user_region_access`, `user_warehouse_access`, `user_marketplace_seller_access`. Same middleware shape.
- 💡 Pattern: Multi-tenant scoping at the row level via a join, not at the role level.

#### F-204 · Workflow-state authorization

- 📍 NedAccess: `editableBy` per state (e.g., `awaiting_kyc` is editable by user but not OPS; `awaiting_approval` is editable by OPS only).
- 🛒 E-commerce equivalent: order state machine with allowed transitions per role:

| State | Customer | Seller | CSA | Finance | Admin |
|---|---|---|---|---|---|
| `cart` | RW | – | R | R | R |
| `paid` | R | R | R | R | R |
| `fulfilling` | R | RW | R | R | R |
| `shipped` | R | R | R | R | R |
| `delivered` | R(refund-request) | R | RW(refund) | RW(refund) | RW |
| `refunded` | R | R | R | RW | RW |

- 💡 Pattern: State transitions are **first-class authorization checks**, not afterthoughts.

#### F-205 · API key with scopes

- 📍 NedAccess: `api_keys` table; key format `sk_<64-hex>`; SHA256 hashed at rest; **timing-safe comparison** (`crypto.timingSafeEqual`); `last_used_at` tracking.
- 🛒 E-commerce equivalent: Storefront keys (`pk_*` public, read-only) and server keys (`sk_*` private, scoped). Scopes like `catalog:read`, `orders:read`, `orders:write`, `refunds:write`, `webhooks:receive`.
- 💡 Pattern: Public keys never grant write; server keys are scoped narrowly; both rotatable in <1 hour.

#### F-206 · Integration tokens with scopes

- 📍 NedAccess: `INTEGRATION_TOKENS` env var (JSON array of `{token, scopes[]}`); `requireIntegrationScope(scope)` middleware.
- 🛒 E-commerce equivalent: Same shape for partner integrations (3PL, ERP, courier, tax engine).
- 💡 Pattern: Integration auth ≠ user auth; never grant a user role to an integration.

---

### Input Validation & Sanitization

#### F-301 · Zod schema validation

- 📍 NedAccess: Zod on params, query, body. Pattern: `z.coerce.number().int().positive()` for IDs; nested object validation; max 200 fields per form (DoS guard).
- 🛒 E-commerce equivalent: Same. Define a schema per endpoint:

```ts
const CheckoutSchema = z.object({
  cartId: z.string().uuid(),
  shippingAddressId: z.string().uuid().optional(),
  billingAddressId: z.string().uuid().optional(),
  paymentMethodToken: z.string().min(10).max(200),
  promoCode: z.string().regex(/^[A-Z0-9_-]{3,32}$/).optional(),
  giftCardCodes: z.array(z.string().regex(/^[A-Z0-9-]{8,32}$/)).max(5).optional(),
});
```

- 💡 Pattern: **Schema = contract**. Reject anything not in the schema with 400.

#### F-302 · Custom validators (ID, email, phone, currency)

- 📍 NedAccess: Namibian ID number, bank account, currency amount with range + decimal precision, RFC-compliant email + disposable-domain blocklist.
- 🛒 E-commerce equivalent: Country-specific tax IDs, postal codes, phone (libphonenumber), currency (validate against ISO 4217 + per-store allowlist), credit-card BIN range checks.
- 💡 Pattern: Server-side, business-aware validators (not just regex).

#### F-303 · Dynamic form schema validation

- 📍 NedAccess: Forms (e.g., loan applications) have a DB-defined field list; backend rejects fields not in the schema. Max 200 fields.
- 🛒 E-commerce equivalent: Product attribute schemas per category — boots have `size`, `color`, `material`; phones have `storage`, `color`, `network`. Schema-validate on listing create/update.
- 💡 Pattern: Schema lives in DB; validator reads schema and enforces it on every save.

#### F-304 · Sanitization (HTML escape, script-pattern removal, URL allowlist)

- 📍 NedAccess: `utils/sanitize.ts` — HTML-entity escape, removes `<script>`, `<iframe>`, `javascript:`; URL protocol whitelist.
- 🛒 E-commerce equivalent: Reviews, support messages, marketplace descriptions all run through DOMPurify (server-side via `isomorphic-dompurify`) with an allowlist tailored per surface (e.g., `<b>`, `<i>`, `<a>` allowed but with `rel="noopener nofollow ugc"`).
- 💡 Pattern: Allowlist HTML tags + attributes; never blocklist.

---

### File Upload Security (one of the strongest areas in NedAccess)

#### F-401 · Filename validation

- 📍 NedAccess: Block `../`, `..\`, leading `/` or `\`, null byte (`\0`/`%00`), control chars, Windows reserved names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`-`COM9`, `LPT1`-`LPT9`), Unicode-normalize (homograph defense), max length 255.
- 🛒 E-commerce equivalent: Identical for product images, return-evidence uploads, seller documents (KYB), support attachments, receipt scans for warranty claims.
- 💡 Pattern: Generate a server-side random filename (UUID) + sanitize the original for **display only**.

#### F-402 · Magic-byte (file-signature) validation

- 📍 NedAccess: Verify actual file type vs. claimed MIME. Examples:
  - JPEG: `FF D8 FF`
  - PNG: `89 50 4E 47`
  - PDF: `25 50 44 46` (`%PDF`)
  - GIF: `47 49 46 38`
  - WEBP: `52 49 46 46 ... 57 45 42 50`
  - HEIC/HEIF: `... 66 74 79 70 68 65 69 63`
- 🛒 E-commerce equivalent: Identical. Use `file-type` npm package or equivalent.
- 💡 Pattern: **Never trust `Content-Type` from the client.** Verify the magic bytes, then re-encode the image (strips EXIF + payloads).

#### F-403 · Content scanning (executables, scripts, dangerous PDFs)

- 📍 NedAccess: Scan for PE (`MZ`), ELF (`7F 45 4C 46`), Mach-O (`FE ED FA`), shebangs, `<script>` patterns; scan PDFs for `/JS`, `/JavaScript`, `/Launch`, `/EmbeddedFile`, `/OpenAction`, `/AA`, suspicious form actions; polyglot detection; ZIP-bomb detection (compression ratio cap).
- 🛒 E-commerce equivalent: Identical. Adds **office docs** for B2B (no macros: detect `vbaProject.bin`, `oleObject*`).
- 💡 Pattern: Scanner runs **before** the file is persisted; rejects with audit log.

#### F-404 · ClamAV virus scan

- 📍 NedAccess: Optional; called via `clamdscan` after magic-byte + content scan.
- 🛒 E-commerce equivalent: Same; or a hosted equivalent (VirusTotal API for spot-checks; CrowdStrike/SentinelOne for production).
- 💡 Pattern: Layer signature scanning **on top of** structural scanning, not instead of.

#### F-405 · File size and count caps

- 📍 NedAccess: 10MB/file, 5 files/upload; 30+ extensions blocklisted (`.exe`, `.bat`, `.js`, `.php`, `.zip`, `.jar`, `.dll`, `.scr`, `.msi`, `.com`, `.cmd`, `.ps1`, `.vbs`, `.lnk`, `.app`, `.deb`, `.rpm`, ...); double-extension detected (`receipt.pdf.exe`).
- 🛒 E-commerce equivalent: Identical. Tighter limits for product photos (≤5 MB).
- 💡 Pattern: Allowlist extensions, not blocklist; double-extension check; cap count.

#### F-406 · Storage as DB BLOB or signed S3

- 📍 NedAccess: `kyc_documents`, `application_documents` use `VARBINARY(MAX)`; documents downloaded via signed URLs.
- 🛒 E-commerce equivalent: Product images on S3 with **private bucket + signed URLs**, served via CDN with signed-URL validation. **Never** make user-uploaded media buckets public; the public CDN URL must be a derived/processed thumbnail.
- 💡 Pattern: Originals always private; only processed/sanitized derivatives are public.

---

### API Security

#### F-501 · 100% parameterized SQL, centralized in `queries/`

- 📍 NedAccess: All SQL in `backend/src/queries/`; placeholders `@0, @1, @2`; ESLint rule prohibits `AppDataSource.query()` in `routes/`; `yarn check:queries` in CI; see [`../DATABASE_QUERY_ARCHITECTURE.md`](../DATABASE_QUERY_ARCHITECTURE.md).
- 🛒 E-commerce equivalent: Same architecture. If using an ORM, **disable `query()` raw escape hatch in production code paths**. If using SQL builders (Prisma, Drizzle, Kysely), use parameter-binding APIs only.
- 💡 Pattern: SQL lives in dedicated files; raw concatenation linted away.

#### F-502 · CSRF tokens (cookie-based)

- 📍 NedAccess: `XSRF-TOKEN` cookie + `X-XSRF-TOKEN` header on state-changing requests; exempts JWT-bearer + API-key + public endpoints.
- 🛒 E-commerce equivalent: Same. Required for any cookie-authenticated session. Combined with `SameSite=lax` and CORS allowlist.
- 💡 Pattern: Two layers — cookie SameSite + token-on-header.

#### F-503 · CORS allowlist with dynamic origin validation

- 📍 NedAccess: Origin must match exactly one of the allowlisted production / staging domains.
- 🛒 E-commerce equivalent: Storefront origins, headless customer apps, native app webviews. **Wildcard `*` is never acceptable for credentialed CORS.**
- 💡 Pattern: Static allowlist in env; reject with 403 on mismatch.

#### F-504 · Idempotency keys for write endpoints

- 📍 NedAccess: `middleware/idempotency.ts` — store request hash + response for a window; replay = same response.
- 🛒 E-commerce equivalent: **Mandatory** on `POST /checkout`, `POST /refunds`, `POST /payments`, `POST /coupons/redeem`. Stripe / Adyen require an `Idempotency-Key`; mirror it.
- 💡 Pattern: Every state-changing endpoint accepts `Idempotency-Key`; the server stores `(key, request-hash) → response` for 24h.

#### F-505 · Correlation IDs

- 📍 NedAccess: `middleware/correlationId.ts` — generates UUID per request, propagated to logs and downstream HTTP calls (`X-Request-Id`).
- 🛒 E-commerce equivalent: Same. Pass through to payment provider / WMS / CRM. Customer support pastes a request ID into the support tool to find the trace.
- 💡 Pattern: One ID, threaded through every log line and outbound HTTP header.

---

## Layer 4 — Data Protection

### F-601 · Password hashing — bcrypt cost 12

- 📍 NedAccess: `bcrypt.hash(plain, 12)` → 4,096 rounds; per-password salt automatic.
- 🛒 E-commerce equivalent: bcrypt(12) or argon2id(64MB, t=3, p=4). Re-hash on login if cost factor has been raised since last hash.
- 💡 Pattern: KDF with tunable cost; revisit cost factor every 18 months.

### F-602 · API keys — SHA256 + timing-safe compare

- 📍 NedAccess: Key shown **once** on creation; only SHA256 stored. Lookup uses `crypto.timingSafeEqual`.
- 🛒 E-commerce equivalent: Identical. Storefront *public* keys can be plain (they're public by definition); *secret* keys hashed.
- 💡 Pattern: Treat API keys like passwords — never readable after creation.

### F-603 · Application secrets — AES-256-GCM (authenticated encryption)

- 📍 NedAccess: `services/secrets.ts`. Key derived `SHA256(SECRETS_ENC_KEY)`, IV 12 bytes random, auth-tag 16 bytes, output = `iv||tag||ciphertext`.
- 🛒 E-commerce equivalent: Encrypt: payment-provider secret keys, courier API keys, tax-engine keys, ERP creds, marketplace seller payout creds. **Use AWS KMS / GCP KMS / Azure Key Vault** for managed key storage where possible.
- 💡 Pattern: GCM (or ChaCha20-Poly1305), never CBC without HMAC, never ECB.

```ts
// pseudo: services/secrets.ts pattern
import crypto from 'crypto';
const KEY = crypto.createHash('sha256').update(env.SECRETS_ENC_KEY).digest();
export function encrypt(plaintext: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}
export function decrypt(b64: string) {
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const dec = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(enc), dec.final()]).toString('utf8');
}
```

### F-604 · HMAC-SHA256 for tamper-evident artifacts

- 📍 NedAccess: Certificate URLs and download URLs are HMAC-signed (`certificateId.kycId.userId`).
- 🛒 E-commerce equivalent: Receipt/invoice PDFs, refund authorizations, courier label URLs, gift-card redemption codes, partner callback URLs.
- 💡 Pattern: Anything a client should be able to verify but not modify gets an HMAC signature.

### F-605 · Payment data — never store, always tokenize

- 📍 NedAccess: N/A (no PANs handled).
- 🛒 E-commerce equivalent: **Never** persist PAN/CVV. Use the payment provider's tokenization (Stripe Elements, Adyen 3DS2 Web Drop-in, Braintree Hosted Fields). Store only a token + last4 + brand + expiry. **PCI scope drops to SAQ A**.
- 💡 Pattern: If you don't store it, you don't have to protect it. Maximum scope reduction.

### F-606 · TLS for DB connections

- 📍 NedAccess: `encrypt=true; trustServerCertificate=...` on mssql; min connection 2 / max 10.
- 🛒 E-commerce equivalent: Identical for Postgres/MySQL — `sslmode=verify-full`. Use IAM authentication (AWS RDS) where possible.
- 💡 Pattern: Encrypt every hop, even inside the VPC.

---

## Layer 5 — Database

### F-701 · Least-privilege application user

- 📍 NedAccess: `nedaccess_app` has `SELECT/INSERT/UPDATE/DELETE` only; migrations run as a separate user with DDL rights.
- 🛒 E-commerce equivalent: Same. Three users:
  - `app_rw` for the app
  - `app_ro` for reporting/BI
  - `migrator` for schema changes (used only by CI/CD)
- 💡 Pattern: Application can never `DROP TABLE`; if it tried, it would error.

### F-702 · Connection pooling + timeouts

- 📍 NedAccess: TypeORM pool max 10/min 2; 30s connection + request timeout.
- 🛒 E-commerce equivalent: Same shape, sized to traffic. Use a connection pooler (PgBouncer/RDS Proxy) at scale.
- 💡 Pattern: Bounded resources prevent denial-of-service against the DB.

### F-703 · Audit log table (365-day retention)

- 📍 NedAccess: `audit_log` with `event_type, user_id, ip, user_agent, request_id, metadata, timestamp`; indexed on `(event_type, user_id, created_at)`.
- 🛒 E-commerce equivalent: Same shape; partition monthly; ship to a SIEM (Datadog, Splunk, Elastic) for long-term retention + alerting.
- 💡 Pattern: Append-only; consider WORM storage for compliance.

### F-704 · Soft-delete / `deleted_at` for users

- 📍 NedAccess: `users.deleted_at NULL` ⇒ active. Auth middleware refuses any request from a deleted user.
- 🛒 E-commerce equivalent: Same for customers, sellers, admin users. **Order data may need to be retained** for tax/AML — pseudonymize PII columns instead.
- 💡 Pattern: Deletion = pseudonymize+disable, not `DELETE FROM`.

---

## Layer 6 — Monitoring & Audit

### F-801 · 30+ security event types

- 📍 NedAccess: `services/securityLogger.ts` — `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGIN_LOCKED`, `LOGOUT`, `PASSWORD_CHANGED`, `PASSWORD_RESET_REQUESTED`, `OTP_GENERATED`, `OTP_VERIFIED`, `OTP_FAILED`, `TOKEN_REVOKED`, `FORBIDDEN_ACCESS`, `UNAUTHORIZED_ACCESS`, `RATE_LIMIT_EXCEEDED`, `MALICIOUS_FILE_BLOCKED`, `VIRUS_DETECTED`, `PRIVILEGE_ESCALATION`, `ADMIN_ACTION`, `DATA_EXPORT`, ...
- 🛒 E-commerce equivalent: Same plus: `PAYMENT_DECLINED`, `CARD_TESTING_DETECTED`, `REFUND_ISSUED`, `REFUND_DENIED`, `COUPON_REDEEMED`, `COUPON_BLOCKED`, `GIFT_CARD_BALANCE_QUERIED`, `GIFT_CARD_REDEEMED`, `ORDER_DISPUTED`, `CHARGEBACK_RECEIVED`, `ADDRESS_ADDED`, `ADDRESS_DELETED`, `EMAIL_CHANGED`, `PHONE_CHANGED`.
- 💡 Pattern: Predefined enum of events; metadata column for variable fields.

### F-802 · Request logging with sensitive-data redaction

- 📍 NedAccess: Morgan + Winston, structured JSON logs; passwords, tokens, OTPs redacted before logging.
- 🛒 E-commerce equivalent: Redact PAN, CVV, billing/shipping address, email, phone, any PII. **Never** log full request bodies in production for `/checkout` and `/auth/*`.
- 💡 Pattern: Log redaction is a property of the logger, not the developer.

### F-803 · Health checks (`/healthz`, `/readyz`)

- 📍 NedAccess: `/healthz` (process up), `/readyz` (DB + Redis + disk).
- 🛒 E-commerce equivalent: Same. **Don't** expose readiness details to the public — `/readyz` should return only `200/503` to the LB; metrics exposed only on a private port (e.g., `/metrics` on port 9000, accessible only to Prometheus).
- 💡 Pattern: Liveness ≠ readiness. Both bound to private metrics endpoint.

### F-804 · Alerting on critical events

- 📍 NedAccess: Email + Slack on `ACCOUNT_LOCKED`, `PRIVILEGE_ESCALATION`, `MALICIOUS_FILE_BLOCKED`, `VIRUS_DETECTED`.
- 🛒 E-commerce equivalent: Add `CARD_TESTING_DETECTED`, `BULK_REFUND_BY_ADMIN`, `BULK_DELETION`, `ADMIN_LOGIN_FROM_NEW_GEO`, `BACKUP_FAILED`, `WEBHOOK_REPLAY_DETECTED`, `CHECKOUT_ERROR_RATE_SPIKE`, `LOGIN_ERROR_RATE_SPIKE`.
- 💡 Pattern: Alert on rates of events, not just absolute events (an error rate going from 0.1% to 5% is more actionable than "5 errors").

---

## Layer 7 — External Services

### F-901 · AWS least-privilege IAM

- 📍 NedAccess: Rekognition role: only `rekognition:*FaceLiveness*`; Textract role: Textract + scoped S3 prefix; S3 buckets private with SSE.
- 🛒 E-commerce equivalent: Same. Payment-provider keys scoped to the merchant account; courier APIs scoped to your shipper account; tax engine scoped to your tenant.
- 💡 Pattern: One role per integration; rotate quarterly; audit policy diffs in PR review.

### F-902 · S3 with SSE + lifecycle

- 📍 NedAccess: Server-side encryption (AES256/KMS), private bucket, versioning, access logs, lifecycle rule deleting Textract temp objects after 7 days.
- 🛒 E-commerce equivalent: Product-image bucket private; CDN signed URLs; lifecycle rules to expire user-uploaded "drafts" / abandoned KYB docs. Keep order receipts long-term per tax law.
- 💡 Pattern: Default-private + signed URLs + lifecycle = zero accidental data exposure.

### F-903 · Outbound HTTPS only with timeouts

- 📍 NedAccess: All AWS SDK calls HTTPS, Keycloak HTTPS with 10s timeout (fail-graceful), SendGrid HTTPS.
- 🛒 E-commerce equivalent: Same plus payment-provider with 5s timeout + retry-with-idempotency-key, courier with 10s timeout, tax engine with circuit breaker.
- 💡 Pattern: Never call out without a timeout; always have a fallback or fail-closed strategy.

### F-904 · Webhook receivers — verify signature + idempotency + replay window

- 📍 NedAccess: Integration tokens with scopes; HMAC verification on inbound admin status updates.
- 🛒 E-commerce equivalent:
  - **Stripe**: verify `Stripe-Signature`; tolerance ±5 min
  - **Adyen**: verify HMAC of payload
  - **Carrier**: verify HMAC + IP allowlist
  - All idempotent; record `(provider, event_id) → processed_at`
- 💡 Pattern: Inbound webhook = untrusted input until proven via signature + idempotency.

---

## Frontend-Only Mappings

### F-1001 · Route guards in the SPA

- 📍 NedAccess: `frontend/src/app/auth.tsx`, route guard checks role + permission before rendering admin pages.
- 🛒 E-commerce equivalent: Same. Storefront routes (account, orders, addresses) require auth; admin routes additionally check role + scope.
- 💡 Pattern: Frontend guards are UX, not security. Backend enforces; frontend hides.

### F-1002 · Permission helpers (`hasPermission`, `canEdit`)

- 📍 NedAccess: `frontend/src/lib/permissions.ts`.
- 🛒 E-commerce equivalent: Same. Returned from a `/me` endpoint; cached in React Query for 5 minutes.
- 💡 Pattern: One source of truth (the backend `/me`), refreshed on focus.

### F-1003 · CSP-compliant React app

- 📍 NedAccess: No inline `<script>`/`<style>`; nonce or hash for any required inline.
- 🛒 E-commerce equivalent: Same. Vite/Next.js can emit nonce-based scripts. Avoid third-party widgets that require `unsafe-inline`.
- 💡 Pattern: Lock CSP early; refactor any tooling that needs inline.

---

## Recap Table — Every NedAccess File → E-commerce Use

| NedAccess file | Use it for in e-commerce |
|---|---|
| `middleware/auth.ts` | Customer + seller + admin auth, all roles |
| `middleware/rateLimit.ts` | Per-route rate limit; especially checkout, login, gift-card balance, search |
| `middleware/csrf.ts` | All cookie-authenticated state-change routes |
| `middleware/idempotency.ts` | Checkout, refunds, payments, coupon redemption |
| `middleware/correlationId.ts` | Every request — propagated to PSP, WMS, ERP |
| `middleware/uploadValidation.ts` | Product images, return evidence, KYB docs, support attachments |
| `middleware/applicationOwnership.ts` | Order ownership, address ownership, review ownership |
| `middleware/productAccess.ts` | Brand/region/category/store-scoped admin access |
| `middleware/formSchemaValidator.ts` | Product attribute schema validation |
| `middleware/documentSecurityHeaders.ts` | Receipt PDF / invoice download responses |
| `middleware/error.ts` | Sanitized error responses (no stack traces) |
| `services/accountSecurity.ts` | Lockout, password policy, common-password check |
| `services/jwt.ts` | Token mint/verify; same rotation pattern |
| `services/tokenRevocation.ts` | Logout-everywhere, fraud-triggered revocation |
| `services/securityLogger.ts` | All audit events; extend the enum for commerce events |
| `services/secrets.ts` | Encrypt PSP keys, courier creds, ERP creds |
| `queries/base.ts` (`runQuery`) | Centralized parameterized SQL pattern |
| `utils/sanitize.ts` | Review / message / description sanitization |
| `utils/logger.ts` (Winston) | Structured logs with redaction |

---

**Next**: [`04-implementation-roadmap.md`](./04-implementation-roadmap.md) — phased build plan so you don't have to ship all of this on day one.
