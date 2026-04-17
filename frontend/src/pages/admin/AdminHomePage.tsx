import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Alert, Box, Button, Divider, Paper, Stack, Typography } from '@mui/material'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { AdminOverviewCharts, type AdminOverviewDto } from './AdminOverviewCharts'

type LowStockRow = { sku: string; product_name: string; quantity: number; low_stock_threshold: number | null }

export function AdminHomePage() {
  const [overview, setOverview] = useState<AdminOverviewDto | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [connectivity, setConnectivity] = useState<string | null>(null)
  const [connectivityBusy, setConnectivityBusy] = useState(false)
  const [lowStock, setLowStock] = useState<LowStockRow[]>([])
  const [lowStockHint, setLowStockHint] = useState<string | null>(null)
  const [lowStockLoaded, setLowStockLoaded] = useState(false)

  useEffect(() => {
    void (async () => {
      setOverviewLoading(true)
      setOverviewError(null)
      try {
        const res = await fetch(apiUrl('/api/admin/overview'), { credentials: 'include' })
        if (res.status === 401 || res.status === 403) {
          setOverview(null)
          setOverviewError('You need an authorised staff session to load dashboard metrics.')
        } else if (!res.ok) {
          setOverview(null)
          const raw = await res.text().catch(() => '')
          let msg = raw ? raw.slice(0, 240) : `Overview request failed (HTTP ${res.status}).`
          try {
            const j = JSON.parse(raw) as { error?: string }
            if (j?.error) msg = j.error
          } catch {
            /* keep msg */
          }
          setOverviewError(msg)
        } else {
          setOverview((await res.json()) as AdminOverviewDto)
        }
      } catch {
        setOverview(null)
        setOverviewError('Could not load overview metrics.')
      } finally {
        setOverviewLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    void (async () => {
      setLowStockLoaded(false)
      setLowStockHint(null)
      try {
        const res = await fetch(apiUrl('/api/admin/inventory/low-stock'), { credentials: 'include' })
        if (res.status === 401 || res.status === 403) {
          setLowStockHint('Sign in with an authorised staff role to view low-stock alerts.')
          setLowStock([])
          setLowStockLoaded(true)
          return
        }
        if (!res.ok) {
          setLowStockHint(`Low-stock data could not be loaded (HTTP ${res.status}).`)
          setLowStock([])
          setLowStockLoaded(true)
          return
        }
        const data = (await res.json()) as { items: LowStockRow[] }
        setLowStock(data.items ?? [])
        setLowStockLoaded(true)
      } catch {
        setLowStockHint('A network error occurred while loading low-stock data.')
        setLowStock([])
        setLowStockLoaded(true)
      }
    })()
  }, [])

  async function verifyConnectivity() {
    setConnectivity(null)
    setConnectivityBusy(true)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/admin/ping', { method: 'GET' })
      const text = (await res.text()).trim()
      setConnectivity(`${res.status} ${text}`.trim())
    } catch (e) {
      setConnectivity(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setConnectivityBusy(false)
    }
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 1200 }}>
      <Box>
        <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0.8, fontWeight: 700 }}>
          PayToday operations
        </Typography>
        <Typography variant="h4" component="h1" fontWeight={800} sx={{ mt: 0.5, letterSpacing: -0.5 }}>
          Overview
        </Typography>
      </Box>

      <AdminOverviewCharts data={overview} loading={overviewLoading} error={overviewError} />

      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 2 }}>
        <Typography variant="subtitle1" fontWeight={800}>
          Access & connectivity
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.65, maxWidth: 720 }}>
          Sign in under{' '}
          <Button component={RouterLink} to="/account" size="small" variant="text" sx={{ fontWeight: 700, p: 0, minWidth: 0, verticalAlign: 'baseline' }}>
            Account
          </Button>{' '}
          with a staff profile that has <strong>Admin</strong>, <strong>Operations</strong>, or{' '}
          <strong>Fulfillment</strong> privileges. The API validates your session before returning admin data.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ mt: 2 }}>
          <Button variant="outlined" onClick={() => void verifyConnectivity()} disabled={connectivityBusy} sx={{ fontWeight: 700 }}>
            {connectivityBusy ? 'Checking…' : 'Verify API connectivity'}
          </Button>
          <Typography variant="caption" color="text.secondary">
            Confirms that authenticated admin traffic reaches the application tier.
          </Typography>
        </Stack>
        {connectivity ? (
          <Alert severity={connectivity.startsWith('200') ? 'success' : 'warning'} sx={{ mt: 2, wordBreak: 'break-word' }}>
            {connectivity}
          </Alert>
        ) : null}
      </Paper>

      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 2 }}>
        <Typography variant="subtitle1" fontWeight={800}>
          Low-stock SKUs
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Variants at or below their configured threshold (requires inventory access).
        </Typography>
        <Divider sx={{ my: 2 }} />
        {lowStockHint ? (
          <Alert severity="info" sx={{ mb: lowStock.length ? 2 : 0 }}>
            {lowStockHint}
          </Alert>
        ) : null}
        {lowStockLoaded && !lowStockHint && lowStock.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No variants are currently below threshold.
          </Typography>
        ) : null}
        {lowStock.length > 0 ? (
          <Stack component="ul" sx={{ m: 0, pl: 2.25, mb: 0 }}>
            {lowStock.map((r) => (
              <Typography key={r.sku} component="li" variant="body2" sx={{ py: 0.25 }}>
                <Box component="span" fontWeight={700}>
                  {r.sku}
                </Box>
                {' — '}
                {r.product_name} · quantity {r.quantity}
                {r.low_stock_threshold != null ? ` · threshold ${r.low_stock_threshold}` : ''}
              </Typography>
            ))}
          </Stack>
        ) : null}
        <Button component={RouterLink} to="/admin/inventory" variant="text" size="small" sx={{ mt: 2, fontWeight: 700 }}>
          Open inventory
        </Button>
      </Paper>
    </Stack>
  )
}
