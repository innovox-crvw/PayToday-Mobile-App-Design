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

type BoxRow = {
  id: string
  locationId: string
  code: string
  capacity: number
  currentLoad: number
  available: number
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

  const [editBox, setEditBox] = useState<BoxRow | null>(null)
  const [editBoxCode, setEditBoxCode] = useState('')
  const [editBoxCap, setEditBoxCap] = useState('')

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
      await fetchCsrfToken()
      const res = await apiFetch(`/api/admin/deposit/locations/${locationId}/boxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: boxCode, capacity: Number(boxCap) }),
      })
      if (!res.ok) throw new Error(await res.text())
      setBoxOpen(null)
      setBoxCode('')
      setBoxCap('20')
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
      await fetchCsrfToken()
      const res = await apiFetch(`/api/admin/deposit/boxes/${editBox.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: editBoxCode.trim(),
          capacity: Number(editBoxCap),
        }),
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

      <Dialog open={!!boxOpen} onClose={() => setBoxOpen(null)} fullWidth maxWidth="xs">
        <DialogTitle>New box at location</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Box code (label on locker)" value={boxCode} onChange={(e) => setBoxCode(e.target.value)} fullWidth />
            <TextField label="Capacity (slots)" value={boxCap} onChange={(e) => setBoxCap(e.target.value)} type="number" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBoxOpen(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => boxOpen && void saveBox(boxOpen)} disabled={!boxCode.trim()}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!editBox} onClose={() => setEditBox(null)} fullWidth maxWidth="xs">
        <DialogTitle>Edit box</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Box code" value={editBoxCode} onChange={(e) => setEditBoxCode(e.target.value)} fullWidth />
            <TextField label="Capacity" value={editBoxCap} onChange={(e) => setEditBoxCap(e.target.value)} type="number" />
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
                <Button size="small" variant="contained" onClick={() => setBoxOpen(loc.id)}>
                  Add box
                </Button>
              </Stack>
            </Stack>
            <TableContainer sx={{ mt: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Box code</TableCell>
                    <TableCell align="right">Load</TableCell>
                    <TableCell align="right">Capacity</TableCell>
                    <TableCell align="right">Free</TableCell>
                    <TableCell width={100} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loc.boxes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <Typography variant="body2" color="text.secondary">
                          No boxes — add at least one to allocate pickup codes here.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {loc.boxes.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.code}</TableCell>
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
