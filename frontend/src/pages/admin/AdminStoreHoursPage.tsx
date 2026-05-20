import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
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
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { apiFetch, fetchCsrfToken, readResponseJson } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { summariesTouchLiquorCategory } from '../../lib/liquorCategorySlugs'

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

type HoursKind = 'store' | 'liquor'

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

function fillRowsFromApi(items: HoursRow[] | undefined): HoursRow[] {
  if (!items?.length) return DEFAULT_ROWS.map((d) => ({ ...d }))
  return DEFAULT_ROWS.map((d) => {
    const found = items.find((r) => r.day_of_week === d.day_of_week)
    return found ?? d
  })
}

export function AdminStoreHoursPage() {
  const [searchParams] = useSearchParams()
  const merchantFromUrl = searchParams.get('merchant')?.trim() ?? ''
  const [merchantId, setMerchantId] = useState(merchantFromUrl || '991001')
  const [hoursKind, setHoursKind] = useState<HoursKind>('store')
  const [hasLiquorCategory, setHasLiquorCategory] = useState(false)
  const [rows, setRows] = useState<HoursRow[]>(DEFAULT_ROWS)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)

  const hoursPath = hoursKind === 'liquor' ? 'liquor-hours' : 'store-hours'

  const loadMerchantLiquorFlag = useCallback(async (mid: string) => {
    let fromCatalog = false
    let fromLiquorHours = false
    try {
      const [storeRes, liquorRes] = await Promise.all([
        fetch(apiUrl(`/api/admin/stores/${mid}`), { credentials: 'include' }),
        fetch(apiUrl(`/api/admin/merchants/${mid}/liquor-hours`), { credentials: 'include' }),
      ])
      if (storeRes.ok) {
        const data = await readResponseJson<{
          categorySummary?: string | null
          products?: { categorySlug: string | null }[]
        }>(storeRes)
        fromCatalog = summariesTouchLiquorCategory(
          data.categorySummary ?? null,
          (data.products ?? []).map((p) => p.categorySlug),
        )
      }
      if (liquorRes.ok) {
        const lh = await readResponseJson<{
          items?: HoursRow[]
          wide?: Record<string, unknown> & { is_active?: boolean }
        }>(liquorRes)
        const w = lh.wide
        const wideHasDay =
          w &&
          ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].some(
            (d) => typeof w[d] === 'string' && String(w[d]).trim(),
          )
        fromLiquorHours = (lh.items?.length ?? 0) > 0 || Boolean(w?.is_active && wideHasDay)
      }
      const touches = fromCatalog || fromLiquorHours
      setHasLiquorCategory(touches)
      if (!touches) {
        setHoursKind((k) => (k === 'liquor' ? 'store' : k))
      }
    } catch {
      setHasLiquorCategory(false)
    }
  }, [])

  const load = useCallback(async () => {
    const mid = merchantId.trim()
    if (!mid) return
    setErr(null)
    setOk(null)
    setLoading(true)
    try {
      await loadMerchantLiquorFlag(mid)
      const res = await fetch(apiUrl(`/api/admin/merchants/${mid}/${hoursPath}`), { credentials: 'include' })
      const data = await readResponseJson<{ items?: HoursRow[]; error?: string }>(res)
      if (!res.ok) throw new Error(data.error ?? (await res.text()))
      setRows(fillRowsFromApi(data.items))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }, [merchantId, hoursPath, loadMerchantLiquorFlag])

  useEffect(() => {
    if (merchantFromUrl) setMerchantId(merchantFromUrl)
  }, [merchantFromUrl])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    const mid = merchantId.trim()
    setBusy(true)
    setErr(null)
    setOk(null)
    try {
      await fetchCsrfToken()
      const res = await apiFetch(`/api/admin/merchants/${mid}/${hoursPath}`, {
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
      setOk(hoursKind === 'liquor' ? 'Liquor selling times saved.' : 'Store opening times saved.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  function updateRow(idx: number, patch: Partial<HoursRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const isLiquor = hoursKind === 'liquor'

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={800} sx={{ mb: 3 }}>
        Store hours
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {isLiquor
          ? 'Permitted alcohol sale windows (Africa/Windhoek). Checkout with alcohol in the cart must fall inside these times.'
          : 'Store opening hours (Africa/Windhoek). When the store is closed, customers can schedule pickup or delivery inside these hours.'}{' '}
        ISO weekdays: 1 = Monday through 7 = Sunday.{' '}
        <RouterLink to="/admin/stores">Manage pickup stores</RouterLink>.
      </Typography>
      {err ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      ) : null}
      {ok ? (
        <Alert severity="success" sx={{ mb: 2 }}>
          {ok}
        </Alert>
      ) : null}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} sx={{ mb: 3 }} flexWrap="wrap">
        <TextField
          label="Merchant ID"
          value={merchantId}
          onChange={(e) => setMerchantId(e.target.value)}
          size="small"
          sx={{ width: 160 }}
        />
        <Button variant="outlined" onClick={() => void load()} disabled={loading}>
          Load
        </Button>
        {hasLiquorCategory ? (
          <ToggleButtonGroup
            exclusive
            size="small"
            value={hoursKind}
            onChange={(_e, v: HoursKind | null) => {
              if (v) setHoursKind(v)
            }}
            aria-label="Hours schedule type"
          >
            <ToggleButton value="store">Store times</ToggleButton>
            <ToggleButton value="liquor">Liquor times</ToggleButton>
          </ToggleButtonGroup>
        ) : null}
      </Stack>

      {hasLiquorCategory ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          This merchant sells products in a liquor category. Use the switch above to edit store opening times and alcohol
          selling times separately.
        </Alert>
      ) : null}

      <Paper variant="outlined" sx={{ p: 2, opacity: loading ? 0.6 : 1 }}>
        <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1.5 }}>
          {isLiquor ? 'Liquor selling times' : 'Store opening times'}
        </Typography>
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
                    label="Open"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
          <Button variant="contained" onClick={() => void save()} disabled={busy || loading}>
            {isLiquor ? 'Save liquor times' : 'Save store times'}
          </Button>
        </Stack>
      </Paper>
    </Box>
  )
}
