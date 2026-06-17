import type { ConnectionPool } from 'mssql'
import { env } from '../config/env.js'
import { requestYangoDelivery } from './yangoClient.js'

/**
 * After payment, request a Yango courier for paid orders where the customer chose **Yango delivery**
 * (`delivery_method = yango_delivery`). Generic home delivery does not trigger the Yango API.
 */
export async function tryYangoDispatchAfterPaid(pool: ConnectionPool, orderId: string): Promise<void> {
  if (!env.yangoEnabled) return

  const o = await pool
    .request()
    .input('oid', orderId)
    .query<{
      delivery_method: string
      status: string
      total_cents: number
      currency: string
      paytoday_reference: string | null
      line1: string | null
      city: string | null
      region: string | null
      postal_code: string | null
      country: string | null
    }>(`
      SELECT o.delivery_method, o.status, o.total_cents, o.currency, o.paytoday_reference,
        sa.line1, sa.city, sa.region, sa.postal_code, sa.country
      FROM dbo.orders o
      LEFT JOIN dbo.addresses sa ON sa.id = o.shipping_address_id
      WHERE o.id = @oid
    `)
  const row = o.recordset[0]
  if (!row || row.status?.toLowerCase() !== 'paid') return
  if (row.delivery_method?.toLowerCase() !== 'yango_delivery') return
  const line1 = row.line1?.trim()
  const city = row.city?.trim()
  if (!line1 || !city) {
    console.warn('[yango] skip dispatch: incomplete shipping address', orderId)
    return
  }

  const ref = row.paytoday_reference?.trim() || `PTSTORE-${orderId}`
  const res = await requestYangoDelivery({
    orderId,
    reference: ref,
    dropoffLine1: line1,
    dropoffCity: city,
    dropoffRegion: row.region?.trim() || null,
    dropoffPostal: row.postal_code?.trim() || null,
    dropoffCountry: (row.country ?? 'NA').trim() || 'NA',
    totalCents: Number(row.total_cents ?? 0),
    currency: (row.currency ?? 'NAD').trim(),
  })

  if (!res.ok || !res.deliveryId) {
    console.warn('[yango] dispatch failed', orderId, res.detail ?? res)
    return
  }

  try {
    await pool
      .request()
      .input('oid', orderId)
      .input('yid', res.deliveryId)
      .input('yst', res.status ?? 'requested')
      .input('yurl', res.trackingUrl)
      .query(`
      UPDATE dbo.fulfillment_tasks SET
        yango_delivery_id = @yid,
        yango_status = @yst,
        yango_tracking_url = @yurl,
        carrier_name = COALESCE(carrier_name, N'Yango'),
        updated_at = SYSUTCDATETIME()
      WHERE order_id = @oid
    `)
  } catch (e) {
    console.warn('[yango] could not persist fulfillment Yango fields (migration 055?)', e)
  }
}
