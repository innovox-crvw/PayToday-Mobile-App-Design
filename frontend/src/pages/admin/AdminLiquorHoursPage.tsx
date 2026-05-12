import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { apiFetch, fetchCsrfToken, readResponseJson } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'

/** Matches DB: ISO weekday 1 = Monday … 7 = Sunday. */
const ISO_DAY_META = [
  { iso: 1, label: 'Monday' },
  { iso: 2, label: 'Tuesday' },
  { iso: 3, label: 'Wednesday' },
  { iso: 4, label: 'Thursday' },
  { iso: 5, label: 'Friday' },
  { iso: 6, label: 'Saturday' },
  { iso: 7, label: 'Sunday' },
] as const

type HoursRow = {
  day_of_week: number
  start_minute: number
  end_minute: number
  is_active: boolean
}

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60)
    .toString()
    .padStart(2, '0')
  const min = (m % 60).toString().padStart(2, '0')
  return `${h}:${min}`
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

const DEFAULT_ROWS: HoursRow[] = ISO_DAY_META.map((d) => ({
  day_of_week: d.iso,
  start_minute: d.iso <= 5 ? 9 * 60 : 10 * 60,
  end_minute: 20 * 60,
  is_active: d.iso < 7,
}))

export function AdminLiquorHoursPage() {
  const [merchantId, setMerchantId] = useState('991001')
  const [rows, setRows] = useState<HoursRow[]>(DEFAULT_ROWS)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!merchantId.trim()) return
    setErr(null)
    setOk(null)
    try {
      const res = await fetch(apiUrl(`/api/admin/merchants/${merchantId.trim()}/liquor-hours`), { credentials: 'include' })
      const data = await readResponseJson<{ items?: HoursRow[]; error?: string }>(res)
      if (!res.ok) throw new Error(data.error ?? (await res.text()))
      if (data.items?.length) {
        const filled = DEFAULT_ROWS.map((d) => {
          const found = data.items!.find((r) => r.day_of_week === d.day_of_week)
          return found ?? d
        })
        setRows(filled)
      } else {
        setRows(DEFAULT_ROWS)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    }
  }, [merchantId])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    setBusy(true)
    setErr(null)
    setOk(null)
    try {
      await fetchCsrfToken()
      const res = await apiFetch(`/api/admin/merchants/${merchantId.trim()}/liquor-hours`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: rows.map((r) => ({
            dayOfWeek: r.day_of_week,
            startMinute: r.start_minute,
            endMinute: r.end_minute,
            isActive: r.is_active,
          })),
        }),
      })
      const data = await readResponseJson<{ ok?: boolean; error?: string }>(res)
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setOk('Saved.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  function updateRow(idx: number, patch: Partial<HoursRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={800} sx={{ mb: 3 }}>
        Liquor selling hours
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Times use the store&apos;s local day (Africa/Windhoek at checkout). Days follow ISO: 1 = Monday through 7 = Sunday.
      </Typography>
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

      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
        <TextField
          label="Merchant ID"
          value={merchantId}
          onChange={(e) => setMerchantId(e.target.value)}
          size="small"
          sx={{ width: 160 }}
        />
        <Button variant="outlined" onClick={() => void load()}>
          Load
        </Button>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Day</TableCell>
              <TableCell>Open from</TableCell>
              <TableCell>Until</TableCell>
              <TableCell>Active</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.day_of_week}>
                <TableCell>
                  <strong>{ISO_DAY_META.find((d) => d.iso === r.day_of_week)?.label ?? `Day ${r.day_of_week}`}</strong>
                </TableCell>
                <TableCell>
                  <TextField
                    type="time"
                    size="small"
                    value={minutesToTime(r.start_minute)}
                    onChange={(e) => updateRow(i, { start_minute: timeToMinutes(e.target.value) })}
                    disabled={!r.is_active}
                    sx={{ width: 120 }}
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    type="time"
                    size="small"
                    value={minutesToTime(r.end_minute)}
                    onChange={(e) => updateRow(i, { end_minute: timeToMinutes(e.target.value) })}
                    disabled={!r.is_active}
                    sx={{ width: 120 }}
                  />
                </TableCell>
                <TableCell>
                  <FormControlLabel
                    control={<Checkbox checked={r.is_active} onChange={(e) => updateRow(i, { is_active: e.target.checked })} />}
                    label="Active"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
          <Button variant="contained" onClick={() => void save()} disabled={busy}>
            Save all days
          </Button>
        </Stack>
      </Paper>
    </Box>
  )
}
