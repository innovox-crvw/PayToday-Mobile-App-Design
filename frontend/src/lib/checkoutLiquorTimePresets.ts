/** Quick-pick windows for checkout when alcohol is outside current liquor hours (Africa/Windhoek). */

import type { YangoDemoSlot } from './yangoDeliveryDemo'
import {
  nextWindhoekCalendarDays,
  slotInsideLiquorHoursForDate,
  windhoekLocalInputToIso,
  windhoekMinutesToDatetimeLocal,
  type SellingHoursRow,
} from './windhoekTime'

export type LiquorTimePreset = {
  id: string
  label: string
  /** `datetime-local` value */
  startLocal: string
  endLocal: string
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toDatetimeLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/**
 * Suggested morning / afternoon blocks for the next few days (skip slots already ended).
 * Staff still validate against merchant liquor hours on the server.
 */
export function buildLiquorSchedulePresets(numDays = 7, maxOptions = 16): LiquorTimePreset[] {
  const out: LiquorTimePreset[] = []
  const now = new Date()
  const dayTitle = (d: Date) =>
    d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

  const blocks: { suffix: string; startH: number; startM: number; endH: number; endM: number }[] = [
    { suffix: 'Morning (9:00–12:00)', startH: 9, startM: 0, endH: 12, endM: 0 },
    { suffix: 'Afternoon (14:00–18:00)', startH: 14, startM: 0, endH: 18, endM: 0 },
  ]

  for (let d = 0; d < numDays && out.length < maxOptions; d += 1) {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d)
    for (const b of blocks) {
      const start = new Date(base)
      start.setHours(b.startH, b.startM, 0, 0)
      const end = new Date(base)
      end.setHours(b.endH, b.endM, 0, 0)
      if (end.getTime() <= now.getTime()) continue
      const startLocal = toDatetimeLocal(start)
      const endLocal = toDatetimeLocal(end)
      out.push({
        id: `${startLocal}|${endLocal}`,
        label: `${dayTitle(base)} · ${b.suffix}`,
        startLocal,
        endLocal,
      })
    }
  }
  return out
}

/**
 * Same shape as {@link buildLiquorSchedulePresets}, but each option uses the delivery area's configured windows
 * (from `home_delivery_areas` presets merged into `YangoDemoZone.slots`) instead of fixed morning/afternoon blocks.
 */
/**
 * Presets from merchant `liquor_selling_hours` — only windows that pass server-side liquor validation.
 */
export function buildLiquorSchedulePresetsFromLiquorHours(
  rows: SellingHoursRow[],
  numDays = 7,
  maxOptions = 16,
): LiquorTimePreset[] {
  const active = rows.filter((r) => r.is_active)
  if (!active.length) return []
  const out: LiquorTimePreset[] = []
  const nowIso = new Date().toISOString()

  for (const { ymd, dowIso } of nextWindhoekCalendarDays(numDays)) {
    if (out.length >= maxOptions) break
    const row = active.find((r) => r.day_of_week === dowIso)
    if (!row) continue
    const startLocal = windhoekMinutesToDatetimeLocal(ymd, row.start_minute)
    const endLocal = windhoekMinutesToDatetimeLocal(ymd, row.end_minute)
    const endIso = windhoekLocalInputToIso(endLocal)
    if (!endIso || endIso <= nowIso) continue
    const dayTitle = new Intl.DateTimeFormat(undefined, {
      timeZone: 'Africa/Windhoek',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date(windhoekLocalInputToIso(startLocal)!))
    const suffix = `${pad2(Math.floor(row.start_minute / 60))}:${pad2(row.start_minute % 60)}–${pad2(Math.floor(row.end_minute / 60))}:${pad2(row.end_minute % 60)}`
    out.push({
      id: `${startLocal}|${endLocal}`,
      label: `${dayTitle} · ${suffix}`,
      startLocal,
      endLocal,
    })
  }
  return out
}

/** Keep only delivery-area slots that fall inside permitted liquor hours on that calendar day. */
export function filterAreaSlotsForLiquorHours(
  slots: readonly YangoDemoSlot[],
  liquorRows: SellingHoursRow[],
): YangoDemoSlot[] {
  if (!liquorRows.some((r) => r.is_active)) return [...slots]
  return slots.filter((slot) => {
    const sm = slot.startMinute ?? 0
    const em = slot.endMinute ?? 0
    return nextWindhoekCalendarDays(7).some(({ ymd }) =>
      slotInsideLiquorHoursForDate(liquorRows, ymd, slot.startHour, sm, slot.endHour, em),
    )
  })
}

export function buildLiquorSchedulePresetsFromAreaSlots(
  slots: readonly YangoDemoSlot[],
  liquorRows?: SellingHoursRow[],
  numDays = 7,
  maxOptions = 16,
): LiquorTimePreset[] {
  const usable =
    liquorRows?.length && liquorRows.some((r) => r.is_active)
      ? filterAreaSlotsForLiquorHours(slots, liquorRows)
      : [...slots]
  if (!usable.length) return []
  const out: LiquorTimePreset[] = []

  for (const { ymd } of nextWindhoekCalendarDays(numDays)) {
    if (out.length >= maxOptions) break
    for (const slot of usable) {
      if (out.length >= maxOptions) break
      const sm = slot.startMinute ?? 0
      const em = slot.endMinute ?? 0
      if (liquorRows?.length && !slotInsideLiquorHoursForDate(liquorRows, ymd, slot.startHour, sm, slot.endHour, em)) {
        continue
      }
      const startLocal = windhoekMinutesToDatetimeLocal(ymd, slot.startHour * 60 + sm)
      const endLocal = windhoekMinutesToDatetimeLocal(ymd, slot.endHour * 60 + em)
      const endIso = windhoekLocalInputToIso(endLocal)
      if (!endIso || endIso <= new Date().toISOString()) continue
      const dayTitle = new Intl.DateTimeFormat(undefined, {
        timeZone: 'Africa/Windhoek',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).format(new Date(windhoekLocalInputToIso(startLocal)!))
      out.push({
        id: `${slot.id}|${startLocal}|${endLocal}`,
        label: `${dayTitle} · ${slot.label}`,
        startLocal,
        endLocal,
      })
    }
  }
  return out
}
