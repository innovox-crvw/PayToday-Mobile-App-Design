import { env, loadDotenvFiles } from '../config/env.js'
import { mergeNotifyRuntime, notifyTransactionalEmailUrl, type NotifyRuntimeConfig } from './integrationRuntimeConfig.js'

export interface NotifySendInput {
  to: string
  templateKey: string
  payload: Record<string, unknown>
}

function stripTrailingSlashes(s: string): string {
  return s.replace(/\/+$/u, '')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
}

function moneyLine(cents: unknown, currency: unknown): string {
  const c = typeof cents === 'number' && Number.isFinite(cents) ? cents : Number(cents)
  const cur = typeof currency === 'string' && currency.trim() ? currency.trim() : 'NAD'
  if (!Number.isFinite(c)) return `${cur} —`
  return `${cur} ${(c / 100).toFixed(2)}`
}

function parseNotifyTemplateIdsJson(raw: string | undefined): Record<string, string> {
  const r = raw?.trim()
  if (!r) return {}
  try {
    const o = JSON.parse(r) as Record<string, unknown>
    if (!o || typeof o !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string' && v.trim()) out[k] = v.trim()
    }
    return out
  } catch {
    return {}
  }
}

function templateIdForKey(templateKey: string, notify: NotifyRuntimeConfig): string | undefined {
  const m = parseNotifyTemplateIdsJson(notify.emailTemplateIdsJson)
  return m[templateKey]?.trim() || undefined
}

function variablesForTemplate(payload: Record<string, unknown>, storeUrl: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined) continue
    out[k] = v
  }
  out.storeUrl = storeUrl
  return out
}

function buildFallbackEmail(
  templateKey: string,
  payload: Record<string, unknown>,
  storeUrl: string,
): { subject: string; html: string; text: string } {
  const store = storeUrl
  if (templateKey === 'checkout_pending_payment') {
    const orderId = String(payload.orderId ?? '')
    const total = moneyLine(payload.totalCents, payload.currency)
    const subject = 'Complete your PayToday order payment'
    const html = `<p>Thanks for your order.</p>
<p>Order: <strong>${escapeHtml(orderId)}</strong><br/>Total: <strong>${escapeHtml(total)}</strong></p>
<p><a href="${escapeHtml(store)}">Open store</a> to finish payment if you did not complete checkout.</p>`
    const text = `Thanks for your order.\nOrder: ${orderId}\nTotal: ${total}\nStore: ${store}`
    return { subject, html, text }
  }
  if (templateKey === 'payment_confirmed') {
    const orderId = String(payload.orderId ?? '')
    const subject = 'Payment received — PayToday order'
    const html = `<p>We received your payment for order <strong>${escapeHtml(orderId)}</strong>.</p>
<p><a href="${escapeHtml(store)}">View your orders</a> in the store.</p>`
    const text = `Payment received for order ${orderId}.\nStore: ${store}`
    return { subject, html, text }
  }
  if (templateKey === 'pickup_code_ready') {
    const orderId = String(payload.orderId ?? '')
    const code = String(payload.code ?? '')
    const subject = 'Your pickup code is ready'
    const html = `<p>Your order <strong>${escapeHtml(orderId)}</strong> is ready for collection.</p>
<p>Pickup code: <strong style="font-size:1.25em;letter-spacing:0.08em">${escapeHtml(code)}</strong></p>
<p>Show this code at the deposit location.</p>`
    const text = `Order ${orderId} is ready.\nPickup code: ${code}`
    return { subject, html, text }
  }
  if (templateKey === 'hub_demo_pending_payment') {
    const ref = String(payload.reference ?? '')
    const payee = String(payload.payeeName ?? '')
    const total = moneyLine(payload.amountCents, payload.currency)
    const hub = payload.variant === 'services' ? 'service' : 'hub'
    const subject = `Demo ${hub} payment — action required`
    const html = `<p>This is a <strong>client demo</strong> payment (no real charge).</p>
<p>Payee: <strong>${escapeHtml(payee)}</strong><br/>Amount: <strong>${escapeHtml(total)}</strong><br/>Reference: <code>${escapeHtml(ref)}</code></p>
<p>In production the customer would finish on the PayToday hosted page; here the app simulates that step.</p>`
    const text = `Demo ${hub} payment pending.\nPayee: ${payee}\nTotal: ${total}\nRef: ${ref}`
    return { subject, html, text }
  }
  if (templateKey === 'hub_demo_payment_completed') {
    const ref = String(payload.reference ?? '')
    const payee = String(payload.payeeName ?? '')
    const total = moneyLine(payload.amountCents, payload.currency)
    const hub = payload.variant === 'services' ? 'Service demo' : 'Hub demo'
    const subject = `Demo payment received — ${hub}`
    const html = `<p>We simulated a successful <strong>${escapeHtml(hub)}</strong> payment.</p>
<p>Payee: <strong>${escapeHtml(payee)}</strong><br/>Amount: <strong>${escapeHtml(total)}</strong><br/>Reference: <code>${escapeHtml(ref)}</code></p>`
    const text = `Demo payment confirmed.\nPayee: ${payee}\nTotal: ${total}\nRef: ${ref}`
    return { subject, html, text }
  }
  const subject = `PayToday notification (${templateKey})`
  const blob = escapeHtml(JSON.stringify(payload, null, 2))
  const html = `<p>Notification: <code>${escapeHtml(templateKey)}</code></p><pre>${blob}</pre>`
  const text = `${templateKey}\n${JSON.stringify(payload)}`
  return { subject, html, text }
}

/**
 * POST `…/email` or `…/{portal}/email` on the Today notify service (JSON, `x-api-key` header).
 * When portal template IDs are configured in env, sends with `templateId` + `variables`; otherwise HTML/text fallback.
 */
export async function sendNotifyTransactionalEmail(
  input: NotifySendInput,
  notify?: NotifyRuntimeConfig,
): Promise<{ ok: true } | { ok: false; error: string }> {
  loadDotenvFiles()
  const n = notify ?? mergeNotifyRuntime(null)
  const key = n.apiKey.trim()
  const base = stripTrailingSlashes(n.baseUrl.trim() || 'https://notify-service.today-ww.net/api/v1')
  if (!key || !base) {
    return {
      ok: false,
      error:
        'Notify service not configured (NOTIFY_SERVICE_API_KEY / NOTIFY_SERVICE_BASE_URL; optional NOTIFY_SERVICE_PORTAL)',
    }
  }

  const templateId = templateIdForKey(input.templateKey, n)
  const from = n.notificationEmailFrom.trim()
  const storeUrl = n.publicStoreUrl.trim() || env.publicStoreUrl.replace(/\/$/u, '')
  const vars = variablesForTemplate(input.payload, storeUrl)
  const fallback = buildFallbackEmail(input.templateKey, input.payload, storeUrl)

  const body: Record<string, unknown> = {
    to: input.to,
    subject: fallback.subject,
  }
  if (from) body.from = from
  if (templateId) {
    body.templateId = templateId
    body.variables = vars
  } else {
    body.html = fallback.html
    body.text = fallback.text
  }

  const url = notifyTransactionalEmailUrl(n)
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
      },
      body: JSON.stringify(body),
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'fetch failed' }
  }

  let parsed: { success?: boolean; error?: string; message?: string } = {}
  try {
    parsed = (await res.json()) as typeof parsed
  } catch {
    /* ignore */
  }

  if (!res.ok || parsed.success === false) {
    const msg = parsed.error || parsed.message || res.statusText || `HTTP ${res.status}`
    return { ok: false, error: msg }
  }

  return { ok: true }
}
