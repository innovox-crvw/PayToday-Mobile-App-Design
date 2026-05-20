import { randomUUID } from 'node:crypto'
import type { ConnectionPool, Transaction } from 'mssql'
import { columnExists } from '../db/columnExists.js'
import { tryDebitWalletPaymentPlanInstalment } from './demoWalletService.js'
import { confirmOrderPaid } from './paymentConfirmation.js'

export type RecurringTermMonths = 3 | 6 | 12

export function parseRecurringTermMonths(raw: unknown): RecurringTermMonths | null {
  const n = Number(raw)
  if (n === 3 || n === 6 || n === 12) return n
  return null
}

export type PaymentPlanDto = {
  id: string
  plan_type: string
  total_instalments: number
  instalment_cents: number
  currency: string
  status: string
  created_at: string | null
  instalments: {
    id: string
    instalment_number: number
    amount_cents: number
    status: string
    due_date: string
    paid_at: string | null
    payment_ref: string | null
  }[]
}

export type PaymentPlanType = 'weekly' | 'biweekly' | 'monthly'

export type CreatePaymentPlanInput = {
  orderId: string
  planType?: PaymentPlanType
  totalInstalments: number
  totalCents: number
  currency: string
  /** First instalment due date (defaults to one month from now for monthly). */
  firstDueDate?: Date
}

/** Split total into N instalment amounts (last instalment absorbs rounding remainder). */
export function splitTotalIntoInstalmentAmounts(totalCents: number, count: number): number[] {
  const n = Math.max(1, Math.floor(count))
  const total = Math.max(0, Math.floor(totalCents))
  const base = Math.floor(total / n)
  const amounts: number[] = []
  for (let i = 0; i < n; i += 1) {
    amounts.push(i === n - 1 ? total - base * (n - 1) : base)
  }
  return amounts
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d)
  out.setMonth(out.getMonth() + months)
  return out
}

function dueDateForInstalment(planType: PaymentPlanType, firstDue: Date, index: number): Date {
  const due = new Date(firstDue)
  if (planType === 'weekly') due.setDate(due.getDate() + index * 7)
  else if (planType === 'biweekly') due.setDate(due.getDate() + index * 14)
  else due.setMonth(due.getMonth() + index)
  return due
}

/** cadence_months on hybrid DBs from 068_recurring_laybuy */
function cadenceMonthsForPlanType(planType: PaymentPlanType): number {
  if (planType === 'weekly') return 0
  if (planType === 'biweekly') return 0
  return 1
}

export async function assertPaymentPlanSchema(pool: ConnectionPool): Promise<void> {
  const hasInstalmentCents = await columnExists(pool, 'order_payment_plans.instalment_cents')
  if (!hasInstalmentCents) {
    throw new Error(
      'Database is missing order_payment_plans.instalment_cents. Run npm run db:migrate from the backend folder.',
    )
  }
}

/**
 * Creates order_payment_plans + instalment rows inside an open transaction.
 */
