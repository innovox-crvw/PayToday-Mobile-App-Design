/** Africa/Windhoek wall-clock helpers (Namibia, UTC+2, no DST). */

const WH_SHORT_TO_ISO: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
}

export type SellingHoursRow = {
  day_of_week: number
  start_minute: number
  end_minute: number
  is_active: boolean
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** ISO weekday 1=Mon … 7=Sun; minutes 0–1439 in Africa/Windhoek. */
export function windhoekDowAndMinutes(instant: Date): { dowIso: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Windhoek',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  let wd = 'Mon'
  let hh = 0
  let mm = 0
  for (const p of parts) {
    if (p.type === 'weekday' && p.value) wd = p.value.slice(0, 3)
    if (p.type === 'hour') hh = Number(p.value)
    if (p.type === 'minute') mm = Number(p.value)
  }
  return {
    dowIso: WH_SHORT_TO_ISO[wd] ?? 1,
    minutes: Math.min(1439, Math.max(0, hh * 60 + mm)),
  }
}

/** Next N calendar days in Windhoek as `YYYY-MM-DD` + ISO weekday. */
export function nextWindhoekCalendarDays(count: number): { ymd: string; dowIso: number }[] {
  const out: { ymd: string; dowIso: number }[] = []
  const seen = new Set<string>()
  let t = Date.now()
  while (out.length < count) {
    const d = new Date(t)
    const ymd = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Windhoek',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
    if (!seen.has(ymd)) {
      seen.add(ymd)
      out.push({ ymd, dowIso: windhoekDowAndMinutes(d).dowIso })
    }
    t += 86_400_000
  }
  return out
}

/** `datetime-local` value for a Windhoek calendar date + minutes from midnight. */
export function windhoekMinutesToDatetimeLocal(ymd: string, minutesFromMidnight: number): string {
  const h = Math.floor(minutesFromMidnight / 60)
  const m = minutesFromMidnight % 60
  return `${ymd}T${pad2(h)}:${pad2(m)}`
}

/**
 * Parse `datetime-local` (or ISO) as Windhoek wall time → UTC ISO for the API.
 * Matches server `windhoekIsoDowAndMinutes` validation.
 */
export function windhoekLocalInputToIso(local: string): string | null {
  const raw = local.trim()
  if (!raw) return null
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (m) {
    const y = Number(m[1])
    const mo = Number(m[2])
    const d = Number(m[3])
    const h = Number(m[4])
    const min = Number(m[5])
    return new Date(Date.UTC(y, mo - 1, d, h - 2, min, 0, 0)).toISOString()
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function minutesToHmLabel(m: number): string {
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`
}

/** Same rules as backend `isWindowInsideGranularLiquorHours`. */
export function isWindowInsideLiquorHours(
  rows: SellingHoursRow[],
  startLocal: string,
  endLocal: string,
): boolean {
  const active = rows.filter((r) => r.is_active)
  if (!active.length) return true
  const startIso = windhoekLocalInputToIso(startLocal)
  const endIso = windhoekLocalInputToIso(endLocal)
  if (!startIso || !endIso) return false
  const start = new Date(startIso)
  const end = new Date(endIso)
  if (!(start.getTime() < end.getTime())) return false
  const a = windhoekDowAndMinutes(start)
  const b = windhoekDowAndMinutes(end)
  if (a.dowIso !== b.dowIso) return false
  const row = active.find((r) => r.day_of_week === a.dowIso)
  if (!row) return false
  return a.minutes >= row.start_minute && b.minutes <= row.end_minute
}

export function slotInsideLiquorHoursForDate(
  rows: SellingHoursRow[],
  dateYmd: string,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
): boolean {
  const startLocal = windhoekMinutesToDatetimeLocal(dateYmd, startHour * 60 + startMinute)
  const endLocal = windhoekMinutesToDatetimeLocal(dateYmd, endHour * 60 + endMinute)
  return isWindowInsideLiquorHours(rows, startLocal, endLocal)
}

export function formatLiquorHoursSummary(rows: SellingHoursRow[]): string {
  const active = rows.filter((r) => r.is_active)
  if (!active.length) return ''
  const ISO_DAY = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
  return active
    .map(
      (r) =>
        `${ISO_DAY[r.day_of_week] ?? `Day ${r.day_of_week}`} ${minutesToHmLabel(r.start_minute)}–${minutesToHmLabel(r.end_minute)}`,
    )
    .join(' · ')
}
