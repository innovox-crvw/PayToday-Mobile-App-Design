function fulfillmentStageShortLabel(stage: string): string {
  const s = stage.toLowerCase()
  const map: Record<string, string> = {
    pending: 'Pending',
    picking: 'Picking',
    packing: 'Packing',
    packed: 'Packed',
    shipped: 'Shipped',
    delivered: 'Delivered',
  }
  return map[s] || stage || 'Updated'
}

/** Titles/subtitles shown in the in-app notification list (aligned with email templates). */
export function inAppCopyForTemplate(templateKey: string, payloadJson: string): { title: string; body: string } {
  let payload: Record<string, unknown> = {}
  try {
    payload = JSON.parse(payloadJson) as Record<string, unknown>
  } catch {
    /* use defaults */
  }

  const orderId = String(payload.orderId ?? '').trim()
  const code = String(payload.code ?? '').trim()

  if (templateKey === 'checkout_pending_payment') {
    const cents = typeof payload.totalCents === 'number' ? payload.totalCents : Number(payload.totalCents)
    const currency = typeof payload.currency === 'string' && payload.currency.trim() ? payload.currency.trim() : 'NAD'
    const total =
      Number.isFinite(cents) && cents >= 0 ? `${currency} ${(cents / 100).toFixed(2)}` : `${currency} —`
    return {
      title: 'Complete your payment',
      body: orderId ? `Order ${orderId} · Total ${total}` : `Total ${total}`,
    }
  }

  if (templateKey === 'payment_confirmed') {
    return {
      title: 'Payment received',
      body: orderId ? `We confirmed payment for order ${orderId}.` : 'Your payment was confirmed.',
    }
  }

  if (templateKey === 'pickup_code_ready') {
    const exp = String(payload.expiresAt ?? '').trim()
    const expShort = exp ? ` · Expires ${exp.slice(0, 16).replace('T', ' ')} UTC` : ''
    return {
      title: 'Pickup code ready',
      body:
        code && orderId
          ? `Order ${orderId} · Code ${code}${expShort}`
          : code
            ? `Code: ${code}${expShort}`
            : 'Your order is ready for collection.',
    }
  }

  if (templateKey === 'fulfillment_stage_updated') {
    const stage = String(payload.stage ?? '').trim()
    const prev = String(payload.previousStage ?? '').trim()
    const label = fulfillmentStageShortLabel(stage)
    const prevLabel = prev ? fulfillmentStageShortLabel(prev) : ''
    return {
      title: 'Order fulfillment update',
      body:
        orderId && prevLabel && label !== prevLabel
          ? `Order ${orderId} · ${prevLabel} → ${label}`
          : orderId && label
            ? `Order ${orderId} · Now ${label}`
            : label
              ? `Fulfillment is now ${label}.`
              : 'Your order fulfillment status was updated.',
    }
  }

  if (templateKey === 'hub_demo_pending_payment') {
    const ref = String(payload.reference ?? '').trim()
    const payee = String(payload.payeeName ?? '').trim()
    const meter = String((payload as { meterOrAccountRef?: string }).meterOrAccountRef ?? '').trim()
    const cents = typeof payload.amountCents === 'number' ? payload.amountCents : Number(payload.amountCents)
    const currency = typeof payload.currency === 'string' && payload.currency.trim() ? payload.currency.trim() : 'NAD'
    const total =
      Number.isFinite(cents) && cents >= 0 ? `${currency} ${(cents / 100).toFixed(2)}` : `${currency} —`
    const hub = payload.variant === 'services' ? 'Service payment (demo)' : 'Hub payment (demo)'
    const meterBit = meter ? ` · Meter/account ${meter}` : ''
    return {
      title: 'Complete your demo payment',
      body: ref
        ? `${hub} · ${payee || 'Payee'} · ${total} · Ref ${ref}${meterBit}`
        : `${hub} · ${payee || 'Payee'} · ${total}${meterBit}`,
    }
  }

  if (templateKey === 'return_case_status') {
    const orderId = String(payload.orderId ?? '').trim()
    const status = String(payload.status ?? '').trim().toLowerCase()
    const label =
      status === 'pending'
        ? 'Submitted'
        : status === 'approved'
          ? 'Approved'
          : status === 'rejected'
            ? 'Rejected'
            : status === 'received'
              ? 'Received at warehouse'
              : status === 'completed'
                ? 'Refund completed'
                : status || 'Updated'
    return {
      title: 'Return request',
      body: orderId ? `Order ${orderId} · ${label}` : `Return · ${label}`,
    }
  }

  if (templateKey === 'order_dispute_submitted') {
    const orderId = String(payload.orderId ?? '').trim()
    const disputeId = String(payload.disputeId ?? '').trim()
    const status = String(payload.status ?? 'open').trim().toLowerCase()
    const statusLabel = status === 'open' ? 'Open' : status === 'in_review' ? 'In review' : status || 'Open'
    return {
      title: 'Dispute received',
      body:
        disputeId && orderId
          ? `Ref ${disputeId.slice(0, 8)}… · Order ${orderId} · ${statusLabel}`
          : disputeId
            ? `Ref ${disputeId.slice(0, 8)}… · ${statusLabel}`
            : 'Your dispute was submitted.',
    }
  }

  if (templateKey === 'merchant_paytoday_sync') {
    const name = String(payload.merchantName ?? 'Merchant').trim()
    const mid = payload.payTodayMerchantId
    const midStr =
      typeof mid === 'number' && Number.isFinite(mid)
        ? String(mid)
        : typeof mid === 'string'
          ? mid.trim()
          : ''
    const ev = String(payload.event ?? 'update').trim()
    return {
      title: name || 'Merchant update',
      body: midStr ? `PayToday merchant ${midStr} · ${ev}` : ev,
    }
  }

  if (templateKey === 'hub_demo_payment_completed') {
    const ref = String(payload.reference ?? '').trim()
    const payee = String(payload.payeeName ?? '').trim()
    const meter = String((payload as { meterOrAccountRef?: string }).meterOrAccountRef ?? '').trim()
    const hub = payload.variant === 'services' ? 'Service payment' : 'Hub payment'
    const meterBit = meter ? ` Meter/account ${meter}.` : ''
    return {
      title: 'Demo payment received',
      body: ref
        ? `${hub} confirmed for ${payee || 'payee'}. Reference ${ref}.${meterBit}`
        : `${hub} confirmed for ${payee || 'payee'}.${meterBit}`,
    }
  }

  return {
    title: 'PayToday',
    body: templateKey,
  }
}
