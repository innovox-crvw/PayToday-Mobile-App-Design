import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { requireAuth } from '../../middleware/auth.js'
import { creditDemoWalletFund, getDemoWalletBalanceCents } from '../../services/demoWalletService.js'

export const walletRouter = Router()

/** Store orders and demo ledger rows use UUID strings in URLs. */
const TX_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type WalletTransactionApiRow = {
  id: string
  business: string
  status: 'successful' | 'failed' | 'pending'
  reference: string
  date: string
  datetime: string
  amountCents: number
  type: string
  source: 'wallet'
  paymentMethod: string
  orderStatus: string
}

function mapOrderWalletStatus(status: string): 'successful' | 'failed' | 'pending' {
  const s = status.toLowerCase()
  if (s === 'cancelled') return 'failed'
  if (s === 'pending_payment' || s === 'draft') return 'pending'
  return 'successful'
}

function formatWalletDates(createdAt: Date): { date: string; datetime: string } {
  const d = createdAt instanceof Date ? createdAt : new Date(createdAt)
  const date = d.toLocaleDateString('en-NA', { day: 'numeric', month: 'short', year: 'numeric' })
  const datetime = `${date}, ${d.toLocaleTimeString('en-NA', { hour: '2-digit', minute: '2-digit' })}`
  return { date, datetime }
}

function rowToDto(row: {
  orderId: string
  status: string
  total_cents: number
  created_at: Date
  delivery_method: string
  paytoday_reference: string | null
}): WalletTransactionApiRow {
  const { date, datetime } = formatWalletDates(row.created_at)
  const ref = row.paytoday_reference?.trim() || `Order ${row.orderId.slice(0, 8)}…`
  const dm = (row.delivery_method ?? 'order').replace(/_/g, ' ')
  return {
    id: row.orderId,
    business: `PayToday Store · ${dm}`,
    status: mapOrderWalletStatus(row.status),
    reference: ref,
    date,
    datetime,
    amountCents: -Math.abs(row.total_cents),
    type: 'Store purchase',
    source: 'wallet',
    paymentMethod: 'PayToday checkout',
    orderStatus: row.status,
  }
}

function ledgerRowToDto(row: {
  id: string
  delta_cents: number
  balance_after_cents: number
  entry_type: string
  reference: string | null
  payee_label: string | null
  created_at: Date
}): WalletTransactionApiRow {
  const { date, datetime } = formatWalletDates(row.created_at)
  const delta = Number(row.delta_cents)
  const isCredit = delta > 0
  const ref = row.reference?.trim() || `TX ${row.id.slice(0, 8)}…`
  const payee = row.payee_label?.trim()
  const et = row.entry_type
  const typeLabel =
    et === 'demo_fund'
      ? 'Top-up'
      : et === 'store_checkout_spend'
        ? 'Store purchase'
        : et === 'store_refund_credit'
          ? 'Store refund (after fee)'
          : 'Wallet payment'
  return {
    id: row.id,
    business: isCredit ? 'Demo wallet funding' : payee || 'Wallet payment',
    status: 'successful',
    reference: ref,
    date,
    datetime,
    amountCents: delta,
    type: typeLabel,
    source: 'wallet',
    paymentMethod: 'Demo wallet',
    orderStatus: '',
  }
}

walletRouter.get('/balance', requireAuth, async (req, res) => {
  const pool = await getSqlPool({ eager: true })
  if (!pool || !req.user) {
    res.status(503).json({ error: 'Database unavailable' })
    return
  }
  const b = await getDemoWalletBalanceCents(pool, req.user.sub)
  if (b === null) {
    res.json({ balanceCents: 0, walletDemoAvailable: false })
    return
  }
  res.json({ balanceCents: b, walletDemoAvailable: true })
})

walletRouter.post('/demo/fund', requireAuth, async (req, res) => {
  const pool = await getSqlPool({ eager: true })
  if (!pool || !req.user) {
    res.status(503).json({ error: 'Database unavailable' })
    return
  }
  const body = req.body as Record<string, unknown>
  const raw = body.amountCents
  const amountCents = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(amountCents)) {
    res.status(400).json({ error: 'amountCents must be a number' })
    return
  }
  const ref =
    typeof body.reference === 'string' && body.reference.trim()
      ? body.reference.trim().slice(0, 120)
      : `DEMO-FUND-${Date.now().toString(36).toUpperCase()}`
  const result = await creditDemoWalletFund(pool, req.user.sub, amountCents, ref)
  if (!result.ok) {
    const status = result.code === 'invalid_amount' ? 400 : result.code === 'schema_missing' ? 503 : 400
    res.status(status).json({ error: result.error, code: result.code })
    return
  }
  res.json({ ok: true, balanceCents: result.balanceAfter })
})

