import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { formatMoney } from '../../lib/money'
import { formatOrderStatusLabel } from '../../lib/orderStatusDisplay'

const REFUND_FEE_BPS = 1000

type Detail = {
  order: {
    orderId: string
    status: string
    subtotal_cents: number
    shipping_cents: number
    tax_cents: number
    total_cents: number
    currency: string
    delivery_method: string
    deposit_location_id: string | null
    deposit_location_name: string | null
  }
  lines: { productName: string; sku: string; quantity: number; unitPriceCents: number }[]
  fulfillment: { stage: string; carrier_name: string | null; tracking_reference: string | null } | null
  shippingAddress: {
    label: string | null
    line1: string
    line2: string | null
    city: string
    region: string | null
    postal_code: string | null
    country: string
  } | null
  pickupMasked: boolean
  activePickupCodes: number
}

function feeFromTotalCents(totalCents: number): { fee: number; net: number } {
  const fee = Math.floor((totalCents * REFUND_FEE_BPS) / 10000)
  return { fee, net: Math.max(0, totalCents - fee) }
}

function emailFromSearch(search: string): string {
  return new URLSearchParams(search).get('email')?.trim() ?? ''
}

export function OrderDetailPage() {
  const { orderId } = useParams()
  const { pathname, search } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const [detail, setDetail] = useState<Detail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pickupCode, setPickupCode] = useState('')
  const [pickupMsg, setPickupMsg] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<{ severity: 'success' | 'warning' | 'info'; text: string } | null>(null)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [refundBusy, setRefundBusy] = useState(false)
  const [volatilePickup, setVolatilePickup] = useState<{ code: string; expiresAt: string } | null>(null)
  const [pickupGenBusy, setPickupGenBusy] = useState(false)
  const [pickupGenErr, setPickupGenErr] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  /** Email used for guest API calls (query + POST). */
  const [guestEmailDraft, setGuestEmailDraft] = useState(() => emailFromSearch(search))
  const [guestEmailActive, setGuestEmailActive] = useState(() => emailFromSearch(search))

  useEffect(() => {
    setGuestEmailDraft(emailFromSearch(search))
    setGuestEmailActive(emailFromSearch(search))
  }, [orderId, search])

  useEffect(() => {
    if (!volatilePickup) return
    const t = window.setInterval(() => setNowMs(Date.now()), 250)
    return () => window.clearInterval(t)
  }, [volatilePickup])

  const loadDetail = useCallback(async () => {
    if (!orderId) return
    const path = guestEmailActive.trim()
      ? `/api/orders/${orderId}?email=${encodeURIComponent(guestEmailActive.trim())}`
      : `/api/orders/${orderId}`
    const res = await fetch(apiUrl(path), { credentials: 'include' })
    if (!res.ok) throw new Error(await res.text())
    setDetail((await res.json()) as Detail)
  }, [orderId, guestEmailActive])

  useEffect(() => {
    if (!orderId) return
    void (async () => {
      try {
        setErr(null)
        await loadDetail()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to load')
      }
    })()
  }, [orderId, loadDetail])

  function orderActionPath(suffix: string): string {
    const base = `/api/orders/${orderId}/${suffix}`
    const em = guestEmailActive.trim()
    return em ? `${base}?email=${encodeURIComponent(em)}` : base
  }

  async function generateVolatilePickupCode() {
    if (!orderId) return
    setPickupGenErr(null)
    setPickupGenBusy(true)
    try {
      await fetchCsrfToken()
      const res = await apiFetch(orderActionPath('pickup-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = (await res.json()) as {
        error?: string
        pickupCode?: string
        expiresAt?: string
        ttlSeconds?: number
      }
      if (!res.ok) {
        setPickupGenErr(data.error ?? 'Could not generate code')
        setVolatilePickup(null)
        return
      }
      const code = data.pickupCode ?? ''
      const expiresAt = data.expiresAt ?? ''
      if (!code || !expiresAt) {
        setPickupGenErr('Unexpected response from server')
        setVolatilePickup(null)
        return
      }
      setVolatilePickup({ code, expiresAt })
      setPickupCode(code)
      await loadDetail()
    } catch (e) {
      setPickupGenErr(e instanceof Error ? e.message : 'Failed')
      setVolatilePickup(null)
    } finally {
      setPickupGenBusy(false)
    }
  }

  async function verifyPickup() {
    setPickupMsg(null)
    try {
      await fetchCsrfToken()
      const url = guestEmailActive.trim()
        ? `/api/orders/${orderId}/pickup/verify?email=${encodeURIComponent(guestEmailActive.trim())}`
        : `/api/orders/${orderId}/pickup/verify`
      const res = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: pickupCode }),
      })
      const data = (await res.json()) as { error?: string; ok?: boolean }
      if (!res.ok) {
        setPickupMsg(data.error ?? 'Failed')
        return
      }
      setPickupMsg('Code accepted.')
      setVolatilePickup(null)
      await loadDetail()
    } catch (e) {
      setPickupMsg(e instanceof Error ? e.message : 'Failed')
    }
  }

  async function cancelOrder() {
    if (!orderId) return
    setActionMsg(null)
    setCancelBusy(true)
    try {
      await fetchCsrfToken()
      const res = await apiFetch(orderActionPath('cancel'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = (await res.json()) as { error?: string; ok?: boolean }
      if (!res.ok) {
        setActionMsg({ severity: 'warning', text: data.error ?? (await res.text()) })
        return
      }
      setActionMsg({ severity: 'success', text: 'Order cancelled. Any reserved stock has been released.' })
      await loadDetail()
    } catch (e) {
      setActionMsg({ severity: 'warning', text: e instanceof Error ? e.message : 'Cancel failed' })
    } finally {
      setCancelBusy(false)
    }
  }

  async function confirmRefund() {
    if (!orderId) return
    setRefundBusy(true)
    setActionMsg(null)
    try {
      await fetchCsrfToken()
      const res = await apiFetch(orderActionPath('refund'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
      const data = (await res.json()) as {
        error?: string
        ok?: boolean
        handlingFeeCents?: number
        netRefundCents?: number
        walletNote?: string
      }
      if (!res.ok) {
        setActionMsg({ severity: 'warning', text: data.error ?? (await res.text()) })
        return
      }
      const cur = detail?.order
      const ccy = cur?.currency ?? 'NAD'
      const parts = [
        `Refund completed. Handling fee ${formatMoney(data.handlingFeeCents ?? 0, ccy)}; you receive ${formatMoney(data.netRefundCents ?? 0, ccy)}.`,
      ]
      if (data.walletNote) {
        parts.push(data.walletNote)
      }
      setActionMsg({ severity: 'success', text: parts.join(' ') })
      setRefundOpen(false)
      await loadDetail()
    } catch (e) {
      setActionMsg({ severity: 'warning', text: e instanceof Error ? e.message : 'Refund failed' })
    } finally {
      setRefundBusy(false)
    }
  }

  if (err) {
    return (
      <Stack sx={{ py: 4, maxWidth: 560, mx: 'auto' }}>
        <Alert severity="error">{err}</Alert>
        <Button component={RouterLink} to={`${pathPrefix}/orders`} sx={{ mt: 2 }}>
          Back
        </Button>
      </Stack>
    )
  }
  if (!detail?.order) return <Typography sx={{ p: 2 }}>Loading…</Typography>

  const o = detail.order
  const st = o.status
  const terminal = ['shipped', 'delivered', 'cancelled', 'refunded'].includes(st)
  const canCancelUnpaid = (st === 'pending_payment' || st === 'draft') && !terminal
  const canRefundPaid = (st === 'paid' || st === 'processing') && !['shipped', 'delivered', 'cancelled', 'refunded'].includes(st)
  const { fee: previewFee, net: previewNet } = feeFromTotalCents(o.total_cents)
  const depositPickupEligible =
    o.delivery_method === 'deposit_box' && (st === 'paid' || st === 'processing')
  const volatileExpiresMs = volatilePickup ? new Date(volatilePickup.expiresAt).getTime() : 0
  const volatileSecondsLeft = volatilePickup ? Math.max(0, Math.ceil((volatileExpiresMs - nowMs) / 1000)) : 0
  const volatileExpiredOnClient = Boolean(volatilePickup && volatileSecondsLeft <= 0)

  return (
    <Stack spacing={2} sx={{ maxWidth: 560, mx: 'auto', py: 2 }}>
      <Typography variant="h5" fontWeight={800}>
        Order
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
        {o.orderId}
      </Typography>
      <Typography color="text.secondary">
        {formatOrderStatusLabel(o.status)} · {o.delivery_method}
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
        <TextField
          size="small"
          label="Guest order email"
          value={guestEmailDraft}
          onChange={(e) => setGuestEmailDraft(e.target.value)}
          fullWidth
          helperText="Required for guest checkout. Click Apply after editing."
        />
        <Button variant="outlined" onClick={() => setGuestEmailActive(guestEmailDraft.trim())}>
          Apply
        </Button>
      </Stack>
      <Typography>
        Subtotal {(o.subtotal_cents / 100).toFixed(2)} · Shipping {(o.shipping_cents / 100).toFixed(2)} · Tax{' '}
        {(o.tax_cents / 100).toFixed(2)}
      </Typography>
      <Typography variant="h6" fontWeight={800}>
        Total {(o.total_cents / 100).toFixed(2)} {o.currency}
      </Typography>
      <Typography variant="subtitle1" fontWeight={700}>
        Items
      </Typography>
      {detail.lines.map((l) => (
        <Typography key={l.sku}>
          {l.productName} × {l.quantity} @ {(l.unitPriceCents / 100).toFixed(2)}
        </Typography>
      ))}
      {detail.shippingAddress && o.delivery_method === 'home' ? (
        <Stack spacing={0.5} sx={{ pt: 1 }}>
          <Typography variant="subtitle2" fontWeight={700}>
            Delivery address
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
            {detail.shippingAddress.label ? `${detail.shippingAddress.label}\n` : ''}
            {detail.shippingAddress.line1}
            {detail.shippingAddress.line2 ? `\n${detail.shippingAddress.line2}` : ''}
            {`\n${detail.shippingAddress.city}${detail.shippingAddress.region ? `, ${detail.shippingAddress.region}` : ''} ${detail.shippingAddress.postal_code ?? ''}`.trim()}
            {`\n${detail.shippingAddress.country}`}
          </Typography>
        </Stack>
      ) : null}
      {detail.fulfillment && (
        <Typography variant="body2" color="text.secondary">
          Shipment: {detail.fulfillment.stage}
          {detail.fulfillment.carrier_name ? ` · ${detail.fulfillment.carrier_name}` : ''}
          {detail.fulfillment.tracking_reference ? ` · Tracking: ${detail.fulfillment.tracking_reference}` : ''}
        </Typography>
      )}

      {(st === 'shipped' || st === 'delivered') && (
        <Button component={RouterLink} to={`${pathPrefix}/orders/${orderId}/return${guestEmailActive.trim() ? `?email=${encodeURIComponent(guestEmailActive.trim())}` : ''}`} variant="outlined">
          Request a return
        </Button>
      )}

      {depositPickupEligible && (
        <Stack spacing={1} sx={{ pt: 1 }}>
          <Typography variant="subtitle2" fontWeight={700}>
            Deposit box pickup
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {o.deposit_location_name
              ? `Pickup location: ${o.deposit_location_name}.`
              : o.deposit_location_id
                ? 'Your order is assigned to a deposit location.'
                : 'No deposit location is recorded on this order — contact support.'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            When you are at the locker, generate a pickup code. Each code is only valid for a short time; generate a new one if
            it expires before you open the box.
          </Typography>
          <Button
            variant="contained"
            disabled={pickupGenBusy || !o.deposit_location_id}
            onClick={() => void generateVolatilePickupCode()}
          >
            {pickupGenBusy ? 'Generating…' : 'Generate pickup code'}
          </Button>
          {pickupGenErr && <Alert severity="warning">{pickupGenErr}</Alert>}
          {volatilePickup && !volatileExpiredOnClient && (
            <Stack spacing={0.5}>
              <Typography variant="body1" sx={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: 2 }}>
                {volatilePickup.code}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Valid for about {volatileSecondsLeft}s — use it at the box, then confirm pickup below.
              </Typography>
            </Stack>
          )}
          {volatileExpiredOnClient && (
            <Alert severity="info">That on-screen code has expired. Generate a new pickup code when you are ready.</Alert>
          )}
        </Stack>
      )}

      {actionMsg && <Alert severity={actionMsg.severity}>{actionMsg.text}</Alert>}

      {canCancelUnpaid && (
        <Stack spacing={1}>
          <Typography variant="subtitle2" fontWeight={700}>
            Cancel order
          </Typography>
          <Typography variant="body2" color="text.secondary">
            You can cancel before payment is completed. Reserved items are returned to stock automatically.
          </Typography>
          <Button variant="outlined" color="warning" disabled={cancelBusy} onClick={() => void cancelOrder()}>
            {cancelBusy ? 'Cancelling…' : 'Cancel order'}
          </Button>
        </Stack>
      )}

      {canRefundPaid && (
        <Stack spacing={1}>
          <Typography variant="subtitle2" fontWeight={700}>
            Refund (before shipment)
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Available while the order is paid or processing (not shipped). A 10% handling fee is deducted from the order
            total; the remainder is returned where your payment method allows (PayToday Wallet credits apply immediately when you
            paid with the wallet).
          </Typography>
          <Button variant="outlined" onClick={() => setRefundOpen(true)}>
            Request refund…
          </Button>
        </Stack>
      )}

      <Dialog open={refundOpen} onClose={() => !refundBusy && setRefundOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Confirm refund</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <Typography variant="body2">
              Order total: <strong>{formatMoney(o.total_cents, o.currency)}</strong>
            </Typography>
            <Typography variant="body2">
              Handling fee (10%): <strong>{formatMoney(previewFee, o.currency)}</strong>
            </Typography>
            <Typography variant="body1" fontWeight={700}>
              You receive: {formatMoney(previewNet, o.currency)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              By confirming, this order will be marked refunded and inventory will be put back on sale. Card payments may
              require additional processing by PayToday.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRefundOpen(false)} disabled={refundBusy}>
            Back
          </Button>
          <Button variant="contained" color="warning" disabled={refundBusy} onClick={() => void confirmRefund()}>
            {refundBusy ? 'Processing…' : 'Confirm refund'}
          </Button>
        </DialogActions>
      </Dialog>

      {(depositPickupEligible || !detail.pickupMasked) && (
        <Stack spacing={1} sx={{ pt: 2 }}>
          <Typography variant="subtitle2">Confirm pickup</Typography>
          <Typography variant="body2" color="text.secondary">
            After you have collected your order from the locker, enter the pickup code you used and confirm.
          </Typography>
          <TextField size="small" label="Pickup code" value={pickupCode} onChange={(e) => setPickupCode(e.target.value)} />
          <Button variant="outlined" onClick={() => void verifyPickup()}>
            Verify code
          </Button>
          {pickupMsg && <Alert severity="info">{pickupMsg}</Alert>}
        </Stack>
      )}
      <Button component={RouterLink} to={`${pathPrefix}/orders`} variant="text">
        All orders
      </Button>
    </Stack>
  )
}
