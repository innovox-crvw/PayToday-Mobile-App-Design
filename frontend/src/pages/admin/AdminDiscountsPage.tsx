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
  MenuItem,
} from '@mui/material'
import { apiFetch, fetchCsrfToken, readResponseJson } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'

type DiscountRow = {
  id: string
  code: string
  description: string | null
  discount_type: 'flat' | 'pct'
  discount_value: number
  min_order_cents: number
  max_discount_cents: number | null
  max_uses: number | null
  uses_count: number
  is_active: boolean
  starts_at: string | null
  ends_at: string | null
}

const EMPTY: Omit<DiscountRow, 'id' | 'uses_count'> = {
  code: '',
  description: '',
  discount_type: 'flat',
  discount_value: 0,
  min_order_cents: 0,
  max_discount_cents: null,
  max_uses: null,
  is_active: true,
  starts_at: null,
  ends_at: null,
}

function normalizeDiscountRow(raw: Record<string, unknown>): DiscountRow {
  const dt = String(raw.discount_type ?? 'flat').toLowerCase()
  const discount_type: 'flat' | 'pct' = dt === 'pct' || dt === 'percent' ? 'pct' : 'flat'
  return {
    id: String(raw.id ?? ''),
    code: String(raw.code ?? ''),
    description: raw.description == null ? null : String(raw.description),
    discount_type,
    discount_value: Number(raw.discount_value ?? 0),
    min_order_cents: Number(raw.min_order_cents ?? 0),
    max_discount_cents: raw.max_discount_cents == null ? null : Number(raw.max_discount_cents),
    max_uses: raw.max_uses == null ? null : Number(raw.max_uses),
    uses_count: Number(raw.uses_count ?? 0),
    is_active: Boolean(raw.is_active),
    starts_at: raw.starts_at == null ? null : String(raw.starts_at),
    ends_at: raw.ends_at == null ? null : String(raw.ends_at),
  }
}

export function AdminDiscountsPage() {
  const [items, setItems] = useState<DiscountRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<DiscountRow | null>(null)
  const [form, setForm] = useState<typeof EMPTY>({ ...EMPTY })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setErr(null)
    try {
      const res = await fetch(apiUrl('/api/admin/discounts'), { credentials: 'include' })
      const data = await readResponseJson<{ items?: unknown[]; error?: string }>(res)
      if (!res.ok) throw new Error(typeof data.error === 'string' && data.error.trim() ? data.error : `HTTP ${res.status}`)
      const rawItems = Array.isArray(data.items) ? data.items : []
      setItems(rawItems.map((row) => normalizeDiscountRow(row as Record<string, unknown>)))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    }
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load()
    }, 0)
    return () => clearTimeout(id)
  }, [load])

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY })
    setOk(null)
    setOpen(true)
  }

  function openEdit(r: DiscountRow) {
    setEditing(r)
    setForm({
      code: r.code,
      description: r.description ?? '',
      discount_type: r.discount_type,
      discount_value: r.discount_value,
      min_order_cents: r.min_order_cents,
      max_discount_cents: r.max_discount_cents,
      max_uses: r.max_uses,
      is_active: r.is_active,
      starts_at: r.starts_at,
      ends_at: r.ends_at,
    })
    setOk(null)
    setOpen(true)
  }

  async function save() {
    setBusy(true)
    setErr(null)
    try {
      await fetchCsrfToken()
      if (editing) {
        await apiFetch(`/api/admin/discounts/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        setOk('Updated.')
      } else {
        await apiFetch('/api/admin/discounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        setOk('Created.')
      }
      setOpen(false)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function deleteRow(id: string) {
    if (!confirm('Delete this discount code?')) return
    try {
      await fetchCsrfToken()
      await apiFetch(`/api/admin/discounts/${id}`, { method: 'DELETE' })
      setOk('Deleted.')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    }
  }

  function fmtCents(n: number | null) {
    if (n == null) return '—'
    return `N$ ${(n / 100).toFixed(2)}`
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={800}>
          Discount codes
        </Typography>
        <Button variant="contained" onClick={openCreate}>
          + New code
        </Button>
      </Stack>
      {err && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      )}
      {ok && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {ok}
        </Alert>
      )}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Code</TableCell>
            <TableCell>Type</TableCell>
            <TableCell>Value</TableCell>
            <TableCell>Min order</TableCell>
            <TableCell>Uses</TableCell>
            <TableCell>Active</TableCell>
            <TableCell>Expires</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <strong>{r.code}</strong>
              </TableCell>
              <TableCell>{r.discount_type === 'pct' ? 'Percent' : 'Flat'}</TableCell>
              <TableCell>
                {r.discount_type === 'pct' ? `${(r.discount_value / 100).toFixed(1)}%` : fmtCents(r.discount_value)}
              </TableCell>
              <TableCell>{fmtCents(r.min_order_cents)}</TableCell>
              <TableCell>
                {r.uses_count}
                {r.max_uses != null ? ` / ${r.max_uses}` : ''}
              </TableCell>
              <TableCell>
                <Chip label={r.is_active ? 'Active' : 'Inactive'} size="small" color={r.is_active ? 'success' : 'default'} />
              </TableCell>
              <TableCell>{r.ends_at ? new Date(r.ends_at).toLocaleDateString() : '—'}</TableCell>
              <TableCell>
                <Stack direction="row" spacing={0.5}>
                  <Button size="small" onClick={() => openEdit(r)}>
                    Edit
                  </Button>
                  <Button size="small" color="error" onClick={() => void deleteRow(r.id)}>
                    Del
                  </Button>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} align="center">
                No discount codes yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit discount code' : 'New discount code'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {!editing && (
              <TextField
                label="Code"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                required
              />
            )}
            <TextField
              label="Description"
              value={form.description ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              helperText="Optional — not stored on all database versions."
            />
            <TextField
              select
              label="Type"
              value={form.discount_type}
              onChange={(e) => setForm((f) => ({ ...f, discount_type: e.target.value as 'flat' | 'pct' }))}
            >
              <MenuItem value="flat">Flat (cents)</MenuItem>
              <MenuItem value="pct">Percent (basis points, e.g. 1000 = 10%)</MenuItem>
            </TextField>
            <TextField
              label="Value"
              type="number"
              value={form.discount_value}
              onChange={(e) => setForm((f) => ({ ...f, discount_value: Number(e.target.value) }))}
              helperText="Flat: cents (e.g. 500 = N$5). Pct: bps (e.g. 1000 = 10%)."
            />
            <TextField
              label="Min order (cents)"
              type="number"
              value={form.min_order_cents}
              onChange={(e) => setForm((f) => ({ ...f, min_order_cents: Number(e.target.value) }))}
            />
            <TextField
              label="Max discount (cents, optional)"
              type="number"
              value={form.max_discount_cents ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, max_discount_cents: e.target.value ? Number(e.target.value) : null }))}
              helperText="Optional — ignored if the database has no max-discount column."
            />
            <TextField
              label="Max uses (optional)"
              type="number"
              value={form.max_uses ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, max_uses: e.target.value ? Number(e.target.value) : null }))}
            />
            <TextField
              select
              label="Active"
              value={form.is_active ? '1' : '0'}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === '1' }))}
            >
              <MenuItem value="1">Yes</MenuItem>
              <MenuItem value="0">No</MenuItem>
            </TextField>
            <TextField
              label="Starts at (ISO)"
              value={form.starts_at ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value || null }))}
            />
            <TextField
              label="Ends at (ISO)"
              value={form.ends_at ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value || null }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void save()} disabled={busy}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