export async function createPaymentPlanInTransaction(
  tx: Transaction,
  input: CreatePaymentPlanInput,
): Promise<{ planId: string; instalmentCents: number }> {
  const planType: PaymentPlanType = input.planType ?? 'monthly'
  const totalInstalments = Math.max(1, Math.floor(input.totalInstalments))
  const amounts = splitTotalIntoInstalmentAmounts(input.totalCents, totalInstalments)
  const instalmentCents = amounts[0] ?? 0
  const totalCents = Math.max(0, Math.floor(input.totalCents))
  const currency = (input.currency ?? 'NAD').trim().slice(0, 10) || 'NAD'

  const colR = await tx.request().query<{
    principal_len: number | null
    created_len: number | null
    updated_len: number | null
    inst_created_len: number | null
  }>(`
    SELECT COL_LENGTH(N'dbo.order_payment_plans', N'total_principal_cents') AS principal_len,
      COL_LENGTH(N'dbo.order_payment_plans', N'created_at') AS created_len,
      COL_LENGTH(N'dbo.order_payment_plans', N'updated_at') AS updated_len,
      COL_LENGTH(N'dbo.order_payment_plan_instalments', N'created_at') AS inst_created_len
  `)
  const colRow = colR.recordset[0]
  const hasRecurringPrincipal = colRow?.principal_len != null
  const hasPlanCreated = colRow?.created_len != null
  const hasPlanUpdated = colRow?.updated_len != null
  const hasInstalmentCreated = colRow?.inst_created_len != null

  const planId = randomUUID()

  const insertCols = [
    'id',
    'order_id',
    'plan_type',
    'total_instalments',
    'instalment_cents',
    'currency',
    'status',
  ]
  const insertVals = ['@planId', '@oid', '@type', '@total', '@cents', '@ccy', "N'active'"]
  const req = tx
    .request()
    .input('planId', planId)
    .input('oid', input.orderId)
    .input('type', planType)
    .input('total', totalInstalments)
    .input('cents', instalmentCents)
    .input('ccy', currency)

  if (hasRecurringPrincipal) {
    insertCols.push('total_principal_cents', 'fee_cents', 'installment_count', 'cadence_months')
    insertVals.push('@principal', '0', '@installmentCount', '@cadence')
    req
      .input('principal', totalCents)
      .input('installmentCount', totalInstalments)
      .input('cadence', cadenceMonthsForPlanType(planType))
  }
  if (hasPlanCreated) {
    insertCols.push('created_at')
    insertVals.push('SYSUTCDATETIME()')
  }
  if (hasPlanUpdated) {
    insertCols.push('updated_at')
    insertVals.push('SYSUTCDATETIME()')
  }

  await req.query(`
      INSERT INTO dbo.order_payment_plans (${insertCols.join(', ')})
      VALUES (${insertVals.join(', ')})
    `)

  const firstDue =
    input.firstDueDate && !Number.isNaN(input.firstDueDate.getTime())
      ? input.firstDueDate
      : addMonths(new Date(), 1)

  const instCols = ['id', 'plan_id', 'instalment_number', 'amount_cents', 'due_date']
  const instVals = ['@iid', '@pid', '@num', '@cents', '@due']
  if (hasInstalmentCreated) {
    instCols.push('created_at')
    instVals.push('SYSUTCDATETIME()')
  }

  for (let i = 0; i < totalInstalments; i += 1) {
    const due = dueDateForInstalment(planType, firstDue, i)
    await tx
      .request()
      .input('iid', randomUUID())
      .input('pid', planId)
      .input('num', i + 1)
      .input('cents', amounts[i] ?? instalmentCents)
      .input('due', due)
      .query(`
        INSERT INTO dbo.order_payment_plan_instalments (${instCols.join(', ')})
        VALUES (${instVals.join(', ')})
      `)
  }

  return { planId, instalmentCents }
}

