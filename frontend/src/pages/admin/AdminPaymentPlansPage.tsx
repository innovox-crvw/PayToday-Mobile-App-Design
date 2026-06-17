import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Drawer,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { formatMoney } from '../../lib/money'

type PlanRow = {
  id: string
  order_id: string
  plan_type: string
  total_instalments: number
  instalment_cents: number
  currency: string
  status: string
  created_at: string | null
  overdue_count: number
  customer_email: string | null
}

type InstalmentRow = {
  id: string
  instalment_number: number
  amount_cents: number
  status: string
  due_date: string
  paid_at: string | null
  payment_ref: string | null
}

type PlanDetail = {
  id: string
  plan_type: string
  total_instalments: number
  instalment_cents: number
  currency: string
  status: string
  instalments: InstalmentRow[]
}

export function AdminPaymentPlansPage() {
  const [items, setItems] = useState<PlanRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null)
  const [detail, setDetail] = useState<PlanDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [paymentRef, setPaymentRef] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setErr(null)
    try {
      const q = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : ''
      const res = await fetch(apiUrl(`/api/admin/payment-plans${q}`), { credentials: 'include' })
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as { items: PlanRow[] }
      setItems(data.items ?? [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load payment plans')
    }
  }, [statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  async function openDetail(orderId: string) {
    setDetailLoading(true)
    setDetailOrderId(orderId)
    setDetail(null)
    setPaymentRef('')
    try {
      const res = await fetch(apiUrl(`/api/admin/orders/${encodeURIComponent(orderId)}/payment-plan`), {
        credentials: 'include',
      })
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as { plan: PlanDetail | null }
      if (!data.plan) {
        setToast('No plan found for this order')
        setDetailOrderId(null)
        return
      }
      setDetail(data.plan)
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Could not load plan')
    } finally {
      setDetailLoading(false)
    }
  }

  async function markPaid(instalmentId: string) {
    setBusyId(instalmentId)
    setToast(null)
    try {
      await fetchCsrfToken()
      const res = await apiFetch(`/api/admin/payment-plan-instalments/${encodeURIComponent(instalmentId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paid', payment_ref: paymentRef.trim() || null }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Update failed')
      }
      setToast('Instalment marked paid')
      if (detailOrderId) void openDetail(detailOrderId)
      void load()
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        Payment plans
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Recurring / instalment plans created at checkout or by staff. Mark instalments paid when you receive payment.
      </Typography>

      {toast ? (
        <Alert severity="success" onClose={() => setToast(null)}>
          {toast}
        </Alert>
      ) : null}
      {err ? <Alert severity="error">{err}</Alert> : null}

      <FormControl size="small" sx={{ maxWidth: 220 }}>
        <InputLabel id="plan-status-filter">Plan status</InputLabel>
        <Select
          labelId="plan-status-filter"
          label="Plan status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="active">Active</MenuItem>
          <MenuItem value="completed">Completed</MenuItem>
          <MenuItem value="cancelled">Cancelled</MenuItem>
        </Select>
      </FormControl>

      <Box sx={{ overflowX: 'auto', border: 1, borderColor: 'divider', borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Order</TableCell>
              <TableCell>Customer</TableCell>
              <TableCell>Term</TableCell>
              <TableCell>Instalment</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Overdue</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    No payment plans yet.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>
                    <Button component={RouterLink} to={`/admin/orders`} size="small" sx={{ fontFamily: 'monospace' }}>
                      {row.order_id.slice(0, 8)}…
                    </Button>
                  </TableCell>
                  <TableCell>{row.customer_email ?? '—'}</TableCell>
                  <TableCell>
                    {row.total_instalments} × {row.plan_type}
                  </TableCell>
                  <TableCell>{formatMoney(row.instalment_cents, row.currency)}</TableCell>
                  <TableCell>
                    <Chip size="small" label={row.status} color={row.status === 'active' ? 'primary' : 'default'} />
                  </TableCell>
                  <TableCell align="right">{row.overdue_count > 0 ? row.overdue_count : '—'}</TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => void openDetail(row.order_id)}>
                      Instalments
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Box>

      <Drawer
        anchor="right"
        open={detailLoading || detail != null}
        onClose={() => {
          setDetail(null)
          setDetailOrderId(null)
        }}
      >
        <Box sx={{ width: { xs: 1, sm: 400 }, p: 2.5 }}>
          {detailLoading ? (
            <Stack alignItems="center" py={4}>
              <CircularProgress />
            </Stack>
          ) : detail ? (
            <Stack spacing={2}>
              <Typography variant="h6" fontWeight={800}>
                Plan instalments
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Order {detailOrderId ?? '—'}
              </Typography>
              <TextField
                label="Payment reference (optional)"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                size="small"
                fullWidth
              />
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>Due</TableCell>
                    <TableCell>Amount</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detail.instalments.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>{i.instalment_number}</TableCell>
                      <TableCell>{i.due_date}</TableCell>
                      <TableCell>{formatMoney(i.amount_cents, detail.currency)}</TableCell>
                      <TableCell>
                        <Chip size="small" label={i.status} color={i.status === 'paid' ? 'success' : 'default'} />
                      </TableCell>
                      <TableCell>
                        {i.status !== 'paid' ? (
                          <Button
                            size="small"
                            disabled={busyId === i.id}
                            onClick={() => void markPaid(i.id)}
                          >
                            Mark paid
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Button onClick={() => setDetail(null)}>Close</Button>
            </Stack>
          ) : null}
        </Box>
      </Drawer>
    </Stack>
  )
}
