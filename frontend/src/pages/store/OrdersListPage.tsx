import { useEffect, useState } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { Alert, Card, CardActionArea, Stack, Typography } from '@mui/material'
import { apiFetch } from '../../api/client'
import { formatOrderStatusLabel } from '../../lib/orderStatusDisplay'

type Row = { orderId: string; status: string; total_cents: number; currency: string; created_at: string }

export function OrdersListPage() {
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const [items, setItems] = useState<Row[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch('/api/orders/mine')
        if (res.status === 401) {
          setErr('Sign in to see your orders.')
          return
        }
        if (!res.ok) throw new Error(await res.text())
        const data = (await res.json()) as { items: Row[] }
        setItems(data.items ?? [])
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to load')
      }
    })()
  }, [])

  return (
    <Stack spacing={2} sx={{ maxWidth: 560, mx: 'auto', py: 2 }}>
      <Typography variant="h5" fontWeight={800}>
        My orders
      </Typography>
      {err && <Alert severity="warning">{err}</Alert>}
      {!err && items.length === 0 && <Typography color="text.secondary">No orders yet.</Typography>}
      {items.map((o) => (
        <Card key={o.orderId} variant="outlined">
          <CardActionArea component={RouterLink} to={`${pathPrefix}/orders/${o.orderId}`} sx={{ p: 2 }}>
            <Typography fontWeight={700}>
              {(o.total_cents / 100).toFixed(2)} {o.currency}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formatOrderStatusLabel(o.status)} · {new Date(o.created_at).toLocaleString()}
            </Typography>
          </CardActionArea>
        </Card>
      ))}
    </Stack>
  )
}