/** Load plan + instalments for an order (no auth check). */
export async function fetchPaymentPlanForOrder(
  pool: ConnectionPool,
  orderId: string,
): Promise<PaymentPlanDto | null> {
  const hasInstalmentCents = await columnExists(pool, 'order_payment_plans.instalment_cents')
  const hasPlanCreated = await columnExists(pool, 'order_payment_plans.created_at')
  const instalmentCentsSql = hasInstalmentCents
    ? 'p.instalment_cents'
    : `(SELECT TOP 1 i.amount_cents FROM dbo.order_payment_plan_instalments i WHERE i.plan_id = p.id ORDER BY i.instalment_number)`
  const planCreatedSql = hasPlanCreated
    ? 'CONVERT(NVARCHAR(30), p.created_at, 127) AS created_at'
    : 'CAST(NULL AS NVARCHAR(30)) AS created_at'
  const plan = await pool.request().input('oid', orderId).query<{
    id: string
    plan_type: string
    total_instalments: number
    instalment_cents: number
    currency: string
    status: string
    created_at: string | null
  }>(`
    SELECT CAST(p.id AS NVARCHAR(36)) AS id, p.plan_type, p.total_instalments,
      ${instalmentCentsSql} AS instalment_cents, p.currency, p.status,
      ${planCreatedSql}
    FROM dbo.order_payment_plans p WHERE p.order_id = @oid
  `)
  const planRow = plan.recordset[0]
  if (!planRow) return null
  const instalments = await pool.request().input('pid', planRow.id).query<{
    id: string
    instalment_number: number
    amount_cents: number
    status: string
    due_date: string
    paid_at: string | null
    payment_ref: string | null
  }>(`
    SELECT CAST(id AS NVARCHAR(36)) AS id, instalment_number, amount_cents, status,
      CONVERT(NVARCHAR(10), due_date, 23) AS due_date,
      CONVERT(NVARCHAR(30), paid_at, 127) AS paid_at,
      payment_ref
    FROM dbo.order_payment_plan_instalments WHERE plan_id = @pid
    ORDER BY instalment_number
  `)
  return { ...planRow, instalments: instalments.recordset }
}

export type DueInstalmentDto = {
  order_id: string
  instalment_id: string
  instalment_number: number
  amount_cents: number
  currency: string
  due_date: string
  plan_id: string
}

/** Next payable instalment per active plan for this user (sequential pay). */
export async function listDueInstalmentsForUser(
  pool: ConnectionPool,
  userId: string,
): Promise<DueInstalmentDto[]> {
  const r = await pool.request().input('uid', userId).query<DueInstalmentDto>(`
    SELECT CAST(o.id AS NVARCHAR(36)) AS order_id,
      CAST(i.id AS NVARCHAR(36)) AS instalment_id,
      i.instalment_number,
      i.amount_cents,
      p.currency,
      CONVERT(NVARCHAR(10), i.due_date, 23) AS due_date,
      CAST(p.id AS NVARCHAR(36)) AS plan_id
    FROM dbo.orders o
    INNER JOIN dbo.order_payment_plans p ON p.order_id = o.id AND p.status = N'active'
    INNER JOIN dbo.order_payment_plan_instalments i ON i.plan_id = p.id
    WHERE o.user_id = @uid
      AND i.status IN (N'pending', N'overdue')
      AND NOT EXISTS (
        SELECT 1 FROM dbo.order_payment_plan_instalments prev
        WHERE prev.plan_id = p.id
          AND prev.instalment_number < i.instalment_number
          AND prev.status NOT IN (N'paid', N'waived')
      )
    ORDER BY i.due_date ASC, i.instalment_number ASC
  `)
  return r.recordset
}

async function assertInstalmentPayable(
  pool: ConnectionPool,
  userId: string,
  orderId: string,
  instalmentId: string,
): Promise<
  | {
      instalmentId: string
      planId: string
      instalmentNumber: number
      amountCents: number
      currency: string
      status: string
    }
  | { error: string; code: string }
> {
  const r = await pool
    .request()
    .input('oid', orderId)
    .input('iid', instalmentId)
    .input('uid', userId)
    .query<{
      order_user_id: string
      plan_id: string
      instalment_number: number
      amount_cents: number
      currency: string
      status: string
      prior_unpaid: number
    }>(`
    SELECT CAST(o.user_id AS NVARCHAR(36)) AS order_user_id,
      CAST(p.id AS NVARCHAR(36)) AS plan_id,
      i.instalment_number,
      i.amount_cents,
      p.currency,
      i.status,
      (SELECT COUNT(1) FROM dbo.order_payment_plan_instalments prev
        WHERE prev.plan_id = p.id
          AND prev.instalment_number < i.instalment_number
          AND prev.status NOT IN (N'paid', N'waived')) AS prior_unpaid
    FROM dbo.order_payment_plan_instalments i
    INNER JOIN dbo.order_payment_plans p ON p.id = i.plan_id
    INNER JOIN dbo.orders o ON o.id = p.order_id
    WHERE i.id = @iid AND p.order_id = @oid
  `)
  const row = r.recordset[0]
  if (!row) return { error: 'Instalment not found.', code: 'not_found' }
  if (row.order_user_id !== userId) return { error: 'Order not found.', code: 'not_found' }
  if (row.status === 'paid' || row.status === 'waived') {
    return { error: 'This instalment is already paid.', code: 'already_paid' }
  }
  if (row.prior_unpaid > 0) {
    return { error: 'Pay earlier instalments first.', code: 'out_of_sequence' }
  }
  return {
    instalmentId,
    planId: row.plan_id,
    instalmentNumber: row.instalment_number,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
  }
}

