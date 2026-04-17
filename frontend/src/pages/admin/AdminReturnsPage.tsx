import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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

type Row = {
  id: string
  order_id: string
  reason: string
  status: string
  rejection_reason: string | null
  created_at: string
  received_at: string | null
  refund_net_cents: number | null
  line_count?: number
}

type DetailLine = {
  variant_id: string
  product_id: string
  quantity: number
  sku: string
  product_name: string
  variant_name: string
}

function statusColor(status: string): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' {
  const s = status.toLowerCase()
  if (s === 'pending') return 'warning'
  if (s === 'approved') return 'info'
  if (s === 'rejected') return 'error'
  if (s === 'received') return 'primary'
  if (s === 'completed') return 'success'
  return 'default'
}

export function AdminReturnsPage() {
  const [items, setItems] = useState<Row[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ lines: DetailLine[]; reason: string; image_urls_json: string | null } | null>(
    null,
  )
  const [detailFor, setDetailFor] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const load = useCallback(async () => {
    setErr(null)
    try {
      const [listRes, aRes] = await Promise.all([
        fetch(apiUrl('/api/admin/returns'), { credentials: 'include' }),
        fetch(apiUrl('/api/admin/returns/analytics'), { credentials: 'include' }),
      ])
      if (!listRes.ok) throw new Error(await listRes.text())
      const listData = (await listRes.json()) as { items: Row[] }
      setItems(listData.items ?? [])
      if (aRes.ok) {
        const a = (await aRes.json()) as { counts: Record<string, number> }
        setCounts(a.counts ?? {})
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function loadDetail(id: string) {
    setErr(null)
    try {
      const res = await fetch(apiUrl(`/api/admin/returns/${encodeURIComponent(id)}`), { credentials: 'include' })
      if (!res.ok) throw new Error(await res.text())
      const d = (await res.json()) as {
        case: { reason: string; image_urls_json: string | null }
        lines: DetailLine[]
      }
      setDetail({ lines: d.lines, reason: d.case.reason, image_urls_json: d.case.image_urls_json })
      setDetailFor(id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    }
  }

  async function postAction(path: string, body?: object) {
    setErr(null)
    setOk(null)
    try {
      await fetchCsrfToken()
      const res = await apiFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      const data = (await res.json()) as { error?: string; ok?: boolean; walletNote?: string }
      if (!res.ok) {
        setErr(data.error ?? 'Failed')
        return
      }
      setOk(data.walletNote ? `Done. ${data.walletNote}` : 'Done.')
      await load()
      if (detailFor) await loadDetail(detailFor)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        Return requests
      </Typography>
      <Typography variant="body2" color="text.secondary" maxWidth={900}>
        Workflow: <strong>Pending</strong> → approve or reject (no stock change). When approved, wait for physical goods.
        <strong> Mark received</strong> restocks inventory only at that moment. <strong>Complete refund</strong> credits the
        customer PayToday Wallet (same handling fee basis as pre-ship refunds) and sets status to completed.
      </Typography>
      {Object.keys(counts).length > 0 ? (
        <Stack direction="row" gap={1} flexWrap="wrap">
          {Object.entries(counts).map(([k, v]) => (
            <Chip key={k} label={`${k}: ${v}`} size="small" variant="outlined" />
          ))}
        </Stack>
      ) : null}
      {err && <Alert severity="warning">{err}</Alert>}
      {ok && <Alert severity="success">{ok}</Alert>}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Created</TableCell>
            <TableCell>Order</TableCell>
            <TableCell>Lines</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Reason (preview)</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((r) => (
            <TableRow key={r.id} hover selected={detailFor === r.id}>
              <TableCell>{new Date(r.created_at).toLocaleString()}</TableCell>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{r.order_id}</TableCell>
              <TableCell>{r.line_count ?? '—'}</TableCell>
              <TableCell>
                <Chip size="small" label={r.status} color={statusColor(r.status)} />
              </TableCell>
              <TableCell sx={{ maxWidth: 280 }}>
                <Typography variant="body2" noWrap title={r.reason}>
                  {r.reason}
                </Typography>
                {r.status === 'rejected' && r.rejection_reason ? (
                  <Typography variant="caption" color="error">
                    {r.rejection_reason}
                  </Typography>
                ) : null}
              </TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={0.5} justifyContent="flex-end" flexWrap="wrap">
                  <Button size="small" variant="outlined" onClick={() => void loadDetail(r.id)}>
                    Details
                  </Button>
                  {r.status === 'pending' ? (
                    <>
                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        onClick={() => void postAction(`/api/admin/returns/${encodeURIComponent(r.id)}/approve`)}
                      >
                        Approve
                      </Button>
                      <Button size="small" color="error" onClick={() => setRejectOpen(r.id)}>
                        Reject
                      </Button>
                    </>
                  ) : null}
                  {r.status === 'approved' ? (
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => void postAction(`/api/admin/returns/${encodeURIComponent(r.id)}/receive`)}
                    >
                      Mark received (restock)
                    </Button>
                  ) : null}
                  {r.status === 'received' ? (
                    <Button
                      size="small"
                      variant="contained"
                      color="secondary"
                      onClick={() =>
                        void postAction(`/api/admin/returns/${encodeURIComponent(r.id)}/complete-refund`)
                      }
                    >
                      Complete refund
                    </Button>
                  ) : null}
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {detail && detailFor ? (
        <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Typography variant="subtitle1" fontWeight={800} gutterBottom>
            Lines for {detailFor}
          </Typography>
          {detail.lines.map((l) => (
            <Typography key={l.variant_id} variant="body2">
              {l.product_name} — {l.variant_name} · SKU {l.sku} × {l.quantity}
            </Typography>
          ))}
          {detail.image_urls_json ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Images JSON: {detail.image_urls_json}
            </Typography>
          ) : null}
        </Box>
      ) : null}

      <Dialog open={Boolean(rejectOpen)} onClose={() => setRejectOpen(null)} fullWidth maxWidth="xs">
        <DialogTitle>Reject return</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Reason shown to customer"
            fullWidth
            multiline
            minRows={2}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectOpen(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={!rejectReason.trim()}
            onClick={() => {
              const id = rejectOpen
              if (!id) return
              void (async () => {
                await postAction(`/api/admin/returns/${encodeURIComponent(id)}/reject`, {
                  reason: rejectReason.trim(),
                })
                setRejectOpen(null)
                setRejectReason('')
              })()
            }}
          >
            Reject
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
