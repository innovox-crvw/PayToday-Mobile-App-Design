/** Deterministic storefront tab copy for backfill / seeds. */

import {
  formatPackageDimensionsLine,
  inferPackageDimensions,
  type PackageDims,
} from './productPackageProfiles.js'

export type ProductTabContentGenerated = {
  description: string
  deliveryInformation: string
  returnPolicy: string
  warrantyInfo: string
  whatsInTheBox: string
}

export function isStubProductDescription(desc: string | null | undefined, name: string): boolean {
  const d = (desc ?? '').trim()
  if (!d) return true
  if (d.length < 72) return true
  if (/demo catalogue item\.?$/i.test(d)) return true
  if (d === name.trim()) return true
  if (/^(pantry staple|fresh produce|beverage|snack|electronics|audio|accessory|home|cleaning|wine|beer|spirits|liquor):\s/i.test(d)) {
    return true
  }
  if (/^[\w\s&]+ is available from/i.test(d) && d.length < 220) return true
  return false
}

function categoryLabel(categoryName: string, categorySlug: string): string {
  return categoryName.trim() || categorySlug.replace(/-/g, ' ') || 'General'
}

function isAgeRestrictedCategory(categorySlug: string): boolean {
  const s = categorySlug.toLowerCase()
  return ['liquor', 'wine', 'beer', 'spirits'].some((k) => s === k || s.includes(k))
}

function isBulky(dims: PackageDims): boolean {
  return dims.packageLengthMm >= 500 || dims.packageHeightMm >= 400 || dims.grossWeightG >= 5000
}

function productHighlights(name: string, categorySlug: string): string {
  const n = name.toLowerCase()
  const cat = categorySlug.toLowerCase()
  if (cat.includes('wine') || (cat.includes('liquor') && /wine|port|aperitif/.test(n))) {
    return 'Sold in standard retail bottles unless otherwise stated. Store upright and away from direct sunlight. Enjoy responsibly — 18+ only.'
  }
  if (cat.includes('beer') || cat.includes('spirits') || cat.includes('liquor')) {
    return 'Alcohol sold subject to Namibian liquor trading hours and age verification at checkout. Chill before serving where appropriate.'
  }
  if (cat.includes('electronic') || cat.includes('audio') || cat.includes('accessories')) {
    return 'Check compatibility (ports, size, voltage) before ordering. Register with the manufacturer when a warranty card is included.'
  }
  if (cat.includes('fresh')) {
    return 'Best enjoyed soon after delivery. Quality depends on seasonal supply — appearance may vary slightly from photos.'
  }
  if (cat.includes('grocery') || cat.includes('snack') || cat.includes('soft-drink')) {
    return 'Check best-before or expiry on the pack when it arrives. Keep sealed until opened.'
  }
  return 'See specifications on this page and compare variants before you add to cart.'
}

function warrantyForCategory(categorySlug: string, name: string): string {
  const s = categorySlug.toLowerCase()
  const n = name.toLowerCase()
  if (s.includes('electronic') || s.includes('audio') || /phone|tablet|tv|router|charger|keyboard|mouse|webcam|watch/.test(n)) {
    return `Manufacturer warranty (if any) applies to defects in materials and workmanship under normal use — typically 12–24 months for electronics, as stated on packaging or the warranty card inside the box. Accidental damage, liquid ingress, and unauthorised repair are usually excluded. Keep your AvoToday invoice and serial numbers (if shown on the device) for claims. Our team can help route you to the brand or importer where applicable.`
  }
  if (isAgeRestrictedCategory(s)) {
    return 'Alcoholic beverages are consumable goods: no manufacturer warranty applies. If a bottle arrives damaged or clearly faulty, contact us promptly with photos and your order number — we will review under retailer policy.'
  }
  if (s.includes('grocery') || s.includes('food') || s.includes('drink') || s.includes('fresh') || s.includes('snack')) {
    return 'Food, beverages, and perishables are sold for consumption. Quality issues (damage, leaks, obvious spoilage) reported within a short window after delivery may be reviewed with photos and your order reference. Routine freshness and taste preferences are not warranty matters.'
  }
  if (s.includes('home') || s.includes('cleaning')) {
    return `Household items may include a limited manufacturer warranty when supplied by the brand (e.g. small appliances). Retain packaging and any warranty card for ${name}. Wear-and-tear, misuse, and cosmetic marks from delivery are not covered.`
  }
  return `Warranty terms depend on the manufacturer and product type. Keep your AvoToday order confirmation as proof of purchase. Contact support from your order if you need help with a warranty or quality concern.`
}

function buildDescription(
  name: string,
  sku: string,
  categorySlug: string,
  categoryName: string,
  brandName: string | null,
): string {
  const category = categoryLabel(categoryName, categorySlug)
  const retailer = brandName?.trim() ? brandName.trim() : 'AvoToday'
  const highlights = productHighlights(name, categorySlug)
  return `${name} (SKU ${sku}) is listed in our ${category} range on ${retailer}. ${highlights}\n\nOrder online for delivery or pickup in Namibia — pricing is shown in NAD including the variant on this page. Images are representative; labels, batch codes, or bundle contents may vary by supplier shipment.`
}

