import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { env } from '../src/config/env.js'
import { clearWebhookIdempotencyForTests } from '../src/routes/webhooks/paytoday.js'

describe('PayToday Store API', () => {
  const app = createApp()

  afterEach(() => {
    clearWebhookIdempotencyForTests()
  })

  it('GET /api/health', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(['off', 'connected', 'unreachable']).toContain(res.body.database)
  })

  it('GET /api/csrf', async () => {
    const res = await request(app).get('/api/csrf')
    expect(res.status).toBe(200)
    expect(res.body.csrfToken).toBeTruthy()
  })

  it('GET /api/storefront-config includes checkoutRequireSignIn', async () => {
    const res = await request(app).get('/api/storefront-config')
    expect(res.status).toBe(200)
    expect(typeof res.body.checkoutRequireSignIn).toBe('boolean')
    expect(typeof res.body.nedbankFinanceUrl).toBe('string')
    expect(res.body.nedbankFinanceUrl).toMatch(/^https:\/\//u)
  })

  it('GET /api/storefront/popular-stores returns items array and days', async () => {
    const res = await request(app).get('/api/storefront/popular-stores').query({ days: 30, limit: 5 })
    expect(res.status).toBe(200)
    expect(['database', 'off', 'error']).toContain(res.body.source)
    expect(typeof res.body.days).toBe('number')
    expect(Array.isArray(res.body.items)).toBe(true)
  })

  it('GET /api/auth/keycloak/status returns paytodaySignInEnabled + localPasswordLoginAllowed booleans', async () => {
    const res = await request(app).get('/api/auth/keycloak/status')
    expect(res.status).toBe(200)
    expect(typeof res.body.paytodaySignInEnabled).toBe('boolean')
    expect(typeof res.body.localPasswordLoginAllowed).toBe('boolean')
  })

  it('GET /api/auth/public-config returns JSON (no secrets)', async () => {
    const res = await request(app).get('/api/auth/public-config')
    expect(res.status).toBe(200)
    expect(res.body).toBeTypeOf('object')
  })

  it('POST /api/auth/login with authSource paytoday returns 400 when Keycloak unconfigured', async () => {
    const prev = {
      baseUrl: env.keycloakBaseUrl,
      realm: env.keycloakRealm,
      clientId: env.keycloakClientId,
    }
    env.keycloakBaseUrl = ''
    env.keycloakRealm = ''
    env.keycloakClientId = ''
    try {
      const agent = request.agent(app)
      const csrf = await agent.get('/api/csrf')
      const token = csrf.body.csrfToken as string
      const res = await agent
        .post('/api/auth/login')
        .set('X-CSRF-Token', token)
        .send({ email: 'u@example.com', password: 'x', authSource: 'paytoday' })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('paytoday_login_failed')
    } finally {
      env.keycloakBaseUrl = prev.baseUrl
      env.keycloakRealm = prev.realm
      env.keycloakClientId = prev.clientId
    }
  })

  it('GET /api/auth/keycloak/routes lists Keycloak auth endpoints', async () => {
    const res = await request(app).get('/api/auth/keycloak/routes')
    expect(res.status).toBe(200)
    expect(res.body.documentationFile).toBe('docs/KEYCLOAK_API.md')
    expect(Array.isArray(res.body.endpoints)).toBe(true)
    expect(res.body.endpoints.length).toBeGreaterThanOrEqual(4)
    expect(res.body.endpoints.some((e: { path?: string }) => e.path?.endsWith('/keycloak/status'))).toBe(true)
  })

  it('GET /api/auth/keycloak/start is 404 (PKCE front-channel removed)', async () => {
    const res = await request(app).get('/api/auth/keycloak/start')
    expect(res.status).toBe(404)
  })

  it('POST /api/auth/keycloak/callback is 404 (PKCE front-channel removed)', async () => {
    const agent = request.agent(app)
    const csrf = await agent.get('/api/csrf')
    const token = csrf.body.csrfToken as string
    const res = await agent
      .post('/api/auth/keycloak/callback')
      .set('X-CSRF-Token', token)
      .send({ code: 'x', redirect_uri: 'https://example.com/cb', code_verifier: 'x', state: 'x' })
    expect(res.status).toBe(404)
  })

  it('GET /api/auth/keycloak/status does not expose legacy fields', async () => {
    const res = await request(app).get('/api/auth/keycloak/status')
    expect(res.status).toBe(200)
    expect(res.body.enabled).toBeUndefined()
    expect(res.body.keycloakOnly).toBeUndefined()
    expect(res.body.keycloakReady).toBeUndefined()
    expect(res.body.ropcLoginEnabled).toBeUndefined()
    expect(res.body.clientId).toBeUndefined()
  })

  it('GET /api/payments/return redirects to storefront success (no SQL: demo path)', async () => {
    const orderId = '00000000-0000-4000-8000-000000000001'
    const res = await request(app).get('/api/payments/return').query({ orderId, status: 'success' })
    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('/checkout/success')
    expect(res.headers.location).toContain(encodeURIComponent(orderId))
    expect(res.headers.location).toContain('awaitingWebhook=1')
  })

  it('GET /api/payments/return derives orderId from PTSTORE- reference when orderId omitted', async () => {
    const orderId = '00000000-0000-4000-8000-000000000003'
    const res = await request(app)
      .get('/api/payments/return')
      .query({ reference: `PTSTORE-${orderId}`, status: 'success' })
    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('/checkout/success')
    expect(res.headers.location).toContain(encodeURIComponent(orderId))
    expect(res.headers.location).toContain('awaitingWebhook=1')
  })

  it('POST /api/webhooks/paytoday accepts signed body and dedupes by event id (no SQL)', async () => {
    const body = JSON.stringify({
      eventId: 'evt-smoke-1',
      orderId: '00000000-0000-4000-8000-000000000002',
      status: 'paid',
    })
    const r1 = await request(app)
      .post('/api/webhooks/paytoday')
      .set('Content-Type', 'application/json')
      .send(body)
    expect(r1.status).toBe(200)
    expect(r1.body.duplicate).toBeFalsy()

    const r2 = await request(app)
      .post('/api/webhooks/paytoday')
      .set('Content-Type', 'application/json')
      .send(body)
    expect(r2.status).toBe(200)
    expect(r2.body.duplicate).toBe(true)
  })
})
