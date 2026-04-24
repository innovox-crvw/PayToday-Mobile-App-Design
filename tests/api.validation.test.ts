import jwt from 'jsonwebtoken'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../backend/src/app.js'
import { env } from '../backend/src/config/env.js'
import { clearWebhookIdempotencyForTests } from '../backend/src/routes/webhooks/paytoday.js'

describe('API validation (400 + field)', () => {
  const app = createApp()

  afterEach(() => {
    clearWebhookIdempotencyForTests()
  })

  it('POST /api/auth/login rejects invalid email before DB', async () => {
    const agent = request.agent(app)
    const csrf = await agent.get('/api/csrf')
    const token = csrf.body.csrfToken as string
    const res = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', token)
      .send({ email: 'not-an-email', password: 'password123' })
    expect(res.status).toBe(400)
    expect(res.body.field).toBe('email')
    expect(res.body.code).toBe('validation_error')
  })

  it('POST /api/admin/products rejects bad slug and bad imageUrl when SQL available', async () => {
    const health = await request(app).get('/api/health')
    if (health.body.database !== 'connected') {
      return
    }
    const agent = request.agent(app)
    const csrf = await agent.get('/api/csrf')
    const csrfToken = csrf.body.csrfToken as string
    const access = jwt.sign(
      { sub: '00000000-0000-4000-8000-00000000aa01', email: 'val-test-admin@example.com', role: 'admin' },
      env.jwtSecret,
    )
    const badSlug = await agent
      .post('/api/admin/products')
      .set('X-CSRF-Token', csrfToken)
      .set('Cookie', [`${env.cookieName}=${access}`])
      .send({
        slug: 'Invalid_Slug',
        name: 'Test product',
        sku: 'SKUVAL1',
        priceCents: 100,
        initialStock: 0,
        currency: 'NAD',
      })
    expect(badSlug.status).toBe(400)
    expect(badSlug.body.field).toBe('slug')
    expect(badSlug.body.code).toBe('validation_error')

    const badImg = await agent
      .post('/api/admin/products')
      .set('X-CSRF-Token', csrfToken)
      .set('Cookie', [`${env.cookieName}=${access}`])
      .send({
        slug: `valid-slug-val-test-${Date.now()}`,
        name: 'Test product 2',
        sku: 'SKUVAL2',
        priceCents: 100,
        initialStock: 0,
        currency: 'NAD',
        imageUrl: 'data:text/html,<script>x</script>',
      })
    expect(badImg.status).toBe(400)
    expect(badImg.body.field).toBe('imageUrl')
  })

  it('POST /api/auth/register rejects invalid email when database is connected', async () => {
    const health = await request(app).get('/api/health')
    if (health.body.database !== 'connected') {
      return
    }
    const agent = request.agent(app)
    const csrf = await agent.get('/api/csrf')
    const token = csrf.body.csrfToken as string
    const res = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', token)
      .send({ email: '@@@', password: 'password123', fullName: 'x' })
    expect(res.status).toBe(400)
    expect(res.body.field).toBe('email')
  })
})