function buildDelivery(
  name: string,
  categorySlug: string,
  dims: PackageDims,
): string {
  const bulky = isBulky(dims)
  const age = isAgeRestrictedCategory(categorySlug)
  const lines = [
    `We deliver across Namibia where service is available. After you add ${name} to your cart, choose home delivery or a pickup point at checkout — fees and estimated windows depend on your address and the courier lane selected.`,
    bulky
      ? `This item ships in a carton of approximately ${formatPackageDimensionsLine(dims)}. Bulky or heavy parcels may require additional handling time and cannot always be left unattended — please ensure someone can receive the delivery or choose pickup.`
      : `Packed for transit in a carton of approximately ${formatPackageDimensionsLine(dims)}.`,
    'You will receive order updates when your order is confirmed, packed, and handed to the courier. Inspect the outer box on arrival and note any visible damage on delivery where possible.',
  ]
  if (age) {
    lines.push(
      'Alcohol orders require the recipient to be 18 or older with valid ID. Deliveries may only occur during permitted liquor trading hours for your area and merchant.',
    )
  }
  return lines.join('\n\n')
}

function buildReturns(name: string, categorySlug: string, brandName: string | null): string {
  const retailer = brandName?.trim() ? brandName.trim() : 'the retailer'
  const age = isAgeRestrictedCategory(categorySlug)
  const food =
    categorySlug.includes('grocery') ||
    categorySlug.includes('fresh') ||
    categorySlug.includes('snack') ||
    categorySlug.includes('soft-drink')
  const lines = [
    `Returns and exchanges for ${name} follow ${retailer} policy and applicable consumer protection rules in Namibia.`,
    'To request help, open your order in AvoToday and contact support with your order number, SKU, and a short description of the issue. Photos of the product and packaging speed up resolution.',
  ]
  if (age) {
    lines.push(
      'Unopened alcohol may only be returned where permitted by law and store policy; opened bottles cannot be accepted for hygiene and licensing reasons.',
    )
  } else if (food) {
    lines.push(
      'Perishable and opened food items are generally not returnable unless damaged in transit or incorrect item supplied.',
    )
  } else {
    lines.push(
      'Unopened items in resaleable condition with all accessories may qualify within the stated return window where applicable.',
    )
  }
  return lines.join('\n\n')
}

function buildWhatsInTheBox(
  name: string,
  sku: string,
  dims: PackageDims,
  variantLines: { sku: string; name: string }[],
): string {
  const dimLine = formatPackageDimensionsLine(dims)
  const variant =
    variantLines.length === 1
      ? variantLines[0]!
      : variantLines[0]
  const variantLabel = variant?.name?.trim() || 'Standard'
  const variantSku = variant?.sku?.trim() || sku

  const lines = [
    'Contents of this shipment',
    '',
    `Product: ${name}`,
    `SKU: ${sku}`,
    `Variant: ${variantLabel} (${variantSku})`,
    '',
    'Outer retail / shipping carton (L × W × H):',
    dimLine,
    '',
    'Included in the box:',
    `• 1 × ${name} — the item described on this product page`,
  ]

  if (variantLines.length > 1) {
    lines.push('', 'All variants on this product:')
    for (const v of variantLines) {
      lines.push(`• ${v.name.trim() || 'Standard'} (SKU ${v.sku})`)
    }
  }

  lines.push(
    '',
    'Packaging may differ slightly from photos (seasonal sleeves, language on labels). Accessories shown in marketing images are included only when listed above. Retain the carton until you have inspected the product.',
  )

  return lines.join('\n')
}

export function generateProductTabContent(input: {
  name: string
  description: string | null
  categorySlug: string
  categoryName: string
  brandName: string | null
  sku?: string
  variantLines: { sku: string; name: string }[]
  packageDims?: PackageDims | null
}): ProductTabContentGenerated {
  const name = input.name.trim()
  const sku = input.sku?.trim() || input.variantLines[0]?.sku?.trim() || '—'
  const categorySlug = input.categorySlug.trim()
  const dims = input.packageDims ?? inferPackageDimensions(name, categorySlug)

  let description = (input.description ?? '').trim()
  if (isStubProductDescription(description, name)) {
    description = buildDescription(name, sku, categorySlug, input.categoryName, input.brandName)
  }

  return {
    description,
    deliveryInformation: buildDelivery(name, categorySlug, dims),
    returnPolicy: buildReturns(name, categorySlug, input.brandName),
    warrantyInfo: warrantyForCategory(categorySlug, name),
    whatsInTheBox: buildWhatsInTheBox(name, sku, dims, input.variantLines),
  }
}
