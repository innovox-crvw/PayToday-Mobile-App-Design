import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Alert, Button, Stack, Typography } from '@mui/material'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'

type LowStockRow = { sku: string; product_name: string; quantity: number }

export function AdminHomePage() {
  const [msg, setMsg] = useState<string | null>(null)
  const [lowStock, setLowStock] = useState<LowStockRow[]>([])
  const [lowStockHint, setLowStockHint] = useState<string | null>(null)
  const [lowStockLoaded, setLowStockLoaded] = useState(false)

  async function ping() {
    setMsg(null)
    try {
      const res = await fetch(apiUrl('/api/admin/ping'), { credentials: 'include' })
      const text = await res.text()
      setMsg(`${res.status} ${text}`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Request failed')
    }
  }

  useEffect(() => {
    void (async () => {
      setLowStockLoaded(false)
      setLowStockHint(null)
      try {
        const res = await fetch(apiUrl('/api/admin/inventory/low-stock'), { credentials: 'include' })
        if (res.status === 401 || res.status === 403) {
          setLowStockHint('Sign in with admin, ops, or fulfillment to load low-stock data.')
          setLowStock([])
          setLowStockLoaded(true)
          return
        }
        if (!res.ok) {
          setLowStockHint(`Could not load low stock (HTTP ${res.status}).`)
          setLowStock([])
          setLowStockLoaded(true)
          return
        }
        const data = (await res.json()) as { items: LowStockRow[] }
        setLowStock(data.items ?? [])
        setLowStockLoaded(true)
      } catch {
        setLowStockHint('Network error while loading low stock.')
        setLowStock([])
        setLowStockLoaded(true)
      }
    })()
  }, [])

  async function pingWithCsrf() {
    setMsg(null)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/admin/ping', { method: 'GET' })
      const text = await res.text()
      setMsg(`${res.status} ${text}`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Request failed')
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        Operations overview
      </Typography>
      <Typography color="text.secondary" maxWidth={720}>
        v1 includes product, order, inventory, fulfillment, and deposit box management. Use the sidebar to navigate modules as they
        are implemented against MS SQL Server.
      </Typography>
      <Alert severity="info">
        <code>GET /api/admin/ping</code> requires a JWT with role admin, ops, or fulfillment. Sign in on{' '}
        <strong>/account</strong> using staff credentials from your database, then test the ping.
      </Alert>
      <Stack direction="row" gap={1} flexWrap="wrap">
        <Button variant="outlined" onClick={() => void ping()}>
          Ping admin (GET, no CSRF)
        </Button>
        <Button variant="outlined" onClick={() => void pingWithCsrf()}>
          Ping admin (with CSRF warmup)
        </Button>
      </Stack>
      {msg && (
        <Alert severity={msg.startsWith('200') ? 'success' : 'warning'} sx={{ wordBreak: 'break-word' }}>
          {msg}
        </Alert>
      )}
      <Typography variant="subtitle1" fontWeight={700}>
        Low stock (threshold set on variants)
      </Typography>
      {lowStockHint && (
        <Alert severity="info" sx={{ maxWidth: 720 }}>
          {lowStockHint}
        </Alert>
      )}
      {lowStockLoaded && !lowStockHint && lowStock.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No SKUs are below their low-stock threshold right now.
        </Typography>
      )}
      {lowStock.length > 0 && (
        <Stack component="ul" sx={{ m: 0, pl: 2 }}>
          {lowStock.map((r) => (
            <Typography key={r.sku} component="li" variant="body2">
              {r.sku} — {r.product_name} · qty {r.quantity}
            </Typography>
          ))}
        </Stack>
      )}
      <Button component={RouterLink} to="/admin/inventory" variant="text" size="small" sx={{ alignSelf: 'flex-start' }}>
        Open inventory admin
      </Button>
    </Stack>
  )
}
