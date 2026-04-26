# E-Commerce RBAC Design

## Overview

This document describes a Role-Based Access Control (RBAC) model for a multi-tenant e-commerce platform. The platform supports three primary actor categories — `ADMIN` (platform operator), `MERCHANT` (business / store owner), and `USER` (shopper) — each with very different surface areas, trust boundaries, and audit requirements.

The design intentionally separates **role** (who you are) from **permission** (what you can do) from **scope** (what data you can do it on). This is the same separation used in the existing NedAccess permission model (see `docs/PERMISSIONS_SYSTEM.md`), but adapted for the multi-tenant nature of an e-commerce marketplace.

---

## 1. Core Concepts

| Concept | Description | Example |
|---|---|---|
| **Role** | A named bundle of permissions assigned to a user. | `MERCHANT_OWNER`, `STORE_MANAGER`, `CUSTOMER` |
| **Permission** | A single atomic capability, expressed as `resource.action`. | `products.create`, `orders.refund` |
| **Scope** | The data boundary the permission applies to. | `platform`, `merchant:42`, `self` |
| **Resource** | A noun the system operates on. | `product`, `order`, `payout`, `user` |
| **Action** | A verb performed on a resource. | `view`, `create`, `update`, `delete`, `approve` |

A grant is therefore the tuple: **(user, role | direct permission, scope)**.

### Why scope matters in e-commerce

Unlike a single-tenant app, two merchants on the same platform must never see each other's products, customers, orders, or payouts. The `scope` field is what enforces that isolation; `role` alone is not enough.

```
Permission check = role.includes(permission) AND scope.matches(targetResource)
```

---

## 2. Role Hierarchy

