import {
  Box,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import type { SellingHoursRow } from '../../lib/windhoekTime'

const ISO_DAYS = [
  { iso: 1, label: 'Monday' },
  { iso: 2, label: 'Tuesday' },
  { iso: 3, label: 'Wednesday' },
  { iso: 4, label: 'Thursday' },
  { iso: 5, label: 'Friday' },
  { iso: 6, label: 'Saturday' },
  { iso: 7, label: 'Sunday' },
] as const

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function minutesToHm(m: number): string {
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`
}

type Props = {
  title: string
  rows: SellingHoursRow[]
  /** Shown under the title (e.g. Africa/Windhoek). */
  timezoneNote?: string
  openNow?: boolean
}

export function SellingTimesPanel(props: Props) {
  const { title, rows, timezoneNote = 'All times are Africa/Windhoek (Namibia).', openNow } = props
  const active = rows.filter((r) => r.is_active)

  if (!active.length) {
    return (
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, px: 2, py: 1.5 }}>
        <Typography variant="subtitle2" fontWeight={800}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          No selling hours configured for this store.
        </Typography>
      </Box>
    )
  }

  const byDay = new Map(active.map((r) => [r.day_of_week, r]))

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ px: 2, py: 1.25, bgcolor: (t) => t.palette.action.hover }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
          <Typography variant="subtitle2" fontWeight={800}>
            {title}
          </Typography>
          {openNow !== undefined ? (
            <Chip
              size="small"
              label={openNow ? 'Open now' : 'Closed now'}
              color={openNow ? 'success' : 'default'}
              variant={openNow ? 'filled' : 'outlined'}
            />
          ) : null}
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.35 }}>
          {timezoneNote}
        </Typography>
      </Box>
      <Table size="small" aria-label={title}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 800, width: '42%' }}>Day</TableCell>
            <TableCell sx={{ fontWeight: 800 }}>Selling times</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {ISO_DAYS.map(({ iso, label }) => {
            const row = byDay.get(iso)
            return (
              <TableRow key={iso}>
                <TableCell component="th" scope="row" sx={{ fontWeight: 600 }}>
                  {label}
                </TableCell>
                <TableCell>
                  {row ? (
                    <Typography variant="body2" fontWeight={700}>
                      {minutesToHm(row.start_minute)} – {minutesToHm(row.end_minute)}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Closed
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Box>
  )
}
