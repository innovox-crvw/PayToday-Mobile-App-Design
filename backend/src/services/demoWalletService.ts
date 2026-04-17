import type { ConnectionPool, Transaction } from 'mssql'

export type HubDebitResult =
  | { ok: true; balanceAfter: number; duplicate: boolean }
  | { ok: false; code: 'insufficient_funds' | 'schema_missing' | 'unknown'; error: string }

function isSchemaError(msg: string): boolean {
  const m = msg.toLowerCase()
  return m.includes('wallet_demo_balance') || m.includes('demo_wallet_ledger') || m.includes('invalid object name')
}

async function rollbackQuiet(t: Transaction): Promise<void> {
  try {
    await t.rollback()
  } catch {
    /* ignore */
  }
}

export async function getDemoWalletBalanceCents(pool: ConnectionPool, userId: string): Promise<number | null> {
  try {
    const r = await pool
      .request()
      .input('uid', userId)
      .query<{ b: number }>(`SELECT CAST(wallet_demo_balance_cents AS BIGINT) AS b FROM dbo.users WHERE id = @uid`)
    const row = r.recordset[0]
    if (!row) return null
    return Number(row.b)
  } catch {
    return null
  }
}

export async function creditDemoWalletFund(
  pool: ConnectionPool,
  userId: string,
  amountCents: number,
  reference: string,
): Promise<{ ok: true; balanceAfter: number } | { ok: false; code: string; error: string }> {
  if (!Number.isFinite(amountCents) || amountCents < 100 || amountCents > 1_000_000_000) {
    return { ok: false, code: 'invalid_amount', error: 'Amount must be between N$1.00 and N$10,000,000.00.' }
  }
  const tx = pool.transaction()
  await tx.begin()
  try {
    const upd = await tx
      .request()
      .input('uid', userId)
      .input('amt', amountCents)
      .query<{ bal: number }>(`
        UPDATE dbo.users WITH (UPDLOCK, ROWLOCK)
        SET wallet_demo_balance_cents = wallet_demo_balance_cents + @amt
        OUTPUT INSERTED.wallet_demo_balance_cents AS bal
        WHERE id = @uid
      `)
    const bal = upd.recordset[0]?.bal
    if (bal == null) {
      await rollbackQuiet(tx)
      return { ok: false, code: 'not_found', error: 'User not found' }
    }
    await tx
      .request()
      .input('uid', userId)
      .input('delta', amountCents)
      .input('bal', bal)
      .input('ref', reference.slice(0, 120))
      .query(`
        INSERT INTO dbo.demo_wallet_ledger (user_id, delta_cents, balance_after_cents, entry_type, reference)
        VALUES (@uid, @delta, @bal, N'demo_fund', @ref)
      `)
    await tx.commit()
    return { ok: true, balanceAfter: bal }
  } catch (e) {
    await rollbackQuiet(tx)
    const msg = e instanceof Error ? e.message : String(e)
    if (isSchemaError(msg)) {
      return {
        ok: false,
        code: 'schema_missing',
        error: 'Demo wallet is not installed on this database. Run backend/scripts/paytoday-add-demo-wallet.sql.',
      }
    }
    return { ok: false, code: 'unknown', error: msg }
  }
}

type WalletLedgerEntryType = 'hub_demo_spend' | 'store_checkout_spend' | 'store_refund_credit'

