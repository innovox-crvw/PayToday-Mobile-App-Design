import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, Navigate, useLocation, useParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { formatHomeDeliveryWindow } from '../../lib/formatHomeDeliveryWindow'
import { formatPackageDimensionsMm } from '../../lib/formatPackageDims'
import { formatMoney } from '../../lib/money'
import { formatNad } from '../../data/walletMock'
import {
  fetchOrderReviewFromApi,
  getOrderReview,
  getReadyForReviewOrderIds,
  markOrderReadyForReview,
  type StoredOrderReview,
} from '../../lib/orderListCategory'
import { formatOrderStatusLabel } from '../../lib/orderStatusDisplay'
import { APP_DISPLAY_NAME, APP_WALLET_DISPLAY_NAME, SURFACE_SHADOW } from '../../theme/branding'
import { SHOP_V2 } from '../../theme/storeV2'

const REFUND_FEE_BPS = 1000

const orderCardSx = {
  borderRadius: 2.5,
  border: 1,
  borderColor: 'divider',
  boxShadow: SURFACE_SHADOW,
  bgcolor: 'background.paper',
} as const

function formatDeliveryMethod(method: string): string {
  const labels: Record<string, string> = {
    home: 'Home delivery',
    yango_delivery: 'Yango courier',
    store_pickup: 'Store pickup',
    deposit_box: 'Deposit locker',
  }
  return labels[method] ?? method.replace(/_/g, ' ')
}

function orderStatusChipColor(status: string): 'success' | 'info' | 'warning' | 'error' | 'default' {
  if (status === 'delivered') return 'success'
  if (status === 'shipped') return 'info'
  if (status === 'paid' || status === 'processing') return 'success'
  if (status === 'pending_payment' || status === 'draft') return 'warning'
  if (status === 'cancelled' || status === 'refunded') return 'error'
  return 'default'
}

function OrderSectionCard(props: { title: string; children: ReactNode; spacing?: number }) {
  const { title, children, spacing = 1.25 } = props
  return (
    <Card elevation={0} sx={orderCardSx}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Typography variant="subtitle2" fontWeight={800} sx={{ mb: spacing }}>
          {title}
        </Typography>
        {children}
      </CardContent>
    </Card>
  )
}

