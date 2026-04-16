# Security checklist — PayToday Store (production)

- [ ] `NODE_ENV=production`
- [ ] Strong random `JWT_SECRET` (not committed; use secret manager in prod)
- [ ] Strong `PAYTODAY_WEBHOOK_SECRET`; webhook rejects invalid HMAC
- [ ] `ALLOW_DEV_ROLE_HEADER` unset or `false`
- [ ] TLS everywhere; cookies `secure: true` (enforced when SameSite is `none`)
- [ ] `CORS_ORIGINS` lists only real storefront/admin origins
- [ ] Rate limiting on `/api/auth/*` and webhooks at reverse proxy or API gateway
- [ ] SQL connection string not logged; least-privilege DB user for app
- [ ] Admin actions audited (order cancel/refund/stage changes rely on authenticated staff)
- [ ] Dependency audit: `npm audit` / org policy
- [ ] Optional: PayToday webhook source IP allowlist if documented by PayToday