async function tryDebitWalletWithCorrelation(
  pool: ConnectionPool,
  userId: string,
  amountCents: number,
  correlationId: string,
  payeeName: string,
  reference: string,
  entryType: WalletLedgerEntryType,
): Promise<HubDebitResult> {
  if (!Number.isFinite(amountCents) || amountCents < 1) {
    return { ok: false, code: 'unknown', error: 'Invalid amount' }
  }
  const tx = pool.transaction()
  await tx.begin()
  try {
    const dup = await tx
      .request()
      .input('uid', userId)
      .input('cid', correlationId)
      .query<{ bal: number }>(
        `SELECT TOP 1 CAST(balance_after_cents AS BIGINT) AS bal FROM dbo.demo_wallet_ledger WHERE user_id = @uid AND correlation_id = @cid`,
      )
    const dupBal = dup.recordset[0]?.bal
    if (dupBal != null) {
      await tx.commit()
      return { ok: true, balanceAfter: dupBal, duplicate: true }
    }

    const upd = await tx
      .request()
      .input('uid', userId)
      .input('amt', amountCents)
      .query<{ bal: number }>(`
        UPDATE dbo.users WITH (UPDLOCK, ROWLOCK)
        SET wallet_demo_balance_cents = wallet_demo_balance_cents - @amt
        OUTPUT INSERTED.wallet_demo_balance_cents AS bal
        WHERE id = @uid AND wallet_demo_balance_cents >= @amt
      `)
    const bal = upd.recordset[0]?.bal
    if (bal == null) {
      await rollbackQuiet(tx)
      try {
        const cur = await pool
          .request()
          .input('uid', userId)
          .query<{ wallet_demo_balance_cents: number }>(
            `SELECT wallet_demo_balance_cents FROM dbo.users WHERE id = @uid`,
          )
        const b = Number(cur.recordset[0]?.wallet_demo_balance_cents ?? 0)
        if (b < amountCents) {
          return {
            ok: false,
            code: 'insufficient_funds',
            error: `Insufficient wallet balance (N$ ${(b / 100).toFixed(2)} available, need N$ ${(amountCents / 100).toFixed(2)}).`,
          }
        }
      } catch {
        /* fall through */
      }
      return { ok: false, code: 'unknown', error: 'Could not debit wallet.' }
    }

    await tx
      .request()
      .input('uid', userId)
      .input('delta', -amountCents)
      .input('bal', bal)
      .input('ref', reference.slice(0, 120))
      .input('cid', correlationId)
      .input('payee', payeeName.slice(0, 200))
      .input('etype', entryType)
      .query(`
        INSERT INTO dbo.demo_wallet_ledger (
          user_id, delta_cents, balance_after_cents, entry_type, reference, correlation_id, payee_label
        ) VALUES (
          @uid, @delta, @bal, @etype, @ref, @cid, @payee
        )
      `)
    await tx.commit()
    return { ok: true, balanceAfter: bal, duplicate: false }
  } catch (e) {
    await rollbackQuiet(tx)
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('UQ_demo_wallet_ledger_user_corr') || msg.toLowerCase().includes('duplicate')) {
      const r = await pool
        .request()
        .input('uid', userId)
        .input('cid', correlationId)
        .query<{ bal: number }>(
          `SELECT TOP 1 CAST(balance_after_cents AS BIGINT) AS bal FROM dbo.demo_wallet_ledger WHERE user_id = @uid AND correlation_id = @cid`,
        )
      const b = r.recordset[0]?.bal
      if (b != null) return { ok: true, balanceAfter: b, duplicate: true }
    }
    if (isSchemaError(msg)) {
      return {
        ok: false,
        code: 'schema_missing',
        error: 'Demo wallet is not installed on this database. Run backend/scripts/paytoday-add-demo-wallet.sql.',
      }
    }
    return { ok: false, code: 'unknown', error: msg }
  }
}

export async function tryDebitWalletHubDemo(
  pool: ConnectionPool,
  userId: string,
  amountCents: number,
  correlationId: string,
  payeeName: string,
  reference: string,
): Promise<HubDebitResult> {
  return tryDebitWalletWithCorrelation(pool, userId, amountCents, correlationId, payeeName, reference, 'hub_demo_spend')
}

/** Idempotent per (user_id, orderId) correlation — store checkout demo wallet pay. */
export async function tryDebitWalletStoreCheckout(
  pool: ConnectionPool,
  userId: string,
  orderId: string,
  amountCents: number,
  reference: string,
): Promise<HubDebitResult> {
  return tryDebitWalletWithCorrelation(
    pool,
    userId,
    amountCents,
    orderId,
    'PayToday Store checkout',
    reference,
    'store_checkout_spend',
  )
}

/**
 * Credits the demo wallet after a store refund (net amount after handling fee).
 * Idempotent per (user_id, reference) where reference is `store-refund:<orderId>`.
 */