function SummaryRow(props: { label: string; value: string; emphasis?: boolean }) {
  const { label, value, emphasis } = props
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={2}>
      <Typography variant={emphasis ? 'body1' : 'body2'} color={emphasis ? 'text.primary' : 'text.secondary'}>
        {label}
      </Typography>
      <Typography variant={emphasis ? 'body1' : 'body2'} fontWeight={emphasis ? 800 : 600} sx={{ textAlign: 'right' }}>
        {value}
      </Typography>
    </Stack>
  )
}

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
  const [walletBalanceCents, setWalletBalanceCents] = useState<number | null>(null)
  const [payingInstalmentId, setPayingInstalmentId] = useState<string | null>(null)
  const [instalmentPayMsg, setInstalmentPayMsg] = useState<string | null>(null)

  const reloadPaymentPlan = useCallback(async () => {
    if (!orderId) return
    try {
      const res = await apiFetch(`/api/orders/${orderId}/payment-plan`)
      if (!res.ok) return
      const d = (await res.json()) as { plan: typeof paymentPlan }
      setPaymentPlan(d.plan ?? null)
    } catch {
      /* ignore */
    }
  }, [orderId])

  useEffect(() => {
    setOrderReadyForReviewLocal(false)
  }, [orderId])

  useEffect(() => {
    if (!orderId) return
    void reloadPaymentPlan()
  }, [orderId, reloadPaymentPlan])

  useEffect(() => {
    if (!paymentPlan) return
    let cancelled = false
    void (async () => {
      try {
        const res = await apiFetch('/api/wallet/balance')
        if (!res.ok || cancelled) return
        const data = (await res.json()) as { balanceCents?: number }
        if (!cancelled && typeof data.balanceCents === 'number') setWalletBalanceCents(data.balanceCents)
      } catch {
        /* optional */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [paymentPlan])

  const nextPayableInstalmentId = useMemo(() => {
    if (!paymentPlan) return null
    const sorted = [...paymentPlan.instalments].sort((a, b) => a.instalment_number - b.instalment_number)
    for (const i of sorted) {
      if (i.status === 'paid' || i.status === 'waived') continue
      const priorUnpaid = sorted.some(
        (p) => p.instalment_number < i.instalment_number && p.status !== 'paid' && p.status !== 'waived',
      )
      if (!priorUnpaid) return i.id
    }
    return null
  }, [paymentPlan])

  async function payInstalmentWithWallet(instalmentId: string) {
    if (!orderId) return
    setPayingInstalmentId(instalmentId)
    setInstalmentPayMsg(null)
    try {
      await fetchCsrfToken()
      const res = await apiFetch(
        `/api/orders/${orderId}/payment-plan-instalments/${encodeURIComponent(instalmentId)}/pay-with-wallet`,
        { method: 'POST' },
      )
      const data = (await res.json()) as {
        error?: string
        walletBalanceAfterCents?: number
        orderPaid?: boolean
        planCompleted?: boolean
        instalmentNumber?: number
      }
      if (!res.ok) {
        setInstalmentPayMsg(data.error ?? 'Could not pay instalment')
        return
      }
      if (typeof data.walletBalanceAfterCents === 'number') {
        setWalletBalanceCents(data.walletBalanceAfterCents)
        window.dispatchEvent(new Event('pt-wallet-updated'))
      }
      await reloadPaymentPlan()
      if (data.orderPaid) void loadDetail()
      const n = data.instalmentNumber
      if (data.orderPaid) {
        setInstalmentPayMsg(
          n != null
            ? `Instalment ${n} paid from your wallet. All instalments complete — order is now paid.`
            : 'All instalments paid — order is now paid.',
        )
      } else {
        setInstalmentPayMsg(n != null ? `Instalment ${n} paid from your wallet.` : 'Instalment paid from your wallet.')
      }
    } catch (e) {
      setInstalmentPayMsg(e instanceof Error ? e.message : 'Could not pay instalment')
    } finally {
      setPayingInstalmentId(null)
    }
  }

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

  const shippingAddressBlock =
    detail.shippingAddress && o.delivery_method === 'home'
      ? [
          detail.shippingAddress.label,
          detail.shippingAddress.line1,
          detail.shippingAddress.line2,
          detail.shippingAddress.suburb,
          `${detail.shippingAddress.city}${detail.shippingAddress.region ? `, ${detail.shippingAddress.region}` : ''} ${detail.shippingAddress.postal_code ?? ''}`.trim(),
          detail.shippingAddress.country,
        ]
          .filter(Boolean)
          .join('\n')
      : null

  const hasDeliverySection =
    Boolean(shippingAddressBlock) ||
    Boolean(detail.fulfillment) ||
    o.delivery_method === 'deposit_box' ||
    (o.delivery_method === 'home' && o.home_delivery_window) ||
    (o.contains_alcohol && o.delivery_scheduled_for)

  const hasOrderActions =
    (st === 'shipped' || st === 'delivered') ||
    canDispute ||
    canCancelUnpaid ||
    canRefundPaid

  return (
    <Box
      sx={{
        maxWidth: 560,
        mx: 'auto',
        py: 2,
        px: { xs: 0.5, sm: 0 },
        bgcolor: SHOP_V2.pageBackground,
        borderRadius: { md: SHOP_V2.radius },
      }}
    >
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Button
            component={RouterLink}
            to={`${pathPrefix}/orders`}
            startIcon={<ArrowBackIcon />}
            size="small"
            sx={{ fontWeight: 700, minWidth: 0, px: 1 }}
          >
            Orders
          </Button>
        </Stack>

        <Stack spacing={1}>
          <Typography variant="h5" fontWeight={800} sx={{ letterSpacing: -0.35 }}>
            Order details
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={0.75} alignItems="center">
            <Chip label={formatOrderStatusLabel(o.status)} size="small" color={orderStatusChipColor(st)} sx={{ fontWeight: 700 }} />
            <Chip label={formatDeliveryMethod(o.delivery_method)} size="small" variant="outlined" sx={{ fontWeight: 600 }} />
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>
            {o.orderId}
          </Typography>
        </Stack>

        {actionMsg ? <Alert severity={actionMsg.severity} onClose={() => setActionMsg(null)}>{actionMsg.text}</Alert> : null}

        <OrderSectionCard title="Order summary">
          <Stack spacing={1}>
            <SummaryRow label="Subtotal" value={formatMoney(o.subtotal_cents, o.currency)} />
            <SummaryRow label="Shipping" value={formatMoney(o.shipping_cents, o.currency)} />
            <SummaryRow label="Tax" value={formatMoney(o.tax_cents, o.currency)} />
            {o.discount_cents != null && o.discount_cents > 0 ? (
              <SummaryRow label="Discount" value={`-${formatMoney(o.discount_cents, o.currency)}`} />
            ) : null}
            <Divider sx={{ my: 0.5 }} />
            <SummaryRow label="Total" value={formatMoney(o.total_cents, o.currency)} emphasis />
          </Stack>
        </OrderSectionCard>

        <OrderSectionCard title={`Items (${detail.lines.length})`} spacing={1}>
          <Stack divider={<Divider flexItem />} spacing={1.25}>
            {detail.lines.map((l, idx) => {
              const pkg = formatPackageDimensionsMm(l)
              const lineTotal = l.unitPriceCents * l.quantity
              return (
                <Box key={`${l.sku}-${idx}`}>
                  <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.35 }}>
                    {l.productName}
                    {l.variantName ? (
                      <Typography component="span" variant="body2" color="text.secondary" fontWeight={500}>
                        {' '}
                        · {l.variantName}
                      </Typography>
                    ) : null}
                  </Typography>
                  <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.35 }}>
                    <Typography variant="caption" color="text.secondary">
                      {l.quantity} × {formatMoney(l.unitPriceCents, o.currency)}
                      {l.sku ? ` · ${l.sku}` : ''}
                    </Typography>
                    <Typography variant="caption" fontWeight={700}>
                      {formatMoney(lineTotal, o.currency)}
                    </Typography>
                  </Stack>
                  {pkg ? (
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
                      Package: {pkg}
                    </Typography>
                  ) : null}
                </Box>
              )
            })}
          </Stack>
        </OrderSectionCard>

        {hasDeliverySection ? (
          <OrderSectionCard title="Delivery & tracking">
            <Stack spacing={1.25}>
              {o.delivery_method === 'deposit_box' && o.deposit_location_name ? (
                <Typography variant="body2" color="text.secondary">
                  Locker: <strong>{o.deposit_location_name}</strong>
                </Typography>
              ) : null}
              {o.contains_alcohol && o.delivery_scheduled_for ? (
                <Alert severity="warning" sx={{ py: 0.5 }}>
                  Alcohol fulfilment scheduled for {new Date(o.delivery_scheduled_for).toLocaleString()}.
                </Alert>
              ) : null}
              {o.delivery_method === 'home' && o.home_delivery_window ? (
                <Typography variant="body2" color="text.secondary">
                  Preferred window:{' '}
                  {formatHomeDeliveryWindow(
                    o.home_delivery_window.start,
                    o.home_delivery_window.end,
                    o.home_delivery_window.label,
                  )}
                </Typography>
              ) : null}
              {shippingAddressBlock ? (
                <Box>
                  <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" sx={{ mb: 0.35 }}>
                    Delivery address
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line', lineHeight: 1.45 }}>
                    {shippingAddressBlock}
                  </Typography>
                </Box>
              ) : null}
              {detail.fulfillment ? (
                <Box>
                  <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" sx={{ mb: 0.35 }}>
                    Shipment
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {detail.fulfillment.stage}
                    {detail.fulfillment.carrier_name ? ` · ${detail.fulfillment.carrier_name}` : ''}
                    {detail.fulfillment.tracking_reference ? ` · ${detail.fulfillment.tracking_reference}` : ''}
                    {detail.fulfillment.yango_delivery_id ? ` · Yango ${detail.fulfillment.yango_delivery_id}` : ''}
                    {detail.fulfillment.yango_status ? ` (${detail.fulfillment.yango_status})` : ''}
                  </Typography>
                  {detail.fulfillment.yango_tracking_url ? (
                    <Button
                      href={detail.fulfillment.yango_tracking_url}
                      target="_blank"
                      rel="noreferrer"
                      size="small"
                      sx={{ mt: 0.75, fontWeight: 700, px: 0 }}
                    >
                      Track delivery
                    </Button>
                  ) : null}
                </Box>
              ) : null}
            </Stack>
          </OrderSectionCard>
        ) : null}

        {paymentPlan ? (
          <OrderSectionCard title="Payment plan">
            <Stack spacing={1.25}>
              <Stack direction="row" flexWrap="wrap" gap={0.75} alignItems="center">
                <Typography variant="body2" color="text.secondary">
                  {paymentPlan.plan_type} · {paymentPlan.total_instalments} instalments
                </Typography>
                <Chip
                  label={paymentPlan.status}
                  size="small"
                  color={paymentPlan.status === 'active' ? 'primary' : paymentPlan.status === 'completed' ? 'success' : 'default'}
                />
              </Stack>
              {paymentPlan.status === 'active' && nextPayableInstalmentId ? (
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                  Pay each instalment with {APP_WALLET_DISPLAY_NAME}
                  {walletBalanceCents != null ? ` (available ${formatNad(walletBalanceCents)})` : ''}. Instalments are paid in order.
                </Alert>
              ) : null}
              {instalmentPayMsg ? (
                <Alert
                  severity={instalmentPayMsg.includes('paid') ? 'success' : 'error'}
                  sx={{ borderRadius: 2 }}
                  onClose={() => setInstalmentPayMsg(null)}
                >
                  {instalmentPayMsg}
                </Alert>
              ) : null}
              <Box sx={{ overflowX: 'auto', mx: -0.5, px: 0.5 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>#</TableCell>
                      <TableCell>Amount</TableCell>
                      <TableCell>Due</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Pay</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paymentPlan.instalments.map((i) => {
                      const canPayWallet =
                        paymentPlan.status === 'active' &&
                        nextPayableInstalmentId === i.id &&
                        (i.status === 'pending' || i.status === 'overdue')
                      return (
                        <TableRow key={i.id}>
                          <TableCell>{i.instalment_number}</TableCell>
                          <TableCell>{formatMoney(i.amount_cents, paymentPlan.currency)}</TableCell>
                          <TableCell>{i.due_date}</TableCell>
                          <TableCell>
                            <Chip
                              label={i.status}
                              size="small"
                              color={i.status === 'paid' ? 'success' : i.status === 'overdue' ? 'error' : 'default'}
                            />
                          </TableCell>
                          <TableCell align="right">
                            {canPayWallet ? (
                              <Button
                                size="small"
                                variant="contained"
                                disabled={payingInstalmentId != null}
                                onClick={() => void payInstalmentWithWallet(i.id)}
                                startIcon={
                                  payingInstalmentId === i.id ? (
                                    <CircularProgress size={16} color="inherit" aria-hidden />
                                  ) : undefined
                                }
                              >
                                {payingInstalmentId === i.id ? 'Paying…' : APP_WALLET_DISPLAY_NAME}
                              </Button>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </Box>
            </Stack>
          </OrderSectionCard>
        ) : null}

        {st === 'delivered' && !orderInReviewQueue ? (
          <OrderSectionCard title="Confirm receipt">
            <Stack spacing={1.25}>
              <Typography variant="body2" color="text.secondary">
                When you&apos;ve collected or received your order, mark it complete. It moves to <strong>To review</strong> on My orders.
              </Typography>
              <Button
                variant="contained"
                size="small"
                sx={{ alignSelf: 'flex-start', fontWeight: 700 }}
                onClick={() => {
                  markOrderReadyForReview(o.orderId)
                  setOrderReadyForReviewLocal(true)
                  setActionMsg({ severity: 'success', text: 'Moved to To review.' })
                }}
              >
                Mark complete
              </Button>
            </Stack>
          </OrderSectionCard>
        ) : null}

        {st === 'delivered' && orderInReviewQueue && !existingReview ? (
          <OrderSectionCard title="Your feedback">
            <Stack spacing={1.25}>
              <Typography variant="body2" color="text.secondary">
                Rate this order on the review screen.
              </Typography>
              <Button
                component={RouterLink}
                to={`${pathPrefix}/orders/${o.orderId}/review`}
                variant="contained"
                sx={{ alignSelf: 'flex-start', fontWeight: 700 }}
              >
                Leave your review
              </Button>
            </Stack>
          </OrderSectionCard>
        ) : null}

        {st === 'delivered' && existingReview ? (
          <OrderSectionCard title="Your review">
            <Stack spacing={1}>
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
          </OrderSectionCard>
        ) : null}

        {depositPickupEligible ? (
          <OrderSectionCard title="Deposit locker pickup">
            <Stack spacing={1.25}>
              <Typography variant="body2" color="text.secondary">
                {o.deposit_location_name
                  ? `Pickup at ${o.deposit_location_name}.`
                  : o.deposit_location_id
                    ? 'Your order is assigned to a deposit location.'
                    : 'No deposit location on this order — contact support.'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Generate a short-lived code at the locker. If it expires, generate a new one.
              </Typography>
              <Button
                variant="contained"
                disabled={pickupGenBusy || !o.deposit_location_id}
                onClick={() => void generateVolatilePickupCode()}
                sx={{ alignSelf: 'flex-start', fontWeight: 700 }}
              >
                {pickupGenBusy ? 'Generating…' : 'Generate pickup code'}
              </Button>
              {pickupGenErr ? <Alert severity="warning">{pickupGenErr}</Alert> : null}
              {volatilePickup && !volatileExpiredOnClient ? (
                <Box sx={{ py: 1, px: 1.5, borderRadius: 2, bgcolor: 'action.hover', border: 1, borderColor: 'divider' }}>
                  <Typography variant="h6" sx={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: 2 }}>
                    {volatilePickup.code}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Valid ~{volatileSecondsLeft}s — use at the box, then confirm below.
                  </Typography>
                </Box>
              ) : null}
              {volatileExpiredOnClient ? (
                <Alert severity="info">Code expired. Generate a new one when you are at the locker.</Alert>
              ) : null}
            </Stack>
          </OrderSectionCard>
        ) : null}

        {(depositPickupEligible || !detail.pickupMasked) ? (
          <OrderSectionCard title="Confirm pickup">
            <Stack spacing={1.25}>
              <Typography variant="body2" color="text.secondary">
                After collection, enter the pickup code you used.
              </Typography>
              <TextField
                size="small"
                label="Pickup code"
                value={pickupCode}
                onChange={(e) => setPickupCode(e.target.value)}
                disabled={pickupVerifyBusy}
                fullWidth
              />
              <Button
                variant="outlined"
                disabled={pickupVerifyBusy}
                onClick={() => void verifyPickup()}
                sx={{ alignSelf: 'flex-start', fontWeight: 700 }}
              >
                {pickupVerifyBusy ? 'Verifying…' : 'Verify code'}
              </Button>
              {pickupMsg ? <Alert severity="info">{pickupMsg}</Alert> : null}
            </Stack>
          </OrderSectionCard>
        ) : null}

        {hasOrderActions ? (
          <OrderSectionCard title="Manage order">
            <Stack spacing={1.5} divider={<Divider flexItem />}>
              {canCancelUnpaid ? (
                <Stack spacing={1}>
                  <Typography variant="body2" color="text.secondary">
                    Cancel before payment completes. Stock is released automatically.
                  </Typography>
                  <Button variant="outlined" color="warning" disabled={cancelBusy} onClick={() => void cancelOrder()} sx={{ alignSelf: 'flex-start', fontWeight: 700 }}>
                    {cancelBusy ? 'Cancelling…' : 'Cancel order'}
                  </Button>
                </Stack>
              ) : null}
              {canRefundPaid ? (
                <Stack spacing={1}>
                  <Typography variant="body2" color="text.secondary">
                    Refund before shipment. A 10% handling fee applies; the rest returns to your payment method ({APP_WALLET_DISPLAY_NAME} refunds are immediate).
                  </Typography>
                  <Button variant="outlined" disabled={refundBusy} onClick={() => setRefundOpen(true)} sx={{ alignSelf: 'flex-start', fontWeight: 700 }}>
                    Request refund…
                  </Button>
                </Stack>
              ) : null}
              {(st === 'shipped' || st === 'delivered') ? (
                <Button
                  component={RouterLink}
                  to={`${pathPrefix}/orders/${orderId}/return${guestEmailForApi ? `?email=${encodeURIComponent(guestEmailForApi)}` : ''}`}
                  variant="outlined"
                  sx={{ alignSelf: 'flex-start', fontWeight: 700 }}
                >
                  Request a return
                </Button>
              ) : null}
              {canDispute ? (
                <Stack spacing={1}>
                  {disputeHint === 'open' ? (
                    <Alert severity="info">Open dispute on this order — we will update you here and by email.</Alert>
                  ) : null}
                  <Button
                    component={RouterLink}
                    to={`${pathPrefix}/orders/${orderId}/dispute${guestEmailForApi ? `?email=${encodeURIComponent(guestEmailForApi)}` : ''}`}
                    variant="outlined"
                    color="secondary"
                    sx={{ alignSelf: 'flex-start', fontWeight: 700 }}
                  >
                    Dispute transaction
                  </Button>
                  <Typography variant="caption" color="text.secondary">
                    Billing or delivery issues. Use return request when the order has shipped.
                  </Typography>
                </Stack>
              ) : null}
            </Stack>
          </OrderSectionCard>
        ) : null}

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

      </Stack>
    </Box>
  )
}
