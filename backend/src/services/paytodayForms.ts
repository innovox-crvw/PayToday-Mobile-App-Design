import { mergePayTodayRuntime, type PayTodayRuntimeConfig } from './integrationRuntimeConfig.js'

export type { PayTodayRuntimeConfig }

export interface PaymentRedirectParams {
  orderId: string
  reference: string
  totalCents: number
  currency: string
  returnPath?: string
  cancelPath?: string
  /** Required when PAYTODAY_PAYMENT_INTENT_URL is set (guest or signed-in payer email). */
  userEmail?: string | null
  invoiceNumber?: string | null
  userFirstName?: string | null
  userLastName?: string | null
  userPhone?: string | null
}

export type PaymentRedirectResolution = {
  redirectUrl: string
  /** Populated when PayToday Payment Intent API returns `payment_intent_token`. */
  paymentIntentToken?: string | null
}

export class PayTodayPaymentIntentError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 502,
  ) {
    super(message)
    this.name = 'PayTodayPaymentIntentError'
  }
}

function asPt(pt?: PayTodayRuntimeConfig): PayTodayRuntimeConfig {
  return pt ?? mergePayTodayRuntime(null)
}

/** When `pt` is omitted, uses env + optional `dbo.integration_settings` merge (pass merged config from checkout when SQL is available). */
export function isPaymentIntentMode(pt?: PayTodayRuntimeConfig): boolean {
  return asPt(pt).paymentIntentUrl.length > 0
}

function apiReturnUrl(pt: PayTodayRuntimeConfig, reference: string, orderId: string): string {
  const q = new URLSearchParams({ reference, orderId })
  return `${pt.publicApiUrl}/api/payments/return?${q.toString()}`
}

function buildQueryStringRedirect(pt: PayTodayRuntimeConfig, p: PaymentRedirectParams): PaymentRedirectResolution {
  const base = pt.formsBaseUrl.replace(/\/$/u, '')
  if (!base) {
    const qp = new URLSearchParams({
      orderId: p.orderId,
      demo: '1',
    })
    return { redirectUrl: `${pt.publicStoreUrl}/checkout/complete?${qp.toString()}` }
  }
  const successUrl = apiReturnUrl(pt, p.reference, p.orderId)
  const cancelUrl = `${pt.publicStoreUrl}${p.cancelPath ?? '/checkout/failure'}?orderId=${encodeURIComponent(p.orderId)}`
  const q = new URLSearchParams({
    amount: (p.totalCents / 100).toFixed(2),
    currency: p.currency,
    reference: p.reference,
    orderId: p.orderId,
    returnUrl: successUrl,
    cancelUrl,
  })
  if (pt.vendorId) q.set('vi', pt.vendorId)
  if (pt.businessId) q.set('businessId', pt.businessId)
  return { redirectUrl: `${base}?${q.toString()}` }
}

function parseBusinessId(pt: PayTodayRuntimeConfig): number {
  const raw = pt.businessId.trim()
  if (!raw) {
    throw new PayTodayPaymentIntentError('PAYTODAY_BUSINESS_ID is required for PayToday payment intent.', 500)
  }
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) {
    throw new PayTodayPaymentIntentError('PAYTODAY_BUSINESS_ID must be a positive integer.', 500)
  }
  return n
}

