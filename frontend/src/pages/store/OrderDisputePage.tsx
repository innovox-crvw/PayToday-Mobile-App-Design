import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom'
import { Alert, Box, Button, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { formatMoney } from '../../lib/money'
import { formatPackageDimensionsMm } from '../../lib/formatPackageDims'

function emailFromSearch(search: string): string {
  return new URLSearchParams(search).get('email')?.trim() ?? ''
}

type OrderLine = {
  variantId: string
  productName: string
  sku: string
  quantity: number
  unitPriceCents: number
  variantName?: string | null
  packageLengthMm?: number | null
  packageWidthMm?: number | null
  packageHeightMm?: number | null
  grossWeightG?: number | null
}

type OrderDetail = {
  order: {
    orderId: string
    status: string
    total_cents: number
    currency: string
  }
  lines: OrderLine[]
}

type DisputeRow = {
  disputeId: string
  status: string
  reason: string
  description: string | null
  admin_resolution_note: string | null
  created_at: string
  updated_at: string
  variant_id?: string | null
  variant_sku?: string | null
  product_name?: string | null
}

export function OrderDisputePage() {
  const { orderId } = useParams()
  const { pathname, search } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const guestEmail = emailFromSearch(search).trim()
  const [guestDraft, setGuestDraft] = useState(guestEmail)
  const [guestActive, setGuestActive] = useState(guestEmail)

  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [disputes, setDisputes] = useState<DisputeRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [description, setDescription] = useState('')
  const [variantId, setVariantId] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState<string | null>(null)

  useEffect(() => {
    const e = emailFromSearch(search).trim()
    setGuestDraft(e)
    setGuestActive(e)
  }, [orderId, search])

  const load = useCallback(async () => {
    if (!orderId) return
    const q = guestActive ? `?email=${encodeURIComponent(guestActive)}` : ''
    const [oRes, dRes] = await Promise.all([
      fetch(apiUrl(`/api/orders/${orderId}${q}`), { credentials: 'include' }),
      fetch(apiUrl(`/api/disputes/for-order/${orderId}${q}`), { credentials: 'include' }),
    ])
    if (!oRes.ok) throw new Error(await oRes.text())
    if (!dRes.ok) throw new Error(await dRes.text())
    setDetail((await oRes.json()) as OrderDetail)
    const dj = (await dRes.json()) as { items: DisputeRow[] }
    setDisputes(dj.items ?? [])
  }, [orderId, guestActive])

  useEffect(() => {
    if (!orderId) return
    void (async () => {
      try {
        setErr(null)
        await load()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to load')
        setDetail(null)
      }
    })()
  }, [orderId, load])

  const hasOpen = disputes.some((d) => d.status === 'open' || d.status === 'in_review')
  const blocked = ['draft', 'cancelled', 'refunded'].includes((detail?.order.status ?? '').toLowerCase())

  async function applyGuestEmail() {
    setGuestActive(guestDraft.trim())
  }

  async function submit() {
    if (!orderId) return
    setBusy(true)
    setOk(null)
    setErr(null)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          email: guestActive || undefined,
          reason: reason.trim(),
          description: description.trim() || null,
          variantId: variantId.trim() || undefined,
        }),
      })
      const body = (await res.json()) as { error?: string; disputeId?: string }
      if (!res.ok) {
        setErr(body.error ?? 'Request failed')
        return
      }
      setOk(`Dispute submitted (reference ${body.disputeId?.slice(0, 8) ?? ''}…). Support will review it.`)
      setReason('')
      setDescription('')
      setVariantId('')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  if (err && !detail) {
    return (
      <Stack sx={{ py: 4, maxWidth: 560, mx: 'auto' }} spacing={2}>
        <Alert severity="error">{err}</Alert>
        <Button component={RouterLink} to={`${pathPrefix}/orders${guestActive ? `?email=${encodeURIComponent(guestActive)}` : ''}`}>
          Back to orders
        </Button>
      </Stack>
    )
  }

  if (!detail?.order) {
    return (
      <Typography sx={{ p: 2 }} variant="body2">
        Loading…
      </Typography>
    )
  }

  const o = detail.order

  return (
    <Stack spacing={2} sx={{ maxWidth: 560, mx: 'auto', py: 2 }}>
      <Typography variant="h5" fontWeight={800}>
        Dispute this order
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Use this for billing or fulfilment problems (wrong charge, missing items, damaged goods). For sending items back, use{' '}
        <Button component={RouterLink} size="small" to={`${pathPrefix}/orders/${orderId}/return${guestActive ? `?email=${encodeURIComponent(guestActive)}` : ''}`}>
          Request a return
        </Button>
        .
      </Typography>

      {!guestEmail && (
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <TextField
            size="small"
            fullWidth
            label="Order email (guest)"
            value={guestDraft}
            onChange={(e) => setGuestDraft(e.target.value)}
            helperText="Must match the email on the order"
          />
          <Button variant="outlined" onClick={() => void applyGuestEmail()} sx={{ mt: 0.5, flexShrink: 0 }}>
            Apply
          </Button>
        </Stack>
      )}

      <Typography variant="subtitle2" fontWeight={700}>
        Order {o.orderId.slice(0, 8)}… · {o.status}
      </Typography>
      <Typography variant="body2">Total {formatMoney(o.total_cents, o.currency)}</Typography>

      <Typography variant="subtitle2" fontWeight={700}>
        Line items
      </Typography>
      {detail.lines.map((l) => {
        const pkg = formatPackageDimensionsMm(l)
        return (
          <Typography key={l.variantId} variant="body2" color="text.secondary">
            {l.productName}
            {l.variantName ? ` · ${l.variantName}` : ''} × {l.quantity} @ {formatMoney(l.unitPriceCents, o.currency)}
            {pkg ? (
              <>
                <br />
                <Box component="span" sx={{ fontSize: '0.85em' }}>
                  Package: {pkg}
                </Box>
              </>
            ) : null}
          </Typography>
        )
      })}

      {disputes.length > 0 ? (
        <Stack spacing={1}>
          <Typography variant="subtitle2" fontWeight={700}>
            Your disputes on this order
          </Typography>
          {disputes.map((d) => (
            <Alert key={d.disputeId} severity={d.status === 'resolved' ? 'success' : d.status === 'dismissed' ? 'info' : 'warning'}>
              <Typography variant="caption" display="block" color="text.secondary">
                {d.status} · {new Date(d.created_at).toLocaleString()}
              </Typography>
              {d.variant_sku ? (
                <Typography variant="caption" display="block" color="text.secondary">
                  Item: {d.product_name ?? '—'} ({d.variant_sku})
                </Typography>
              ) : null}
              <Typography variant="body2" fontWeight={600}>
                {d.reason}
              </Typography>
              {d.description ? (
                <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                  {d.description}
                </Typography>
              ) : null}
              {d.admin_resolution_note ? (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  <strong>Update from support:</strong> {d.admin_resolution_note}
                </Typography>
              ) : null}
            </Alert>
          ))}
        </Stack>
      ) : null}

      {blocked ? (
        <Alert severity="info">Disputes cannot be opened for this order status.</Alert>
      ) : hasOpen ? (
        <Alert severity="info">You already have an open dispute on this order. Please wait for support to respond.</Alert>
      ) : (
        <Stack spacing={1.5}>
          <FormControl fullWidth size="small">
            <InputLabel id="dispute-variant-label">Which item (optional)</InputLabel>
            <Select
              labelId="dispute-variant-label"
              label="Which item (optional)"
              value={variantId}
              onChange={(e) => setVariantId(String(e.target.value))}
            >
              <MenuItem value="">
                <em>Whole order</em>
              </MenuItem>
              {detail.lines.map((l) => (
                <MenuItem key={l.variantId} value={l.variantId}>
                  {l.productName} ({l.sku})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField label="Summary (required)" required value={reason} onChange={(e) => setReason(e.target.value)} multiline minRows={2} inputProps={{ maxLength: 500 }} helperText={`${reason.length}/500`} />
          <TextField label="Details (optional)" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={4} inputProps={{ maxLength: 4000 }} helperText={`${description.length}/4000`} />
          {err ? <Alert severity="error">{err}</Alert> : null}
          {ok ? <Alert severity="success">{ok}</Alert> : null}
          <Button variant="contained" disabled={busy || !reason.trim()} onClick={() => void submit()}>
            {busy ? 'Submitting…' : 'Submit dispute'}
          </Button>
        </Stack>
      )}

      <Button component={RouterLink} to={`${pathPrefix}/orders/${orderId}${guestActive ? `?email=${encodeURIComponent(guestActive)}` : ''}`} variant="text">
        Back to order
      </Button>
    </Stack>
  )
}
