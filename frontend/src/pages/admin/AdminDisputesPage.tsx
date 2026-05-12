import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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

type Row = {
  disputeId: string
  orderId: string
  status: string
  reason: string
  description: string | null
  admin_resolution_note: string | null
  created_at: string
  updated_at: string
  order_status: string
  total_cents: number
  currency: string
  customer_email: string | null
  variant_sku: string | null
  product_name: string | null
}

const STATUSES = ['open', 'in_review', 'resolved', 'dismissed'] as const

export function AdminDisputesPage() {
  const [items, setItems] = useState<Row[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [edit, setEdit] = useState<Row | null>(null)
  const [status, setStatus] = useState<string>('open')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setErr(null)
    try {
      const res = await fetch(apiUrl('/api/admin/disputes'), { credentials: 'include' })
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as { items: Row[] }
      setItems(data.items ?? [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function openEdit(r: Row) {
    setEdit(r)
    setStatus(r.status)
    setNote(r.admin_resolution_note ?? '')
    setOk(null)
  }

  async function save() {
    if (!edit) return
    setBusy(true)
    setErr(null)
    setOk(null)
    try {
      await fetchCsrfToken()
      const res = await apiFetch(`/api/admin/disputes/${encodeURIComponent(edit.disputeId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adminResolutionNote: note.trim() || null }),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) {
        setErr(body.error ?? 'Update failed')
        return
      }
      setOk('Dispute updated.')
      setEdit(null)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        Order disputes
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Customer-submitted billing or fulfilment disputes. Status changes notify the customer when notification templates are wired.
      </Typography>
      {err ? <Alert severity="error">{err}</Alert> : null}
      {ok ? <Alert severity="success">{ok}</Alert> : null}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Created</TableCell>
            <TableCell>Order</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Customer</TableCell>
            <TableCell>Item</TableCell>
            <TableCell>Reason</TableCell>
            <TableCell align="right">Order total</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((r) => (
            <TableRow key={r.disputeId} hover>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleString()}</TableCell>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{r.orderId.slice(0, 8)}…</TableCell>
              <TableCell>{r.status}</TableCell>
              <TableCell>{r.customer_email ?? '—'}</TableCell>
              <TableCell sx={{ maxWidth: 160 }}>
                <Typography variant="body2" noWrap title={r.variant_sku ?? ''}>
                  {r.variant_sku ? `${r.product_name ?? ''} (${r.variant_sku})` : '—'}
                </Typography>
              </TableCell>
              <TableCell sx={{ maxWidth: 280 }}>
                <Typography variant="body2" noWrap title={r.reason}>
                  {r.reason}
                </Typography>
              </TableCell>
              <TableCell align="right">{formatMoney(r.total_cents, r.currency)}</TableCell>
              <TableCell align="right">
                <Button size="small" onClick={() => openEdit(r)}>
                  Manage
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No disputes yet.
        </Typography>
      ) : null}

      <Dialog open={Boolean(edit)} onClose={() => !busy && setEdit(null)} fullWidth maxWidth="sm">
        <DialogTitle>Dispute</DialogTitle>
        <DialogContent>
          {edit ? (
            <Stack spacing={1.5} sx={{ pt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Order {edit.orderId} · {edit.order_status}
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {edit.reason}
              </Typography>
              {edit.description ? (
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                  {edit.description}
                </Typography>
              ) : null}
              <FormControl fullWidth size="small">
                <InputLabel id="dispute-status">Status</InputLabel>
                <Select labelId="dispute-status" label="Status" value={status} onChange={(e) => setStatus(String(e.target.value))}>
                  {STATUSES.map((s) => (
                    <MenuItem key={s} value={s}>
                      {s}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField label="Resolution note (visible to customer when set)" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={3} fullWidth />
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEdit(null)} disabled={busy}>
            Close
          </Button>
          <Button variant="contained" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
