/** Realistic outer-carton dimensions (mm) and gross weight (g) inferred from product title + category. */

export type PackageDims = {
  packageLengthMm: number
  packageWidthMm: number
  packageHeightMm: number
  grossWeightG: number
}

export function formatPackageDimensionsLine(d: PackageDims): string {
  const kg = d.grossWeightG / 1000
  const kgStr = kg >= 1 ? `${kg.toFixed(2)} kg` : `${d.grossWeightG} g`
  return `${d.packageLengthMm} × ${d.packageWidthMm} × ${d.packageHeightMm} mm (shipping weight approx. ${kgStr})`
}

type Rule = { test: (name: string, cat: string) => boolean; dims: PackageDims }

const RULES: Rule[] = [
  { test: (n) => /tv|television/.test(n) && /43/.test(n), dims: { packageLengthMm: 1080, packageWidthMm: 180, packageHeightMm: 680, grossWeightG: 11800 } },
  { test: (n) => /tv|television/.test(n), dims: { packageLengthMm: 950, packageWidthMm: 160, packageHeightMm: 580, grossWeightG: 9200 } },
  { test: (n) => /tablet/.test(n) && /10/.test(n), dims: { packageLengthMm: 280, packageWidthMm: 45, packageHeightMm: 220, grossWeightG: 780 } },
  { test: (n) => /smartphone|phone/.test(n), dims: { packageLengthMm: 165, packageWidthMm: 85, packageHeightMm: 35, grossWeightG: 380 } },
  { test: (n) => /soundbar/.test(n), dims: { packageLengthMm: 920, packageWidthMm: 140, packageHeightMm: 120, grossWeightG: 4200 } },
  { test: (n) => /turntable|vinyl/.test(n), dims: { packageLengthMm: 480, packageWidthMm: 420, packageHeightMm: 180, grossWeightG: 6500 } },
  { test: (n) => /headphone/.test(n) && /over-ear/.test(n), dims: { packageLengthMm: 220, packageWidthMm: 200, packageHeightMm: 95, grossWeightG: 680 } },
  { test: (n) => /earbud/.test(n), dims: { packageLengthMm: 110, packageWidthMm: 95, packageHeightMm: 42, grossWeightG: 185 } },
  { test: (n) => /speaker/.test(n) && /bluetooth|portable/.test(n), dims: { packageLengthMm: 195, packageWidthMm: 95, packageHeightMm: 95, grossWeightG: 920 } },
  { test: (n) => /microphone/.test(n), dims: { packageLengthMm: 240, packageWidthMm: 120, packageHeightMm: 75, grossWeightG: 1100 } },
  { test: (n) => /webcam/.test(n), dims: { packageLengthMm: 145, packageWidthMm: 95, packageHeightMm: 75, grossWeightG: 320 } },
  { test: (n) => /smart watch|smartwatch/.test(n), dims: { packageLengthMm: 120, packageWidthMm: 95, packageHeightMm: 55, grossWeightG: 240 } },
  { test: (n) => /router|wi-fi|wifi/.test(n), dims: { packageLengthMm: 280, packageWidthMm: 220, packageHeightMm: 75, grossWeightG: 850 } },
  { test: (n) => /power bank/.test(n), dims: { packageLengthMm: 165, packageWidthMm: 85, packageHeightMm: 32, grossWeightG: 420 } },
  { test: (n) => /charger/.test(n) && /laptop|65/.test(n), dims: { packageLengthMm: 180, packageWidthMm: 120, packageHeightMm: 45, grossWeightG: 480 } },
  { test: (n) => /keyboard/.test(n), dims: { packageLengthMm: 460, packageWidthMm: 165, packageHeightMm: 35, grossWeightG: 720 } },
  { test: (n) => /mouse/.test(n), dims: { packageLengthMm: 125, packageWidthMm: 85, packageHeightMm: 45, grossWeightG: 165 } },
  { test: (n) => /microsd|memory card/.test(n), dims: { packageLengthMm: 95, packageWidthMm: 65, packageHeightMm: 12, grossWeightG: 28 } },
  { test: (n) => /hdmi|cable/.test(n), dims: { packageLengthMm: 220, packageWidthMm: 145, packageHeightMm: 28, grossWeightG: 180 } },
  { test: (n) => /laptop sleeve/.test(n), dims: { packageLengthMm: 380, packageWidthMm: 280, packageHeightMm: 45, grossWeightG: 420 } },
  { test: (n) => /phone case|screen protector/.test(n), dims: { packageLengthMm: 185, packageWidthMm: 105, packageHeightMm: 18, grossWeightG: 85 } },
  { test: (n) => /car phone mount/.test(n), dims: { packageLengthMm: 145, packageWidthMm: 115, packageHeightMm: 55, grossWeightG: 195 } },
  { test: (n) => /usb hub/.test(n), dims: { packageLengthMm: 155, packageWidthMm: 95, packageHeightMm: 32, grossWeightG: 145 } },
  { test: (n) => /coffee maker/.test(n), dims: { packageLengthMm: 360, packageWidthMm: 280, packageHeightMm: 320, grossWeightG: 4800 } },
  { test: (n) => /kettle/.test(n), dims: { packageLengthMm: 240, packageWidthMm: 220, packageHeightMm: 260, grossWeightG: 1450 } },
  { test: (n) => /bed sheet|sheet set/.test(n), dims: { packageLengthMm: 380, packageWidthMm: 280, packageHeightMm: 95, grossWeightG: 1850 } },
  { test: (n) => /blanket/.test(n), dims: { packageLengthMm: 420, packageWidthMm: 320, packageHeightMm: 120, grossWeightG: 2100 } },
  { test: (n) => /plate set|dinner plate/.test(n), dims: { packageLengthMm: 320, packageWidthMm: 320, packageHeightMm: 180, grossWeightG: 5200 } },
  { test: (n) => /frying pan|pan 28/.test(n), dims: { packageLengthMm: 480, packageWidthMm: 300, packageHeightMm: 85, grossWeightG: 1650 } },
  { test: (n) => /desk lamp/.test(n), dims: { packageLengthMm: 380, packageWidthMm: 120, packageHeightMm: 120, grossWeightG: 980 } },
  { test: (n) => /storage box/.test(n), dims: { packageLengthMm: 520, packageWidthMm: 380, packageHeightMm: 180, grossWeightG: 2400 } },
  { test: (n) => /wall clock/.test(n), dims: { packageLengthMm: 320, packageWidthMm: 320, packageHeightMm: 55, grossWeightG: 780 } },
  { test: (n) => /flask|thermos/.test(n), dims: { packageLengthMm: 110, packageWidthMm: 110, packageHeightMm: 280, grossWeightG: 620 } },
  { test: (n) => /detergent/.test(n) && /3l|3 l/.test(n), dims: { packageLengthMm: 180, packageWidthMm: 120, packageHeightMm: 280, grossWeightG: 3200 } },
  { test: (n) => /toilet paper/.test(n), dims: { packageLengthMm: 480, packageWidthMm: 320, packageHeightMm: 220, grossWeightG: 2100 } },
  { test: (n) => /box wine|wine box|3l/.test(n) && /wine/.test(n), dims: { packageLengthMm: 200, packageWidthMm: 130, packageHeightMm: 240, grossWeightG: 3200 } },
  { test: (n) => /750ml|750 ml/.test(n) && /wine|cabernet|merlot|shiraz|pinot|chardonnay|chenin|rosé|rose|moscato|sparkling|port|aperitif|gin|vodka|rum|whisky|brandy|tequila|spirit/.test(n), dims: { packageLengthMm: 95, packageWidthMm: 95, packageHeightMm: 320, grossWeightG: 1350 } },
  { test: (n) => /12-pack|12 pack/.test(n), dims: { packageLengthMm: 400, packageWidthMm: 260, packageHeightMm: 150, grossWeightG: 4200 } },
  { test: (n) => /6-pack|6 pack/.test(n), dims: { packageLengthMm: 240, packageWidthMm: 165, packageHeightMm: 125, grossWeightG: 2100 } },
  { test: (n) => /4-pack|4 pack/.test(n), dims: { packageLengthMm: 210, packageWidthMm: 150, packageHeightMm: 110, grossWeightG: 1450 } },
  { test: (n) => /ready-to-drink|premix|cooler/.test(n), dims: { packageLengthMm: 210, packageWidthMm: 150, packageHeightMm: 110, grossWeightG: 1500 } },
  { test: (n) => /milk/.test(n) && /2l|2 l/.test(n), dims: { packageLengthMm: 100, packageWidthMm: 100, packageHeightMm: 245, grossWeightG: 2150 } },
  { test: (n) => /bread|loaf/.test(n), dims: { packageLengthMm: 280, packageWidthMm: 140, packageHeightMm: 110, grossWeightG: 780 } },
  { test: (n) => /sugar/.test(n) && /2\.5|2,5/.test(n), dims: { packageLengthMm: 180, packageWidthMm: 120, packageHeightMm: 280, grossWeightG: 2550 } },
  { test: (n) => /oil/.test(n) && /2l|2 l/.test(n), dims: { packageLengthMm: 95, packageWidthMm: 95, packageHeightMm: 310, grossWeightG: 1920 } },
  { test: (n) => /maize|meal/.test(n) && /5kg|5 kg/.test(n), dims: { packageLengthMm: 250, packageWidthMm: 150, packageHeightMm: 380, grossWeightG: 5100 } },
  { test: (n) => /rice/.test(n) && /2kg|2 kg/.test(n), dims: { packageLengthMm: 120, packageWidthMm: 80, packageHeightMm: 280, grossWeightG: 2050 } },
  { test: (n) => /egg/.test(n) && /18/.test(n), dims: { packageLengthMm: 300, packageWidthMm: 200, packageHeightMm: 75, grossWeightG: 1120 } },
  { test: (n) => /butter/.test(n), dims: { packageLengthMm: 125, packageWidthMm: 85, packageHeightMm: 55, grossWeightG: 540 } },
  { test: (n) => /oats/.test(n), dims: { packageLengthMm: 180, packageWidthMm: 120, packageHeightMm: 240, grossWeightG: 1080 } },
  { test: (n) => /pasta/.test(n), dims: { packageLengthMm: 250, packageWidthMm: 80, packageHeightMm: 300, grossWeightG: 530 } },
  { test: (n) => /cola|squash|ginger beer/.test(n) && /2l|2 l/.test(n), dims: { packageLengthMm: 95, packageWidthMm: 95, packageHeightMm: 320, grossWeightG: 2150 } },
  { test: (n) => /water/.test(n) && /6-pack|6 pack/.test(n), dims: { packageLengthMm: 380, packageWidthMm: 260, packageHeightMm: 220, grossWeightG: 9200 } },
  { test: (n) => /energy drink/.test(n), dims: { packageLengthMm: 210, packageWidthMm: 150, packageHeightMm: 110, grossWeightG: 1350 } },
  { test: (n) => /iced tea|tonic/.test(n), dims: { packageLengthMm: 95, packageWidthMm: 95, packageHeightMm: 280, grossWeightG: 1650 } },
  { test: (n) => /sparkling water/.test(n), dims: { packageLengthMm: 360, packageWidthMm: 240, packageHeightMm: 200, grossWeightG: 7800 } },
  { test: (n) => /chips|crisps/.test(n), dims: { packageLengthMm: 220, packageWidthMm: 160, packageHeightMm: 55, grossWeightG: 145 } },
  { test: (n) => /chocolate/.test(n), dims: { packageLengthMm: 165, packageWidthMm: 45, packageHeightMm: 22, grossWeightG: 95 } },
  { test: (n) => /peanut butter/.test(n), dims: { packageLengthMm: 85, packageWidthMm: 85, packageHeightMm: 120, grossWeightG: 450 } },
  { test: (n) => /biscuit/.test(n), dims: { packageLengthMm: 240, packageWidthMm: 95, packageHeightMm: 55, grossWeightG: 230 } },
  { test: (n) => /noodle/.test(n), dims: { packageLengthMm: 280, packageWidthMm: 180, packageHeightMm: 95, grossWeightG: 520 } },
  { test: (n) => /trail mix|granola/.test(n), dims: { packageLengthMm: 220, packageWidthMm: 140, packageHeightMm: 45, grossWeightG: 340 } },
  { test: (n) => /popcorn/.test(n), dims: { packageLengthMm: 280, packageWidthMm: 200, packageHeightMm: 95, grossWeightG: 380 } },
  { test: (n) => /banana|apple|potato|onion|tomato|carrot|avocado|spinach/.test(n), dims: { packageLengthMm: 280, packageWidthMm: 180, packageHeightMm: 95, grossWeightG: 1100 } },
  { test: (n) => /dishwashing|cleaner|750ml|1l|1 l/.test(n), dims: { packageLengthMm: 95, packageWidthMm: 75, packageHeightMm: 240, grossWeightG: 920 } },
  { test: (n) => /sponge|scourer/.test(n), dims: { packageLengthMm: 220, packageWidthMm: 140, packageHeightMm: 65, grossWeightG: 180 } },
]