async function resolveOfficialPaymentIntent(
  pt: PayTodayRuntimeConfig,
  p: PaymentRedirectParams,
): Promise<PaymentRedirectResolution> {
  const vi = pt.vendorId.trim()
  if (!vi) {
    throw new PayTodayPaymentIntentError('PAYTODAY_VENDOR_ID (verification id `vi`) is required for payment intent.', 500)
  }
  const email = p.userEmail?.trim()
  if (!email) {
    throw new PayTodayPaymentIntentError(
      'Payer email is required for PayToday payment intent (guestEmail or signed-in user).',
      400,
    )
  }
  const businessId = parseBusinessId(pt)
  const amount = Number.parseFloat((p.totalCents / 100).toFixed(2))
  if (!(amount > 0)) {
    throw new PayTodayPaymentIntentError('Order total must be greater than zero.', 400)
  }
  if (p.currency !== 'NAD') {
    console.warn('[paytoday] Payment intent email examples use NAD; currency is', p.currency)
  }

  const returnUrl = apiReturnUrl(pt, p.reference, p.orderId)
  const body: Record<string, string | number> = {
    vi,
    amount,
    reference: p.reference,
    business_id: businessId,
    user_email: email,
    return_url: returnUrl,
  }
  const inv = p.invoiceNumber?.trim()
  if (inv) body.invoice_number = inv
  const fn = p.userFirstName?.trim()
  if (fn) body.user_first_name = fn
  const ln = p.userLastName?.trim()
  if (ln) body.user_last_name = ln
  const ph = p.userPhone?.trim()
  if (ph) body.user_phone_number = ph

  const url = pt.paymentIntentUrl
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e) {
    console.error('[paytoday] Payment intent network error', e)
    throw new PayTodayPaymentIntentError('Could not reach PayToday payment intent API.', 502)
  }

  const text = await res.text()
  let data: {
    success?: boolean
    message?: string
    error?: string
    payment_url?: string
    payment_intent_token?: string
  }
  try {
    data = text ? (JSON.parse(text) as typeof data) : {}
  } catch {
    throw new PayTodayPaymentIntentError(`PayToday returned non-JSON (${res.status}).`, 502)
  }

  if (!((res.status === 201 || res.status === 200) && data.success)) {
    const msg = data.error || data.message || `PayToday payment intent failed (HTTP ${res.status}).`
    console.warn('[paytoday] Payment intent error', res.status, text.slice(0, 500))
    throw new PayTodayPaymentIntentError(msg, res.status >= 400 && res.status < 600 ? res.status : 502)
  }
  const payUrl = data.payment_url
  if (typeof payUrl !== 'string' || payUrl.length === 0) {
    throw new PayTodayPaymentIntentError('PayToday response missing payment_url.', 502)
  }
  const token =
    typeof data.payment_intent_token === 'string' && data.payment_intent_token.length > 0
      ? data.payment_intent_token
      : null
  return { redirectUrl: payUrl, paymentIntentToken: token }
}

async function resolveLegacyFormsApi(
  pt: PayTodayRuntimeConfig,
  p: PaymentRedirectParams,
): Promise<PaymentRedirectResolution> {
  const apiUrl = pt.formsApiUrl.trim()
  const successUrl = apiReturnUrl(pt, p.reference, p.orderId)
  const cancelUrl = `${pt.publicStoreUrl}${p.cancelPath ?? '/checkout/failure'}?orderId=${encodeURIComponent(p.orderId)}`
  const body = {
    vendorId: pt.vendorId || undefined,
    businessId: pt.businessId || undefined,
    amountCents: p.totalCents,
    currency: p.currency,
    reference: p.reference,
    orderId: p.orderId,
    returnUrl: successUrl,
    cancelUrl,
  }

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.warn('[paytoday] Forms API error', res.status, await res.text())
      return buildQueryStringRedirect(pt, p)
    }
    const data = (await res.json()) as { redirectUrl?: string; url?: string }
    const url = data.redirectUrl ?? data.url
    if (typeof url === 'string' && url.length > 0) {
      return { redirectUrl: url }
    }
  } catch (e) {
    console.warn('[paytoday] Forms API fetch failed', e)
  }
  return buildQueryStringRedirect(pt, p)
}

/**
 * Resolves the customer redirect URL.
 * Pass `pt` from `mergePayTodayRuntime(await getIntegrationSettingsMap(pool))` so PayToday URLs/secrets can live in SQL.
 */
export async function resolvePaymentRedirect(
  p: PaymentRedirectParams,
  pt?: PayTodayRuntimeConfig,
): Promise<PaymentRedirectResolution> {
  const c = asPt(pt)
  if (c.paymentIntentUrl) {
    return resolveOfficialPaymentIntent(c, p)
  }
  if (c.formsApiUrl.trim()) {
    return resolveLegacyFormsApi(c, p)
  }
  return buildQueryStringRedirect(c, p)
}
