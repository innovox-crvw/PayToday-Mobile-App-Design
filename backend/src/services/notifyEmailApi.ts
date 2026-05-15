import { env, loadDotenvFiles } from '../config/env.js'
import { mergeNotifyRuntime, notifyTransactionalEmailUrl, type NotifyRuntimeConfig } from './integrationRuntimeConfig.js'
import { wrapStoreTransactionalEmail } from './transactionalEmailLayout.js'

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

/** Shared HTML/text for outbox templates (notify API fallback and optional SMTP). */
export function buildFallbackEmail(
  templateKey: string,
  payload: Record<string, unknown>,
  storeUrl: string,
): { subject: string; html: string; text: string } {
  const store = storeUrl
  if (templateKey === 'checkout_pending_payment') {
    const orderId = String(payload.orderId ?? '')
    const total = moneyLine(payload.totalCents, payload.currency)
    const subject = 'Complete your order payment — PayToday Store'
    const html = wrapStoreTransactionalEmail(
      {
        preheader: `Order ${orderId} — ${total} — payment pending`,
        title: 'Complete your payment',
        intro:
          'Thank you for your purchase. Your order is reserved. Please complete payment to confirm — use the button below to return to the store checkout.',
        details: [
          { label: 'Order reference', value: orderId || '—' },
          { label: 'Amount due', value: total },
        ],
        cta: { label: 'Continue to payment', href: store },
        footnote: 'If you have already paid, you can disregard this message once your confirmation email arrives.',
      },
      store,
    )
    const text = `PayToday Store — complete your payment\n\nOrder: ${orderId}\nTotal: ${total}\n\nOpen: ${store}`
    return { subject, html, text }
  }
  if (templateKey === 'payment_confirmed') {
    const orderId = String(payload.orderId ?? '')
    const subject = 'Payment received — PayToday Store'
    const html = wrapStoreTransactionalEmail(
      {
        preheader: `Payment confirmed for order ${orderId}`,
        title: 'Payment received',
        intro:
          'We have successfully received your payment. Your order is confirmed and will be processed according to the delivery method you selected.',
        details: [{ label: 'Order reference', value: orderId || '—' }],
        cta: { label: 'Open store', href: store },
        footnote: 'Thank you for shopping with PayToday Store.',
      },
      store,
    )
    const text = `PayToday Store — payment received\n\nOrder: ${orderId}\n\nView store: ${store}`
    return { subject, html, text }
  }
  if (templateKey === 'pickup_code_ready') {
    const orderId = String(payload.orderId ?? '')
    const code = String(payload.code ?? '')
    const expiresAtRaw = String(payload.expiresAt ?? '').trim()
    let expiryLine = ''
    if (expiresAtRaw) {
      try {
        const d = new Date(expiresAtRaw)
        if (!Number.isNaN(d.getTime())) {
          expiryLine = `<p style="margin:12px 0 0;font-size:13px;color:#b45309;">This code expires at <strong>${escapeHtml(d.toISOString().replace('T', ' ').slice(0, 19))}</strong> UTC. Generate a new one from your order page after it expires.</p>`
        }
      } catch {
        /* ignore */
      }
    }
    const subject = 'Your pickup code is ready — PayToday Store'
    const codeBox = `<p style="margin:0 0 6px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#71717a;">Pickup code</p>
<p style="margin:0;padding:16px 20px;background:#faf5ff;border:1px solid #e9d5ff;border-radius:10px;font-size:24px;font-weight:700;letter-spacing:0.18em;font-family:Consolas,'Courier New',monospace;color:#5b21b6;text-align:center;">${escapeHtml(code)}</p>
<p style="margin:12px 0 0;font-size:13px;color:#52525b;">Show this code at the deposit location when you collect your order.</p>${expiryLine}`
    const html = wrapStoreTransactionalEmail(
      {
        preheader: `Pickup code for order ${orderId}`,
        title: 'Ready for collection',
        intro: 'Your order is ready. Use the pickup code below when you arrive at the deposit location.',
        details: [{ label: 'Order reference', value: orderId || '—' }],
        extraHtml: [codeBox],
        cta: { label: 'Open store', href: store },
        footnote: 'Keep this code private — it may be required to release your parcel.',
      },
      store,
    )
    const text = `PayToday Store — pickup ready\n\nOrder: ${orderId}\nPickup code: ${code}${expiresAtRaw ? `\nExpires (UTC): ${expiresAtRaw}` : ''}\n\nStore: ${store}`
    return { subject, html, text }
  }
  if (templateKey === 'fulfillment_stage_updated') {
    const orderId = String(payload.orderId ?? '')
    const stage = String(payload.stage ?? '').trim()
    const previousStage = String(payload.previousStage ?? '').trim()
    const stageLabel = (s: string) => {
      const m: Record<string, string> = {
        pending: 'Pending',
        picking: 'Picking',
        packing: 'Packing',
        packed: 'Packed',
        shipped: 'Shipped',
        delivered: 'Delivered',
      }
      return m[s.toLowerCase()] || s || '—'
    }
    const cur = stageLabel(stage)
    const prev = previousStage ? stageLabel(previousStage) : ''
    const subject = `Order fulfillment: ${cur} — PayToday Store`
    const changed = prev && cur !== prev
    const html = wrapStoreTransactionalEmail(
      {
        preheader: changed ? `Order ${orderId}: ${prev} → ${cur}` : `Order ${orderId} is now ${cur}`,
        title: 'Fulfillment update',
        intro: changed
          ? `Our fulfillment team updated your order. The fulfillment stage moved from ${escapeHtml(prev)} to ${escapeHtml(cur)}.`
          : `Your order fulfillment status is now ${escapeHtml(cur)}.`,
        details: [
          { label: 'Order reference', value: orderId || '—' },
          { label: 'Current stage', value: cur },
          ...(changed ? [{ label: 'Previous stage', value: prev }] : []),
        ],
        cta: { label: 'View order', href: store },
        footnote: 'You can track progress in the store under My orders when signed in.',
      },
      store,
    )
    const textLines = [
      'PayToday Store — fulfillment update',
      '',
      `Order: ${orderId}`,
      `Stage: ${cur}`,
      ...(changed ? [`Previous: ${prev}`] : []),
      '',
      `Store: ${store}`,
    ]
    return { subject, html, text: textLines.join('\n') }
  }
  if (templateKey === 'return_case_status') {
    const orderId = String(payload.orderId ?? '')
    const returnCaseId = String(payload.returnCaseId ?? '')
    const status = String(payload.status ?? '').toLowerCase()
    const message = String(payload.message ?? '').trim()
    const statusLabel =
      status === 'pending'
        ? 'Received'
        : status === 'approved'
          ? 'Approved'
          : status === 'rejected'
            ? 'Rejected'
            : status === 'received'
              ? 'Items received'
              : status === 'completed'
                ? 'Completed'
                : status || 'Updated'
    const subject = `Return update: ${statusLabel} — PayToday Store`
    const html = wrapStoreTransactionalEmail(
      {
        preheader: `Return ${returnCaseId.slice(0, 8)}… · ${statusLabel}`,
        title: 'Return request update',
        intro: message || `Your return request for order ${orderId || '—'} is now ${statusLabel.toLowerCase()}.`,
        details: [
          { label: 'Order reference', value: orderId || '—' },
          { label: 'Return reference', value: returnCaseId || '—' },
          { label: 'Status', value: statusLabel },
        ],
        cta: { label: 'Open store', href: store },
        footnote: 'Ship approved returns only to the address provided by support.',
      },
      store,
    )
    const text = [
      'PayToday Store — return update',
      '',
      `Order: ${orderId}`,
      `Return case: ${returnCaseId}`,
      `Status: ${statusLabel}`,
      message ? `\n${message}` : '',
      '',
      `Store: ${store}`,
    ].join('\n')
    return { subject, html, text }
  }
  if (templateKey === 'order_dispute_submitted') {
    const orderId = String(payload.orderId ?? '')
    const disputeId = String(payload.disputeId ?? '')
    const statusRaw = String(payload.status ?? 'open').toLowerCase()
    const statusLabel =
      statusRaw === 'open'
        ? 'Open'
        : statusRaw === 'in_review'
          ? 'In review'
          : statusRaw === 'resolved'
            ? 'Resolved'
            : statusRaw === 'dismissed'
              ? 'Dismissed'
              : statusRaw || 'Open'
    const reasonPreview = String(payload.reasonPreview ?? '').trim()
    const subject = `Dispute received — reference ${disputeId.slice(0, 8)}… — PayToday Store`
    const html = wrapStoreTransactionalEmail(
      {
        preheader: `Dispute ${disputeId.slice(0, 8)}… · ${statusLabel}`,
        title: 'We received your dispute',
        intro:
          'Thank you for letting us know. Support will review your case. Please quote your dispute reference in any follow-up messages.',
        details: [
          { label: 'Dispute reference', value: disputeId || '—' },
          { label: 'Order reference', value: orderId || '—' },
          { label: 'Status', value: statusLabel },
          ...(reasonPreview ? [{ label: 'Reason', value: reasonPreview }] : []),
        ],
        cta: { label: 'Open store', href: store },
        footnote: 'You can track updates from your order page when signed in.',
      },
      store,
    )
    const text = [
      'PayToday Store — dispute received',
      '',
      `Dispute reference: ${disputeId}`,
      `Order: ${orderId}`,
      `Status: ${statusLabel}`,
      reasonPreview ? `Reason: ${reasonPreview}` : '',
      '',
      `Store: ${store}`,
    ]
      .filter(Boolean)
      .join('\n')
    return { subject, html, text }
  }
  if (templateKey === 'hub_demo_pending_payment') {
    const ref = String(payload.reference ?? '')
    const payee = String(payload.payeeName ?? '')
    const meter = String((payload as { meterOrAccountRef?: string }).meterOrAccountRef ?? '').trim()
    const total = moneyLine(payload.amountCents, payload.currency)
    const hub = payload.variant === 'services' ? 'service' : 'hub'
    const subject = `Demo ${hub} payment — action required`
    const details: { label: string; value: string }[] = [
      { label: 'Payee', value: payee || '—' },
      { label: 'Amount', value: total },
      { label: 'Reference', value: ref || '—' },
    ]
    if (meter) details.splice(2, 0, { label: 'Meter / account', value: meter })
    const html = wrapStoreTransactionalEmail(
      {
        preheader: `Demo ${hub} — ${total} — reference ${ref}`,
        title: `Demo ${hub} payment`,
        intro:
          'This is a sandbox / client demonstration. No real funds are moved. In production the customer would complete checkout on the PayToday hosted flow.',
        details,
        cta: { label: 'Open store', href: store },
      },
      store,
    )
    const text = `Demo ${hub} payment pending.\nPayee: ${payee}\nTotal: ${total}\nRef: ${ref}${meter ? `\nMeter/account: ${meter}` : ''}`
    return { subject, html, text }
  }
  if (templateKey === 'hub_demo_payment_completed') {
    const ref = String(payload.reference ?? '')
    const payee = String(payload.payeeName ?? '')
    const meter = String((payload as { meterOrAccountRef?: string }).meterOrAccountRef ?? '').trim()
    const total = moneyLine(payload.amountCents, payload.currency)
    const hub = payload.variant === 'services' ? 'Service demo' : 'Hub demo'
    const subject = `Demo payment received — ${hub}`
    const details: { label: string; value: string }[] = [
      { label: 'Payee', value: payee || '—' },
      { label: 'Amount', value: total },
      { label: 'Reference', value: ref || '—' },
    ]
    if (meter) details.splice(2, 0, { label: 'Meter / account', value: meter })
    const html = wrapStoreTransactionalEmail(
      {
        preheader: `Demo payment confirmed — ${ref}`,
        title: 'Demo payment received',
        intro: `We simulated a successful ${hub} payment in the demo environment.`,
        details,
        cta: { label: 'Open store', href: store },
      },
      store,
    )
    const text = `Demo payment confirmed.\nPayee: ${payee}\nTotal: ${total}\nRef: ${ref}${meter ? `\nMeter/account: ${meter}` : ''}`
    return { subject, html, text }
  }
  const subject = `PayToday Store — ${templateKey}`
  const blob = escapeHtml(JSON.stringify(payload, null, 2))
  const html = wrapStoreTransactionalEmail(
    {
      preheader: subject,
      title: 'Store notification',
      intro: `You have a new notification (${templateKey}).`,
      extraHtml: [
        `<pre style="margin:0;padding:14px;background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;font-size:12px;overflow:auto;">${blob}</pre>`,
      ],
      cta: { label: 'Open store', href: store },
    },
    store,
  )
  const text = `${templateKey}\n${JSON.stringify(payload)}`
  return { subject, html, text }
}

