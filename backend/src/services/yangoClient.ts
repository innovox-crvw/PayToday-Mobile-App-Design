import { env } from '../config/env.js'

export type YangoDispatchInput = {
  orderId: string
  reference: string
  /** Customer drop-off address lines */
  dropoffLine1: string
  dropoffCity: string
  dropoffRegion: string | null
  dropoffPostal: string | null
  dropoffCountry: string
  totalCents: number
  currency: string
}

/**
 * Placeholder Yango integration: real API URLs and payloads depend on your Yango contract.
 * When `YANGO_ENABLED` and base URL + key are set, performs a best-effort POST and returns a synthetic id on success.
 */
export async function requestYangoDelivery(input: YangoDispatchInput): Promise<{
  ok: boolean
  deliveryId: string | null
  status: string | null
  trackingUrl: string | null
  detail?: string
}> {
  if (!env.yangoEnabled || !env.yangoApiBaseUrl || !env.yangoApiKey) {
    return { ok: false, deliveryId: null, status: null, trackingUrl: null, detail: 'Yango not configured' }
  }
  try {
    const url = `${env.yangoApiBaseUrl}/v1/deliveries`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.yangoApiKey}`,
      },
      body: JSON.stringify({
        externalId: input.reference,
        orderId: input.orderId,
        dropoff: {
          line1: input.dropoffLine1,
          city: input.dropoffCity,
          region: input.dropoffRegion,
          postalCode: input.dropoffPostal,
          country: input.dropoffCountry,
        },
        amount: { cents: input.totalCents, currency: input.currency },
      }),
    })
    const text = await res.text()
    if (!res.ok) {
      return { ok: false, deliveryId: null, status: null, trackingUrl: null, detail: text.slice(0, 500) }
    }
    let deliveryId: string | null = null
    let trackingUrl: string | null = null
    try {
      const j = JSON.parse(text) as { id?: string; deliveryId?: string; trackingUrl?: string; url?: string }
      deliveryId = (j.id ?? j.deliveryId ?? null) as string | null
      trackingUrl = (j.trackingUrl ?? j.url ?? null) as string | null
    } catch {
      /* ignore */
    }
    return {
      ok: true,
      deliveryId: deliveryId ?? `yango-pending-${input.orderId.slice(0, 8)}`,
      status: 'requested',
      trackingUrl,
    }
  } catch (e) {
    return {
      ok: false,
      deliveryId: null,
      status: null,
      trackingUrl: null,
      detail: e instanceof Error ? e.message : String(e),
    }
  }
}
