import { useEffect, useState } from 'react'
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom'
import { Alert, Button, Stack, TextField, Typography } from '@mui/material'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { formatOrderStatusLabel } from '../../lib/orderStatusDisplay'

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
  }
  lines: { productName: string; sku: string; quantity: number; unitPriceCents: number }[]
  fulfillment: { stage: string; tracking_reference: string | null } | null
  pickupMasked: boolean
}

export function OrderDetailPage() {
  const { orderId } = useParams()
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const [detail, setDetail] = useState<Detail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pickupCode, setPickupCode] = useState('')
  const [pickupMsg, setPickupMsg] = useState<string | null>(null)

  const q = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
  const emailQ = q.get('email') ?? ''

  useEffect(() => {
    if (!orderId) return
    void (async () => {
      try {
        const path = emailQ
          ? `/api/orders/${orderId}?email=${encodeURIComponent(emailQ)}`
          : `/api/orders/${orderId}`
        const res = await fetch(apiUrl(path), { credentials: 'include' })
        if (!res.ok) throw new Error(await res.text())
        setDetail((await res.json()) as Detail)
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to load')
      }
    })()
  }, [orderId, emailQ])

  async function verifyPickup() {
    setPickupMsg(null)
    try {
      await fetchCsrfToken()
      const url = emailQ
        ? `/api/orders/${orderId}/pickup/verify?email=${encodeURIComponent(emailQ)}`
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
    } catch (e) {
      setPickupMsg(e instanceof Error ? e.message : 'Failed')
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

  return (
    <Stack spacing={2} sx={{ maxWidth: 560, mx: 'auto', py: 2 }}>
      <Typography variant="h5" fontWeight={800}>
        Order
      </Typography>
      <Typography color="text.secondary">
        {formatOrderStatusLabel(o.status)} · {o.delivery_method}
      </Typography>
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
      {detail.fulfillment && (
        <Typography variant="body2" color="text.secondary">
          Fulfillment: {detail.fulfillment.stage}
          {detail.fulfillment.tracking_reference ? ` · Tracking: ${detail.fulfillment.tracking_reference}` : ''}
        </Typography>
      )}
      {!detail.pickupMasked && (
        <Stack spacing={1} sx={{ pt: 2 }}>
          <Typography variant="subtitle2">Confirm pickup (enter code from notification)</Typography>
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
