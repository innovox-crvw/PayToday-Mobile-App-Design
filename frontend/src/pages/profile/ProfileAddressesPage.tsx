import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined'
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined'
import { WalletSubheader } from '../wallet/WalletSubheader'
import { useStorePathPrefix } from './profilePaths'
import { useAuthMe, SESSION_CHANGED_EVENT } from '../../hooks/useAuthMe'
import { apiFetch, fetchCsrfToken } from '../../api/client'

type AddressRow = {
  id: string
  label: string | null
  line1: string
  line2: string | null
  city: string
  region: string | null
  postal_code: string | null
  country: string
  is_default: boolean
}

const emptyForm = {
  label: '',
  line1: '',
  line2: '',
  city: '',
  region: '',
  postalCode: '',
  country: 'NA',
  isDefault: false,
}

export function ProfileAddressesPage() {
  const prefix = useStorePathPrefix()
  const accountPath = prefix ? `${prefix}/account` : '/account'

  const { user, loading } = useAuthMe()
  const [items, setItems] = useState<AddressRow[]>([])
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; severity: 'success' | 'error' } | null>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const res = await apiFetch('/api/addresses')
      if (res.status === 401) {
        setItems([])
        setLoadErr('Sign in to manage addresses.')
        return
      }
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as { items: AddressRow[] }
      setItems(data.items ?? [])
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : 'Failed to load')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function openNew() {
    setEditingId(null)
    setForm(emptyForm)
    setDialogOpen(true)
    setMsg(null)
  }

  function openEdit(row: AddressRow) {
    setEditingId(row.id)
    setForm({
      label: row.label ?? '',
      line1: row.line1,
      line2: row.line2 ?? '',
      city: row.city,
      region: row.region ?? '',
      postalCode: row.postal_code ?? '',
      country: row.country || 'NA',
      isDefault: row.is_default,
    })
    setDialogOpen(true)
    setMsg(null)
  }

  async function saveDialog() {
    setSaving(true)
    setMsg(null)
    try {
      await fetchCsrfToken()
      const body = {
        label: form.label.trim() || null,
        line1: form.line1.trim(),
        line2: form.line2.trim() || null,
        city: form.city.trim(),
        region: form.region.trim() || null,
        postalCode: form.postalCode.trim() || null,
        country: form.country.trim() || 'NA',
        isDefault: form.isDefault,
      }
      if (!body.line1 || !body.city) {
        setMsg({ text: 'Line 1 and city are required.', severity: 'error' })
        return
      }
      const url = editingId ? `/api/addresses/${editingId}` : '/api/addresses'
      const res = await apiFetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { error?: string; ok?: boolean }
      if (!res.ok) {
        setMsg({ text: data.error ?? 'Save failed', severity: 'error' })
        return
      }
      setDialogOpen(false)
      await load()
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Save failed', severity: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function setDefault(id: string) {
    setMsg(null)
    try {
      await fetchCsrfToken()
      const res = await apiFetch(`/api/addresses/${id}/default`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setMsg({ text: data.error ?? 'Could not update default', severity: 'error' })
        return
      }
      await load()
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Failed', severity: 'error' })
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Remove this address?')) return
    setMsg(null)
    try {
      await fetchCsrfToken()
      const res = await apiFetch(`/api/addresses/${id}`, { method: 'DELETE' })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setMsg({ text: data.error ?? 'Could not delete', severity: 'error' })
        return
      }
      await load()
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Failed', severity: 'error' })
    }
  }

  if (loading) {
    return (
      <Stack alignItems="center" py={6}>
        <CircularProgress size={36} />
      </Stack>
    )
  }

  if (!user) {
    return (
      <Stack spacing={2.5} sx={{ maxWidth: 560, mx: 'auto', pb: 4 }}>
        <WalletSubheader title="Address book" />
        <Card variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider' }}>
          <CardContent sx={{ py: 4, textAlign: 'center' }}>
            <Box sx={{ color: 'text.secondary', mb: 2 }}>
              <PersonOffOutlinedIcon sx={{ fontSize: 56 }} />
            </Box>
            <Typography variant="h6" fontWeight={800} gutterBottom>
              Sign in required
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, lineHeight: 1.6 }}>
              Save delivery addresses for checkout. Sign in to manage your address book.
            </Typography>
            <Button component={RouterLink} to={accountPath} variant="contained" size="large" sx={{ fontWeight: 700 }}>
              Go to Account
            </Button>
          </CardContent>
        </Card>
      </Stack>
    )
  }

  return (
    <Stack spacing={2.5} sx={{ maxWidth: 560, mx: 'auto', pb: 4 }}>
      <WalletSubheader title="Address book" />
      <Typography variant="body2" color="text.secondary">
        Add, edit, or remove saved addresses. The default address is pre-selected at checkout when you choose home delivery.
      </Typography>

      {msg ? (
        <Alert severity={msg.severity} onClose={() => setMsg(null)}>
          {msg.text}
        </Alert>
      ) : null}
      {loadErr ? <Alert severity="warning">{loadErr}</Alert> : null}

      <Button variant="contained" onClick={openNew} sx={{ alignSelf: 'flex-start', fontWeight: 700 }}>
        Add address
      </Button>

      {items.length === 0 && !loadErr ? (
        <Typography color="text.secondary">No saved addresses yet.</Typography>
      ) : null}

      {items.map((a) => (
        <Card key={a.id} variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent>
            <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <LocationOnOutlinedIcon color="primary" sx={{ mt: 0.25 }} />
                <Box>
                  {a.label ? (
                    <Typography fontWeight={700}>
                      {a.label}
                      {a.is_default ? ' · Default' : ''}
                    </Typography>
                  ) : (
                    <Typography fontWeight={700}>{a.is_default ? 'Default address' : 'Address'}</Typography>
                  )}
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                    {a.line1}
                    {a.line2 ? `\n${a.line2}` : ''}
                    {`\n${a.city}${a.region ? `, ${a.region}` : ''} ${a.postal_code ?? ''}`.trim()}
                    {`\n${a.country}`}
                  </Typography>
                </Box>
              </Box>
              <Stack spacing={0.5} alignItems="flex-end">
                {!a.is_default ? (
                  <Button size="small" onClick={() => void setDefault(a.id)}>
                    Set default
                  </Button>
                ) : null}
                <Button size="small" onClick={() => openEdit(a)}>
                  Edit
                </Button>
                <Button size="small" color="warning" onClick={() => void remove(a.id)}>
                  Delete
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ))}

      <Dialog open={dialogOpen} onClose={() => !saving && setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editingId ? 'Edit address' : 'New address'}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            {msg && dialogOpen ? (
              <Alert severity={msg.severity} onClose={() => setMsg(null)}>
                {msg.text}
              </Alert>
            ) : null}
            <TextField label="Label (optional)" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} fullWidth />
            <TextField label="Line 1" required value={form.line1} onChange={(e) => setForm((f) => ({ ...f, line1: e.target.value }))} fullWidth />
            <TextField label="Line 2" value={form.line2} onChange={(e) => setForm((f) => ({ ...f, line2: e.target.value }))} fullWidth />
            <TextField label="City" required value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} fullWidth />
            <TextField label="Region / state" value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} fullWidth />
            <TextField label="Postal code" value={form.postalCode} onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))} fullWidth />
            <TextField label="Country" value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} fullWidth />
            <Typography variant="caption" color="text.secondary">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
                />
                Use as default delivery address
              </label>
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void saveDialog()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
