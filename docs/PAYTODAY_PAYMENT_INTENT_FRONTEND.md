# Frontend integration — PayToday Payment Intent (this store)

PayToday’s HTML form + JavaScript integration guide describes posting JSON to:

`POST https://admin.today-ww.net/web/customs/vendor/forms/`

with fields such as `vi`, `amount`, `reference`, `business_id`, `user_email`, and `return_url`, then redirecting the browser to `payment_url`.

**This project does not call that URL from the browser.** Verification ID (`vi`) and `business_id` must stay on the server. The SPA follows the same *user flow* (submit → redirect to hosted payment → return with status), but uses a **backend-for-frontend** endpoint that already implements the official JSON contract.

## End-to-end flow

1. Customer completes checkout in the SPA (`CheckoutPage`).
2. SPA sends **`POST /api/checkout`** (JSON body, CSRF + cookies as for other mutations). See [`frontend/src/pages/store/CheckoutPage.tsx`](../frontend/src/pages/store/CheckoutPage.tsx).
3. API creates the order, then calls PayToday Payment Intent **from Node** ([`backend/src/services/paytodayForms.ts`](../backend/src/services/paytodayForms.ts)).
4. API responds with **`redirectUrl`** (= PayToday’s `payment_url`).
5. SPA sets **`window.location.href = data.redirectUrl`** (same outcome as the guide’s `fetch` + redirect, without exposing secrets).
6. After payment, PayToday redirects the browser to **`return_url`**, which is **`{PUBLIC_API_URL}/api/payments/return?...`** ([`backend/src/routes/api/paymentReturn.ts`](../backend/src/routes/api/paymentReturn.ts)). The API confirms payment when appropriate, then **302** to **`{PUBLIC_STORE_URL}/checkout/success?orderId=...`** or **`/checkout/failure`**.

So the “return page” in the guide maps to **`/checkout/success`** (or failure) in this SPA, not a raw `return_url` on the SPA origin. Query parameters on the API return handler include PayToday’s `status` and optional `payment_intent_token`; the API resolves `orderId` and strips sensitive details before the storefront URL.

## SPA checklist (equivalent to the official guide)

| Official guide step | In this repo |
|---------------------|--------------|
| Form with `vi`, `business_id`, etc. | **Do not.** Only send checkout fields your store needs (delivery, email, optional guest name/phone). |
| `e.preventDefault()` + `fetch` to PayToday | Use **`fetch('/api/checkout', { method: 'POST', ... })`** with **`credentials: 'include'`** and CSRF (see [`frontend/src/api/client.ts`](../frontend/src/api/client.ts)). |
| `amount` as float | Server computes amount from the cart **after** creating the order; the client must not set the payable total. |
| `reference` | Server sets `PTSTORE-{orderId}`. |
| `user_email` | From signed-in account or **`guestEmail`** on checkout. |
| `return_url` | Server builds `{PUBLIC_API_URL}/api/payments/return?reference=...&orderId=...`. |
| On success, `window.location.href = data.payment_url` | Use **`data.redirectUrl`** from **`POST /api/checkout`**. |
| Return URL: `?status=success&payment_intent_token=...` | Handled on **`GET /api/payments/return`**; token is stored when migration 007 is applied. Success/failure UX: **`/checkout/success`** / **`/checkout/failure`**. |
| Expiry (~30 minutes) | Documented by PayToday; if `payment_url` expires, customer can retry checkout (new intent) or use order recovery flows. |
| HTTPS in production | Required for **`PUBLIC_STORE_URL`** and **`PUBLIC_API_URL`**. |

## Optional payer fields (guest checkout)

When **`PAYTODAY_PAYMENT_INTENT_URL`** is set, the API forwards optional PayToday fields when present:

- **`guestFirstName`**, **`guestLastName`**, **`guestPhone`** — optional strings on **`POST /api/checkout`** (guest or signed-in; signed-in users also get **`user_first_name` / `user_last_name`** from **`users.full_name`** when available).

## Environment (server only)

| Variable | Maps to PayToday JSON |
|----------|------------------------|
| `PAYTODAY_PAYMENT_INTENT_URL` | POST target (e.g. `https://admin.today-ww.net/web/customs/vendor/forms/`) |
| `PAYTODAY_VENDOR_ID` | `vi` |
| `PAYTODAY_BUSINESS_ID` | `business_id` (integer) |
| `PUBLIC_API_URL` | Used to build `return_url` |
| `PUBLIC_STORE_URL` | Final redirect to SPA after `/api/payments/return` |

Details: [`docs/PAYTODAY_PAYMENT_INTENT.md`](PAYTODAY_PAYMENT_INTENT.md).

## Minimal fetch example (pseudo-code)

```ts
await fetchCsrfToken()
const res = await apiFetch('/api/checkout', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': idempotencyKey,
  },
  body: JSON.stringify({
    deliveryMethod: 'deposit_box',
    depositLocationId: locationId,
    guestEmail: 'customer@example.com',
    guestFirstName: 'Optional',
    guestLastName: 'Name',
    guestPhone: '+264…',
  }),
})
const data = await res.json()
if (!res.ok) throw new Error(data.error ?? 'Checkout failed')
if (data.redirectUrl) window.location.href = data.redirectUrl
```

Do **not** add a client-side `fetch` to `admin.today-ww.net` with `vi` or `business_id`.
