# Embedded storefront (PayToday App)

## Routes

- `/embed` redirects to `/embed/shop`.
- `/embed/shop`, `/embed/shop/:slug`, `/embed/cart`, `/embed/checkout`, `/embed/account` — same storefront as the public site, using the shared `StoreLayout` with the `/embed` path prefix (the **Admin** link is hidden in this mode).

## Requirements

1. **Same API origin** as the web app, or configure the WebView base URL so `fetch('/api/...', { credentials: 'include' })` hits the Store API.
2. **CORS**: add the App WebView origin to `CORS_ORIGINS` on the API.
3. **Cookies**: if the WebView host is a third-party context, production must use `SameSite=None; Secure` on `pt_session` and `pt_cart_session` (update cookie options in server auth/cart routes when deploying embed).

## PostMessage (optional)

If the host needs checkout completion callbacks, extend `CheckoutPage` to `window.parent.postMessage({ type: 'paytoday-store:checkout', orderId }, trustedOrigin)` after redirect return.