walletRouter.get('/transactions', requireAuth, async (req, res) => {
  const pool = await getSqlPool({ eager: true })
  if (!pool || !req.user) {
    res.status(503).json({ error: 'Database unavailable' })
    return
  }
  try {
    const r = await pool
      .request()
      .input('uid', req.user.sub)
      .query<{
        orderId: string
        status: string
        total_cents: number
        created_at: Date
        delivery_method: string
        paytoday_reference: string | null
      }>(`
      SELECT CAST(id AS NVARCHAR(36)) AS orderId,
             status,
             total_cents,
             created_at,
             delivery_method,
             paytoday_reference
      FROM dbo.orders
      WHERE user_id = @uid
      ORDER BY created_at DESC
    `)

    type Merged = { dto: WalletTransactionApiRow; at: number }
    const merged: Merged[] = r.recordset.map((row) => ({
      dto: rowToDto(row),
      at: new Date(row.created_at).getTime(),
    }))

    try {
      const lr = await pool
        .request()
        .input('uid', req.user.sub)
        .query<{
          id: string
          delta_cents: number
          balance_after_cents: number
          entry_type: string
          reference: string | null
          payee_label: string | null
          created_at: Date
        }>(`
        SELECT TOP 120
          CAST(id AS NVARCHAR(36)) AS id,
          delta_cents,
          balance_after_cents,
          entry_type,
          reference,
          payee_label,
          created_at
        FROM dbo.demo_wallet_ledger
        WHERE user_id = @uid
        ORDER BY created_at DESC
      `)
      for (const row of lr.recordset) {
        /* Store checkout already appears as an order row; skip ledger duplicate for the same wallet spend. */
        if (String(row.entry_type).toLowerCase() === 'store_checkout_spend') continue
        merged.push({
          dto: ledgerRowToDto(row),
          at: new Date(row.created_at).getTime(),
        })
      }
    } catch {
      /* demo_wallet_ledger may not exist yet */
    }

    merged.sort((a, b) => b.at - a.at)
    const items = merged.slice(0, 150).map((m) => m.dto)
    res.json({ source: 'database', items })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[wallet/transactions] list failed:', msg)
    res.status(500).json({ error: 'Could not load transactions', detail: process.env.NODE_ENV === 'development' ? msg : undefined })
  }
})

walletRouter.get('/transactions/:orderId', requireAuth, async (req, res) => {
  const orderId = String(req.params.orderId ?? '')
  if (!TX_ID_RE.test(orderId)) {
    res.status(400).json({ error: 'Invalid transaction id' })
    return
  }
  const pool = await getSqlPool({ eager: true })
  if (!pool || !req.user) {
    res.status(503).json({ error: 'Database unavailable' })
    return
  }
  try {
    const r = await pool
      .request()
      .input('uid', req.user.sub)
      .input('oid', orderId)
      .query<{
        orderId: string
        status: string
        total_cents: number
        created_at: Date
        delivery_method: string
        paytoday_reference: string | null
      }>(`
      SELECT CAST(id AS NVARCHAR(36)) AS orderId,
             status,
             total_cents,
             created_at,
             delivery_method,
             paytoday_reference
      FROM dbo.orders
      WHERE id = @oid AND user_id = @uid
    `)
    const row = r.recordset[0]
    if (row) {
      res.json(rowToDto(row))
      return
    }

    try {
      const lr = await pool
        .request()
        .input('uid', req.user.sub)
        .input('lid', orderId)
        .query<{
          id: string
          delta_cents: number
          balance_after_cents: number
          entry_type: string
          reference: string | null
          payee_label: string | null
          created_at: Date
        }>(`
        SELECT CAST(id AS NVARCHAR(36)) AS id,
               delta_cents,
               balance_after_cents,
               entry_type,
               reference,
               payee_label,
               created_at
        FROM dbo.demo_wallet_ledger
        WHERE id = @lid AND user_id = @uid
      `)
      const lrow = lr.recordset[0]
      if (lrow) {
        res.json(ledgerRowToDto(lrow))
        return
      }
    } catch {
      /* ledger table missing */
    }

    res.status(404).json({ error: 'Not found' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[wallet/transactions/:orderId] failed:', msg)
    res.status(500).json({ error: 'Could not load transaction', detail: process.env.NODE_ENV === 'development' ? msg : undefined })
  }
})