```
┌──────────────────────────────────────────────────────────┐
│                      PLATFORM SCOPE                      │
│                                                          │
│  ┌────────────────┐    ┌────────────────────────────┐    │
│  │  SUPER_ADMIN   │    │  PLATFORM_SUPPORT          │    │
│  │  (full access) │    │  (read-only + impersonate) │    │
│  └────────────────┘    └────────────────────────────┘    │
│                                                          │
│  ┌────────────────┐    ┌────────────────────────────┐    │
│  │  FINANCE_ADMIN │    │  COMPLIANCE_ADMIN          │    │
│  │  (payouts/fees)│    │  (KYC, fraud, takedowns)   │    │
│  └────────────────┘    └────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                  MERCHANT SCOPE (per store)              │
│                                                          │
│  ┌────────────────┐    ┌────────────────────────────┐    │
│  │ MERCHANT_OWNER │    │  STORE_MANAGER             │    │
│  │ (full store)   │    │  (no billing/team mgmt)    │    │
│  └────────────────┘    └────────────────────────────┘    │
│                                                          │
│  ┌────────────────┐    ┌────────────────────────────┐    │
│  │ CATALOG_EDITOR │    │  ORDER_FULFILLER           │    │
│  │ (products only)│    │  (orders + shipments)      │    │
│  └────────────────┘    └────────────────────────────┘    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │ MERCHANT_SUPPORT (read-only customer service)    │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                     USER SCOPE (self)                    │
│                                                          │
│  ┌────────────────┐    ┌────────────────────────────┐    │
│  │  GUEST         │    │  CUSTOMER                  │    │
│  │  (anon cart)   │    │  (account, orders, wallet) │    │
│  └────────────────┘    └────────────────────────────┘    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │ VIP_CUSTOMER (loyalty tier — extra perms)        │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

---

## 3. ADMIN — Platform Operator

The ADMIN tier operates on **platform scope**. They never own products or process retail orders; they govern the system that merchants and customers use.

### 3.1 Sub-roles

| Role | Purpose | Risk |
|---|---|---|
| `SUPER_ADMIN` | Break-glass full access. Few seats, hardware MFA mandatory. | Critical |
| `PLATFORM_SUPPORT` | Read-only across tenants, can impersonate (audited). | High |
| `FINANCE_ADMIN` | Manage fees, payouts, refunds-of-last-resort, tax config. | High |
| `COMPLIANCE_ADMIN` | KYC approvals, merchant suspensions, takedown notices. | High |
| `INTEGRATIONS_ADMIN` | Manage API keys, webhooks, fulfilment partners, payment gateways. | High |
| `CONTENT_ADMIN` | Manage email templates, CMS pages, banners, categories taxonomy. | Medium |

### 3.2 Permission groups

| Group | Permissions | Notes |
|---|---|---|
| **Application config** | `config.view`, `config.update`, `config.feature_flags` | Toggle features per environment. |
| **API keys** | `apikeys.view`, `apikeys.create`, `apikeys.rotate`, `apikeys.revoke` | Always show last 4 chars only after creation. |
| **Email** | `email.templates.view/edit`, `email.test_send`, `email.smtp.configure`, `email.deliverability.view` | Test sends must use a sandbox recipient list. |
| **Safety deposit boxes** | `sdb.view`, `sdb.assign`, `sdb.audit`, `sdb.config` | Highly sensitive — log every read. |
| **Fulfilment partners** | `fulfilment.partners.view/create/update/disable`, `fulfilment.credentials.rotate` | Credentials encrypted at rest, never returned in API. |
| **User management** | `users.view`, `users.create`, `users.suspend`, `users.delete`, `users.impersonate` | Impersonation creates a session token tagged `actor=admin_id; subject=user_id`. |
| **Merchant management** | `merchants.view`, `merchants.approve`, `merchants.suspend`, `merchants.kyc.review`, `merchants.fees.update` | Approve/suspend require dual-control for tier-1 merchants. |
| **Payments & payouts** | `payouts.view`, `payouts.release`, `payouts.hold`, `refunds.view`, `refunds.issue_platform` | `FINANCE_ADMIN` only. |
| **Audit & logs** | `audit.view`, `audit.export`, `logs.view` | Read-only by design — no admin can mutate audit. |

### 3.3 Required guardrails

- **MFA mandatory** for every admin role.
- **IP allowlist** for `SUPER_ADMIN` and `FINANCE_ADMIN`.
- **Dual control** (two approvers) on: merchant deletion, payout release > threshold, API key creation for payment gateways, mass user export.
- **Impersonation** must be time-boxed (e.g. 30 minutes), reason-coded, and surface a banner to the impersonated user's account in the audit trail.
- **No standing access** for `SUPER_ADMIN`: just-in-time elevation via approval workflow, expires automatically.

---

## 4. MERCHANT — Business / Store Owner

The MERCHANT tier operates on **merchant scope**: every permission is implicitly bounded to `merchant:{id}`. A merchant user with `products.update` cannot edit another merchant's products even though the permission key is identical.

### 4.1 Sub-roles

| Role | Purpose |
|---|---|
| `MERCHANT_OWNER` | Founder/legal signatory. Full control of the store, billing, team. |
| `STORE_MANAGER` | Day-to-day operations. No billing or team-add/remove. |
| `CATALOG_EDITOR` | Manage products, variants, pricing, media, categories. |
| `ORDER_FULFILLER` | View orders, generate shipping labels, mark fulfilled, issue partial refunds. |
| `MERCHANT_FINANCE` | View payouts, statements, tax reports. Read-only on operations. |
| `MERCHANT_SUPPORT` | Read customer/order data for the store; reply to messages. No edits. |

### 4.2 Permission groups (always scoped to `merchant:{id}`)

| Group | Permissions |
|---|---|
| **Storefront** | `storefront.view`, `storefront.update`, `storefront.theme.update`, `storefront.domains.manage` |
| **Catalog** | `products.view/create/update/delete`, `products.publish`, `inventory.adjust`, `categories.manage`, `media.upload` |
| **Pricing & promotions** | `pricing.update`, `discounts.create/update/delete`, `coupons.manage` |
| **Orders** | `orders.view`, `orders.update`, `orders.cancel`, `orders.fulfil`, `orders.refund_partial`, `orders.refund_full` |
| **Customers (own store)** | `customers.view`, `customers.note`, `customers.export` (gated, audited) |
| **Reports** | `reports.sales.view`, `reports.inventory.view`, `reports.payouts.view` |
| **Integrations** | `integrations.view`, `integrations.connect`, `integrations.disconnect` (Shopify, Xero, courier APIs) |
| **Team** | `team.view`, `team.invite`, `team.update_role`, `team.remove` (owner only) |
| **Billing** | `billing.view`, `billing.payment_method.update`, `billing.plan.change` (owner only) |
| **Settings** | `settings.tax.update`, `settings.shipping.update`, `settings.policies.update` |

### 4.3 Tenant isolation rules

Every merchant-scope query must include the tenant predicate. Two layers enforce this:

1. **Middleware** resolves `req.merchantId` from the user's session/membership and rejects requests where the URL `:merchantId` doesn't match.
2. **Data layer** never accepts a query without a `merchantId` filter — query helpers (e.g. `runQuery`) wrap product/order/customer reads in a function that requires `merchantId` as a parameter.

A merchant user with multiple memberships (rare) must explicitly switch context; the active merchant is part of the session.

### 4.4 Notable nuances

- **Refund ceilings**: `ORDER_FULFILLER` can refund up to a configurable amount per order (e.g. R 5 000); above that requires `MERCHANT_OWNER` or `STORE_MANAGER`.
- **Bulk export of customers** is always permission-gated and audited — common GDPR/POPIA blast radius.
- **Discount codes** are dangerous; only `STORE_MANAGER`+ should create unlimited-use codes.
- **API tokens issued by merchants** inherit the role of the issuing user (or a narrower role) and must be auto-revoked when that user is removed from the team.

---

## 5. USER — Shopper

The USER tier operates on **self scope**: permissions apply only to resources owned by the user (their cart, their orders, their addresses). Most public browsing requires no authentication at all.

### 5.1 Sub-roles

| Role | Purpose |
|---|---|
| `GUEST` | Unauthenticated. Browse, add to cart (session cookie), checkout as guest. |
| `CUSTOMER` | Authenticated buyer with persistent account. |
| `VIP_CUSTOMER` | Loyalty tier — early-access drops, higher refund self-service ceiling. |

### 5.2 Permission groups

| Group | GUEST | CUSTOMER | VIP_CUSTOMER |
|---|---|---|---|
| **Browse** `catalog.view`, `search.use`, `reviews.read` | ✅ | ✅ | ✅ |
| **Cart** `cart.read/update` (session-scoped) | ✅ | ✅ | ✅ |
| **Checkout** `checkout.create_order`, `payment.tokenize` | ✅ (guest) | ✅ | ✅ |
| **Account** `account.view/update`, `addresses.manage`, `password.change`, `mfa.manage` | ❌ | ✅ | ✅ |
| **Orders (own)** `orders.view_own`, `orders.cancel_own` (within window), `orders.return_request` | ❌ | ✅ | ✅ |
| **Reviews** `reviews.create_for_purchased`, `reviews.update_own`, `reviews.delete_own` | ❌ | ✅ | ✅ |
| **Wishlist / saved** `wishlist.manage`, `payment_methods.save` | ❌ | ✅ | ✅ |
| **Loyalty** `loyalty.redeem`, `early_access.view` | ❌ | partial | ✅ |
| **Self-service refund** | ❌ | up to R 500 | up to R 2 000 |

### 5.3 Self-scope rules

- Every user-data endpoint (`/orders/:id`, `/addresses/:id`) checks `resource.userId === req.user.id` **after** the role check. The role grants the *capability*; the ownership check enforces the *boundary*.
- A user must never be able to enumerate other users (no `/users/:id` endpoint accessible with `CUSTOMER` role).
- Reviews can only be left for products the user has actually received (`orders.fulfilled` evidence required).

---

## 6. Cross-cutting Permission Patterns

### 6.1 Permission key naming

```
{resource}.{action}[.{qualifier}]
```

Examples:
- `products.update` (merchant scope)
- `orders.refund_full` (merchant scope)
- `orders.view_own` (self scope — qualifier makes scope explicit)
- `merchants.approve` (platform scope)

A `_own` suffix is a strong convention: any permission ending in `_own` is automatically self-scoped and the middleware enforces ownership.

### 6.2 Default-deny

The system rejects any request whose permission isn't explicitly granted. There is no implicit "logged-in users can do X" — `CUSTOMER` is itself a role with an explicit allow-list.

### 6.3 Layered checks (request lifecycle)

```
1. Authenticate            → who is the principal?
2. Resolve scope context   → which merchant / which user is being acted on?
3. Role/permission check   → does the principal have the permission?
4. Scope match             → is the target resource inside the principal's scope?
5. Ownership/eligibility   → for *_own and self-service flows
6. Business rule           → e.g. refund window, inventory available, KYC complete
```

A failure at any layer returns **403** (or **404** if leaking existence is itself a problem, e.g. another merchant's product slug).

### 6.4 Caching

Mirror the existing NedAccess pattern: in-memory cache of `(userId → permissions, scopes)` with event-based invalidation on:
- role assignment / revocation,
- team membership change,
- merchant suspension,
- user suspension/deletion.

Admin fast-path bypasses the cache lookup (admins are rare, hot, and need fresh state).

### 6.5 Direct (override) permissions

Useful for one-off access without inventing a new role:

- Granting `PLATFORM_SUPPORT` user a temporary `merchants.kyc.review` for two days.
- Granting a single merchant user `payouts.export` while the platform builds a proper role.

Direct grants must always have an `expires_at` and must be auditable.

---

## 7. Database Schema (suggested)

```
users(id, email, status, mfa_enabled, ...)

