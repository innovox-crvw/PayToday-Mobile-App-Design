import type { ConnectionPool } from 'mssql'
import { tryDebitWalletStoreCheckout } from './demoWalletService.js'

const ROUND_UP_INCREMENTS = [100, 500, 1000] as const

export type WalletSettings = {
  roundUpEnabled: boolean
  roundUpIncrementCents: number
  savingsBalanceCents: number
  walletExtrasAvailable: boolean
}

function extrasSchemaMissing(msg: string): boolean {
  const m = msg.toLowerCase()
  return (
    m.includes('wallet_savings') ||
    m.includes('wallet_round_up') ||
    m.includes('wallet_split') ||
    m.includes('invalid object name')
  )
}

export function computeRoundUpCents(orderCents: number, incrementCents: number): { chargeCents: number; spareCents: number } {
  if (orderCents <= 0 || incrementCents <= 0) return { chargeCents: orderCents, spareCents: 0 }
  const chargeCents = Math.ceil(orderCents / incrementCents) * incrementCents
  return { chargeCents, spareCents: Math.max(0, chargeCents - orderCents) }
}

export async function getWalletSettings(pool: ConnectionPool, userId: string): Promise<WalletSettings> {
  try {
    const r = await pool.request().input('uid', userId).query<{
      wallet_round_up_enabled: boolean
      wallet_round_up_increment_cents: number
      wallet_savings_balance_cents: number
    }>(`
      SELECT
        CAST(wallet_round_up_enabled AS BIT) AS wallet_round_up_enabled,
        wallet_round_up_increment_cents,
        wallet_savings_balance_cents
      FROM dbo.users WHERE id = @uid
    `)
    const row = r.recordset[0]
    if (!row) {
      return { roundUpEnabled: false, roundUpIncrementCents: 500, savingsBalanceCents: 0, walletExtrasAvailable: false }
    }
    const inc = Number(row.wallet_round_up_increment_cents)
    return {
      roundUpEnabled: Boolean(row.wallet_round_up_enabled),
      roundUpIncrementCents: ROUND_UP_INCREMENTS.includes(inc as (typeof ROUND_UP_INCREMENTS)[number]) ? inc : 500,
      savingsBalanceCents: Number(row.wallet_savings_balance_cents) || 0,
      walletExtrasAvailable: true,
    }
  } catch {
    return { roundUpEnabled: false, roundUpIncrementCents: 500, savingsBalanceCents: 0, walletExtrasAvailable: false }
  }
}

export async function patchWalletSettings(
  pool: ConnectionPool,
  userId: string,
  patch: { roundUpEnabled?: boolean; roundUpIncrementCents?: number },
): Promise<WalletSettings | { error: string }> {
  const cur = await getWalletSettings(pool, userId)
  if (!cur.walletExtrasAvailable) {
    return { error: 'Wallet savings settings are not available on this database. Run migration 068_wallet_savings_split.' }
  }
  const enabled = patch.roundUpEnabled ?? cur.roundUpEnabled
  let inc = patch.roundUpIncrementCents ?? cur.roundUpIncrementCents
  if (!ROUND_UP_INCREMENTS.includes(inc as (typeof ROUND_UP_INCREMENTS)[number])) {
    inc = 500
  }
  await pool
    .request()
    .input('uid', userId)
    .input('en', enabled ? 1 : 0)
    .input('inc', inc)
    .query(`
      UPDATE dbo.users
      SET wallet_round_up_enabled = @en, wallet_round_up_increment_cents = @inc
      WHERE id = @uid
    `)
  return getWalletSettings(pool, userId)
}

export async function creditSavingsRoundUp(
  pool: ConnectionPool,
  userId: string,
  spareCents: number,
  _orderId: string,
): Promise<void> {
  if (spareCents < 1) return
  await pool
    .request()
    .input('uid', userId)
    .input('amt', spareCents)
    .query(`UPDATE dbo.users SET wallet_savings_balance_cents = wallet_savings_balance_cents + @amt WHERE id = @uid`)
}

export type SplitParticipantInput = { displayName: string; shareCents: number }

