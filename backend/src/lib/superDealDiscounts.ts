/**
 * Compare-at (list) prices for the home Super deals rail.
 * Sale price stays in price_cents; compare_at_price_cents must be strictly greater.
 */

/** SKU → integer percent off the list price (shown as “was” vs sale). */
export const SUPER_DEAL_DISCOUNT_PERCENT_BY_SKU: Record<string, number> = {
  'GRO-MILK-2L': 10,
  'GRO-EGG-18': 12,
  'GRO-MAIZE-5': 8,
  'FRS-AVO-4': 15,
  'SD-COLA-2L': 10,
  'SD-WAT-6': 12,
  'SNK-CHO-80': 25,
  'SNK-PNB-400': 18,
  'ELC-PHN-64': 12,
  'ELC-TAB-10': 15,
  'ELC-TV-43': 10,
  'ELC-PBK-20': 20,
  'ELC-WCH-FIT': 18,
  'AUD-EAR-WL': 22,
  'AUD-HPH-OE': 15,
  'AUD-SB-21': 12,
  'ACC-CASE-01': 30,
  'ACC-GLS-01': 35,
  'HOM-KTL-17': 18,
  'HOM-COF-FLT': 14,
  'HOM-SHT-Q': 20,
  'CLN-DET-3L': 15,
  'CLN-TP-9': 10,
  'WIN-CAB-750': 15,
  'WIN-SPK-750': 20,
  'WIN-BOX-3L': 12,
  'BEER-LAG-6': 10,
  'BEER-IPA-6': 12,
  'SPI-VOD-750': 12,
  'SPI-WHK-750': 10,
  'LIQ-RTD-GT-4': 15,
}

export function compareAtCentsFromPercentOff(saleCents: number, percentOff: number): number | null {
  if (!Number.isInteger(saleCents) || saleCents < 0) return null
  if (!Number.isInteger(percentOff) || percentOff < 5 || percentOff > 60) return null
  const list = Math.ceil(saleCents / (1 - percentOff / 100))
  return list > saleCents ? list : null
}

export function superDealCompareAtForSku(sku: string, saleCents: number): number | null {
  const pct = SUPER_DEAL_DISCOUNT_PERCENT_BY_SKU[sku.trim().toUpperCase()]
  if (pct == null) return null
  return compareAtCentsFromPercentOff(saleCents, pct)
}
