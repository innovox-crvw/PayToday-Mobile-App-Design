import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom'
import {
  Alert,
  Button,
  Stack,
  TextField,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { formatMoney } from '../../lib/money'

type ReturnableLine = {
  variantId: string
  productId: string
  productName: string
  variantName: string
  sku: string
  orderedQty: number
  reservedByReturnsQty: number
  availableToReturnQty: number
  unitPriceCents: number
  currency: string
}

type ReturnablePayload = {
  orderStatus: string
  lines: ReturnableLine[]
  windowOk: boolean
  daysSinceOrder: number
}

function emailFromSearch(search: string): string {
  return new URLSearchParams(search).get('email')?.trim() ?? ''
}

export function ReturnRequestPage() {
  const { orderId } = useParams()
  const { pathname, search } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const [guestEmailDraft, setGuestEmailDraft] = useState(() => emailFromSearch(search))
  const [guestEmailActive, setGuestEmailActive] = useState(() => emailFromSearch(search))
  const [data, setData] = useState<ReturnablePayload | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [qtyByVariant, setQtyByVariant] = useState<Record<string, string>>({})
  const [imageUrl, setImageUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  useEffect(() => {
    setGuestEmailDraft(emailFromSearch(search))
    setGuestEmailActive(emailFromSearch(search))
  }, [orderId, search])

  const load = useCallback(async () => {
    if (!orderId) return
    const path = guestEmailActive.trim()
      ? `/api/orders/${orderId}/returnable?email=${encodeURIComponent(guestEmailActive.trim())}`
      : `/api/orders/${orderId}/returnable`
    const res = await fetch(apiUrl(path), { credentials: 'include' })
    if (!res.ok) throw new Error(await res.text())
    setData((await res.json()) as ReturnablePayload)
  }, [orderId, guestEmailActive])

  useEffect(() => {
    if (!orderId) return
    void (async () => {
      try {
        setErr(null)
        await load()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to load')
        setData(null)
      }
    })()
  }, [orderId, load])

  const linesToSubmit = useMemo(() => {
    if (!data?.lines.length) return []
    const out: { productId: string; variantId: string; quantity: number }[] = []
    for (const l of data.lines) {
      const raw = qtyByVariant[l.variantId] ?? ''
      const n = Number.parseInt(raw, 10)
      if (!raw.trim() || !Number.isFinite(n) || n < 1) continue
      if (n > l.availableToReturnQty) continue
      out.push({ productId: l.productId, variantId: l.variantId, quantity: n })
    }
    return out
  }, [data, qtyByVariant])

  async function submit() {
    if (!orderId) return
    setBusy(true)
    setOkMsg(null)
    setErr(null)
    try {
      await fetchCsrfToken()
      const imageUrls = imageUrl.trim() ? [imageUrl.trim()] : undefined
      const res = await apiFetch('/api/returns/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          email: guestEmailActive.trim() || undefined,
          reason: reason.trim(),
          lines: linesToSubmit,
          imageUrls,
        }),
      })
      const body = (await res.json()) as { error?: string; returnCaseId?: string }
      if (!res.ok) {
        setErr(body.error ?? 'Request failed')
        return
      }
      setOkMsg(`Return request submitted. Reference ${body.returnCaseId ?? ''}.`)
      setReason('')
      setQtyByVariant({})
      setImageUrl('')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const eligible =
    data &&
    (data.orderStatus === 'shipped' || data.orderStatus === 'delivered') &&
    data.windowOk &&
    data.lines.some((l) => l.availableToReturnQty > 0)

  return (
    <Stack spacing={2} sx={{ maxWidth: 720, mx: 'auto', py: 2 }}>
      <Typography variant="h5" fontWeight={800}>
        Request a return
      </Typography>
      <Typography variant="body2" color="text.secondary">
        After your order is shipped or delivered, you can request a return here. Stock is only adjusted when the warehouse
        confirms receipt of the physical items; refunds run after that step.
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
      {err && <Alert severity="error">{err}</Alert>}
      {okMsg && <Alert severity="success">{okMsg}</Alert>}
      {!data && !err ? <Typography>Loading…</Typography> : null}
      {data && !eligible ? (
        <Alert severity="info">
          {!data.windowOk
            ? `This order is outside the return window (${data.daysSinceOrder} days since order).`
            : data.orderStatus !== 'shipped' && data.orderStatus !== 'delivered'
              ? `Returns open after ship or delivery (current status: ${data.orderStatus}).`
              : 'No quantity is available to return (all items may already be on an active return).'}
        </Alert>
      ) : null}
      {data && eligible ? (
        <>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Product</TableCell>
                <TableCell align="right">Available</TableCell>
                <TableCell align="right">Return qty</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.lines
                .filter((l) => l.availableToReturnQty > 0)
                .map((l) => (
                  <TableRow key={l.variantId}>
                    <TableCell>
                      <Typography fontWeight={700}>{l.productName}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {l.variantName} · {l.sku} · {formatMoney(l.unitPriceCents, l.currency)} each
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{l.availableToReturnQty}</TableCell>
                    <TableCell align="right" sx={{ maxWidth: 120 }}>
                      <TextField
                        size="small"
                        type="number"
                        value={qtyByVariant[l.variantId] ?? ''}
                        onChange={(e) =>
                          setQtyByVariant((m) => ({
                            ...m,
                            [l.variantId]: e.target.value,
                          }))
                        }
                        inputProps={{ min: 1, max: l.availableToReturnQty }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          <TextField
            label="Reason for return"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            fullWidth
            multiline
            minRows={3}
          />
          <TextField
            label="Photo URL (optional)"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            fullWidth
            helperText="Optional link to a photo for validation (e.g. cloud storage)."
          />
          <Button
            variant="contained"
            disabled={busy || !reason.trim() || linesToSubmit.length === 0}
            onClick={() => void submit()}
          >
            {busy ? 'Submitting…' : 'Submit return request'}
          </Button>
        </>
      ) : null}
      <Button component={RouterLink} to={`${pathPrefix}/orders/${orderId ?? ''}`} variant="text">
        Back to order
      </Button>
    </Stack>
  )
}