/**
 * POST PayToday Notifications transactional mail:
 * - Flat path: `{NOTIFY_SERVICE_BASE_URL}/email` (“Send custom email” in Postman) — `to`, `subject`, `html`, `text`, optional `from`.
 * - Portal path: `{base}/{portal}/email` when `NOTIFY_SERVICE_PORTAL` is set and flat mode is off.
 * Auth: `X-API-Key` (Postman). Portal `templateId` payloads are skipped when `NOTIFY_SERVICE_USE_FLAT_EMAIL_PATH=true`.
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
        'Notify service not configured (NOTIFY_SERVICE_API_KEY / NOTIFY_SERVICE_BASE_URL; optional NOTIFY_SERVICE_PORTAL or NOTIFY_SERVICE_USE_FLAT_EMAIL_PATH)',
    }
  }

  const templateId = n.useFlatEmailPath ? undefined : templateIdForKey(input.templateKey, n)
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
        Accept: 'application/json',
        'X-API-Key': key,
      },
      body: JSON.stringify(body),
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'fetch failed' }
  }

  let parsed: { success?: boolean; error?: string; message?: string } = {}
  try {
    const ct = res.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) {
      parsed = (await res.json()) as typeof parsed
    }
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    const msg = parsed.error || parsed.message || res.statusText || `HTTP ${res.status}`
    return { ok: false, error: msg }
  }
  if (parsed.success === false) {
    const msg = parsed.error || parsed.message || 'Notify service returned success: false'
    return { ok: false, error: msg }
  }

  return { ok: true }
}