export async function createSplitBill(
  pool: ConnectionPool,
  userId: string,
  input: {
    totalCents: number
    currency?: string
    creatorShareCents: number
    participants: SplitParticipantInput[]
    orderId?: string | null
    reference?: string | null
  },
): Promise<{ ok: true; splitBillId: string } | { ok: false; error: string }> {
  const total = input.totalCents
  const creatorShare = input.creatorShareCents
  const others = input.participants
  const othersSum = others.reduce((s, p) => s + p.shareCents, 0)
  if (creatorShare < 1 || creatorShare > total) {
    return { ok: false, error: 'Your share must be at least 1 cent and not exceed the total.' }
  }
  if (creatorShare + othersSum !== total) {
    return { ok: false, error: 'Participant shares must add up to the bill total.' }
  }
  for (const p of others) {
    if (!p.displayName.trim() || p.shareCents < 1) {
      return { ok: false, error: 'Each participant needs a name and a share of at least 1 cent.' }
    }
  }
  try {
    const ins = await pool
      .request()
      .input('uid', userId)
      .input('total', total)
      .input('cur', (input.currency ?? 'NAD').slice(0, 3))
      .input('creator', creatorShare)
      .input('oid', input.orderId ?? null)
      .input('ref', input.reference?.slice(0, 120) ?? null)
      .query<{ id: string }>(`
        INSERT INTO dbo.wallet_split_bills (creator_user_id, order_id, total_cents, currency, creator_share_cents, reference)
        OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
        VALUES (@uid, @oid, @total, @cur, @creator, @ref)
      `)
    const splitBillId = ins.recordset[0]?.id
    if (!splitBillId) return { ok: false, error: 'Could not create split bill.' }
    let sort = 0
    for (const p of others) {
      await pool
        .request()
        .input('sid', splitBillId)
        .input('name', p.displayName.trim().slice(0, 120))
        .input('share', p.shareCents)
        .input('ord', sort++)
        .query(`
          INSERT INTO dbo.wallet_split_participants (split_bill_id, display_name, share_cents, sort_order)
          VALUES (@sid, @name, @share, @ord)
        `)
    }
    return { ok: true, splitBillId }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (extrasSchemaMissing(msg)) {
      return { ok: false, error: 'Split bill is not available on this database. Run migration 068_wallet_savings_split.' }
    }
    return { ok: false, error: msg }
  }
}

export async function getSplitBillForUser(
  pool: ConnectionPool,
  userId: string,
  splitBillId: string,
): Promise<{
  id: string
  totalCents: number
  creatorShareCents: number
  currency: string
  participants: { displayName: string; shareCents: number; status: string }[]
} | null> {
  try {
    const h = await pool
      .request()
      .input('id', splitBillId)
      .input('uid', userId)
      .query<{ total_cents: number; creator_share_cents: number; currency: string }>(`
        SELECT total_cents, creator_share_cents, currency
        FROM dbo.wallet_split_bills
        WHERE id = @id AND creator_user_id = @uid
      `)
    const row = h.recordset[0]
    if (!row) return null
    const parts = await pool.request().input('sid', splitBillId).query<{
      display_name: string
      share_cents: number
      status: string
    }>(`
      SELECT display_name, share_cents, status
      FROM dbo.wallet_split_participants
      WHERE split_bill_id = @sid
      ORDER BY sort_order ASC
    `)
    return {
      id: splitBillId,
      totalCents: Number(row.total_cents),
      creatorShareCents: Number(row.creator_share_cents),
      currency: row.currency,
      participants: parts.recordset.map((p) => ({
        displayName: p.display_name,
        shareCents: Number(p.share_cents),
        status: p.status,
      })),
    }
  } catch {
    return null
  }
}

export async function resolveCreatorPayCents(
  pool: ConnectionPool,
  userId: string,
  orderTotalCents: number,
  splitBillId: string | null | undefined,
): Promise<{ payCents: number; splitBillId: string | null } | { error: string }> {
  if (!splitBillId?.trim()) {
    return { payCents: orderTotalCents, splitBillId: null }
  }
  const bill = await getSplitBillForUser(pool, userId, splitBillId.trim())
  if (!bill) return { error: 'Split bill not found.' }
  if (bill.totalCents !== orderTotalCents) {
    return { error: 'Split bill total does not match order total. Recreate the split for this cart.' }
  }
  return { payCents: bill.creatorShareCents, splitBillId: bill.id }
}

export async function checkoutWalletDebitWithExtras(
  pool: ConnectionPool,
  userId: string,
  orderId: string,
  orderTotalCents: number,
  reference: string,
  opts: {
    splitBillId?: string | null
    applyRoundUp?: boolean
    roundUpIncrementCents?: number
  },
): Promise<
  | {
      ok: true
      balanceAfter: number
      chargedCents: number
      roundUpSpareCents: number
    }
  | { ok: false; code: string; error: string }
> {
  const resolved = await resolveCreatorPayCents(pool, userId, orderTotalCents, opts.splitBillId)
  if ('error' in resolved) {
    return { ok: false, code: 'split_invalid', error: resolved.error }
  }
  let chargeCents = resolved.payCents
  let spareCents = 0
  if (opts.applyRoundUp && opts.roundUpIncrementCents) {
    const ru = computeRoundUpCents(chargeCents, opts.roundUpIncrementCents)
    chargeCents = ru.chargeCents
    spareCents = ru.spareCents
  }
  const debit = await tryDebitWalletStoreCheckout(pool, userId, orderId, chargeCents, reference)
  if (!debit.ok) {
    return { ok: false, code: debit.code, error: debit.error }
  }
  if (spareCents > 0) {
    try {
      await creditSavingsRoundUp(pool, userId, spareCents, orderId)
    } catch (e) {
      console.error('[wallet] round-up savings credit failed', e)
    }
  }
  return { ok: true, balanceAfter: debit.balanceAfter, chargedCents: chargeCents, roundUpSpareCents: spareCents }
}