async function markInstalmentPaid(
  pool: ConnectionPool,
  instalmentId: string,
  paymentRef: string,
): Promise<void> {
  await pool
    .request()
    .input('id', instalmentId)
    .input('ref', paymentRef.slice(0, 200))
    .query(`
      UPDATE dbo.order_payment_plan_instalments SET
        status = N'paid',
        payment_ref = @ref,
        paid_at = SYSUTCDATETIME()
      WHERE id = @id
    `)
}

async function finalizePlanIfFullyPaid(
  pool: ConnectionPool,
  planId: string,
  orderId: string,
): Promise<{ planCompleted: boolean; orderPaid: boolean }> {
  const left = await pool.request().input('pid', planId).query<{ c: number }>(`
    SELECT COUNT(1) AS c FROM dbo.order_payment_plan_instalments
    WHERE plan_id = @pid AND status NOT IN (N'paid', N'waived')
  `)
  if ((left.recordset[0]?.c ?? 0) > 0) {
    return { planCompleted: false, orderPaid: false }
  }
  const hasPlanUpdated = await columnExists(pool, 'order_payment_plans.updated_at')
  const updatedSql = hasPlanUpdated ? ', updated_at = SYSUTCDATETIME()' : ''
  await pool.request().input('pid', planId).query(`
    UPDATE dbo.order_payment_plans SET status = N'completed'${updatedSql}
    WHERE id = @pid AND status = N'active'
  `)
  const { alreadyPaid } = await confirmOrderPaid(pool, orderId)
  return { planCompleted: true, orderPaid: !alreadyPaid }
}

/** Debit demo wallet and mark one instalment paid (customer recurring demo flow). */
export async function payInstalmentWithDemoWallet(
  pool: ConnectionPool,
  userId: string,
  orderId: string,
  instalmentId: string,
): Promise<
  | {
      ok: true
      balanceAfter: number
      instalmentNumber: number
      amountCents: number
      currency: string
      planCompleted: boolean
      orderPaid: boolean
    }
  | { ok: false; code: string; error: string }
> {
  const check = await assertInstalmentPayable(pool, userId, orderId, instalmentId)
  if ('error' in check) {
    return { ok: false, code: check.code, error: check.error }
  }

  const debit = await tryDebitWalletPaymentPlanInstalment(
    pool,
    userId,
    instalmentId,
    orderId,
    check.instalmentNumber,
    check.amountCents,
  )
  if (!debit.ok) {
    return { ok: false, code: debit.code, error: debit.error }
  }

  try {
    await markInstalmentPaid(pool, instalmentId, 'demo_wallet')
  } catch (e) {
    return {
      ok: false,
      code: 'mark_paid_failed',
      error: e instanceof Error ? e.message : 'Payment captured but instalment update failed',
    }
  }

  const fin = await finalizePlanIfFullyPaid(pool, check.planId, orderId)
  return {
    ok: true,
    balanceAfter: debit.balanceAfter,
    instalmentNumber: check.instalmentNumber,
    amountCents: check.amountCents,
    currency: check.currency,
    planCompleted: fin.planCompleted,
    orderPaid: fin.orderPaid,
  }
}
