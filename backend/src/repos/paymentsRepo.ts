import type { ConnectionPool } from 'mssql'

export async function updatePaymentReference(pool: ConnectionPool, orderId: string, reference: string): Promise<void> {
  await pool
    .request()
    .input('oid', orderId)
    .input('ref', reference)
    .query(`UPDATE dbo.payments SET payment_reference = @ref WHERE order_id = @oid`)
}

export async function setPaymentProcessing(pool: ConnectionPool, orderId: string): Promise<void> {
  await pool
    .request()
    .input('oid', orderId)
    .query(`UPDATE dbo.payments SET status = N'processing' WHERE order_id = @oid`)
}

export async function recordBrowserPaymentReturn(
  pool: ConnectionPool,
  orderId: string,
  hint: 'success' | 'failed' | 'cancelled' | 'unknown',
): Promise<void> {
  await pool
    .request()
    .input('oid', orderId)
    .input('hint', hint)
    .query(`
      UPDATE dbo.payments SET
        browser_return_at = SYSUTCDATETIME(),
        browser_return_status = @hint
      WHERE order_id = @oid
    `)
}

export async function markPaymentWebhookProcessed(pool: ConnectionPool, orderId: string): Promise<void> {
  await pool
    .request()
    .input('oid', orderId)
    .query(`
      UPDATE dbo.payments SET webhook_processed_at = SYSUTCDATETIME()
      WHERE order_id = @oid AND webhook_processed_at IS NULL
    `)
}

export async function markPaymentFailedFromWebhook(pool: ConnectionPool, orderId: string): Promise<void> {
  await pool
    .request()
    .input('oid', orderId)
    .query(`
      UPDATE dbo.payments SET
        status = N'failed',
        webhook_processed_at = COALESCE(webhook_processed_at, SYSUTCDATETIME())
      WHERE order_id = @oid AND status <> N'captured'
    `)
}

export async function getPaymentRowForOrder(
  pool: ConnectionPool,
  orderId: string,
): Promise<{
  status: string
  payment_reference: string | null
  browser_return_status: string | null
  webhook_processed_at: Date | null
} | null> {
  const r = await pool
    .request()
    .input('oid', orderId)
    .query<{
      status: string
      payment_reference: string | null
      browser_return_status: string | null
      webhook_processed_at: Date | null
    }>(`
      SELECT status, payment_reference, browser_return_status, webhook_processed_at
      FROM dbo.payments WHERE order_id = @oid
    `)
  return r.recordset[0] ?? null
}
