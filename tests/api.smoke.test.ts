import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../backend/src/app.js'
import { clearWebhookIdempotencyForTests } from '../backend/src/routes/webhooks/paytoday.js'

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
  })

  it('GET /api/auth/keycloak/status includes ropcLoginEnabled boolean', async () => {
    const res = await request(app).get('/api/auth/keycloak/status')
    expect(res.status).toBe(200)
    expect(typeof res.body.ropcLoginEnabled).toBe('boolean')
    expect(typeof res.body.localPasswordLoginAllowed).toBe('boolean')
  })

  it('GET /api/auth/public-config returns JSON (no secrets)', async () => {
    const res = await request(app).get('/api/auth/public-config')
    expect(res.status).toBe(200)
    expect(res.body).toBeTypeOf('object')
  })

  it('POST /api/auth/login with authSource paytoday returns 400 when ROPC disabled', async () => {
    const agent = request.agent(app)
    const csrf = await agent.get('/api/csrf')
    const token = csrf.body.csrfToken as string
    const res = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', token)
      .send({ email: 'u@example.com', password: 'x', authSource: 'paytoday' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('paytoday_login_failed')
  })

  it('GET /api/auth/keycloak/routes lists Keycloak auth endpoints', async () => {
    const res = await request(app).get('/api/auth/keycloak/routes')
    expect(res.status).toBe(200)
    expect(res.body.documentationFile).toBe('docs/KEYCLOAK_API.md')
    expect(Array.isArray(res.body.endpoints)).toBe(true)
    expect(res.body.endpoints.length).toBeGreaterThanOrEqual(4)
    expect(res.body.endpoints.some((e: { path?: string }) => e.path?.endsWith('/keycloak/status'))).toBe(true)
  })

  it('POST /api/auth/keycloak/ro-password is 404 when ROPC disabled', async () => {
    const agent = request.agent(app)
    const csrf = await agent.get('/api/csrf')
    const token = csrf.body.csrfToken as string
    const res = await agent
      .post('/api/auth/keycloak/ro-password')
      .set('X-CSRF-Token', token)
      .send({ username: 'u@example.com', password: 'secret' })
    expect(res.status).toBe(404)
  })

  it('GET /api/payments/return redirects to storefront success (no SQL: demo path)', async () => {
    const orderId = '00000000-0000-4000-8000-000000000001'
    const res = await request(app).get('/api/payments/return').query({ orderId, status: 'success' })
    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('/checkout/success')
    expect(res.headers.location).toContain(encodeURIComponent(orderId))
  })

  it('GET /api/payments/return derives orderId from PTSTORE- reference when orderId omitted', async () => {
    const orderId = '00000000-0000-4000-8000-000000000003'
    const res = await request(app)
      .get('/api/payments/return')
      .query({ reference: `PTSTORE-${orderId}`, status: 'success' })
    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('/checkout/success')
    expect(res.headers.location).toContain(encodeURIComponent(orderId))
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
