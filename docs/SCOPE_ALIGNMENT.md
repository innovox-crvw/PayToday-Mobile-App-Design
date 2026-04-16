# Alignment: scope document vs this repository

This file is the working reconciliation between the PayToday Store scope document and the code in this repo. The Word scope file itself is not edited here; PMs can diff this markdown against the proposal.

## Order lifecycle / `orders.status`

- Persisted values use **snake_case** (`pending_payment`, `paid`, `processing`, `shipped`, `delivered`, …).
- **Processing:** when payment is captured, the order becomes `paid` and `fulfillment_tasks.stage` is set to **`pending`**. The order moves to **`processing`** when fulfillment advances the task to **`picking`**, **`packing`**, or **`packed`** (see `PATCH /api/fulfillment/orders/:orderId/stage`).
- Customer and admin UIs may show **Title Case** labels via `formatOrderStatusLabel` in the frontend; API payloads stay unchanged.

## Stock reservation timing

- **Scope (recommended):** reserve stock at **payment confirmation**.
- **v1 implementation:** inventory is **reserved at checkout** (order creation in `pending_payment`) and released on cancel/timeout paths as implemented in `orderService`. This matches the current PayToday redirect flow but differs from the scope recommendation.
- **Phase 2 (behaviour change):** deferring reservation until `confirmOrderPaid` (or adding short-lived holds) requires product sign-off, oversell analysis, and tests—see the implementation plan; not part of the initial alignment pass.

## Pickup codes (deposit boxes)

- Codes are **hashed at rest**; the API returns the plaintext once when allocated.
- **`used_at`** / verification flows enforce **single use** where implemented in `orders` pickup routes.
- **Expiry:** `expires_at` is set when the code is allocated. TTL defaults to **48 hours** and is configurable with **`PICKUP_CODE_TTL_HOURS`** (fractional hours allowed, e.g. `0.5` for ~30 minutes). See `depositService.allocatePickupCode` and `backend/src/config/env.ts`.

## Bulk inventory CSV

- Documented in [`docs/INVENTORY_CSV.md`](INVENTORY_CSV.md). Implemented at `POST /api/fulfillment/inventory/csv` for `admin` / `ops`.

## TypeORM

- Documented in [`docs/ARCHITECTURE_DATA_LAYER.md`](ARCHITECTURE_DATA_LAYER.md).

## Admin dashboard

- **Low stock:** `GET /api/admin/inventory/low-stock` and the admin home overview.
- **Revenue / sales summary:** not part of v1 in this repo; tracked as **phase 2** in [`docs/SCOPE_ACCEPTANCE_TRACEABILITY.md`](SCOPE_ACCEPTANCE_TRACEABILITY.md).