roles(id, key, name, scope_type)         -- scope_type: PLATFORM | MERCHANT | SELF
permissions(id, key, name, scope_type)
role_permissions(role_id, permission_id)

merchants(id, legal_name, status, ...)

memberships(                              -- a user belonging to a merchant team
  id, user_id, merchant_id, role_id,
  status, invited_by, invited_at, accepted_at
)

user_roles(                               -- platform-scope role assignments
  id, user_id, role_id, granted_by, granted_at, expires_at
)

direct_permissions(                       -- ad-hoc grants outside any role
  id, user_id, permission_id, scope_type, scope_id,
  granted_by, granted_at, expires_at, reason
)

permission_audit(                         -- append-only
  id, actor_user_id, subject_user_id, action,
  permission_key, scope_type, scope_id,
  before, after, ip, user_agent, occurred_at
)
```

A user gets an effective permission set by unioning:
- platform-scope roles (via `user_roles`),
- merchant-scope role(s) for the active merchant (via `memberships`),
- self-scope role (`CUSTOMER` etc. — typically derived from account state),
- non-expired direct permissions matching scope.

---

## 8. Worked Examples

### 8.1 Customer cancels their own order
```
POST /orders/9123/cancel
- requireAuth                  → user 504, role CUSTOMER
- requirePermission('orders.cancel_own')   → granted by CUSTOMER role
- ownershipCheck(order.user_id === 504)    → pass
- businessRule(order.status === 'pending') → pass
✅ 200
```

### 8.2 Merchant catalog editor tries to delete a product on another store
```
DELETE /merchants/77/products/881
- requireAuth                              → user 612, membership in merchant 42 only
- resolveScope(:merchantId = 77)           → mismatch with active membership (42)
✗ 404 Not Found  (don't leak existence)
```

### 8.3 Platform support reads merchant payout
```
GET /admin/merchants/42/payouts/2025-04
- requireAuth                              → user 8, role PLATFORM_SUPPORT
- requirePermission('payouts.view')        → granted (read-only)
- scope = PLATFORM                         → no merchantId boundary
✅ 200, audit log entry written
```

### 8.4 Admin issues a temporary direct grant
```
POST /admin/grants
{ user_id: 8, permission: 'merchants.kyc.review',
  scope_type: 'PLATFORM', expires_at: '2026-05-01T00:00Z',
  reason: 'covering for KYC lead on leave' }

- requireRole(SUPER_ADMIN)
- dual-control: a second SUPER_ADMIN must approve before active
- audited: who granted, who approved, why, when it expires
```

---

## 9. Comparison vs. NedAccess RBAC

| Dimension | NedAccess (single org) | E-Commerce (multi-tenant) |
|---|---|---|
| Tenants | One bank, many internal users. | Many independent merchants. |
| Primary scope | Resource/permission grants. | Tenant (merchant) is a first-class scope. |
| Customer role | KYC subject (limited self-service). | Buyer with rich self-service: orders, returns, reviews, loyalty. |
| Cross-tenant leakage risk | Low — single org. | High — must be enforced at every read. |
| Admin breadth | Ops over banking workflows. | Ops over a marketplace + payments + content + integrations. |
| Refund/payout flows | Internal approvals. | Platform ↔ merchant ↔ customer triangle. Refunds may originate from any side. |
| Impersonation | Rare (compliance-driven). | Common (support tickets) — must be tightly logged. |

The mechanics (roles, permissions, direct grants, cache, audit) carry over; the **scope model** is the largest delta. Every merchant-scope check needs a `merchantId` boundary that has no equivalent in a single-tenant system.

---

## 10. Implementation Checklist

- [ ] Define `scope_type` enum (`PLATFORM`, `MERCHANT`, `SELF`) on roles, permissions, and grants.
- [ ] Add `memberships` table for merchant-scope role assignments.
- [ ] Build `requirePermission(permKey, { scope })` middleware that resolves merchant context from the route or session.
- [ ] Always pair merchant-scope reads with a `merchantId` predicate at the query layer (never trust route input alone).
- [ ] Enforce MFA for every platform admin role.
- [ ] Add dual-control workflow for high-risk actions (payouts release, merchant deletion, payment-gateway key creation).
- [ ] Write append-only `permission_audit` and never expose mutation endpoints for it.
- [ ] Time-box every elevated grant (`expires_at` mandatory for direct permissions and `SUPER_ADMIN` sessions).
- [ ] Provide a self-service "switch merchant" affordance for users with multiple memberships.
- [ ] Cache effective permissions per `(user_id, active_merchant_id)`; invalidate on role/membership change.
- [ ] Add automated tests that assert: (a) two merchants cannot read each other's products/orders/customers, (b) a customer cannot read another customer's orders, (c) a guest cannot reach `/account/*`.
