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
    return {
      title: 'Pickup code ready',
      body: code && orderId ? `Order ${orderId} · Code ${code}` : code ? `Code: ${code}` : 'Your order is ready for collection.',
    }
  }

  if (templateKey === 'hub_demo_pending_payment') {
    const ref = String(payload.reference ?? '').trim()
    const payee = String(payload.payeeName ?? '').trim()
    const cents = typeof payload.amountCents === 'number' ? payload.amountCents : Number(payload.amountCents)
    const currency = typeof payload.currency === 'string' && payload.currency.trim() ? payload.currency.trim() : 'NAD'
    const total =
      Number.isFinite(cents) && cents >= 0 ? `${currency} ${(cents / 100).toFixed(2)}` : `${currency} —`
    const hub = payload.variant === 'services' ? 'Service payment (demo)' : 'Hub payment (demo)'
    return {
      title: 'Complete your demo payment',
      body: ref ? `${hub} · ${payee || 'Payee'} · ${total} · Ref ${ref}` : `${hub} · ${payee || 'Payee'} · ${total}`,
    }
  }

  if (templateKey === 'hub_demo_payment_completed') {
    const ref = String(payload.reference ?? '').trim()
    const payee = String(payload.payeeName ?? '').trim()
    const hub = payload.variant === 'services' ? 'Service payment' : 'Hub payment'
    return {
      title: 'Demo payment received',
      body: ref
        ? `${hub} confirmed for ${payee || 'payee'}. Reference ${ref}.`
        : `${hub} confirmed for ${payee || 'payee'}.`,
    }
  }

  return {
    title: 'PayToday',
    body: templateKey,
  }
}
