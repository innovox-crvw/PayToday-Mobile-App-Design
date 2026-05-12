import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
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
import { formatMoney } from '../../lib/money'
import { DEPOSIT_BOX_SIZE_PRESETS, formatBoxDimensionsMm } from '../../lib/depositBoxPresets'

type BoxRow = {
  id: string
  locationId: string
  code: string
  capacity: number
  currentLoad: number
  available: number
  widthMm?: number | null
  depthMm?: number | null
  heightMm?: number | null
}

type LocRow = {
  id: string
  name: string
  addressSummary: string | null
  boxes: BoxRow[]
}

type PickupOrderRow = {
  orderId: string
  status: string
  totalCents: number
  currency: string
  createdAt: string
  depositLocationId: string | null
  depositLocationName: string | null
  activePickupCodes: number
}

function tryParseInteriorDimsMm(w: string, d: string, h: string): { widthMm: number; depthMm: number; heightMm: number } | undefined {
  const wt = w.trim()
  const dt = d.trim()
  const ht = h.trim()
  if (!wt && !dt && !ht) return undefined
  if (!wt || !dt || !ht) {
    throw new Error('Enter all three interior sizes in mm (width, depth, height) or leave all empty.')
  }
  const widthMm = Number(wt)
  const depthMm = Number(dt)
  const heightMm = Number(ht)
  if (![widthMm, depthMm, heightMm].every((n) => Number.isInteger(n) && n > 0)) {
    throw new Error('Interior dimensions must be positive whole numbers (mm).')
  }
  return { widthMm, depthMm, heightMm }
}

function presetIdForDims(widthMm: number | null | undefined, depthMm: number | null | undefined, heightMm: number | null | undefined): string {
  if (widthMm == null || depthMm == null || heightMm == null) return ''
  const hit = DEPOSIT_BOX_SIZE_PRESETS.find((p) => p.widthMm === widthMm && p.depthMm === depthMm && p.heightMm === heightMm)
  return hit?.id ?? 'custom'
}

