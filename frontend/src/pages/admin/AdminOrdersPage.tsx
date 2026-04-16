import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Alert, Button, Stack, TextField, Typography } from '@mui/material'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'

type Row = {
  orderId: string
  status: string
  total_cents: number
  currency: string
  created_at: string
  delivery_method: string
}

export function AdminOrdersPage() {
  const [items, setItems] = useState<Row[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  async function load() {
    setErr(null)
    try {
      const q = filter.trim() ? `?status=${encodeURIComponent(filter.trim())}` : ''
      const res = await fetch(apiUrl(`/api/admin/orders${q}`), { credentials: 'include' })
      if (res.status === 401 || res.status === 403) {
        setErr('Admin or ops sign-in required.')
        return
      }
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as { items: Row[] }
      setItems(data.items ?? [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function cancelOrder(id: string) {
    try {
      await fetchCsrfToken()
      const res = await apiFetch(`/api/admin/orders/${id}/cancel`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Cancel failed')
    }
  }

  async function refundOrder(id: string) {
    try {
      await fetchCsrfToken()
      const res = await apiFetch(`/api/admin/orders/${id}/refund`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Refund failed')
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        Orders
      </Typography>
      {err && <Alert severity="warning">{err}</Alert>}
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField size="small" label="Filter status" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <Button variant="outlined" onClick={() => void load()}>
          Apply
        </Button>
      </Stack>
      <Stack spacing={1}>
        {items.map((o) => (
          <Stack key={o.orderId} direction="row" alignItems="center" spacing={1} flexWrap="wrap" sx={{ py: 1, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="body2" sx={{ minWidth: 220 }}>
              <Button component={RouterLink} to={`/orders/${o.orderId}`} size="small">
                {o.orderId.slice(0, 8)}…
              </Button>
              {o.status} · {(o.total_cents / 100).toFixed(2)} {o.currency}
            </Typography>
            <Button size="small" onClick={() => void cancelOrder(o.orderId)} disabled={['shipped', 'delivered', 'cancelled'].includes(o.status)}>
              Cancel
            </Button>
            <Button size="small" onClick={() => void refundOrder(o.orderId)}>
              Mark refunded
            </Button>
          </Stack>
        ))}
      </Stack>
    </Stack>
  )
}