const CATEGORY_DEFAULTS: Record<string, PackageDims> = {
  electronics: { packageLengthMm: 220, packageWidthMm: 160, packageHeightMm: 75, grossWeightG: 650 },
  audio: { packageLengthMm: 280, packageWidthMm: 200, packageHeightMm: 95, grossWeightG: 1200 },
  accessories: { packageLengthMm: 160, packageWidthMm: 110, packageHeightMm: 35, grossWeightG: 120 },
  home: { packageLengthMm: 380, packageWidthMm: 280, packageHeightMm: 120, grossWeightG: 1800 },
  cleaning: { packageLengthMm: 240, packageWidthMm: 160, packageHeightMm: 120, grossWeightG: 1400 },
  wine: { packageLengthMm: 95, packageWidthMm: 95, packageHeightMm: 320, grossWeightG: 1350 },
  beer: { packageLengthMm: 240, packageWidthMm: 165, packageHeightMm: 125, grossWeightG: 2100 },
  spirits: { packageLengthMm: 95, packageWidthMm: 95, packageHeightMm: 320, grossWeightG: 1400 },
  liquor: { packageLengthMm: 210, packageWidthMm: 150, packageHeightMm: 110, grossWeightG: 1500 },
  groceries: { packageLengthMm: 220, packageWidthMm: 140, packageHeightMm: 120, grossWeightG: 850 },
  'fresh-produce': { packageLengthMm: 280, packageWidthMm: 180, packageHeightMm: 95, grossWeightG: 1000 },
  'soft-drinks': { packageLengthMm: 240, packageWidthMm: 160, packageHeightMm: 140, grossWeightG: 1800 },
  'snacks-pantry': { packageLengthMm: 200, packageWidthMm: 130, packageHeightMm: 55, grossWeightG: 280 },
}

const FALLBACK: PackageDims = { packageLengthMm: 220, packageWidthMm: 150, packageHeightMm: 100, grossWeightG: 500 }

export function inferPackageDimensions(name: string, categorySlug: string): PackageDims {
  const n = name.toLowerCase()
  const cat = categorySlug.toLowerCase()
  for (const rule of RULES) {
    if (rule.test(n, cat)) return { ...rule.dims }
  }
  for (const [key, dims] of Object.entries(CATEGORY_DEFAULTS)) {
    if (cat === key || cat.startsWith(`${key}-`)) return { ...dims }
  }
  return { ...FALLBACK }
}
