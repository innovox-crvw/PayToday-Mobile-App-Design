import { Router } from 'express'
import { columnExists } from '../../db/columnExists.js'
import { getSqlPool } from '../../db/pool.js'
import { optionalAuth, requireAuth, requireRole } from '../../middleware/auth.js'

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
    const hasInstalmentCents = await columnExists(pool, 'order_payment_plans.instalment_cents')
    const hasPlanCreated = await columnExists(pool, 'order_payment_plans.created_at')
    const instalmentCentsSql = hasInstalmentCents
      ? 'p.instalment_cents'
      : `(SELECT TOP 1 i.amount_cents FROM dbo.order_payment_plan_instalments i WHERE i.plan_id = p.id ORDER BY i.instalment_number)`
    const planCreatedSql = hasPlanCreated
      ? 'CONVERT(NVARCHAR(30), p.created_at, 127) AS created_at'
      : 'CAST(NULL AS NVARCHAR(30)) AS created_at'
    const plan = await pool.request().input('oid', orderId).query<{
      id: string; plan_type: string; total_instalments: number; instalment_cents: number; currency: string; status: string; created_at: string
    }>(`
      SELECT CAST(p.id AS NVARCHAR(36)) AS id, p.plan_type, p.total_instalments,
        ${instalmentCentsSql} AS instalment_cents, p.currency, p.status,
        ${planCreatedSql}
      FROM dbo.order_payment_plans p WHERE p.order_id = @oid
    `)
    if (!plan.recordset.length) { res.json({ plan: null }); return }
    const planRow = plan.recordset[0]!
    const instalments = await pool.request().input('pid', planRow.id).query(`
      SELECT CAST(id AS NVARCHAR(36)) AS id, instalment_number, amount_cents, status,
        CONVERT(NVARCHAR(10), due_date, 23) AS due_date,
        CONVERT(NVARCHAR(30), paid_at, 127) AS paid_at,
        payment_ref
      FROM dbo.order_payment_plan_instalments WHERE plan_id = @pid
      ORDER BY instalment_number
    `)
    res.json({ plan: { ...planRow, instalments: instalments.recordset } })
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
  const hasInstalmentCents = await columnExists(pool, 'order_payment_plans.instalment_cents')
  if (!hasInstalmentCents) {
    res.status(503).json({
      error:
        'Database is missing order_payment_plans.instalment_cents. Run `npm run db:migrate` from the backend folder (migration 059_compat_missing_api_columns.sql) or apply that script in SSMS.',
    })
    return
  }
  const tx = pool.transaction()
  await tx.begin()
  try {
    const planR = await tx.request()
      .input('oid', orderId)
      .input('type', plan_type ?? 'monthly')
      .input('total', Number(total_instalments))
      .input('cents', Number(instalment_cents))
      .input('ccy', currency ?? 'NAD')
      .query<{ id: string }>(`
        INSERT INTO dbo.order_payment_plans (order_id, plan_type, total_instalments, instalment_cents, currency)
        OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
        VALUES (@oid, @type, @total, @cents, @ccy)
      `)
    const planId = planR.recordset[0].id
    const firstDue = new Date(String(first_due_date))
    for (let i = 0; i < Number(total_instalments); i++) {
      const due = new Date(firstDue)
      if ((plan_type ?? 'monthly') === 'weekly') due.setDate(due.getDate() + i * 7)
      else if (plan_type === 'biweekly') due.setDate(due.getDate() + i * 14)
      else due.setMonth(due.getMonth() + i)
      await tx.request()
        .input('pid', planId)
        .input('num', i + 1)
        .input('cents', Number(instalment_cents))
        .input('due', due)
        .query(`
          INSERT INTO dbo.order_payment_plan_instalments (plan_id, instalment_number, amount_cents, due_date)
          VALUES (@pid, @num, @cents, @due)
        `)
    }
    await tx.commit()
    res.status(201).json({ planId })
  } catch (e) {
    await tx.rollback()
    res.status(400).json({ error: e instanceof Error ? e.message : 'Failed' })
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
