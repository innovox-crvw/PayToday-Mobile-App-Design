import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { useAuthMe } from '../../hooks/useAuthMe'

const POLL_MS = 12_000

type InvRow = {
  variantId: string
  productId: string
  productName: string
  productSlug: string
  isActive: boolean
  sku: string
  variantName: string
  priceCents: number
  currency: string
  quantity: number
  lowStockThreshold: number | null
  reservedQuantity: number
}

type MovementRow = {
  id: string
  variantId: string
  sku: string
  productName: string
  deltaQty: number
  reason: string
  referenceId: string | null
  createdAt: string
}

type LowRow = { sku: string; product_name: string; quantity: number; low_stock_threshold: number | null }

export function AdminInventoryPage() {
  const { user: authUser } = useAuthMe()
  const [rows, setRows] = useState<InvRow[]>([])
  const [movements, setMovements] = useState<MovementRow[]>([])
  const [lowStock, setLowStock] = useState<LowRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  /** Form fields — reset from the server on each load so counts stay accurate while polling. */
  const [edit, setEdit] = useState<Record<string, { qty: string; th: string }>>({})
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setErr(null)
    try {
      const [rInv, rMov, rLow] = await Promise.all([
        fetch(apiUrl('/api/admin/inventory'), { credentials: 'include' }),
        fetch(apiUrl('/api/admin/inventory/movements?limit=40'), { credentials: 'include' }),
        fetch(apiUrl('/api/admin/inventory/low-stock'), { credentials: 'include' }),
      ])
      if (rInv.status === 401 || rInv.status === 403) {
        setErr('Sign in with admin, ops, or fulfillment to manage inventory.')
        return
      }
      if (!rInv.ok) throw new Error(await rInv.text())
      if (!rMov.ok) throw new Error(await rMov.text())
      if (!rLow.ok) throw new Error(await rLow.text())
      const inv = (await rInv.json()) as { items: InvRow[] }
      const mov = (await rMov.json()) as { items: MovementRow[] }
      const low = (await rLow.json()) as { items: LowRow[] }
      setRows(inv.items ?? [])
      setMovements(mov.items ?? [])
      setLowStock(low.items ?? [])
      setLastUpdated(new Date().toLocaleTimeString())
      const nextEdit: Record<string, { qty: string; th: string }> = {}
      for (const x of inv.items ?? []) {
        nextEdit[x.variantId] = {
          qty: String(x.quantity),
          th: x.lowStockThreshold == null ? '' : String(x.lowStockThreshold),
        }
      }
      setEdit(nextEdit)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load')
    }
  }, [])

  useEffect(() => {
    void loadAll()
    const t = window.setInterval(() => void loadAll(), POLL_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') void loadAll()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [loadAll])

  async function saveRow(variantId: string) {
    setErr(null)
    const row = edit[variantId]
    if (!row) {
      setErr('Nothing to save.')
      return
    }
    const qtyRaw = row.qty
    const thRaw = row.th.trim()
    const quantityTarget = qtyRaw !== '' ? Number(qtyRaw) : NaN
    const body: { quantityTarget?: number; lowStockThreshold?: number | null } = {}
    if (Number.isFinite(quantityTarget) && Number.isInteger(quantityTarget) && quantityTarget >= 0) {
      body.quantityTarget = quantityTarget
    }
    if (thRaw === '') {
      body.lowStockThreshold = null
    } else {
      const t = Number(thRaw)
      if (Number.isFinite(t) && Number.isInteger(t) && t >= 0) {
        body.lowStockThreshold = t
      }
    }
    if (body.quantityTarget === undefined && !Object.prototype.hasOwnProperty.call(body, 'lowStockThreshold')) {
      setErr('Enter a valid on-hand quantity and/or low-stock threshold (clear threshold with an empty field).')
      return
    }
    try {
      await fetchCsrfToken()
      const res = await apiFetch(`/api/admin/inventory/variants/${variantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      await loadAll()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    }
  }

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between">
        <Box>
          <Typography variant="h5" fontWeight={800}>
            Inventory
          </Typography>
          <Typography variant="body2" color="text.secondary" maxWidth={720}>
            On-hand counts sync from checkout reservations, admin adjustments, order cancellations (stock released for unpaid orders),
            and approved returns. This page refreshes every {POLL_MS / 1000}s and when you return to the tab.
          </Typography>
        </Box>
        <Button variant="outlined" onClick={() => void loadAll()}>
          Refresh now
        </Button>
      </Stack>
      {lastUpdated && (
        <Typography variant="caption" color="text.secondary">
          Last loaded: {lastUpdated}
        </Typography>
      )}
      {err && <Alert severity="warning">{err}</Alert>}
      {(authUser?.role === 'admin' || authUser?.role === 'fulfillment') && (authUser.merchants?.length ?? 0) > 0 ? (
        <Alert severity="info">
          Stock levels, low-stock alerts, and recent movements are limited to your linked store(s):{' '}
          <strong>{authUser.merchants!.map((m) => m.name).join(', ')}</strong>. The storefront still aggregates all merchants.
        </Alert>
      ) : null}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Low stock
        </Typography>
        {lowStock.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No SKUs are at or below their threshold.
          </Typography>
        ) : (
          <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap>
            {lowStock.map((r) => (
              <Chip
                key={r.sku}
                color="warning"
                variant="outlined"
                label={`${r.sku} · ${r.product_name} (${r.quantity} ≤ ${r.low_stock_threshold ?? '—'})`}
              />
            ))}
          </Stack>
        )}
      </Paper>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Product</TableCell>
              <TableCell>SKU</TableCell>
              <TableCell align="right">On hand</TableCell>
              <TableCell align="right">Unpaid reserved</TableCell>
              <TableCell align="right">Low at</TableCell>
              <TableCell align="center">Active</TableCell>
              <TableCell width={280}>Adjust</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => {
              const low =
                r.lowStockThreshold != null && r.quantity <= r.lowStockThreshold ? (
                  <Chip size="small" label="Low" color="warning" />
                ) : null
              return (
                <TableRow key={r.variantId} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {r.productName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {r.productSlug} · {r.variantName}
                    </Typography>
                  </TableCell>
                  <TableCell>{r.sku}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                      <span>{r.quantity}</span>
                      {low}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">{r.reservedQuantity}</TableCell>
                  <TableCell align="right">{r.lowStockThreshold ?? '—'}</TableCell>
                  <TableCell align="center">{r.isActive ? 'Yes' : 'No'}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <TextField
                        size="small"
                        label="Qty"
                        type="number"
                        inputProps={{ min: 0, step: 1 }}
                        value={edit[r.variantId]?.qty ?? String(r.quantity)}
                        onChange={(e) =>
                          setEdit((d) => ({
                            ...d,
                            [r.variantId]: { qty: e.target.value, th: d[r.variantId]?.th ?? '' },
                          }))
                        }
                        sx={{ width: 100 }}
                      />
                      <TextField
                        size="small"
                        label="Threshold"
                        type="number"
                        inputProps={{ min: 0, step: 1 }}
                        placeholder="empty = off"
                        value={edit[r.variantId]?.th ?? ''}
                        onChange={(e) =>
                          setEdit((d) => ({
                            ...d,
                            [r.variantId]: { qty: d[r.variantId]?.qty ?? String(r.quantity), th: e.target.value },
                          }))
                        }
                        sx={{ width: 120 }}
                      />
                      <Button size="small" variant="contained" onClick={() => void saveRow(r.variantId)}>
                        Save
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Recent stock movements
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>When (UTC)</TableCell>
              <TableCell>SKU</TableCell>
              <TableCell>Δ</TableCell>
              <TableCell>Reason</TableCell>
              <TableCell>Ref</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {movements.map((m) => (
              <TableRow key={m.id}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{m.createdAt.slice(0, 19).replace('T', ' ')}</TableCell>
                <TableCell>{m.sku}</TableCell>
                <TableCell>{m.deltaQty > 0 ? `+${m.deltaQty}` : m.deltaQty}</TableCell>
                <TableCell>{m.reason}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{m.referenceId?.slice(0, 8) ?? '—'}…</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {movements.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No movements yet.
          </Typography>
        )}
      </Paper>
    </Stack>
  )
}
