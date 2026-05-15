/** Quick-pick windows for checkout when alcohol is outside current liquor hours (local device time). */

import type { YangoDemoSlot } from './yangoDeliveryDemo'

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
export function buildLiquorSchedulePresetsFromAreaSlots(
  slots: readonly YangoDemoSlot[],
  numDays = 7,
  maxOptions = 16,
): LiquorTimePreset[] {
  if (!slots.length) return []
  const out: LiquorTimePreset[] = []
  const now = new Date()
  const dayTitle = (d: Date) =>
    d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

  for (let d = 0; d < numDays && out.length < maxOptions; d += 1) {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d)
    for (const slot of slots) {
      const sm = slot.startMinute ?? 0
      const em = slot.endMinute ?? 0
      const start = new Date(base)
      start.setHours(slot.startHour, sm, 0, 0)
      const end = new Date(base)
      end.setHours(slot.endHour, em, 0, 0)
      if (end.getTime() <= start.getTime()) continue
      if (end.getTime() <= now.getTime()) continue
      const startLocal = toDatetimeLocal(start)
      const endLocal = toDatetimeLocal(end)
      out.push({
        id: `${slot.id}|${startLocal}|${endLocal}`,
        label: `${dayTitle(base)} · ${slot.label}`,
        startLocal,
        endLocal,
      })
    }
  }
  return out
}
