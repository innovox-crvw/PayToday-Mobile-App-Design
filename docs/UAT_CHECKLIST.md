# PayToday Store — UAT sign-off (v1)

Use this list for client acceptance. **Lending / BNPL** is out of scope for v1.

| # | Criterion | Pass / fail | Notes |
|---|-----------|---------------|-------|
| 1 | Browse categories/products; open product detail; select variant where applicable | | |
| 2 | Add to cart; update quantities; cart persists (guest session / logged-in merge) | | |
| 3 | Checkout: home delivery requires saved address when signed in; deposit option available | | |
| 4 | Order totals show subtotal, shipping, tax (per env rules) | | |
| 5 | Double-submit / replay: same `Idempotency-Key` does not create duplicate orders | | |
| 6 | PayToday redirect (or demo complete page when Forms URL unset) | | |
| 7 | **Return URL** after payment marks order paid (or no-op if webhook already did) — idempotent | | |
| 8 | **Webhook** with same payment marks paid once — duplicate events return 200 without double stock move | | |
| 9 | Customer **My orders** and order detail; guest **Track order** with email | | |
|10 | Pickup: masked code policy; customer can submit pickup verify when eligible | | |
|11 | Admin: product/catalogue management (existing) | | |
|12 | Admin: **Orders** list, filter, cancel (pre-ship), refund flag | | |
|13 | Admin: **Fulfillment** stages picking → packing → packed → shipped → delivered | | |
|14 | Admin: deposit boxes and allocation (existing flows) | | |
|15 | Admin: **Returns** queue; approve restocks line items | | |
|16 | Notifications: user **notification channel** (Account); outbox processed by worker | | |
|17 | Auth: session refresh extends access token without full re-login (when refresh cookie present) | | |
|18 | RBAC: customer cannot hit admin APIs; staff roles can per route rules | | |

**Sign-off**

- Client name / role: _________________ Date: _________  
- Vendor name / role: _________________ Date: _________  
