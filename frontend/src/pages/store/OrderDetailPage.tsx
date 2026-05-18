import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink, Navigate, useLocation, useParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Rating,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { formatHomeDeliveryWindow } from '../../lib/formatHomeDeliveryWindow'
import { formatPackageDimensionsMm } from '../../lib/formatPackageDims'
import { formatMoney } from '../../lib/money'
import {
  fetchOrderReviewFromApi,
  getOrderReview,
  getReadyForReviewOrderIds,
  markOrderReadyForReview,
  type StoredOrderReview,
} from '../../lib/orderListCategory'
import { formatOrderStatusLabel } from '../../lib/orderStatusDisplay'
import { APP_DISPLAY_NAME, APP_WALLET_DISPLAY_NAME } from '../../theme/branding'

const REFUND_FEE_BPS = 1000

type Detail = {
  order: {
    orderId: string
    status: string
    subtotal_cents: number
    shipping_cents: number
    tax_cents: number
    discount_cents?: number
    total_cents: number
    currency: string
    delivery_method: string
    deposit_location_id: string | null
    deposit_location_name: string | null
    contains_alcohol?: boolean
    delivery_scheduled_for?: string | null
    home_delivery_window?: { start: string; end: string; label: string | null } | null
  }
  lines: {
    productName: string
    sku: string
    quantity: number
    unitPriceCents: number
    variantName?: string | null
    packageLengthMm?: number | null
    packageWidthMm?: number | null
    packageHeightMm?: number | null
    grossWeightG?: number | null
  }[]
  fulfillment: {
    stage: string
    carrier_name: string | null
    tracking_reference: string | null
    yango_delivery_id?: string | null
    yango_status?: string | null
    yango_tracking_url?: string | null
  } | null
  shippingAddress: {
    label: string | null
    line1: string
    line2: string | null
    suburb: string | null
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
  const [pickupVerifyBusy, setPickupVerifyBusy] = useState(false)
  const [pickupGenErr, setPickupGenErr] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const guestEmailForApi = emailFromSearch(search).trim()
  const [orderReadyForReviewLocal, setOrderReadyForReviewLocal] = useState(false)
  const [apiReview, setApiReview] = useState<StoredOrderReview | null | undefined>(undefined)

  const [disputeHint, setDisputeHint] = useState<'none' | 'open' | 'closed'>('none')
  const [paymentPlan, setPaymentPlan] = useState<{
    plan_type: string
    total_instalments: number
    instalment_cents: number
    currency: string
    status: string
    instalments: { id: string; instalment_number: number; amount_cents: number; status: string; due_date: string; paid_at: string | null }[]
  } | null>(null)

  useEffect(() => {
    setOrderReadyForReviewLocal(false)
  }, [orderId])

  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    void fetch(apiUrl(`/api/orders/${orderId}/payment-plan`), { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok || cancelled) return
        const d = (await res.json()) as { plan: typeof paymentPlan }
        if (!cancelled) setPaymentPlan(d.plan ?? null)
      })
      .catch(() => { /* migration may not be run */ })
    return () => { cancelled = true }
  }, [orderId])

  useEffect(() => {
    if (!orderId) return
    const q = guestEmailForApi ? `?email=${encodeURIComponent(guestEmailForApi)}` : ''
    let cancelled = false
    void fetch(apiUrl(`/api/disputes/for-order/${orderId}${q}`), { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok || cancelled) return
        const data = (await res.json()) as { items: { status: string }[] }
        const items = data.items ?? []
        if (items.some((d) => d.status === 'open' || d.status === 'in_review')) {
          if (!cancelled) setDisputeHint('open')
        } else if (items.length) {
          if (!cancelled) setDisputeHint('closed')
        } else if (!cancelled) setDisputeHint('none')
      })
      .catch(() => {
        /* table may not exist until migration — ignore */
      })
    return () => {
      cancelled = true
    }
  }, [orderId, guestEmailForApi])

  useEffect(() => {
    if (!volatilePickup) return
    const t = window.setInterval(() => setNowMs(Date.now()), 250)
    return () => window.clearInterval(t)
  }, [volatilePickup])

  const loadDetail = useCallback(async () => {
    if (!orderId) return
    const path = guestEmailForApi
      ? `/api/orders/${orderId}?email=${encodeURIComponent(guestEmailForApi)}`
      : `/api/orders/${orderId}`
    const res = await fetch(apiUrl(path), { credentials: 'include' })
    if (!res.ok) throw new Error(await res.text())
    setDetail((await res.json()) as Detail)
  }, [orderId, guestEmailForApi])

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

  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    setApiReview(undefined)
    void fetchOrderReviewFromApi(orderId, { guestEmail: guestEmailForApi || undefined }).then(
      (r) => {
        if (!cancelled) setApiReview(r)
      },
      () => {
        if (!cancelled) setApiReview(null)
      },
    )
    return () => {
      cancelled = true
    }
  }, [orderId, guestEmailForApi])

  function orderActionPath(suffix: string): string {
    const base = `/api/orders/${orderId}/${suffix}`
    return guestEmailForApi ? `${base}?email=${encodeURIComponent(guestEmailForApi)}` : base
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
    setPickupVerifyBusy(true)
    try {
      await fetchCsrfToken()
      const url = guestEmailForApi
        ? `/api/orders/${orderId}/pickup/verify?email=${encodeURIComponent(guestEmailForApi)}`
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
    } finally {
      setPickupVerifyBusy(false)
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
        setActionMsg({ severity: 'warning', text: data.error ?? 'Cancel failed' })
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
        setActionMsg({ severity: 'warning', text: data.error ?? 'Refund failed' })
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

  if (!orderId) {
    return <Navigate to={`${pathPrefix}/orders`} replace />
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
  const orderInReviewQueue = orderReadyForReviewLocal || getReadyForReviewOrderIds().has(o.orderId)
  const existingReview = apiReview ?? getOrderReview(o.orderId)
  const terminal = ['shipped', 'delivered', 'cancelled', 'refunded'].includes(st)
  const canCancelUnpaid = (st === 'pending_payment' || st === 'draft') && !terminal
  const canRefundPaid = (st === 'paid' || st === 'processing') && !['shipped', 'delivered', 'cancelled', 'refunded'].includes(st)
  const { fee: previewFee, net: previewNet } = feeFromTotalCents(o.total_cents)
  const depositPickupEligible =
    o.delivery_method === 'deposit_box' && (st === 'paid' || st === 'processing')
  const volatileExpiresMs = volatilePickup ? new Date(volatilePickup.expiresAt).getTime() : 0
  const volatileSecondsLeft = volatilePickup ? Math.max(0, Math.ceil((volatileExpiresMs - nowMs) / 1000)) : 0
  const volatileExpiredOnClient = Boolean(volatilePickup && volatileSecondsLeft <= 0)
  const canDispute = !['draft', 'cancelled', 'refunded'].includes(String(st).toLowerCase())

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
      {o.contains_alcohol && o.delivery_scheduled_for ? (
        <Alert severity="warning">
          Alcohol fulfilment is scheduled for {new Date(o.delivery_scheduled_for).toLocaleString()}.
        </Alert>
      ) : null}
      {o.delivery_method === 'home' && o.home_delivery_window ? (
        <Typography variant="body2" color="text.secondary">
          Preferred delivery:{' '}
          {formatHomeDeliveryWindow(
            o.home_delivery_window.start,
            o.home_delivery_window.end,
            o.home_delivery_window.label,
          )}
        </Typography>
      ) : null}
      <Typography>
        Subtotal {formatMoney(o.subtotal_cents, o.currency)} · Shipping {formatMoney(o.shipping_cents, o.currency)} · Tax{' '}
        {formatMoney(o.tax_cents, o.currency)}
        {o.discount_cents != null && o.discount_cents > 0 ? ` · Discount -${formatMoney(o.discount_cents, o.currency)}` : ''}
      </Typography>
      <Typography variant="h6" fontWeight={800}>
        Total {formatMoney(o.total_cents, o.currency)}
      </Typography>
      {paymentPlan && (
        <Paper variant="outlined" sx={{ p: 1.5, mt: 1 }}>
          <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
            Payment plan — {paymentPlan.plan_type} · {paymentPlan.total_instalments} instalments
            <Chip label={paymentPlan.status} size="small" sx={{ ml: 1 }} color={paymentPlan.status === 'active' ? 'primary' : paymentPlan.status === 'completed' ? 'success' : 'default'} />
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Due</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Paid</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paymentPlan.instalments.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.instalment_number}</TableCell>
                  <TableCell>{formatMoney(i.amount_cents, paymentPlan.currency)}</TableCell>
                  <TableCell>{i.due_date}</TableCell>
                  <TableCell><Chip label={i.status} size="small" color={i.status === 'paid' ? 'success' : i.status === 'overdue' ? 'error' : 'default'} /></TableCell>
                  <TableCell>{i.paid_at ? new Date(i.paid_at).toLocaleDateString() : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <Typography variant="subtitle1" fontWeight={700}>
        Items
      </Typography>
      {detail.lines.map((l, idx) => {
        const pkg = formatPackageDimensionsMm(l)
        return (
          <Typography key={`${l.sku}-${idx}`} variant="body2">
            {l.productName}
            {l.variantName ? ` · ${l.variantName}` : ''} × {l.quantity} @ {formatMoney(l.unitPriceCents, o.currency)}
            {pkg ? (
              <>
                <br />
                <Box component="span" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
                  Package: {pkg}
                </Box>
              </>
            ) : null}
          </Typography>
        )
      })}
      {detail.shippingAddress && o.delivery_method === 'home' ? (
        <Stack spacing={0.5} sx={{ pt: 1 }}>
          <Typography variant="subtitle2" fontWeight={700}>
            Delivery address
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
            {detail.shippingAddress.label ? `${detail.shippingAddress.label}\n` : ''}
            {detail.shippingAddress.line1}
            {detail.shippingAddress.line2 ? `\n${detail.shippingAddress.line2}` : ''}
            {detail.shippingAddress.suburb ? `\n${detail.shippingAddress.suburb}` : ''}
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
          {detail.fulfillment.yango_delivery_id ? ` · Yango: ${detail.fulfillment.yango_delivery_id}` : ''}
          {detail.fulfillment.yango_status ? ` (${detail.fulfillment.yango_status})` : ''}
          {detail.fulfillment.yango_tracking_url ? (
            <>
              {' '}
              <a href={detail.fulfillment.yango_tracking_url} target="_blank" rel="noreferrer">
                Track delivery
              </a>
            </>
          ) : null}
        </Typography>
      )}

      {st === 'delivered' && !orderInReviewQueue ? (
        <Alert severity="info">
          <Stack spacing={1}>
            <Typography variant="body2">
              When you&apos;ve confirmed receipt, mark complete — the order moves to <strong>To review</strong> on My orders
              so you can leave feedback.
            </Typography>
            <Button
              variant="contained"
              size="small"
              sx={{ alignSelf: 'flex-start' }}
              onClick={() => {
                markOrderReadyForReview(o.orderId)
                setOrderReadyForReviewLocal(true)
                setActionMsg({ severity: 'success', text: 'Moved to To review.' })
              }}
            >
              Mark complete
            </Button>
          </Stack>
        </Alert>
      ) : null}

      {st === 'delivered' && orderInReviewQueue && !existingReview ? (
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">
            Ready to rate this order? Open the dedicated review screen.
          </Typography>
          <Button component={RouterLink} to={`${pathPrefix}/orders/${o.orderId}/review`} variant="contained">
            Leave your review
          </Button>
        </Stack>
      ) : null}

      {st === 'delivered' && existingReview ? (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
          <Stack spacing={1}>
            <Typography variant="subtitle2" fontWeight={700}>
              Your review
            </Typography>
            <Rating value={existingReview.rating} readOnly size="small" sx={{ '& .MuiRating-iconFilled': { color: 'primary.main' } }} />
            {existingReview.comment.trim() ? (
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                {existingReview.comment.trim()}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary" fontStyle="italic">
                No written feedback.
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary">
              Submitted {new Date(existingReview.submittedAt).toLocaleString()}
            </Typography>
          </Stack>
        </Paper>
      ) : null}

      {(st === 'shipped' || st === 'delivered') && (
        <Button
          component={RouterLink}
          to={`${pathPrefix}/orders/${orderId}/return${guestEmailForApi ? `?email=${encodeURIComponent(guestEmailForApi)}` : ''}`}
          variant="outlined"
        >
          Request a return
        </Button>
      )}

      {canDispute ? (
        <Stack spacing={1} sx={{ pt: 0.5 }}>
          {disputeHint === 'open' ? (
            <Alert severity="info">You have an open dispute on this order. We will update you here and by email when it changes.</Alert>
          ) : null}
          <Button
            component={RouterLink}
            to={`${pathPrefix}/orders/${orderId}/dispute${guestEmailForApi ? `?email=${encodeURIComponent(guestEmailForApi)}` : ''}`}
            variant="outlined"
            color="secondary"
          >
            Dispute transaction
          </Button>
          <Typography variant="caption" color="text.secondary">
            For billing or delivery problems. Returns use &quot;Request a return&quot; when shipped.
          </Typography>
        </Stack>
      ) : null}

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
            total; the remainder is returned where your payment method allows ({APP_WALLET_DISPLAY_NAME} credits apply immediately
            when you paid with the wallet).
          </Typography>
          <Button variant="outlined" disabled={refundBusy} onClick={() => setRefundOpen(true)}>
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
              require additional processing by {APP_DISPLAY_NAME}.
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
          <TextField
            size="small"
            label="Pickup code"
            value={pickupCode}
            onChange={(e) => setPickupCode(e.target.value)}
            disabled={pickupVerifyBusy}
          />
          <Button variant="outlined" disabled={pickupVerifyBusy} onClick={() => void verifyPickup()}>
            {pickupVerifyBusy ? 'Verifying…' : 'Verify code'}
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
