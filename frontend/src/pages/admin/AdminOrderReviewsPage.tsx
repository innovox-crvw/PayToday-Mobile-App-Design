import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Chip,
  Paper,
  Rating,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { apiUrl } from '../../lib/apiOrigin'
import { formatMoney } from '../../lib/money'

type Row = {
  reviewId: string
  orderId: string
  rating: number
  comment: string | null
  created_at: string
  total_cents: number
  currency: string
  order_status: string
  customer_email: string | null
}

export function AdminOrderReviewsPage() {
  const [items, setItems] = useState<Row[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(25)

  const load = useCallback(async () => {
    setErr(null)
    try {
      const res = await fetch(apiUrl('/api/admin/order-reviews'), { credentials: 'include' })
      if (res.status === 401 || res.status === 403) {
        setErr('Admin or ops sign-in required.')
        return
      }
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as { items: Row[] }
      setItems(data.items ?? [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load reviews')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((r) => {
      const hay = `${r.orderId} ${r.reviewId} ${r.customer_email ?? ''} ${r.comment ?? ''} ${r.order_status}`.toLowerCase()
      return hay.includes(q)
    })
  }, [items, search])

  const paginated = useMemo(() => {
    const start = page * rowsPerPage
    return filtered.slice(start, start + rowsPerPage)
  }, [filtered, page, rowsPerPage])

  useEffect(() => {
    queueMicrotask(() => {
      setPage((p) => {
        const maxPage = Math.max(0, Math.ceil(filtered.length / rowsPerPage) - 1)
        return Math.min(p, maxPage)
      })
    })
  }, [filtered.length, rowsPerPage])

  return (
    <Stack spacing={2.25} sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 0, sm: 0 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} justifyContent="space-between">
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" fontWeight={800}>
            Customer reviews
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
            Star ratings and comments left after delivery. Scoped to your merchant access when applicable.
          </Typography>
        </Box>
        <Chip size="small" variant="outlined" label={`${filtered.length} shown`} />
      </Stack>

      {err ? <Alert severity="warning">{err}</Alert> : null}

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
          <TextField
            size="small"
            label="Search"
            placeholder="Order id, email, comment…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
            fullWidth
          />
        </Stack>
      </Paper>

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Submitted</TableCell>
              <TableCell>Order</TableCell>
              <TableCell>Rating</TableCell>
              <TableCell sx={{ minWidth: 200 }}>Comment</TableCell>
              <TableCell>Customer</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    No reviews yet.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((r) => (
                <TableRow key={r.reviewId} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {new Date(r.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{r.orderId}</TableCell>
                  <TableCell>
                    <Rating value={r.rating} readOnly size="small" sx={{ verticalAlign: 'middle' }} />
                  </TableCell>
                  <TableCell sx={{ maxWidth: 320 }}>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {(r.comment ?? '').trim() || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>{r.customer_email ?? '—'}</TableCell>
                  <TableCell align="right">{formatMoney(r.total_cents, r.currency)}</TableCell>
                  <TableCell>{r.order_status}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={filtered.length}
          page={page}
          onPageChange={(_e, next) => setPage(next)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(Number(e.target.value))
            setPage(0)
          }}
          rowsPerPageOptions={[10, 25, 50]}
        />
      </TableContainer>
    </Stack>
  )
}
