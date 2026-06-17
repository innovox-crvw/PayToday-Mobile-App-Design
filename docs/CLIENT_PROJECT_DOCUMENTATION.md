# AvoToday Platform — Client Project Documentation

**Document version:** 1.0  
**Date:** 19 May 2026  
**Prepared for:** Client stakeholder review  
**Classification:** External — suitable for client distribution  

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Project identity and vision](#2-project-identity-and-vision)
3. [Target users and personas](#3-target-users-and-personas)
4. [Platform capabilities](#4-platform-capabilities)
5. [User experience and information architecture](#5-user-experience-and-information-architecture)
6. [Technical architecture](#6-technical-architecture)
7. [Security and compliance posture](#7-security-and-compliance-posture)
8. [Third-party integrations](#8-third-party-integrations)
9. [Business rules and domain logic](#9-business-rules-and-domain-logic)
10. [Deployment and operations](#10-deployment-and-operations)
11. [Development status and scope honesty](#11-development-status-and-scope-honesty)
12. [Quality assurance and testing](#12-quality-assurance-and-testing)
13. [Roadmap and phase 2 items](#13-roadmap-and-phase-2-items)
14. [Appendices](#14-appendices)

---

## 1. Executive summary

**AvoToday** is a modern digital commerce and financial-services platform that combines an online store, digital wallet, bill-payment hub, and merchant operations console in a single cohesive web experience. The platform is designed to serve retail customers who want to browse, purchase, and manage their orders alongside wallet and payment services, while giving merchant staff the tools to manage catalogue, inventory, fulfillment, and customer operations.

The solution is delivered as a **single-page web application** (React) backed by a **dedicated API server** (Node.js / Express) and **Microsoft SQL Server** database. It integrates with the **PayToday** payment ecosystem for hosted checkout and payment confirmation, and optionally with **Keycloak** for PayToday-branded customer sign-in. Payment secrets and third-party credentials never reach the end-user's browser — all sensitive operations are handled server-side.

### Key highlights

| Area | Summary |
|------|---------|
| **Customer experience** | Store browsing, cart, checkout, order tracking, wallet, profile, notifications, services hub, and classifieds UI |
| **Merchant operations** | Admin console for products, categories, inventory, orders, fulfillment, deposit boxes, disputes, reviews, and payment plans |
| **Payments** | PayToday payment intent with browser redirect, webhook confirmation, and demo wallet checkout |
| **Security** | HttpOnly session cookies, CSRF protection, role-based access control, HMAC webhook verification |
| **Deployment** | Production-ready split architecture: Nginx serves the SPA and reverse-proxies API traffic |
| **Current maturity** | Core e-commerce and admin flows are implemented; some wallet and classifieds features are UI placeholders or demo-mode |

### Technology stack at a glance

| Layer | Technology |
|-------|------------|
| Customer and admin UI | React 19, TypeScript, Vite, React Router 7, Material UI 6 |
| API server | Node.js 20, Express 5, TypeScript |
| Database | Microsoft SQL Server (66 incremental migrations) |
| Identity (optional) | Keycloak (server-side only) |
| Payments | PayToday Payment Intent API + HMAC webhooks |
| Production hosting | Nginx + PM2 (API), static file serving (frontend) |

---

## 2. Project identity and vision

### Product naming

The platform uses a deliberate split between customer-facing branding and internal/repository naming:

| Context | Name |
|---------|------|
| **Customer-facing product name** | **AvoToday** |
| **Wallet product name** | **PayToday Wallet** |
| **Repository / API internal name** | PayToday Store |

Customer-visible copy, logos, and theme tokens are centralised in `frontend/src/theme/branding.ts`. When rebranding or updating legal/marketing naming, that file is the single source of truth.

### Visual identity

- **Primary palette:** Purple gradient headers (`#8E2DE2` → `#4A00E0`), blue hero accents, clean slate surfaces
- **Typography:** Inter (Google Fonts)
- **Design language:** Bank-grade minimal surfaces with soft elevation, mobile-first bottom navigation, and a dedicated dark admin console for staff

### Vision statement

AvoToday aims to be a **unified digital storefront and wallet hub** where customers can shop, pay bills, manage their wallet, and track orders — while merchants operate catalogue, inventory, and fulfillment from a single integrated back office. The platform is architected as a **Backend-for-Frontend (BFF)** pattern: the browser talks only to the AvoToday API, which in turn orchestrates PayToday, Keycloak, email, and courier services without exposing secrets to clients.

---

## 3. Target users and personas

### 3.1 Customer (shopper)

**Needs:** Browse products, add to cart, checkout (guest or signed-in), track orders, manage profile and addresses, use wallet features, pay bills via services hub, receive notifications.

**Access:** Public store routes (`/shop`, `/cart`, `/checkout`, `/orders`, `/wallet`, `/profile`, etc.)

**Authentication:** Optional for browsing; required for certain flows (alcohol purchase, wallet, order history). Supports local email/password registration and optional PayToday (Keycloak) sign-in.

### 3.2 Merchant admin / operations staff

**Needs:** Manage product catalogue, categories, inventory levels, process orders, advance fulfillment stages, allocate deposit-box pickup codes, handle returns and disputes, moderate reviews, configure store hours and shipping.

**Access:** `/admin/*` routes after staff sign-in

**Roles:**

| Role | Typical responsibilities |
|------|-------------------------|
| **admin** | Full catalogue and configuration access; may be scoped to assigned merchants |
| **ops** | Cross-merchant operations; full admin API access |
| **fulfillment** | Order processing, inventory, deposit boxes, pickup codes |

Fine-grained permissions are additionally available via an RBAC subsystem (`/api/admin/rbac/*`).

### 3.3 Product, QA, and operations stakeholders

**Needs:** Documentation, deployment runbooks, UAT checklists, scope traceability, and security review materials.

**Access:** Repository documentation under `docs/`, deployment scripts under `deploy/`.

---

## 4. Platform capabilities

### 4.1 E-commerce store

| Capability | Status | Description |
|------------|--------|-------------|
| Product catalogue | **Live** | Browse by category, search, product detail pages with variants and images |
| Promotions & super-deals | **Live** | Storefront promotions, personalised deal tiles |
| Shopping cart | **Live** | Server-authoritative cart; persists across sessions via cookie; merges on login |
| Checkout | **Live** | Home delivery, deposit-box pickup, VAT/shipping calculation, discount codes |
| PayToday payment | **Live** | Payment intent → hosted PayToday page → return URL + webhook confirmation |
| Demo wallet checkout | **Live** | Pay from in-app demo wallet balance (development/demo mode) |
| Instalment payment plans | **Live** | Order-level payment plans with wallet debit for instalments |
| Order tracking | **Live** | Order list, detail, status timeline, cancellation |
| Returns | **Live** | Customer-initiated return requests within configurable return window |
| Disputes | **Live** | Customer dispute submission; admin moderation |
| Order reviews | **Live** | Post-delivery review submission; admin moderation |
| Alcohol / liquor gating | **Live** | Age verification via self-reported DOB; liquor sale hours enforcement |
| Finance callouts | **Partial** | Nedbank finance URL integration on eligible products; external application flow |
| Home delivery (Yango) | **Partial** | Demo courier integration with optional webhook status updates |

### 4.2 Digital wallet

| Capability | Status | Description |
|------------|--------|-------------|
| Wallet balance | **Live (demo)** | Demo wallet ledger with fund/add balance |
| Transaction history | **Live (demo)** | Wallet transaction list and detail |
| Cards & bank accounts | **UI** | Onboarding-style add card/bank flows |
| Instalment payments | **Live** | Pay due instalments from demo wallet |
| Savings pocket | **Live** | Wallet savings settings via API |
| Split bill | **Live** | Split bill creation and participant management |
| Scan & pay (QR) | **UI / demo** | QR generation and scan flows; demo barcode scanner |
| Rewards | **UI** | Rewards page present |
| Request payment | **Placeholder** | UI with copy indicating future connectivity |
| Cash-out | **Placeholder** | UI with copy indicating future connectivity |

**Wallet UI (finance layout):** The customer wallet hub at `/wallet` uses shared components under `frontend/src/components/wallet/` and tokens in `frontend/src/theme/walletTheme.ts`. The home screen is ordered as: balance hero → quick actions (Top up, Scan & pay, Pay, History) → **Add funds** (demo ledger; intentionally prominent until live PayToday wallet API) → payment-plan due (if any) → recent activity preview → scan tiles → grouped services (Pay & move, Payment methods, Grow). Sub-pages use `WalletPageShell` for consistent back navigation and card styling. Bottom tab **Wallet** in `StoreLayout` is unchanged.

### 4.3 Services and bill pay

| Capability | Status | Description |
|------------|--------|-------------|
| Services hub | **Live** | Essentials, insurance, finance tiles |
| Insurance flows | **Demo** | Nedlife-style insurance demo payment flow |
| Finance hub | **UI** | Nedbank finance callouts and external link |
| Bill pay categories | **Demo** | Category listing with A–Z index; per-item demo payment gateway |
| Hub navigation tiles | **Live** | Configurable tiles from API with static fallback |

### 4.4 Customer profile and account

| Capability | Status | Description |
|------------|--------|-------------|
| Personal details | **Live** | Name, email, phone, date of birth |
| Address management | **Live** | CRUD addresses with default selection |
| Email verification | **Live** | Verification token flow |
| Password reset | **Live** | Forgot/reset password with email notification |
| Notification preferences | **Live** | Email, in-app, or both |
| Support, FAQ, feedback | **UI** | Support hub pages |
| Account deletion | **UI** | Delete account flow |
| Legal / terms | **UI** | Legal information page |

### 4.5 Classifieds

| Capability | Status | Description |
|------------|--------|-------------|
| Browse listings | **UI (mock)** | Client-side mock data; no backend API |
| Post an ad | **UI (mock)** | Local storage persistence |
| Listing detail | **UI (mock)** | Static mock model |

> **Note:** Classifieds is a fully designed frontend experience using mock data. Backend integration is not yet implemented.

### 4.6 Onboarding and authentication

| Capability | Status | Description |
|------------|--------|-------------|
| Intro carousel | **Live** | First-run introduction |
| Sign in / register | **Live** | Local bcrypt auth + optional PayToday (Keycloak) |
| Complete profile | **Live** | Post-registration profile completion |
| Permissions consent | **UI** | Permissions onboarding step |
| Add card / bank | **UI** | Demo onboarding payment method flows |
| Guest browsing | **Live** | Shop without account; cart via session cookie |

### 4.7 Merchant admin console

| Capability | Status | Description |
|------------|--------|-------------|
| Dashboard overview | **Live** | Stats, charts (Recharts), low-stock alerts |
| Product management | **Live** | CRUD, variant options, image upload, CSV/zip bulk import; per-product storefront tabs (description, delivery, returns, warranty, what's in the box) |
| Category management | **Live** | Category CRUD |
| Order management | **Live** | List, filter, cancel, refund |
| Payment plans | **Live** | Admin view of instalment plans |
| Inventory management | **Live** | Stock levels, movements, low-stock reporting |
| Fulfillment | **Live** | Stage advancement (picking → packing → packed → shipped) |
| Deposit boxes | **Live** | Locations, box allocation, pickup code generation |
| Returns processing | **Live** | Return case workflow |
| Disputes | **Live** | Dispute list and resolution |
| Order reviews | **Live** | Review moderation |
| Store / liquor hours | **Live** | Merchant operating hours configuration |
| Shipping zones | **Live** | Shipping rate and home-delivery area configuration |
| Promotions | **Live** | Store promotion CRUD |
| RBAC | **Live** | Roles, permissions, user-role assignment, audit log |

### 4.8 Notifications

| Capability | Status | Description |
|------------|--------|-------------|
| In-app notifications | **Live** | Notification inbox with read/unread |
| Email notifications | **Live** | Outbox worker drains to PayToday Notify or SMTP |
| Notification worker | **Live** | Background 15-second interval processor |

### 4.9 Embed mode

The platform supports an **`/embed`** route prefix that mirrors the full customer route tree for iframe/partner embedding. Same functionality, prefix-aware navigation. Documented in `docs/EMBED.md`.

---

## 5. User experience and information architecture

### 5.1 Navigation model

**Mobile / tablet:** Bottom navigation bar with five primary destinations — Home, Shop, Wallet, Orders, Services.

**Desktop:** Top app bar with horizontal navigation, search, cart badge, and notification bell.

**Admin:** Fixed dark sidebar with section links; separate login at `/admin/login`.

### 5.2 Customer route map

#### Store and commerce

| Route | Purpose |
|-------|---------|
| `/` | Store home — hero carousel, promotions, category rails |
| `/intro` | Onboarding intro carousel |
| `/shop` | Product catalogue and bill-pay hub anchor |
| `/shop/:slug` | Product detail page |
| `/cart` | Shopping cart |
| `/checkout` | Checkout flow |
| `/checkout/success`, `/failure`, `/complete` | Payment outcome pages |
| `/orders` | Order history |
| `/orders/:orderId` | Order detail |
| `/orders/:orderId/return` | Return request |
| `/orders/track` | Order tracking |
| `/dispute`, `/review` | Post-order dispute and review |
| `/account` | Account hub |

#### Wallet

| Route | Purpose |
|-------|---------|
| `/wallet` | Wallet home and balance |
| `/wallet/rewards` | Rewards |
| `/wallet/paytoday` | PayToday sub-hub |
| `/wallet/cards`, `/wallet/bank` | Payment methods |
| `/wallet/transactions` | Transaction history |
| `/wallet/vouchers` | Vouchers |
| `/wallet/scan/*` | Scan and pay flows |
| `/wallet/savings` | Savings pocket |
| `/wallet/split-bill` | Split bill |

#### Services and payments

| Route | Purpose |
|-------|---------|
| `/services` | Services hub |
| `/services/insurance` | Insurance listings |
| `/services/finance` | Finance hub |
| `/payments/:categoryId` | Bill-pay category |
| `/payments/:categoryId/pay/:itemId` | Bill payment flow |

#### Profile and support

| Route | Purpose |
|-------|---------|
| `/profile` | Profile hub |
| `/profile/personal`, `/profile/addresses` | Personal details and addresses |
| `/profile/settings`, `/profile/legal` | Settings and legal |
| `/notifications` | Notification inbox |
| `/classifieds` | Classifieds browse (mock) |

#### Onboarding and auth

| Route | Purpose |
|-------|---------|
| `/onboarding/login` | Sign in / register |
| `/onboarding/complete-profile` | Profile completion |
| `/forgot-password`, `/reset-password` | Password recovery |

### 5.3 Admin route map

| Route | Purpose |
|-------|---------|
| `/admin` | Dashboard overview |
| `/admin/products` | Product catalogue management |
| `/admin/categories` | Category management |
| `/admin/orders` | Order operations |
| `/admin/payment-plans` | Instalment plan management |
| `/admin/inventory` | Stock management |
| `/admin/fulfillment` | Fulfillment stages |
| `/admin/deposit-boxes` | Pickup location management |
| `/admin/returns` | Returns processing |
| `/admin/disputes` | Dispute resolution |
| `/admin/reviews` | Review moderation |
| `/admin/store-hours` | Operating hours |

### 5.4 Primary user journeys

```
┌─────────────┐     ┌──────────┐     ┌──────────┐     ┌───────────┐     ┌─────────┐
│ Browse shop │ ──► │ Add cart │ ──► │ Checkout │ ──► │ PayToday  │ ──► │ Orders  │
└─────────────┘     └──────────┘     └──────────┘     └───────────┘     └─────────┘

┌─────────────┐     ┌──────────┐     ┌──────────────┐
│   Wallet    │ ──► │ Fund/demo│ ──► │ Pay / scan   │
└─────────────┘     └──────────┘     └──────────────┘

┌─────────────┐     ┌──────────┐     ┌──────────────┐
│  Services   │ ──► │ Category │ ──► │ Demo payment │
└─────────────┘     └──────────┘     └──────────────┘

┌─────────────┐     ┌──────────┐     ┌──────────────┐
│ Admin login │ ──► │ Dashboard│ ──► │ Manage ops   │
└─────────────┘     └──────────┘     └──────────────┘
```

---

## 6. Technical architecture

### 6.1 System context

```
┌─────────────────────────────────────────────────────────────────┐
│                         End-user browser                         │
│                    React SPA (Vite build)                        │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Nginx (public entry point)                    │
│   /          →  Static SPA (index.html + assets)                 │
│   /api/*     →  Reverse proxy to Node API (127.0.0.1:4000)       │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
┌─────────────────────────┐    ┌─────────────────────────┐
│   Express API (Node 20)  │    │  Microsoft SQL Server   │
│   TypeScript, PM2        │    │  Migrations + repos     │
└────────────┬────────────┘    └─────────────────────────┘
             │
    ┌────────┼────────┬──────────────┐
    ▼        ▼        ▼              ▼
 PayToday  Keycloak  Notify/SMTP   Yango (optional)
```

### 6.2 Repository structure

The project is a **single Git repository** containing two independently managed npm packages (no npm workspaces):

```
PayToday-Mobile-App-Design-main/
├── frontend/          React 19 + Vite SPA
├── backend/           Express 5 + TypeScript API
├── deploy/            Production deploy scripts + Nginx config
├── docs/              Technical and operational documentation
└── docker-compose.yml SQL Server for local development
```

Each package has its own `package.json`, lockfile, build pipeline, and deployment script. They do not import from each other.

### 6.3 Frontend architecture

| Aspect | Detail |
|--------|--------|
| **Framework** | React 19 with TypeScript |
| **Build tool** | Vite 8 |
| **Routing** | React Router 7 — declarative route tree in `App.tsx` |
| **UI library** | Material UI 6 with Emotion styling |
| **Charts** | Recharts (admin dashboard) |
| **QR codes** | qrcode library (scan/pay flows) |
| **State management** | Local component state + custom hooks; no global store (Redux/Zustand) |
| **API client** | Centralised `apiFetch` with CSRF headers, cookie credentials, automatic token refresh |
| **Layouts** | `StoreLayout` (customer), `AdminLayout` (staff), `RequireAdminStaff` (guard) |

**Key design decision:** The shopping cart is **authoritative on the server** (`/api/cart`). The frontend refreshes cart state via API calls and listens for a custom `pt-cart-updated` browser event after mutations.

### 6.4 Backend architecture

| Aspect | Detail |
|--------|--------|
| **Runtime** | Node.js 20, Express 5, TypeScript (ESM) |
| **Data access** | Parameterised SQL via `mssql` driver; repository pattern — no ORM |
| **Migrations** | 66 incremental SQL migration files; tracked in `dbo.schema_migrations` |
| **Bootstrap** | Full demo schema + seed data via `paytoday-full-setup.sql` |
| **Security middleware** | Helmet, CORS, cookie-parser, CSRF double-submit, optional/required JWT auth |
| **Background work** | Notification outbox worker (15-second interval) |
| **File uploads** | Product images via multer; served from `/api/uploads/products` |
| **Webhook handling** | Raw body parsing before JSON middleware for HMAC verification |

**Production posture:** The API binds to `127.0.0.1:4000` (loopback only). It never serves the SPA — Nginx handles all public traffic.

### 6.5 Database schema overview

The database supports the full e-commerce lifecycle:

| Domain | Key tables |
|--------|------------|
| **Catalogue** | `categories`, `businesses`, `products`, `product_variants`, `product_images`, `store_promotions` |
| **Inventory** | `warehouses`, `inventory_quantity`, `stock_movements`, `inventory_reservations` |
| **Commerce** | `carts`, `cart_lines`, `orders`, `order_lines`, `payments`, `discount_codes` |
| **Fulfillment** | `fulfillment_tasks`, `pickup_codes`, `deposit_locations`, `deposit_boxes` |
| **Users & auth** | `users`, `user_businesses`, `user_refresh_tokens`, `password_reset_tokens`, `addresses` |
| **Wallet** | `demo_wallet_ledger`, `wallet_split_bills`, `wallet_split_participants` |
| **Payment plans** | `order_payment_plans` |
| **Returns & disputes** | `return_cases`, `customer_disputes`, `order_disputes` |
| **Reviews** | `order_reviews` |
| **Notifications** | `notification_outbox`, `user_notifications` |
| **RBAC** | `rbac_roles`, `rbac_permissions`, `rbac_role_permissions`, `rbac_user_roles` |
| **Integrations** | `integration_settings`, `payment_webhook_events`, `payment_return_events` |
| **Hub** | `hub_navigation_tiles`, `hub_payment_category_items` |
| **Finance** | `finance_applications` |

### 6.6 API surface summary

All endpoints are prefixed with `/api`. Key groups:

| Prefix | Auth | Purpose |
|--------|------|---------|
| `/api/health`, `/api/csrf` | Public | Health check, CSRF token issuance |
| `/api/storefront/*`, `/api/categories`, `/api/products` | Public | Catalogue and merchandising |
| `/api/cart`, `/api/checkout` | CSRF + session | Cart and order creation |
| `/api/auth/*` | Mixed | Registration, login, refresh, logout, profile |
| `/api/orders/*`, `/api/returns/*`, `/api/disputes/*` | Authenticated | Customer order management |
| `/api/wallet/*` | Authenticated | Wallet balance, transactions, settings |
| `/api/notifications/*` | Authenticated | Notification inbox |
| `/api/admin/*` | Staff roles | Full merchant admin API |
| `/api/webhooks/paytoday` | HMAC signature | Payment confirmation webhook |
| `/api/payments/return` | Public GET | Browser return from PayToday hosted page |

### 6.7 Checkout and payment flow

```
Customer                SPA                  API                 PayToday
   │                     │                    │                     │
   │── Submit checkout ─►│                    │                     │
   │                     │── POST /checkout ─►│                     │
   │                     │                    │── Create order ─────│
   │                     │                    │── Payment intent ───►│
   │                     │                    │◄── payment_url ──────│
   │                     │◄── redirectUrl ────│                     │
   │◄── Browser redirect │                    │                     │
   │──────────────────────────────────────────────────────────────►│
   │                     │                    │                     │
   │                     │                    │◄── Webhook (HMAC) ──│
   │                     │                    │── Confirm payment ──│
   │◄── Return redirect ─│◄── GET /return ────│                     │
   │── Success page ────►│                    │                     │
```

The **webhook** is the authoritative path for marking an order as paid. The browser return URL provides immediate UX feedback but may arrive before or after the webhook.

---

## 7. Security and compliance posture

### 7.1 Authentication model

| Mechanism | Detail |
|-----------|--------|
| **Session tokens** | JWT stored in HttpOnly cookie (`pt_session`); not accessible to JavaScript |
| **Refresh tokens** | Separate HttpOnly cookie (`pt_refresh`); 30-day rotation via `POST /api/auth/refresh` |
| **Local auth** | bcrypt password hashing; account lockout after failed attempts |
| **PayToday auth** | Keycloak Resource Owner Password Credentials (ROPC) grant — executed server-side only; realm secrets never reach the browser |
| **Guest sessions** | Anonymous cart via session cookie; merges into user cart on login |

### 7.2 Authorization

| Layer | Mechanism |
|-------|-----------|
| **Route guards (SPA)** | `RequireAdminStaff` checks role before rendering admin pages |
| **API middleware** | `requireAuth` + `requireRole('admin', 'ops', 'fulfillment')` on admin routes |
| **Fine-grained RBAC** | Database-backed permissions with audit log for admin operations |
| **Ownership checks** | Customer routes verify order/address ownership before mutation |

### 7.3 Security controls

| Control | Implementation |
|---------|----------------|
| **CSRF protection** | Double-submit cookie pattern: `pt_csrf` cookie + `X-CSRF-Token` header on all mutating requests |
| **HTTP security headers** | Helmet middleware (default secure headers) |
| **CORS** | Configurable allowed origins with credentials support |
| **Webhook verification** | HMAC-SHA256 signature validation on PayToday webhooks |
| **Input validation** | Server-side validators for email, slugs, SKUs, monetary amounts |
| **Pickup code security** | Hashed at rest; single-use enforcement; configurable TTL |
| **Proxy trust** | `TRUST_PROXY` for correct client IP behind Nginx |
| **Production binding** | API listens on loopback only (`127.0.0.1`) |

### 7.4 PCI DSS considerations

Payment card data is **never handled by AvoToday**. All card entry occurs on PayToday-hosted payment pages. The platform stores only order references, payment status, and webhook event records. A security blueprint with PCI DSS mapping is available under `docs/NEW MDS/security-blueprint/`.

### 7.5 Data privacy

- Customer PII (name, email, phone, addresses) stored in SQL Server
- Passwords hashed with bcrypt; never stored in plaintext
- Refresh tokens stored as hashes in `user_refresh_tokens`
- Account deletion UI present; backend deletion workflow should be confirmed for production GDPR/POPIA compliance

---

## 8. Third-party integrations

| Integration | Purpose | Configuration |
|-------------|---------|---------------|
| **PayToday Payment Intent** | Hosted checkout, payment confirmation | `PAYTODAY_*` env vars + `integration_settings` table |
| **PayToday Webhooks** | Async payment status (paid/failed/cancelled) | `PAYTODAY_WEBHOOK_SECRET` |
| **PayToday Notify** | Transactional email delivery | `NOTIFY_SERVICE_*` env vars |
| **Keycloak** | PayToday-branded customer sign-in | `KEYCLOAK_*` env vars |
| **SMTP (nodemailer)** | Fallback email when Notify unavailable | `SMTP_*` env vars |
| **Yango** | Optional courier dispatch and status | `YANGO_*` env vars |
| **Nedbank Finance** | External finance application link | `NEDBANK_FINANCE_URL` |
| **Google Maps** | Address map picker (optional) | `VITE_GOOGLE_MAPS_API_KEY` |

**Configuration priority:** Non-empty values in the `dbo.integration_settings` database table override environment variables, unless `INTEGRATION_USE_ENV_ONLY=true`.

---

## 9. Business rules and domain logic

### 9.1 Pricing and tax

- Catalogue prices are **VAT-inclusive** by default
- VAT rate configurable via `VAT_RATE_BPS` (basis points; e.g., 1500 = 15%)
- Order line prices are **snapshotted at checkout** — subsequent catalogue price changes do not affect pending orders

### 9.2 Shipping

- Flat-rate shipping via `SHIPPING_FLAT_CENTS` (default: free)
- Free shipping threshold via `SHIPPING_FREE_SUBTOTAL_CENTS`
- Express shipping rate via `SHIPPING_EXPRESS_CENTS`
- Admin-configurable shipping zones and home-delivery areas

### 9.3 Inventory

- Stock validated at checkout order creation
- **Deduction occurs on successful payment** (webhook or return URL confirmation)
- Low-stock alerts visible in admin dashboard
- **v1 note:** Stock is reserved at checkout (order creation in `pending_payment`), which differs from the recommended "reserve at payment" pattern — see Phase 2

### 9.4 Order lifecycle

| Status | Description |
|--------|-------------|
| `pending_payment` | Order created, awaiting payment |
| `paid` | Payment confirmed |
| `processing` | Fulfillment started (picking/packing) |
| `shipped` | Dispatched |
| `delivered` | Completed |
| `cancelled` | Cancelled (manual or timeout) |
| `refunded` | Refund processed |

Pending payment orders older than 24 hours should be cancelled by a scheduled job (manual admin cancel available in v1).

### 9.5 Deposit box pickup

- Customer selects a deposit location at checkout
- Staff assigns a specific box during fulfillment
- Pickup code generated with configurable TTL (default: 48 hours via `PICKUP_CODE_TTL_HOURS`)
- Codes hashed at rest; plaintext shown once at allocation; single-use enforcement

### 9.6 Alcohol and age gating

- Products flagged `contains_alcohol` in catalogue
- When `LIQUOR_GATING_ENABLED`: hidden from anonymous users and under-18 customers
- Checkout requires signed-in user with DOB proving age ≥ 18
- Liquor sale window enforced via merchant operating hours
- **Compliance note:** Self-reported DOB is UX gating only, not legal ID verification

### 9.7 Returns

- Configurable return window via `STORE_RETURN_WINDOW_DAYS`
- Customer-initiated return requests with line-item selection
- Admin return case workflow with status tracking

### 9.8 Notifications

- User preference: `email`, `in_app`, or `both`
- Guests receive email notifications when an address is provided
- Background worker processes `notification_outbox` every 15 seconds

---

## 10. Deployment and operations

### 10.1 Production topology

| Component | Hosting | Access |
|-----------|---------|--------|
| **Nginx** | Public VM | `avotoday.today-ww.net` — sole public entry point |
| **Frontend (SPA)** | Static files at `/var/www/avotoday-frontend/current/dist/` | Served by Nginx |
| **Backend (API)** | PM2 process `avotoday-backend` at `/var/www/avotoday-backend/current` | Loopback `127.0.0.1:4000` only |
| **Database** | Microsoft SQL Server | Private network access from API |

### 10.2 Deployment process

Deployments are **independent** for frontend and backend:

| Package | Script | Process |
|---------|--------|---------|
| **Backend** | `deploy/avotoday-backend-production.ps1` | Build TypeScript → tarball → SCP → `npm ci --omit=dev` → PM2 restart → health check |
| **Frontend** | `deploy/avotoday-frontend-production.ps1` | Build Vite → tarball `dist/` → SCP → atomic symlink swap |

Nginx configuration (`deploy/nginx/avotoday-split.conf`):
- `/api/*` → proxy to `127.0.0.1:4000`
- All other paths → SPA `index.html` (client-side routing)

### 10.3 Local development

**Prerequisites:** Node.js 20+, Docker (for SQL Server), or existing MS SQL instance.

**Quick start (two terminals):**

```bash
# Terminal 1 — Backend
cd backend
docker compose up -d
cp .env.example .env    # Set SQL_CONNECTION_STRING + JWT_SECRET
npm install
npm run db:demo-setup
npm run dev             # http://0.0.0.0:4000

# Terminal 2 — Frontend
cd frontend
cp .env.example .env
npm install
npm run dev             # http://localhost:5173 (proxies /api to backend)
```

**Demo credentials:** `demo@paytoday.local` / `PayToday123!`

Alternatively, from the repository root:

```bash
npm run dev    # Starts both API and web concurrently
```

### 10.4 Environment configuration

| Category | Key variables |
|----------|----------------|
| **Process** | `PORT`, `NODE_ENV`, `BIND_HOST`, `CORS_ORIGINS` |
| **Database** | `SQL_CONNECTION_STRING` |
| **Session** | `JWT_SECRET`, `AUTH_COOKIE_NAME`, `COOKIE_SAME_SITE` |
| **Public URLs** | `PUBLIC_STORE_URL`, `PUBLIC_API_URL` |
| **PayToday** | `PAYTODAY_*`, `PAYTODAY_WEBHOOK_SECRET` |
| **Keycloak** | `KEYCLOAK_BASE_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET` |
| **Email** | `NOTIFY_SERVICE_*`, `SMTP_*`, `NOTIFICATION_EMAIL_FROM` |
| **Business rules** | `VAT_RATE_BPS`, `SHIPPING_FLAT_CENTS`, `STORE_RETURN_WINDOW_DAYS`, `LIQUOR_GATING_ENABLED` |

Full variable reference: `backend/.env.example` and `docs/DEPLOY.md`.

### 10.5 Database operations

| Command | Purpose |
|---------|---------|
| `npm run db:demo-setup` | Full demo database with seed data |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:prepare` | Create database if not exists |
| `npm run db:smoke-checkout` | Smoke test checkout aggregate |
| `npm run db:smoke-payment-plan` | Smoke test payment plan aggregate |

---

## 11. Development status and scope honesty

This section provides transparent status reporting aligned with `docs/SCOPE_ALIGNMENT.md` and `docs/SCOPE_ACCEPTANCE_TRACEABILITY.md`.

### 11.1 Fully implemented (production-ready with configuration)

- Product catalogue with variants, images, and promotions
- Server-backed shopping cart with guest and authenticated sessions
- Checkout with shipping, VAT, discount codes, deposit pickup, and home delivery
- PayToday payment intent integration with webhook confirmation
- Order lifecycle management (create → pay → fulfill → deliver)
- Fulfillment stage management with pickup code generation
- Admin console (products, categories, inventory, orders, fulfillment, deposits)
- Customer authentication (local + optional Keycloak)
- Returns, disputes, and order reviews
- Notification system (in-app + email)
- RBAC for fine-grained admin permissions
- Alcohol/liquor gating
- Instalment payment plans
- Embed mode for partner iframes

### 11.2 Partially implemented or demo-mode

| Feature | Current state |
|---------|---------------|
| **Demo wallet** | Functional ledger with fund/add; not connected to real PayToday wallet |
| **Bill pay / services hub** | Demo payment gateway messaging; not live biller integration |
| **Scan & pay** | QR generation and demo scanner; not connected to live PayToday scan API |
| **Finance applications** | External Nedbank URL link; no in-platform application workflow |
| **Yango courier** | Demo integration with optional webhook; not production courier dispatch |
| **Cards & bank onboarding** | UI flows present; no real payment method tokenisation |
| **Revenue dashboard** | Admin overview shows operational stats; no revenue/sales summary charts |

### 11.3 UI-only / not yet connected to backend

| Feature | Current state |
|---------|---------------|
| **Classifieds** | Full UI with client-side mock data; no API |
| **Wallet: request payment** | Placeholder page |
| **Wallet: cash-out** | Placeholder page |
| **Onboarding: add card/bank** | Demo UI flows |

### 11.4 Known v1 scope differences

| Topic | Scope recommendation | v1 implementation |
|-------|---------------------|-------------------|
| Stock reservation | Reserve at payment confirmation | Reserved at checkout (order creation) |
| Revenue dashboard | Sales/revenue summary | Not implemented (Phase 2) |
| Pending payment expiry | Automated cancellation job | Manual admin cancel available |

---

## 12. Quality assurance and testing

### 12.1 Automated tests

| Suite | Coverage |
|-------|----------|
| `tests/api.smoke.test.ts` | Health, CSRF, storefront, Keycloak status, payment return redirects, webhook deduplication |
| `tests/api.validation.test.ts` | Login/register validation, admin product validation |
| `tests/inputValidators.test.ts` | Email, slug, SKU, image URL, monetary parsers |
| `tests/simpleCsv.test.ts` | Product bulk CSV import parsing |

Tests run via Vitest (`npm test` in backend). No SQL connection required by default in test mode.

### 12.2 Manual testing resources

| Document | Purpose |
|----------|---------|
| `docs/UAT_CHECKLIST.md` | User acceptance testing checklist |
| `docs/PAYTODAY_E2E_SMOKE.md` | End-to-end payment smoke test guide |
| `docs/SECURITY_CHECKLIST.md` | Security review checklist |
| `docs/INTEGRATION_CHECKLIST.md` | Third-party integration verification |

### 12.3 Database smoke scripts

- `npm run db:smoke-checkout` — Validates checkout aggregate logic against live database
- `npm run db:smoke-payment-plan` — Validates instalment plan aggregate logic

### 12.4 Product detail tab content

Storefront product pages show five text tabs: **Description**, **Delivery information**, **Return policy**, **Warranty info**, and **What's in the box**. Values live on `dbo.products` (`description`, `delivery_information`, `return_policy`, `warranty_info`, `whats_in_the_box`) after migration `081_product_detail_tab_content.sql`.

- **Admin** — Edit all five fields under **Product page tabs** when creating or editing a product (`/admin/products`).
- **CSV import** — Optional columns: `delivery_information`, `return_policy`, `warranty_info`, `whats_in_the_box` (see `frontend/public/templates/store-catalog-bulk-import-template.csv`).
- **Backfill existing catalogue** (from `backend/`): `npm run db:migrate` then `npm run db:backfill-product-tabs` (add `--dry-run`, `--slug=…`, or `--limit=N`).

---

## 13. Roadmap and phase 2 items

Based on scope alignment and acceptance traceability documents:

| Item | Description | Priority |
|------|-------------|----------|
| **Stock reservation at payment** | Defer inventory reservation until payment confirmation; requires oversell analysis | High |
| **Revenue / sales dashboard** | Admin dashboard with revenue charts and sales summaries | Medium |
| **Automated pending payment expiry** | Scheduled job to cancel stale `pending_payment` orders | Medium |
| **Classifieds backend** | API and database for real classified listings | Medium |
| **Live wallet integration** | Connect to real PayToday wallet instead of demo ledger | High |
| **Live bill pay integration** | Real biller connections for services/payments hub | High |
| **Scan & pay production** | Connect to PayToday scan API | Medium |
| **Payment method tokenisation** | Real card/bank linking in onboarding | Medium |
| **KYC / age verification** | Third-party identity verification for regulatory compliance | As required |
| **Weight/zone shipping matrix** | Replace flat-rate shipping with configurable zones | Low |
| **Multi-store expansion** | Multiple merchant storefronts from single deployment | Future |

---

## 14. Appendices

### Appendix A — Documentation index

| Document | Audience | Purpose |
|----------|----------|---------|
| `docs/PROJECT_HANDBOOK.md` | All | Technical map of the platform |
| `docs/DEPLOY.md` | Ops, engineering | Deployment and environment guide |
| `docs/BUSINESS_RULES.md` | Product, engineering | Domain business rules |
| `docs/SCOPE_ALIGNMENT.md` | Product | Scope vs implementation reconciliation |
| `docs/SCOPE_ACCEPTANCE_TRACEABILITY.md` | QA, product | Acceptance criteria mapping |
| `docs/KEYCLOAK_AUTH_MODEL.md` | Engineering, security | Authentication architecture |
| `docs/PAYTODAY_PAYMENT_INTENT.md` | Engineering | Payment integration specification |
| `docs/SECURITY_CHECKLIST.md` | Security | Security review checklist |
| `docs/UAT_CHECKLIST.md` | QA | User acceptance testing |
| `docs/EMBED.md` | Engineering, partners | Embed mode documentation |
| `docs/NEW MDS/security-blueprint/` | Security, compliance | PCI DSS and threat model |

### Appendix B — Demo access

| Context | Credentials / URL |
|---------|-------------------|
| **Local frontend** | `http://localhost:5173` |
| **Local backend** | `http://localhost:4000/api/health` |
| **Demo customer login** | `demo@paytoday.local` / `PayToday123!` |
| **Production** | `https://avotoday.today-ww.net` |

### Appendix C — Glossary

| Term | Definition |
|------|------------|
| **BFF** | Backend-for-Frontend — API layer that orchestrates third-party services without exposing secrets to the browser |
| **CSRF** | Cross-Site Request Forgery — mitigated via double-submit cookie pattern |
| **Deposit box** | Physical locker for customer order pickup |
| **Fulfillment task** | Order processing workflow (picking → packing → packed → shipped) |
| **Payment intent** | PayToday API call that creates a hosted payment session |
| **Pickup code** | Time-limited, single-use code for deposit box access |
| **ROPC** | Resource Owner Password Credentials — Keycloak grant type used server-side |
| **SPA** | Single-Page Application — client-side routed web app |
| **Webhook** | Server-to-server HTTP callback for async event notification (e.g., payment confirmation) |

### Appendix D — Contact and support

For technical questions about this platform, refer to the documentation index in Appendix A or contact the development team responsible for the AvoToday / PayToday Store repository.

---

*This document was generated from a comprehensive analysis of the AvoToday / PayToday Store codebase, documentation, and deployment configuration. It reflects the state of the repository as of May 2026.*
