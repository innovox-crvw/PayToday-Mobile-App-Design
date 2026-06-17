export type StoreHoursRow = {
  day_of_week: number
  start_minute: number
  end_minute: number
  is_active: boolean
}

export type StoreHoursStatus = {
  payTodayMerchantId: number
  configured: boolean
  openNow: boolean
  hoursSummary: string
  items: StoreHoursRow[]
  nextOpenLabel: string | null
  liquorItems: StoreHoursRow[]
  liquorConfigured: boolean
  liquorOpenNow: boolean
  liquorHoursSummary: string
}

export const CHECKOUT_SCHEDULE_PRESET_KEY = 'pt_checkout_schedule_preset'

export type CheckoutSchedulePreset = {
  startLocal: string
  endLocal: string
  label: string
}

export function saveCheckoutSchedulePreset(preset: CheckoutSchedulePreset): void {
  try {
    sessionStorage.setItem(CHECKOUT_SCHEDULE_PRESET_KEY, JSON.stringify(preset))
  } catch {
    /* ignore */
  }
}

export function readCheckoutSchedulePreset(): CheckoutSchedulePreset | null {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_SCHEDULE_PRESET_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as CheckoutSchedulePreset
    if (!o?.startLocal || !o?.endLocal) return null
    return o
  } catch {
    return null
  }
}

export function clearCheckoutSchedulePreset(): void {
  try {
    sessionStorage.removeItem(CHECKOUT_SCHEDULE_PRESET_KEY)
  } catch {
    /* ignore */
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toDatetimeLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

const ISO_DAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

function minutesToLabel(m: number): string {
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`
}

/** Upcoming open windows from admin store-hours rows (local device calendar). */
export function buildStoreSchedulePresets(
  rows: StoreHoursRow[],
  numDays = 7,
  maxOptions = 14,
): CheckoutSchedulePreset[] {
  const active = rows.filter((r) => r.is_active)
  if (!active.length) return []
  const out: CheckoutSchedulePreset[] = []
  const now = new Date()

  for (let d = 0; d < numDays && out.length < maxOptions; d += 1) {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d)
    const dowIso = ((base.getDay() + 6) % 7) + 1
    const row = active.find((r) => r.day_of_week === dowIso)
    if (!row) continue
    const start = new Date(base)
    start.setHours(Math.floor(row.start_minute / 60), row.start_minute % 60, 0, 0)
    const end = new Date(base)
    end.setHours(Math.floor(row.end_minute / 60), row.end_minute % 60, 0, 0)
    if (end.getTime() <= now.getTime()) continue
    const dayTitle = base.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
    const startLocal = toDatetimeLocal(start)
    const endLocal = toDatetimeLocal(end)
    out.push({
      startLocal,
      endLocal,
      label: `${dayTitle} · ${minutesToLabel(row.start_minute)}–${minutesToLabel(row.end_minute)}`,
    })
  }
  return out
}

export function isoDayLabel(iso: number): string {
  return ISO_DAY_SHORT[iso] ?? `Day ${iso}`
}

function activeHoursByDay(rows: StoreHoursRow[]): Map<number, StoreHoursRow> {
  return new Map(rows.filter((r) => r.is_active).map((r) => [r.day_of_week, r]))
}

/** True when store opening hours and liquor selling hours differ on any weekday. */
export function sellingHoursSchedulesDiffer(
  storeRows: StoreHoursRow[],
  liquorRows: StoreHoursRow[],
): boolean {
  const storeByDay = activeHoursByDay(storeRows)
  const liquorByDay = activeHoursByDay(liquorRows)
  for (let iso = 1; iso <= 7; iso += 1) {
    const store = storeByDay.get(iso)
    const liquor = liquorByDay.get(iso)
    const storeOpen = Boolean(store)
    const liquorOpen = Boolean(liquor)
    if (storeOpen !== liquorOpen) return true
    if (!storeOpen) continue
    if (
      store!.start_minute !== liquor!.start_minute ||
      store!.end_minute !== liquor!.end_minute
    ) {
      return true
    }
  }
  return false
}
