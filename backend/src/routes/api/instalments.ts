import { Router } from 'express'
import { columnExists } from '../../db/columnExists.js'
import { getSqlPool } from '../../db/pool.js'
import { optionalAuth, requireAuth, requireRole } from '../../middleware/auth.js'
import {
  assertPaymentPlanSchema,
  createPaymentPlanInTransaction,
  fetchPaymentPlanForOrder,
  payInstalmentWithDemoWallet,
} from '../../services/paymentPlanService.js'

/* Customer-facing: view payment plan on their own order */
export const instalmentsRouter = Router()
instalmentsRouter.use(optionalAuth)

function noPool(res: import('express').Response) {
  res.status(503).json({ error: 'Database not configured' })
}

instalmentsRouter.get('/:orderId/payment-plan', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) { noPool(res); return }
  const orderId = req.params.orderId
  const userId = req.user?.sub ?? null
  try {
    const orderCheck = await pool.request()
      .input('oid', orderId)
      .input('uid', userId)
      .query(`SELECT id FROM dbo.orders WHERE id = @oid AND (user_id = @uid OR @uid IS NULL)`)
    if (!orderCheck.recordset.length) {
      res.status(404).json({ error: 'Order not found' }); return
    }
    const plan = await fetchPaymentPlanForOrder(pool, orderId)
    res.json({ plan })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})

instalmentsRouter.post('/:orderId/payment-plan-instalments/:instalmentId/pay-with-wallet', requireAuth, async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    noPool(res)
    return
  }
  const userId = req.user!.sub
  const orderId = String(req.params.orderId)
  const instalmentId = String(req.params.instalmentId)
  try {
    const result = await payInstalmentWithDemoWallet(pool, userId, orderId, instalmentId)
    if (!result.ok) {
      const status =
        result.code === 'insufficient_funds'
          ? 400
          : result.code === 'not_found'
            ? 404
            : result.code === 'already_paid' || result.code === 'out_of_sequence'
              ? 400
              : 400
      res.status(status).json({ error: result.error, code: result.code })
      return
    }
    res.json({
      ok: true,
      walletBalanceAfterCents: result.balanceAfter,
      instalmentNumber: result.instalmentNumber,
      amountCents: result.amountCents,
      currency: result.currency,
      planCompleted: result.planCompleted,
      orderPaid: result.orderPaid,
    })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})

/* Admin: create plans and mark instalments paid */
export const adminInstalmentsRouter = Router()
adminInstalmentsRouter.use(requireAuth, requireRole('admin', 'ops'))

adminInstalmentsRouter.get('/payment-plans', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) { noPool(res); return }
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : null
  try {
    const hasInstalmentCents = await columnExists(pool, 'order_payment_plans.instalment_cents')
    const hasPlanCreated = await columnExists(pool, 'order_payment_plans.created_at')
    const instalmentCentsSql = hasInstalmentCents
      ? 'p.instalment_cents'
      : `(SELECT TOP 1 i.amount_cents FROM dbo.order_payment_plan_instalments i WHERE i.plan_id = p.id ORDER BY i.instalment_number)`
    const planCreatedSql = hasPlanCreated
      ? 'CONVERT(NVARCHAR(30), p.created_at, 127) AS created_at'
      : 'CAST(NULL AS NVARCHAR(30)) AS created_at'
    const orderBySql = hasPlanCreated ? 'ORDER BY p.created_at DESC' : 'ORDER BY p.order_id DESC'
    const r = await pool.request().input('st', statusFilter).query(`
      SELECT CAST(p.id AS NVARCHAR(36)) AS id,
        CAST(p.order_id AS NVARCHAR(36)) AS order_id,
        p.plan_type, p.total_instalments, ${instalmentCentsSql} AS instalment_cents, p.currency, p.status,
        ${planCreatedSql},
        (SELECT COUNT(1) FROM dbo.order_payment_plan_instalments i
          WHERE i.plan_id = p.id AND i.status = N'overdue') AS overdue_count,
        u.email AS customer_email
      FROM dbo.order_payment_plans p
      LEFT JOIN dbo.orders o ON o.id = p.order_id
      LEFT JOIN dbo.users u ON u.id = o.user_id
      WHERE @st IS NULL OR p.status = @st
      ${orderBySql}
    `)
    res.json({ items: r.recordset })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})

adminInstalmentsRouter.post('/orders/:orderId/payment-plan', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) { noPool(res); return }
  const { plan_type, total_instalments, instalment_cents, currency, first_due_date } = req.body as Record<string, unknown>
  if (!total_instalments || !instalment_cents || !first_due_date) {
    res.status(400).json({ error: 'total_instalments, instalment_cents, first_due_date required' }); return
  }
  const orderId = req.params.orderId
  try {
    await assertPaymentPlanSchema(pool)
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : 'Payment plan schema missing' })
    return
  }
  const tx = pool.transaction()
  await tx.begin()
  try {
    const totalInst = Number(total_instalments)
    const perInst = Number(instalment_cents)
    const planType =
      plan_type === 'weekly' || plan_type === 'biweekly' || plan_type === 'monthly' ? plan_type : 'monthly'
    const { planId } = await createPaymentPlanInTransaction(tx, {
      orderId,
      planType,
      totalInstalments: totalInst,
      totalCents: perInst * totalInst,
      currency: typeof currency === 'string' ? currency : 'NAD',
      firstDueDate: new Date(String(first_due_date)),
    })
    await tx.commit()
    res.status(201).json({ planId })
  } catch (e) {
    await tx.rollback()
    res.status(400).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})

adminInstalmentsRouter.get('/orders/:orderId/payment-plan', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) { noPool(res); return }
  try {
    const plan = await fetchPaymentPlanForOrder(pool, req.params.orderId)
    res.json({ plan })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})

adminInstalmentsRouter.patch('/payment-plan-instalments/:id', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) { noPool(res); return }
  const { status, payment_ref } = req.body as Record<string, unknown>
  try {
    await pool.request()
      .input('id', req.params.id)
      .input('st', status ?? null)
      .input('ref', payment_ref ?? null)
      .input('paidAt', status === 'paid' ? new Date() : null)
      .query(`
        UPDATE dbo.order_payment_plan_instalments SET
          status = COALESCE(@st, status),
          payment_ref = COALESCE(@ref, payment_ref),
          paid_at = CASE WHEN @st = N'paid' THEN SYSUTCDATETIME() ELSE paid_at END
        WHERE id = @id
      `)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})
