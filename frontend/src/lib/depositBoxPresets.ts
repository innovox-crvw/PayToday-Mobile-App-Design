/** Admin deposit box — interior locker presets (W × D × H in mm) + suggested parcel slots. */

export type DepositBoxSizePreset = {
  id: string
  label: string
  /** Interior usable width × depth × height (mm). */
  widthMm: number
  depthMm: number
  heightMm: number
  /** Suggested max concurrent reservations / parcels for this locker class. */
  suggestedCapacity: number
}

export const DEPOSIT_BOX_SIZE_PRESETS: DepositBoxSizePreset[] = [
  {
    id: 's',
    label: 'Small — parcel locker',
    widthMm: 320,
    depthMm: 420,
    heightMm: 240,
    suggestedCapacity: 8,
  },
  {
    id: 'm',
    label: 'Medium — grocery bag',
    widthMm: 420,
    depthMm: 520,
    heightMm: 380,
    suggestedCapacity: 14,
  },
  {
    id: 'l',
    label: 'Large — bulk / case',
    widthMm: 520,
    depthMm: 620,
    heightMm: 520,
    suggestedCapacity: 22,
  },
]

export function formatBoxDimensionsMm(widthMm: number | null, depthMm: number | null, heightMm: number | null): string {
  if (widthMm == null || depthMm == null || heightMm == null) return '—'
  return `${widthMm}×${depthMm}×${heightMm} mm`
}