export function AdminDepositPage() {
  const [locations, setLocations] = useState<LocRow[]>([])
  const [pickupOrders, setPickupOrders] = useState<PickupOrderRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const [locOpen, setLocOpen] = useState(false)
  const [locName, setLocName] = useState('')
  const [locAddr, setLocAddr] = useState('')

  const [editLoc, setEditLoc] = useState<LocRow | null>(null)
  const [editLocName, setEditLocName] = useState('')
  const [editLocAddr, setEditLocAddr] = useState('')

  const [boxOpen, setBoxOpen] = useState<string | null>(null)
  const [boxCode, setBoxCode] = useState('')
  const [boxCap, setBoxCap] = useState('20')
  const [boxPresetId, setBoxPresetId] = useState('')
  const [boxW, setBoxW] = useState('')
  const [boxD, setBoxD] = useState('')
  const [boxH, setBoxH] = useState('')

  const [editBox, setEditBox] = useState<BoxRow | null>(null)
  const [editBoxCode, setEditBoxCode] = useState('')
  const [editBoxCap, setEditBoxCap] = useState('')
  const [editBoxPresetId, setEditBoxPresetId] = useState('')
  const [editW, setEditW] = useState('')
  const [editD, setEditD] = useState('')
  const [editH, setEditH] = useState('')

  const [genLocationId, setGenLocationId] = useState('')
  const [genByOrder, setGenByOrder] = useState<Record<string, string>>({})
  const [genResult, setGenResult] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setErr(null)
    try {
      const [ov, pq] = await Promise.all([
        fetch(apiUrl('/api/admin/deposit/overview'), { credentials: 'include' }),
        fetch(apiUrl('/api/admin/deposit/pickup-orders?limit=80'), { credentials: 'include' }),
      ])
      if (ov.status === 401 || ov.status === 403) {
        setErr('Sign in with admin, ops, or fulfillment.')
        return
      }
      if (!ov.ok) throw new Error(await ov.text())
      if (!pq.ok) throw new Error(await pq.text())
      const oj = (await ov.json()) as { locations: LocRow[] }
      const pj = (await pq.json()) as { items: PickupOrderRow[] }
      setLocations(oj.locations ?? [])
      setPickupOrders(pj.items ?? [])
      const first = oj.locations?.[0]?.id ?? ''
      setGenLocationId((prev) => (prev && oj.locations?.some((l) => l.id === prev) ? prev : first))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function saveLocation() {
    setOkMsg(null)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/admin/deposit/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: locName, addressSummary: locAddr.trim() || null }),
      })
      if (!res.ok) throw new Error(await res.text())
      setLocOpen(false)
      setLocName('')
      setLocAddr('')
      setOkMsg('Location created.')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    }
  }

  async function patchLocation() {
    if (!editLoc) return
    setOkMsg(null)
    try {
      await fetchCsrfToken()
      const res = await apiFetch(`/api/admin/deposit/locations/${editLoc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editLocName, addressSummary: editLocAddr.trim() || null }),
      })
      if (!res.ok) throw new Error(await res.text())
      setEditLoc(null)
      setOkMsg('Location updated.')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Update failed')
    }
  }

  async function saveBox(locationId: string) {
    setOkMsg(null)
    try {
      const dims = tryParseInteriorDimsMm(boxW, boxD, boxH)
      const body: Record<string, unknown> = { code: boxCode, capacity: Number(boxCap) }
      if (dims) {
        body.widthMm = dims.widthMm
        body.depthMm = dims.depthMm
        body.heightMm = dims.heightMm
      }
      await fetchCsrfToken()
      const res = await apiFetch(`/api/admin/deposit/locations/${locationId}/boxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      setBoxOpen(null)
      setBoxCode('')
      setBoxCap('20')
      setBoxPresetId('')
      setBoxW('')
      setBoxD('')
      setBoxH('')
      setOkMsg('Deposit box created.')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    }
  }

  async function patchBox() {
    if (!editBox) return
    setOkMsg(null)
    try {
      const dims = tryParseInteriorDimsMm(editW, editD, editH)
      const body: Record<string, unknown> = {
        code: editBoxCode.trim(),
        capacity: Number(editBoxCap),
      }
      if (dims) {
        body.widthMm = dims.widthMm
        body.depthMm = dims.depthMm
        body.heightMm = dims.heightMm
      } else {
        const allEmpty = !editW.trim() && !editD.trim() && !editH.trim()
        const hadStored =
          editBox.widthMm != null && editBox.depthMm != null && editBox.heightMm != null
        if (allEmpty && hadStored) {
          body.widthMm = null
          body.depthMm = null
          body.heightMm = null
        }
      }
      await fetchCsrfToken()
      const res = await apiFetch(`/api/admin/deposit/boxes/${editBox.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      setEditBox(null)
      setOkMsg('Box updated.')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Update failed')
    }
  }

  async function generatePickup(orderId: string) {
    setErr(null)
    setOkMsg(null)
    const loc = genByOrder[orderId] ?? genLocationId
    if (!loc) {
      setErr('Choose a deposit location for this code.')
      return
    }
    try {
      await fetchCsrfToken()
      const res = await apiFetch(`/api/admin/deposit/orders/${encodeURIComponent(orderId)}/pickup-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId: loc }),
      })
      const data = (await res.json()) as { pickupCode?: string; error?: string }
      if (!res.ok) {
        setErr(data.error ?? 'Failed')
        return
      }
      const code = data.pickupCode ?? ''
      setGenResult((m) => ({ ...m, [orderId]: code }))
      setOkMsg('Pickup code generated and notification queued.')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    }
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h5" fontWeight={800}>
        Deposit boxes and pickup
      </Typography>
      <Typography variant="body2" color="text.secondary" maxWidth={900}>
        Add locker locations and physical boxes (each has a label code and capacity). For each paid deposit-box order, pick a
        location with free capacity and generate a six-digit pickup code — the customer receives it by email / in-app when
        notifications are configured. Codes expire per server settings after allocation.
      </Typography>
      {err && (
        <Alert severity="warning" onClose={() => setErr(null)}>
          {err}
        </Alert>
      )}
      {okMsg && (
        <Alert severity="success" onClose={() => setOkMsg(null)}>
          {okMsg}
        </Alert>
      )}

      <Stack direction="row" gap={1} flexWrap="wrap">
        <Button variant="outlined" onClick={() => void load()}>
          Refresh
        </Button>
        <Button variant="contained" onClick={() => setLocOpen(true)}>
          Add location
        </Button>
      </Stack>

      <Dialog open={locOpen} onClose={() => setLocOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>New deposit location</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Name" value={locName} onChange={(e) => setLocName(e.target.value)} fullWidth required />
            <TextField
              label="Address / directions"
              value={locAddr}
              onChange={(e) => setLocAddr(e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLocOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void saveLocation()} disabled={!locName.trim()}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!editLoc} onClose={() => setEditLoc(null)} fullWidth maxWidth="sm">
        <DialogTitle>Edit location</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Name" value={editLocName} onChange={(e) => setEditLocName(e.target.value)} fullWidth />
            <TextField
              label="Address / directions"
              value={editLocAddr}
              onChange={(e) => setEditLocAddr(e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditLoc(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => void patchLocation()}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!boxOpen} onClose={() => setBoxOpen(null)} fullWidth maxWidth="sm">
        <DialogTitle>New box at location</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              select
              label="Locker size preset"
              value={boxPresetId}
              onChange={(e) => {
                const v = e.target.value
                setBoxPresetId(v)
                const p = DEPOSIT_BOX_SIZE_PRESETS.find((x) => x.id === v)
                if (p) {
                  setBoxCap(String(p.suggestedCapacity))
                  setBoxW(String(p.widthMm))
                  setBoxD(String(p.depthMm))
                  setBoxH(String(p.heightMm))
                }
                if (v === '') {
                  setBoxW('')
                  setBoxD('')
                  setBoxH('')
                }
              }}
              fullWidth
              helperText="Pick a preset to fill interior mm and suggested capacity, or choose Custom / None."
            >
              <MenuItem value="">None (capacity only)</MenuItem>
              <MenuItem value="custom">Custom (manual mm)</MenuItem>
              {DEPOSIT_BOX_SIZE_PRESETS.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.label} — {p.widthMm}×{p.depthMm}×{p.heightMm} mm, ~{p.suggestedCapacity} slots
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Box code (label on locker)" value={boxCode} onChange={(e) => setBoxCode(e.target.value)} fullWidth />
            <TextField label="Capacity (slots)" value={boxCap} onChange={(e) => setBoxCap(e.target.value)} type="number" />
            <Typography variant="caption" color="text.secondary" fontWeight={700}>
              Interior W × D × H (mm)
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField label="Width" value={boxW} onChange={(e) => setBoxW(e.target.value)} type="number" fullWidth size="small" />
              <TextField label="Depth" value={boxD} onChange={(e) => setBoxD(e.target.value)} type="number" fullWidth size="small" />
              <TextField label="Height" value={boxH} onChange={(e) => setBoxH(e.target.value)} type="number" fullWidth size="small" />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBoxOpen(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => boxOpen && void saveBox(boxOpen)} disabled={!boxCode.trim()}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!editBox} onClose={() => setEditBox(null)} fullWidth maxWidth="sm">
        <DialogTitle>Edit box</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              select
              label="Locker size preset"
              value={editBoxPresetId}
              onChange={(e) => {
                const v = e.target.value
                setEditBoxPresetId(v)
                const p = DEPOSIT_BOX_SIZE_PRESETS.find((x) => x.id === v)
                if (p) {
                  setEditBoxCap(String(p.suggestedCapacity))
                  setEditW(String(p.widthMm))
                  setEditD(String(p.depthMm))
                  setEditH(String(p.heightMm))
                }
                if (v === '') {
                  setEditW('')
                  setEditD('')
                  setEditH('')
                }
              }}
              fullWidth
              helperText="Presets refill mm and suggested capacity. Clear all three mm fields and save to remove stored size."
            >
              <MenuItem value="">None (clear mm on save if box had a size)</MenuItem>
              <MenuItem value="custom">Custom (manual mm)</MenuItem>
              {DEPOSIT_BOX_SIZE_PRESETS.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.label} — {p.widthMm}×{p.depthMm}×{p.heightMm} mm, ~{p.suggestedCapacity} slots
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Box code" value={editBoxCode} onChange={(e) => setEditBoxCode(e.target.value)} fullWidth />
            <TextField label="Capacity" value={editBoxCap} onChange={(e) => setEditBoxCap(e.target.value)} type="number" />
            <Typography variant="caption" color="text.secondary" fontWeight={700}>
              Interior W × D × H (mm)
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField label="Width" value={editW} onChange={(e) => setEditW(e.target.value)} type="number" fullWidth size="small" />
              <TextField label="Depth" value={editD} onChange={(e) => setEditD(e.target.value)} type="number" fullWidth size="small" />
              <TextField label="Height" value={editH} onChange={(e) => setEditH(e.target.value)} type="number" fullWidth size="small" />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditBox(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => void patchBox()}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Typography variant="subtitle1" fontWeight={700}>
        Locations and boxes
      </Typography>
      {locations.length === 0 && <Typography color="text.secondary">No locations yet. Add one to get started.</Typography>}
      <Stack spacing={2}>
        {locations.map((loc) => (
          <Paper key={loc.id} variant="outlined" sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ sm: 'center' }}>
              <Box>
                <Typography fontWeight={700}>{loc.name}</Typography>
                {loc.addressSummary && (
                  <Typography variant="body2" color="text.secondary">
                    {loc.addressSummary}
                  </Typography>
                )}
              </Box>
              <Stack direction="row" gap={1} flexWrap="wrap">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    setEditLoc(loc)
                    setEditLocName(loc.name)
                    setEditLocAddr(loc.addressSummary ?? '')
                  }}
                >
                  Edit location
                </Button>
                <Button size="small" variant="contained" onClick={() => {
                  setBoxCode('')
                  setBoxCap('20')
                  setBoxPresetId('')
                  setBoxW('')
                  setBoxD('')
                  setBoxH('')
                  setBoxOpen(loc.id)
                }}>
                  Add box
                </Button>
              </Stack>
            </Stack>
            <TableContainer sx={{ mt: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Box code</TableCell>
                    <TableCell>Dimensions (W×D×H)</TableCell>
                    <TableCell align="right">Load</TableCell>
                    <TableCell align="right">Capacity</TableCell>
                    <TableCell align="right">Free</TableCell>
                    <TableCell width={100} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loc.boxes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <Typography variant="body2" color="text.secondary">
                          No boxes — add at least one to allocate pickup codes here.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {loc.boxes.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.code}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatBoxDimensionsMm(b.widthMm ?? null, b.depthMm ?? null, b.heightMm ?? null)}</TableCell>
                      <TableCell align="right">{b.currentLoad}</TableCell>
                      <TableCell align="right">{b.capacity}</TableCell>
                      <TableCell align="right">{b.available}</TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          onClick={() => {
                            setEditBox(b)
                            setEditBoxCode(b.code)
                            setEditBoxCap(String(b.capacity))
                            setEditW(b.widthMm != null ? String(b.widthMm) : '')
                            setEditD(b.depthMm != null ? String(b.depthMm) : '')
                            setEditH(b.heightMm != null ? String(b.heightMm) : '')
                            setEditBoxPresetId(presetIdForDims(b.widthMm, b.depthMm, b.heightMm))
                          }}
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        ))}
      </Stack>

      <Typography variant="subtitle1" fontWeight={700}>
        Generate pickup codes
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Default locker location for new codes (each row can override). Only <strong>paid</strong> or <strong>processing</strong>{' '}
        deposit-box orders are listed. An order may only have one active unused code at a time.
      </Typography>
      <TextField
        select
        label="Default location for codes"
        size="small"
        sx={{ maxWidth: 360 }}
        value={genLocationId}
        onChange={(e) => setGenLocationId(e.target.value)}
      >
        {locations.map((l) => (
          <MenuItem key={l.id} value={l.id}>
            {l.name}
          </MenuItem>
        ))}
      </TextField>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Order</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Total</TableCell>
              <TableCell>Ordered locker</TableCell>
              <TableCell>Active codes</TableCell>
              <TableCell>Allocate at</TableCell>
              <TableCell width={200} />
            </TableRow>
          </TableHead>
          <TableBody>
            {pickupOrders.map((o) => (
              <TableRow key={o.orderId}>
                <TableCell>
                  <Button component={RouterLink} to={`/orders/${o.orderId}`} size="small" sx={{ textTransform: 'none' }}>
                    {o.orderId.slice(0, 8)}…
                  </Button>
                </TableCell>
                <TableCell>{o.status}</TableCell>
                <TableCell>{formatMoney(o.totalCents, o.currency)}</TableCell>
                <TableCell>{o.depositLocationName ?? o.depositLocationId?.slice(0, 8) ?? '—'}</TableCell>
                <TableCell>{o.activePickupCodes}</TableCell>
                <TableCell sx={{ minWidth: 200 }}>
                  <TextField
                    select
                    size="small"
                    fullWidth
                    label="Location"
                    value={genByOrder[o.orderId] ?? genLocationId}
                    onChange={(e) => setGenByOrder((m) => ({ ...m, [o.orderId]: e.target.value }))}
                  >
                    {locations.map((l) => (
                      <MenuItem key={l.id} value={l.id}>
                        {l.name}
                      </MenuItem>
                    ))}
                  </TextField>
                </TableCell>
                <TableCell>
                  <Stack spacing={0.5}>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => void generatePickup(o.orderId)}
                    >
                      Generate code
                    </Button>
                    {genResult[o.orderId] && (
                      <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                        Code: {genResult[o.orderId]}
                      </Typography>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {pickupOrders.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No qualifying deposit-box orders right now.
        </Typography>
      )}
    </Stack>
  )
}
