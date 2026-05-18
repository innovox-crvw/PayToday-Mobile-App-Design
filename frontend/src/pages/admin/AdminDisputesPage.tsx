import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  FormControl,
  IconButton,
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
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
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
type Status = (typeof STATUSES)[number]

const STATUS_LABEL: Record<Status, string> = {
  open: 'Open',
  in_review: 'In review',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
}

function statusChipColor(status: string): 'warning' | 'info' | 'success' | 'default' {
  switch (status) {
    case 'open':
      return 'warning'
    case 'in_review':
      return 'info'
    case 'resolved':
      return 'success'
    default:
      return 'default'
  }
}

async function copyText(label: string, text: string, onOk: (msg: string) => void) {
  try {
    await navigator.clipboard.writeText(text)
    onOk(`${label} copied`)
  } catch {
    onOk('Copy failed — select and copy manually')
  }
}

export function AdminDisputesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [items, setItems] = useState<Row[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [edit, setEdit] = useState<Row | null>(null)
  const [status, setStatus] = useState<string>('open')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<'all' | Status>('all')

  const load = useCallback(async () => {
    setErr(null)
    try {
      const res = await fetch(apiUrl('/api/admin/disputes'), { credentials: 'include' })
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as { items: Row[] }
      const list = data.items ?? []
      setItems(list)
      setEdit((cur) => {
        if (!cur) return null
        return list.find((x) => x.disputeId === cur.disputeId) ?? null
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const did = searchParams.get('disputeId')?.trim()
    if (!did || items.length === 0) return
    const row = items.find((x) => x.disputeId === did)
    if (!row) return
    setEdit(row)
    setStatus(row.status)
    setNote(row.admin_resolution_note ?? '')
    setToast(null)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('disputeId')
        return next
      },
      { replace: true },
    )
  }, [items, searchParams, setSearchParams])

  useEffect(() => {
    if (!edit) return
    setStatus(edit.status)
    setNote(edit.admin_resolution_note ?? '')
  }, [edit])

  const counts = useMemo(() => {
    const c: Record<Status, number> = { open: 0, in_review: 0, resolved: 0, dismissed: 0 }
    for (const r of items) {
      const s = r.status as Status
      if (s in c) c[s] += 1
    }
    return c
  }, [items])

  const filtered = useMemo(() => {
    if (filter === 'all') return items
    return items.filter((r) => r.status === filter)
  }, [items, filter])

  function openCase(r: Row) {
    setEdit(r)
    setStatus(r.status)
    setNote(r.admin_resolution_note ?? '')
    setToast(null)
  }

  async function patchDispute(disputeId: string, body: Record<string, unknown>) {
    await fetchCsrfToken()
    const res = await apiFetch(`/api/admin/disputes/${encodeURIComponent(disputeId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const j = (await res.json()) as { error?: string }
    if (!res.ok) throw new Error(j.error ?? 'Update failed')
  }

  async function applyStatusOnly(next: Status) {
    if (!edit) return
    setBusy(true)
    setErr(null)
    setToast(null)
    try {
      await patchDispute(edit.disputeId, { status: next })
      setToast(`Status set to ${STATUS_LABEL[next]}`)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveNoteOnly() {
    if (!edit) return
    setBusy(true)
    setErr(null)
    setToast(null)
    try {
      await patchDispute(edit.disputeId, { adminResolutionNote: note.trim() || null })
      setToast('Customer message saved')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveCase() {
    if (!edit) return
    setBusy(true)
    setErr(null)
    setToast(null)
    try {
      await patchDispute(edit.disputeId, {
        status,
        adminResolutionNote: note.trim() || null,
      })
      setToast('Case updated')
      setEdit(null)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const openCount = counts.open + counts.in_review

  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="h5" fontWeight={800}>
          Disputes
        </Typography>
        <Typography variant="body2" color="text.secondary" maxWidth={720}>
          Review payment and fulfilment issues. Use status to track your work; add a customer-visible message when you resolve or dismiss a
          case.
        </Typography>
      </Stack>

      <Grid container spacing={2}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Box sx={{ p: 1.5, borderRadius: 1, border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
            <Typography variant="caption" color="text.secondary">
              Needs action
            </Typography>
            <Typography variant="h6" fontWeight={800}>
              {openCount}
            </Typography>
          </Box>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Box sx={{ p: 1.5, borderRadius: 1, border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
            <Typography variant="caption" color="text.secondary">
              In review
            </Typography>
            <Typography variant="h6" fontWeight={800}>
              {counts.in_review}
            </Typography>
          </Box>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Box sx={{ p: 1.5, borderRadius: 1, border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
            <Typography variant="caption" color="text.secondary">
              Resolved
            </Typography>
            <Typography variant="h6" fontWeight={800}>
              {counts.resolved}
            </Typography>
          </Box>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Box sx={{ p: 1.5, borderRadius: 1, border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
            <Typography variant="caption" color="text.secondary">
              Dismissed
            </Typography>
            <Typography variant="h6" fontWeight={800}>
              {counts.dismissed}
            </Typography>
          </Box>
        </Grid>
      </Grid>

      {err ? <Alert severity="error">{err}</Alert> : null}
      {toast ? (
        <Alert severity="success" onClose={() => setToast(null)}>
          {toast}
        </Alert>
      ) : null}

      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
        <Typography variant="subtitle2" fontWeight={700}>
          Queue ({filtered.length})
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={filter}
          onChange={(_, v) => v != null && setFilter(v)}
          aria-label="Filter disputes"
        >
          <ToggleButton value="all">All</ToggleButton>
          {STATUSES.map((s) => (
            <ToggleButton key={s} value={s}>
              {STATUS_LABEL[s]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      <Table size="small" sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
        <TableHead sx={{ bgcolor: 'action.hover' }}>
          <TableRow>
            <TableCell>When</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Customer</TableCell>
            <TableCell>Item</TableCell>
            <TableCell>Summary</TableCell>
            <TableCell align="right">Order</TableCell>
            <TableCell align="right" />
          </TableRow>
        </TableHead>
        <TableBody>
          {filtered.map((r) => (
            <TableRow
              key={r.disputeId}
              hover
              selected={edit?.disputeId === r.disputeId}
              sx={{ cursor: 'pointer' }}
              onClick={() => openCase(r)}
            >
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleString()}</TableCell>
              <TableCell>
                <Chip size="small" label={STATUS_LABEL[r.status as Status] ?? r.status} color={statusChipColor(r.status)} variant="outlined" />
              </TableCell>
              <TableCell>{r.customer_email ?? '—'}</TableCell>
              <TableCell sx={{ maxWidth: 140 }}>
                <Typography variant="body2" noWrap title={r.variant_sku ?? ''}>
                  {r.variant_sku ? `${r.product_name ?? ''} (${r.variant_sku})` : '—'}
                </Typography>
              </TableCell>
              <TableCell sx={{ maxWidth: 260 }}>
                <Typography variant="body2" noWrap title={r.reason}>
                  {r.reason}
                </Typography>
              </TableCell>
              <TableCell align="right">{formatMoney(r.total_cents, r.currency)}</TableCell>
              <TableCell align="right">
                <Button size="small" variant="text" onClick={(e) => { e.stopPropagation(); openCase(r) }}>
                  Open
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

      <Drawer anchor="right" open={Boolean(edit)} onClose={() => !busy && setEdit(null)} PaperProps={{ sx: { width: { xs: '100%', sm: 440, md: 480 }, p: 0 } }}>
        {edit ? (
          <Stack sx={{ height: '100%' }} spacing={0}>
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
              <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                <Box>
                  <Typography variant="overline" color="text.secondary">
                    Dispute case
                  </Typography>
                  <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="wrap">
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                      {edit.disputeId.slice(0, 8)}…
                    </Typography>
                    <Tooltip title="Copy dispute id">
                      <IconButton
                        size="small"
                        aria-label="Copy dispute id"
                        onClick={() => void copyText('Dispute id', edit.disputeId, setToast)}
                      >
                        <ContentCopyIcon fontSize="inherit" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  <Chip sx={{ mt: 1 }} size="small" label={STATUS_LABEL[edit.status as Status] ?? edit.status} color={statusChipColor(edit.status)} />
                </Box>
                <Button size="small" onClick={() => setEdit(null)} disabled={busy}>
                  Close
                </Button>
              </Stack>
            </Box>

            <Box sx={{ p: 2, overflowY: 'auto', flex: 1 }}>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                Quick status
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mb: 2 }}>
                {edit.status !== 'in_review' ? (
                  <Button size="small" variant="outlined" disabled={busy} onClick={() => void applyStatusOnly('in_review')}>
                    Start review
                  </Button>
                ) : null}
                {edit.status !== 'resolved' ? (
                  <Button size="small" variant="outlined" disabled={busy} onClick={() => void applyStatusOnly('resolved')}>
                    Mark resolved
                  </Button>
                ) : null}
                {edit.status !== 'dismissed' ? (
                  <Button size="small" variant="outlined" disabled={busy} onClick={() => void applyStatusOnly('dismissed')}>
                    Dismiss
                  </Button>
                ) : null}
                {edit.status !== 'open' ? (
                  <Button size="small" variant="text" disabled={busy} onClick={() => void applyStatusOnly('open')}>
                    Reopen
                  </Button>
                ) : null}
              </Stack>

              <Divider sx={{ my: 1 }} />

              <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                Order
              </Typography>
              <Stack spacing={0.5} sx={{ mb: 2 }}>
                <Typography variant="body2">
                  Status: <strong>{edit.order_status}</strong> · Total {formatMoney(edit.total_cents, edit.currency)}
                </Typography>
                <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="wrap">
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    {edit.orderId.slice(0, 8)}…
                  </Typography>
                  <Tooltip title="Copy order id">
                    <IconButton
                      size="small"
                      aria-label="Copy order id"
                      onClick={() => void copyText('Order id', edit.orderId, setToast)}
                    >
                      <ContentCopyIcon fontSize="inherit" />
                    </IconButton>
                  </Tooltip>
                  <Button component={RouterLink} to={`/admin/orders?orderId=${encodeURIComponent(edit.orderId)}`} size="small" variant="text">
                    View order
                  </Button>
                </Stack>
              </Stack>

              <Divider sx={{ my: 1 }} />

              <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                Customer report
              </Typography>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                {edit.reason}
              </Typography>
              {edit.description ? (
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>
                  {edit.description}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  No extra detail.
                </Typography>
              )}

              <Divider sx={{ my: 1 }} />

              <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                Activity
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Opened {new Date(edit.created_at).toLocaleString()}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Last change {new Date(edit.updated_at).toLocaleString()}
              </Typography>

              <Divider sx={{ my: 1 }} />

              <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                Update case
              </Typography>
              <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
                <InputLabel id="dispute-status-drawer">Status</InputLabel>
                <Select
                  labelId="dispute-status-drawer"
                  label="Status"
                  value={status}
                  onChange={(e) => setStatus(String(e.target.value))}
                >
                  {STATUSES.map((s) => (
                    <MenuItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Message to customer"
                helperText="Optional. Shown on their order when you resolve or dismiss (if your storefront displays it)."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                multiline
                minRows={4}
                fullWidth
                sx={{ mb: 1.5 }}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap">
                <Button variant="contained" disabled={busy} onClick={() => void saveCase()}>
                  {busy ? 'Saving…' : 'Save status & message'}
                </Button>
                <Button variant="outlined" disabled={busy} onClick={() => void saveNoteOnly()}>
                  Save message only
                </Button>
              </Stack>
            </Box>
          </Stack>
        ) : null}
      </Drawer>
    </Stack>
  )
}
