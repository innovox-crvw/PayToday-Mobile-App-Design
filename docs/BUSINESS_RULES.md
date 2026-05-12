# Business rules — PayToday Store v1

Single-store deployment. Values below are **defaults** until the client signs off in discovery.

## Tax (VAT)

- **Default:** VAT-inclusive display (prices in catalogue include VAT). Server stores `unit_price_cents` as charged.
- **Configurable:** Set `VAT_RATE_BPS` (basis points, e.g. `1500` = 15%) in environment when item prices are ex-VAT and checkout must add tax. Implementation reads this in checkout to populate `tax_cents` on orders.

## Shipping

- **Default:** Flat rate `SHIPPING_FLAT_CENTS` (default `0`) added at checkout for `home` delivery.
- **Future:** Replace with weight/zone matrix via admin configuration.

## Cart and pricing

- **Price snapshot:** `order_lines.unit_price_cents` is fixed at checkout.
- **Price drift:** If catalogue price changes after checkout start, the pending order keeps snapshot values; new checkouts use current prices.

## Inventory

- **v1 policy:** Stock is validated at checkout; **deduction occurs on successful payment** (webhook or return URL), not when the order is created. Concurrent last-unit purchases may fail payment-side if stock is exhausted.

## Deposit boxes

- Customer selects a **location** at checkout; staff assigns a **box** at fulfillment. If no capacity, staff reassigns or contacts the customer (operational process).
- **Store hours vs deposit points:** Pickup locations (`deposit_locations`) do **not** automatically inherit `merchant_operating_hours`. If a deposit point has its own opening rules, model them on the location or in ops documentation; otherwise customers see the store’s general hours from the merchant hours API only on the main storefront.

## Liquor and age (self-reported DOB)

- **Catalogue:** Products may be flagged `contains_alcohol`. When `LIQUOR_GATING_ENABLED` is true, the API hides alcohol from anonymous sessions and from signed-in customers who are not 18+ by date of birth on their profile.
- **Checkout:** Alcohol lines require a signed-in user with `date_of_birth` proving age ≥ 18, and (when configured) must fall inside the merchant’s **liquor** sale window in `merchant_operating_hours`.
- **Compliance:** Self-reported date of birth is **not** legal ID verification. The system is suitable for UX and basic policy gating only; add KYC or third-party age checks if regulations require them.

## Pending payment expiry

- Orders in `pending_payment` older than **24 hours** should be cancelled by a scheduled job (optional v1: manual admin cancel). Reservation rows are not used in the payment-time deduction model.

## Notification channel

- Users have `notification_channel` on `users`: `email`, `in_app`, or `both`. Guests always use email when an address is provided.
