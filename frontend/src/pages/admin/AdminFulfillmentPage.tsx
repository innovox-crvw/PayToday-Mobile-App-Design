import { useEffect, useState } from 'react'
import { Alert, Button, Stack, Typography } from '@mui/material'
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
  yango_delivery_id: string | null
  yango_status: string | null
  yango_tracking_url: string | null
}

export function AdminFulfillmentPage() {
  const [items, setItems] = useState<OrderRow[]>([])
  const [error, setError] = useState<string | null>(null)

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

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        Fulfillment
      </Typography>
      {error && <Alert severity="warning">{error}</Alert>}
      <Typography variant="subtitle1" fontWeight={700}>
        Orders
      </Typography>
      <Stack spacing={1}>
        {items.map((o) => (
          <Stack key={o.orderId} direction="row" alignItems="center" spacing={1} flexWrap="wrap">
            <Typography variant="body2" sx={{ minWidth: 260 }}>
              {o.orderId.slice(0, 8)}… · {formatOrderStatusLabel(o.status)} · {o.stage} · {(o.total_cents / 100).toFixed(2)}{' '}
              {o.currency} · {o.delivery_method}
              {o.yango_delivery_id ? ` · Yango ${o.yango_delivery_id}` : ''}
              {o.yango_tracking_url ? (
                <>
                  {' '}
                  <a href={o.yango_tracking_url} target="_blank" rel="noreferrer">
                    Track
                  </a>
                </>
              ) : null}
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