export async function tryCreditWalletStoreRefund(
  pool: ConnectionPool,
  userId: string,
  orderId: string,
  netRefundCents: number,
): Promise<{ ok: true; balanceAfter: number; duplicate: boolean } | { ok: false; code: string; error: string }> {
  if (!Number.isFinite(netRefundCents) || netRefundCents < 1) {
    return { ok: false, code: 'invalid_amount', error: 'Refund credit amount must be at least 1 cent.' }
  }
  const reference = `store-refund:${orderId}`.slice(0, 120)
  const tx = pool.transaction()
  await tx.begin()
  try {
    const dup = await tx
      .request()
      .input('uid', userId)
      .input('ref', reference)
      .query<{ bal: number }>(
        `SELECT TOP 1 CAST(balance_after_cents AS BIGINT) AS bal
         FROM dbo.demo_wallet_ledger
         WHERE user_id = @uid AND reference = @ref AND entry_type = N'store_refund_credit'`,
      )
    const dupBal = dup.recordset[0]?.bal
    if (dupBal != null) {
      await tx.commit()
      return { ok: true, balanceAfter: dupBal, duplicate: true }
    }

    const upd = await tx
      .request()
      .input('uid', userId)
      .input('amt', netRefundCents)
      .query<{ bal: number }>(`
        UPDATE dbo.users WITH (UPDLOCK, ROWLOCK)
        SET wallet_demo_balance_cents = wallet_demo_balance_cents + @amt
        OUTPUT INSERTED.wallet_demo_balance_cents AS bal
        WHERE id = @uid
      `)
    const bal = upd.recordset[0]?.bal
    if (bal == null) {
      await rollbackQuiet(tx)
      return { ok: false, code: 'not_found', error: 'User not found' }
    }

    await tx
      .request()
      .input('uid', userId)
      .input('delta', netRefundCents)
      .input('bal', bal)
      .input('ref', reference)
      .query(`
        INSERT INTO dbo.demo_wallet_ledger (user_id, delta_cents, balance_after_cents, entry_type, reference, correlation_id, payee_label)
        VALUES (@uid, @delta, @bal, N'store_refund_credit', @ref, NULL, N'Store order refund')
      `)
    await tx.commit()
    return { ok: true, balanceAfter: bal, duplicate: false }
  } catch (e) {
    await rollbackQuiet(tx)
    const msg = e instanceof Error ? e.message : String(e)
    if (isSchemaError(msg)) {
      return {
        ok: false,
        code: 'schema_missing',
        error: 'Demo wallet is not installed on this database.',
      }
    }
    return { ok: false, code: 'unknown', error: msg }
  }
}

/**
 * Credits the demo wallet after a post-delivery return is completed (net after handling fee).
 * Idempotent per (user_id, reference) where reference is `store-return-refund:<returnCaseId>`.
 */
export async function tryCreditWalletReturnCaseRefund(
  pool: ConnectionPool,
  userId: string,
  returnCaseId: string,
  netRefundCents: number,
): Promise<{ ok: true; balanceAfter: number; duplicate: boolean } | { ok: false; code: string; error: string }> {
  if (!Number.isFinite(netRefundCents) || netRefundCents < 1) {
    return { ok: false, code: 'invalid_amount', error: 'Refund credit amount must be at least 1 cent.' }
  }
  const reference = `store-return-refund:${returnCaseId}`.slice(0, 120)
  const tx = pool.transaction()
  await tx.begin()
  try {
    const dup = await tx
      .request()
      .input('uid', userId)
      .input('ref', reference)
      .query<{ bal: number }>(
        `SELECT TOP 1 CAST(balance_after_cents AS BIGINT) AS bal
         FROM dbo.demo_wallet_ledger
         WHERE user_id = @uid AND reference = @ref AND entry_type = N'store_return_refund_credit'`,
      )
    const dupBal = dup.recordset[0]?.bal
    if (dupBal != null) {
      await tx.commit()
      return { ok: true, balanceAfter: dupBal, duplicate: true }
    }

    const upd = await tx
      .request()
      .input('uid', userId)
      .input('amt', netRefundCents)
      .query<{ bal: number }>(`
        UPDATE dbo.users WITH (UPDLOCK, ROWLOCK)
        SET wallet_demo_balance_cents = wallet_demo_balance_cents + @amt
        OUTPUT INSERTED.wallet_demo_balance_cents AS bal
        WHERE id = @uid
      `)
    const bal = upd.recordset[0]?.bal
    if (bal == null) {
      await rollbackQuiet(tx)
      return { ok: false, code: 'not_found', error: 'User not found' }
    }

    await tx
      .request()
      .input('uid', userId)
      .input('delta', netRefundCents)
      .input('bal', bal)
      .input('ref', reference)
      .query(`
        INSERT INTO dbo.demo_wallet_ledger (user_id, delta_cents, balance_after_cents, entry_type, reference, correlation_id, payee_label)
        VALUES (@uid, @delta, @bal, N'store_return_refund_credit', @ref, NULL, N'Store return refund')
      `)
    await tx.commit()
    return { ok: true, balanceAfter: bal, duplicate: false }
  } catch (e) {
    await rollbackQuiet(tx)
    const msg = e instanceof Error ? e.message : String(e)
    if (isSchemaError(msg)) {
      return {
        ok: false,
        code: 'schema_missing',
        error: 'Demo wallet is not installed on this database.',
      }
    }
    return { ok: false, code: 'unknown', error: msg }
  }
}
