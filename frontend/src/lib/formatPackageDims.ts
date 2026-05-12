/** Human-readable package size / weight from order line or variant fields (mm / grams). */
export function formatPackageDimensionsMm(line: {
  packageLengthMm?: number | null
  packageWidthMm?: number | null
  packageHeightMm?: number | null
  grossWeightG?: number | null
}): string | null {
  const l = line.packageLengthMm
  const w = line.packageWidthMm
  const h = line.packageHeightMm
  const g = line.grossWeightG
  const hasDims =
    l != null && w != null && h != null && Number.isFinite(l) && Number.isFinite(w) && Number.isFinite(h) && l > 0 && w > 0 && h > 0
  const dims = hasDims ? `${l} × ${w} × ${h} mm` : null
  const weight = g != null && Number.isFinite(g) && g > 0 ? `${g} g` : null
  if (dims && weight) return `${dims} · ${weight}`
  if (dims) return dims
  if (weight) return `Weight: ${weight}`
  return null
}
