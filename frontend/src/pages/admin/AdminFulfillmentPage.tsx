import { useEffect, useState } from 'react'
import { Alert, Button, Stack, TextField, Typography } from '@mui/material'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { formatOrderStatusLabel } from '../../lib/orderStatusDisplay'

interface OrderRow {
  orderId: string
  status: string
  total_cents: number
  currency: string
  stage: string
  delivery_method: string
}

export function AdminFulfillmentPage() {
  const [items, setItems] = useState<OrderRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [csv, setCsv] = useState('sku,qty_delta,reason\n')
  const [csvFeedback, setCsvFeedback] = useState<{ severity: 'success' | 'warning'; message: string } | null>(null)

  async function load() {
    setError(null)
    try {
      const res = await fetch(apiUrl('/api/fulfillment/orders'), { credentials: 'include' })
      if (res.status === 401 || res.status === 403) {
        setError('Sign in with fulfillment, ops, or admin role.')
        return
      }
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as { items: OrderRow[] }
      setItems(data.items ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function setStage(orderId: string, stage: string) {
    try {
      await fetchCsrfToken()
      const res = await apiFetch(`/api/fulfillment/orders/${orderId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      })
      if (!res.ok) throw new Error(await res.text())
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    }
  }

  async function uploadCsv() {
    setCsvFeedback(null)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/fulfillment/inventory/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      })
      const raw = await res.text()
      let data = {} as {
        ok?: boolean
        applied?: number
        error?: string
        parseErrors?: { line: number; message: string }[]
        errors?: { line: number; sku: string; message: string }[]
      }
      try {
        data = JSON.parse(raw) as typeof data
      } catch {
        /* plain-text error body */
      }
      if (!res.ok) {
        const parsePart =
          data.parseErrors?.map((e) => `Line ${e.line}: ${e.message}`).join('; ') ?? ''
        const rowPart = data.errors?.map((e) => `Line ${e.line} (${e.sku}): ${e.message}`).join('; ') ?? ''
        const msg = [data.error, parsePart, rowPart].filter(Boolean).join(' — ') || raw
        setCsvFeedback({ severity: 'warning', message: msg })
        return
      }
      setError(null)
      setCsvFeedback({ severity: 'success', message: `Applied ${data.applied ?? 0} row(s).` })
      await load()
    } catch (e) {
      setCsvFeedback({ severity: 'warning', message: e instanceof Error ? e.message : 'CSV failed' })
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        Fulfillment
      </Typography>
      {error && <Alert severity="warning">{error}</Alert>}
      {csvFeedback && <Alert severity={csvFeedback.severity}>{csvFeedback.message}</Alert>}
      <Typography variant="subtitle1" fontWeight={700}>
        Orders
      </Typography>
      <Stack spacing={1}>
        {items.map((o) => (
          <Stack key={o.orderId} direction="row" alignItems="center" spacing={1} flexWrap="wrap">
            <Typography variant="body2" sx={{ minWidth: 260 }}>
              {o.orderId.slice(0, 8)}… · {formatOrderStatusLabel(o.status)} · {o.stage} · {(o.total_cents / 100).toFixed(2)}{' '}
              {o.currency} · {o.delivery_method}
            </Typography>
            <Button size="small" onClick={() => void setStage(o.orderId, 'picking')}>
              Picking
            </Button>
            <Button size="small" onClick={() => void setStage(o.orderId, 'packing')}>
              Packing
            </Button>
            <Button size="small" onClick={() => void setStage(o.orderId, 'packed')}>
              Packed
            </Button>
            <Button size="small" onClick={() => void setStage(o.orderId, 'shipped')}>
              Shipped
            </Button>
            <Button size="small" onClick={() => void setStage(o.orderId, 'delivered')}>
              Delivered
            </Button>
          </Stack>
        ))}
      </Stack>
      <Typography variant="subtitle1" fontWeight={700}>
        Bulk inventory CSV (admin/ops)
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Header <code>sku,qty_delta,reason</code> — see <code>docs/INVENTORY_CSV.md</code>. Commas inside values are not supported.
      </Typography>
      <TextField value={csv} onChange={(e) => setCsv(e.target.value)} multiline minRows={4} fullWidth />
      <Button variant="outlined" onClick={() => void uploadCsv()}>
        Submit CSV
      </Button>
      <Typography variant="subtitle1" fontWeight={700}>
        Pick / pack slip
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Open an order in <code>/admin/orders</code>, then use the browser print dialog on the customer order page for a simple slip,
        or extend with a dedicated print template.
      </Typography>
      <Button variant="outlined" onClick={() => window.print()}>
        Print this page (placeholder)
      </Button>
    </Stack>
  )
}
