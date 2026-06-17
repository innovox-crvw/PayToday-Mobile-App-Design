import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import RefreshIcon from '@mui/icons-material/Refresh'
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Select,
  type SelectChangeEvent,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { formatMoney } from '../../lib/money'
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

/** Values accepted by `PATCH .../stage` (see backend fulfillment router). */
const STAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'picking', label: 'Picking' },
  { value: 'packing', label: 'Packing' },
  { value: 'packed', label: 'Packed' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
]

function stageLabel(stage: string): string {
  const s = stage.trim().toLowerCase()
  if (s === 'pick') return 'Picking'
  return STAGE_OPTIONS.find((o) => o.value === s)?.label ?? stage
}

export function AdminFulfillmentPage() {
  const [items, setItems] = useState<OrderRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
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
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function setStage(orderId: string, stage: string) {
    setUpdatingId(orderId)
    setError(null)
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
    } finally {
      setUpdatingId(null)
    }
  }

  function onStageChange(orderId: string, event: SelectChangeEvent<string>) {
    const next = event.target.value
    void setStage(orderId, next)
  }

  function normalizedStageValue(stage: string): string {
    const s = stage.trim().toLowerCase()
    return s === 'pick' ? 'picking' : s
  }

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between">
        <Box>
          <Typography variant="h5" fontWeight={800} gutterBottom>
            Fulfillment
          </Typography>
          <Typography variant="body2" color="text.secondary" maxWidth={640}>
            Set each order&apos;s warehouse stage from the dropdown. Order status updates automatically for some stages (e.g. shipped,
            delivered).
          </Typography>
        </Box>
        <Tooltip title="Refresh list">
          <span>
            <IconButton onClick={() => void load()} disabled={loading} aria-label="Refresh orders" color="primary">
              <RefreshIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {error ? <Alert severity="warning">{error}</Alert> : null}

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1 }}>
        <Table size="small" sx={{ minWidth: 720 }}>
          <TableHead sx={{ bgcolor: 'action.hover' }}>
            <TableRow>
              <TableCell>Order</TableCell>
              <TableCell>Payment</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell>Delivery</TableCell>
              <TableCell sx={{ minWidth: 200 }}>Fulfillment stage</TableCell>
              <TableCell>Courier</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    No fulfillment tasks yet. Paid orders with tasks appear here.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : null}
            {items.map((o) => {
              const rowStage = normalizedStageValue(o.stage)
              const options = STAGE_OPTIONS.some((x) => x.value === rowStage)
                ? STAGE_OPTIONS
                : [{ value: rowStage, label: `${stageLabel(o.stage)} (current)` }, ...STAGE_OPTIONS]

              return (
                <TableRow key={o.orderId} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                      {o.orderId.slice(0, 8)}…
                    </Typography>
                    <Button component={RouterLink} to={`/orders/${o.orderId}`} size="small" variant="text" sx={{ mt: 0.25, p: 0, minWidth: 0 }}>
                      View order
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={formatOrderStatusLabel(o.status)} variant="outlined" />
                  </TableCell>
                  <TableCell align="right">{formatMoney(o.total_cents, o.currency)}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{o.delivery_method || '—'}</Typography>
                  </TableCell>
                  <TableCell>
                    <FormControl size="small" fullWidth disabled={updatingId === o.orderId}>
                      <InputLabel id={`stage-${o.orderId}`}>Stage</InputLabel>
                      <Select
                        labelId={`stage-${o.orderId}`}
                        label="Stage"
                        value={rowStage}
                        onChange={(e) => onStageChange(o.orderId, e)}
                      >
                        {options.map((opt) => (
                          <MenuItem key={`${o.orderId}-${opt.value}`} value={opt.value}>
                            {opt.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell>
                    {o.yango_delivery_id ? (
                      <Stack spacing={0.25}>
                        <Typography variant="caption" color="text.secondary">
                          Yango {o.yango_delivery_id}
                        </Typography>
                        {o.yango_status ? (
                          <Typography variant="caption" display="block">
                            {o.yango_status}
                          </Typography>
                        ) : null}
                        {o.yango_tracking_url ? (
                          <Link href={o.yango_tracking_url} target="_blank" rel="noopener noreferrer" variant="body2">
                            Track
                          </Link>
                        ) : null}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        —
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 1, maxWidth: 560 }}>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          Pick / pack slip
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Open the order, then print from the customer order page if you use that workflow.
        </Typography>
        <Button component={RouterLink} to="/admin/orders" variant="outlined" size="small">
          Go to orders
        </Button>
      </Paper>
    </Stack>
  )
}
