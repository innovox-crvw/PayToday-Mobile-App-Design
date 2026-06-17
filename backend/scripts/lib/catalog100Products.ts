/**
 * 100 demo catalogue rows across groceries, electronics, home, and liquor (wine / beer / spirits).
 */

import { CATALOG_CATEGORY_SLUGS } from '../../src/lib/catalogCategories.js'
import { inferPackageDimensions } from '../../src/lib/productPackageProfiles.js'
import { generateProductTabContent } from '../../src/lib/productTabContentTemplates.js'
import { superDealCompareAtForSku } from '../../src/lib/superDealDiscounts.js'

export type Catalog100Row = {
  slug: string
  name: string
  sku: string
  priceCents: number
  categorySlug: string
  initialStock: number
  imageTags: string
  description: string
  deliveryInformation: string
  returnPolicy: string
  warrantyInfo: string
  whatsInTheBox: string
  packageLengthMm: number
  packageWidthMm: number
  packageHeightMm: number
  grossWeightG: number
  compareAtPriceCents: number | null
}

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function lockFromSku(sku: string): number {
  let h = 0
  for (let i = 0; i < sku.length; i++) h = (h * 31 + sku.charCodeAt(i)) >>> 0
  return (h % 90000) + 10000
}

export function catalogImageUrl(tags: string, sku: string): string {
  const lock = lockFromSku(sku)
  return `https://loremflickr.com/800/800/${encodeURIComponent(tags)}?lock=${lock}`
}

type Seed = [name: string, sku: string, priceCents: number, imageTags: string, stock?: number]

function enrichRow(
  name: string,
  sku: string,
  priceCents: number,
  categorySlug: string,
  imageTags: string,
  initialStock: number,
): Catalog100Row {
  const dims = inferPackageDimensions(name, categorySlug)
  const compareAtPriceCents = superDealCompareAtForSku(sku, priceCents)
  const copy = generateProductTabContent({
    name,
    description: null,
    categorySlug,
    categoryName: categorySlug.replace(/-/g, ' '),
    brandName: null,
    sku,
    variantLines: [{ sku, name: 'Standard' }],
    packageDims: dims,
  })
  return {
    slug: slugFromName(name),
    name,
    sku,
    priceCents,
    categorySlug,
    initialStock,
    imageTags,
    description: copy.description,
    deliveryInformation: copy.deliveryInformation,
    returnPolicy: copy.returnPolicy,
    warrantyInfo: copy.warrantyInfo,
    whatsInTheBox: copy.whatsInTheBox,
    packageLengthMm: dims.packageLengthMm,
    packageWidthMm: dims.packageWidthMm,
    packageHeightMm: dims.packageHeightMm,
    grossWeightG: dims.grossWeightG,
    compareAtPriceCents,
  }
}

function rowsFromSeeds(categorySlug: string, seeds: Seed[]): Catalog100Row[] {
  return seeds.map(([name, sku, priceCents, imageTags, stock = 25]) =>
    enrichRow(name, sku, priceCents, categorySlug, imageTags, stock),
  )
}

/** Exactly 100 products. */
export function buildCatalog100Products(): Catalog100Row[] {
  const all: Catalog100Row[] = [
    ...rowsFromSeeds('groceries', [
      ['Spar full cream milk 2L', 'GRO-MILK-2L', 3299, 'milk,carton'],
      ['Brown bread loaf 700g', 'GRO-BRD-700', 1999, 'bread,loaf'],
      ['White sugar 2.5kg', 'GRO-SUG-25', 4499, 'sugar,bag'],
      ['Sunflower oil 2L', 'GRO-OIL-2L', 5999, 'cooking,oil,bottle'],
      ['Maize meal 5kg', 'GRO-MAIZE-5', 8999, 'flour,bag'],
      ['Rice long grain 2kg', 'GRO-RICE-2', 5499, 'rice,bag'],
      ['Eggs free range 18 pack', 'GRO-EGG-18', 6999, 'eggs,carton'],
      ['Butter salted 500g', 'GRO-BTR-500', 4599, 'butter,pack'],
      ['Instant oats 1kg', 'GRO-OATS-1', 3999, 'oats,cereal'],
      ['Pasta penne 500g', 'GRO-PASTA-500', 2499, 'pasta,pack'],
    ]),
    ...rowsFromSeeds('fresh-produce', [
      ['Bananas 1kg', 'FRS-BAN-1', 2499, 'banana,fruit'],
      ['Apples red 1kg', 'FRS-APL-1', 2999, 'apple,fruit'],
      ['Potatoes 2kg bag', 'FRS-POT-2', 3499, 'potato,vegetable'],
      ['Onions brown 1kg', 'FRS-ONI-1', 1999, 'onion,vegetable'],
      ['Tomatoes 500g', 'FRS-TOM-500', 2799, 'tomato,vegetable'],
      ['Carrots 1kg', 'FRS-CAR-1', 2299, 'carrot,vegetable'],
      ['Avocados 4 pack', 'FRS-AVO-4', 4999, 'avocado,fruit'],
      ['Spinach bunch', 'FRS-SPN-1', 1899, 'spinach,vegetable'],
    ]),
    ...rowsFromSeeds('soft-drinks', [
      ['Cola 2L bottle', 'SD-COLA-2L', 2499, 'cola,soda,bottle'],
      ['Orange squash 2L', 'SD-ORA-2L', 2199, 'orange,drink'],
      ['Mineral water 1.5L 6-pack', 'SD-WAT-6', 8999, 'water,bottle'],
      ['Energy drink 4-pack', 'SD-ENG-4', 6499, 'energy,drink,can'],
      ['Ginger beer 2L', 'SD-GIN-2L', 2799, 'ginger,beer,bottle'],
      ['Iced tea peach 1.5L', 'SD-TEA-15', 2999, 'tea,drink'],
      ['Tonic water 1L', 'SD-TON-1L', 1999, 'tonic,bottle'],
      ['Sparkling water 6-pack', 'SD-SPK-6', 7499, 'sparkling,water'],
    ]),
    ...rowsFromSeeds('snacks-pantry', [
      ['Potato chips salted 125g', 'SNK-CHP-125', 1899, 'chips,snack'],
      ['Chocolate bar milk 80g', 'SNK-CHO-80', 2499, 'chocolate,bar'],
      ['Peanut butter smooth 400g', 'SNK-PNB-400', 4599, 'peanut,butter,jar'],
      ['Biscuits cream 200g', 'SNK-BIS-200', 2199, 'biscuits,cookies'],
      ['Instant noodles 5-pack', 'SNK-NOD-5', 3499, 'noodles,pack'],
      ['Trail mix 300g', 'SNK-MIX-300', 3999, 'nuts,snack'],
      ['Popcorn microwave 3-pack', 'SNK-POP-3', 2999, 'popcorn,snack'],
      ['Granola bars 6-pack', 'SNK-GRN-6', 4999, 'granola,bar'],
    ]),
    ...rowsFromSeeds('electronics', [
      ['Budget smartphone 64GB', 'ELC-PHN-64', 359900, 'smartphone,mobile'],
      ['Android tablet 10 inch', 'ELC-TAB-10', 249900, 'tablet,device'],
      ['LED TV 43 inch', 'ELC-TV-43', 599900, 'television,screen'],
      ['Wireless router Wi-Fi 6', 'ELC-RT-6', 129900, 'router,wifi'],
      ['USB-C laptop charger 65W', 'ELC-CHG-65', 89900, 'charger,cable'],
      ['Portable power bank 20000mAh', 'ELC-PBK-20', 69900, 'powerbank,battery'],
      ['Bluetooth keyboard', 'ELC-KBD-BT', 89900, 'keyboard,computer'],
      ['Wireless mouse', 'ELC-MSE-WL', 49900, 'mouse,computer'],
      ['32GB microSD card', 'ELC-SD-32', 29900, 'memory,card'],
      ['HDMI cable 2m', 'ELC-HDMI-2', 19900, 'hdmi,cable'],
      ['Smart watch fitness', 'ELC-WCH-FIT', 149900, 'smartwatch,wearable'],
      ['Webcam 1080p', 'ELC-CAM-1080', 79900, 'webcam,camera'],
    ]),
    ...rowsFromSeeds('audio', [
      ['Wireless earbuds', 'AUD-EAR-WL', 129900, 'earbuds,audio'],
      ['Over-ear headphones', 'AUD-HPH-OE', 199900, 'headphones,audio'],
      ['Bluetooth speaker portable', 'AUD-SPK-BT', 89900, 'speaker,bluetooth'],
      ['Soundbar 2.1 channel', 'AUD-SB-21', 249900, 'soundbar,speaker'],
      ['USB microphone podcast', 'AUD-MIC-USB', 149900, 'microphone,audio'],
      ['Turntable vinyl starter', 'AUD-TT-01', 399900, 'turntable,vinyl'],
    ]),
    ...rowsFromSeeds('accessories', [
      ['Phone case silicone', 'ACC-CASE-01', 29900, 'phone,case'],
      ['Tempered glass screen protector', 'ACC-GLS-01', 19900, 'screen,protector'],
      ['Laptop sleeve 15 inch', 'ACC-SLV-15', 49900, 'laptop,bag'],
      ['Car phone mount magnetic', 'ACC-MNT-CAR', 39900, 'phone,mount,car'],
      ['USB hub 4-port', 'ACC-HUB-4', 59900, 'usb,hub'],
      ['Cable organiser pack', 'ACC-CBL-ORG', 24900, 'cables,organiser'],
    ]),
    ...rowsFromSeeds('home', [
      ['Non-stick frying pan 28cm', 'HOM-PAN-28', 49900, 'frying,pan,kitchen'],
      ['Dinner plate set 12 piece', 'HOM-PLT-12', 89900, 'plates,dinnerware'],
      ['Electric kettle 1.7L', 'HOM-KTL-17', 69900, 'kettle,kitchen'],
      ['Vacuum flask 1L', 'HOM-FLK-1', 39900, 'flask,thermos'],
      ['Bed sheet set queen', 'HOM-SHT-Q', 129900, 'bed,sheets'],
      ['Throw blanket fleece', 'HOM-BLN-FL', 79900, 'blanket,home'],
      ['Desk lamp LED', 'HOM-LMP-LED', 59900, 'lamp,desk'],
      ['Storage boxes 3-pack', 'HOM-BOX-3', 44900, 'storage,box'],
      ['Wall clock modern', 'HOM-CLK-01', 34900, 'clock,wall'],
      ['Coffee maker filter', 'HOM-COF-FLT', 149900, 'coffee,maker'],
    ]),
    ...rowsFromSeeds('cleaning', [
      ['Laundry detergent 3L', 'CLN-DET-3L', 89900, 'detergent,laundry'],
      ['Dishwashing liquid 750ml', 'CLN-DISH-750', 29900, 'dishwashing,liquid'],
      ['Multipurpose cleaner 1L', 'CLN-MP-1L', 34900, 'cleaner,spray'],
      ['Toilet paper 9-roll', 'CLN-TP-9', 89900, 'toilet,paper'],
      ['Sponge scourers 6-pack', 'CLN-SPG-6', 19900, 'sponge,cleaning'],
    ]),
    ...rowsFromSeeds('wine', [
      ['Cabernet Sauvignon 750ml', 'WIN-CAB-750', 18900, 'red,wine,bottle'],
      ['Merlot reserve 750ml', 'WIN-MER-750', 21900, 'red,wine,bottle'],
      ['Sauvignon Blanc 750ml', 'WIN-SB-750', 17900, 'white,wine,bottle'],
      ['Chenin Blanc 750ml', 'WIN-CHN-750', 15900, 'white,wine,bottle'],
      ['Sparkling brut 750ml', 'WIN-SPK-750', 24900, 'champagne,wine,bottle'],
      ['Rosé dry 750ml', 'WIN-ROS-750', 16900, 'rose,wine,bottle'],
      ['Shiraz premium 750ml', 'WIN-SHR-750', 27900, 'red,wine,bottle'],
      ['Pinotage 750ml', 'WIN-PIN-750', 19900, 'red,wine,bottle'],
      ['Moscato sweet 750ml', 'WIN-MOS-750', 14900, 'wine,bottle'],
      ['Box wine red 3L', 'WIN-BOX-3L', 29900, 'wine,box'],
    ]),
    ...rowsFromSeeds('beer', [
      ['Lager 6-pack 330ml', 'BEER-LAG-6', 10900, 'beer,bottle'],
      ['Craft IPA 6-pack', 'BEER-IPA-6', 12900, 'craft,beer,bottle'],
      ['Stout 4-pack 440ml', 'BEER-STO-4', 9900, 'stout,beer,can'],
      ['Cider apple 6-pack', 'BEER-CID-6', 11900, 'cider,bottle'],
      ['Lite beer 12-pack', 'BEER-LIT-12', 18900, 'beer,can'],
      ['Wheat beer 6-pack', 'BEER-WHT-6', 12400, 'beer,bottle'],
      ['Non-alcoholic beer 6-pack', 'BEER-NA-6', 9900, 'beer,bottle'],
    ]),
    ...rowsFromSeeds('spirits', [
      ['Whisky blended 750ml', 'SPI-WHK-750', 44900, 'whisky,bottle'],
      ['Vodka premium 750ml', 'SPI-VOD-750', 39900, 'vodka,bottle'],
      ['Gin dry 750ml', 'SPI-GIN-750', 42900, 'gin,bottle'],
      ['Dark rum 750ml', 'SPI-RUM-750', 37900, 'rum,bottle'],
      ['Brandy VSOP 750ml', 'SPI-BRN-750', 49900, 'brandy,bottle'],
    ]),
    ...rowsFromSeeds('liquor', [
      ['Ready-to-drink gin tonic 4-pack', 'LIQ-RTD-GT-4', 14900, 'gin,tonic,can'],
      ['Wine cooler mixed 6-pack', 'LIQ-WCO-6', 12900, 'wine,cooler,can'],
      ['Premix whiskey cola 4-pack', 'LIQ-WCC-4', 13900, 'whiskey,cola,can'],
      ['Aperitif spritz 750ml', 'LIQ-APR-750', 22900, 'aperitif,bottle'],
      ['Port ruby 750ml', 'LIQ-PRT-750', 26900, 'port,wine,bottle'],
    ]),
  ]

  if (all.length !== 100) {
    throw new Error(`Expected 100 catalog rows, got ${all.length}`)
  }

  const slugs = new Set<string>()
  const skus = new Set<string>()
  for (const r of all) {
    if (!CATALOG_CATEGORY_SLUGS.has(r.categorySlug)) {
      throw new Error(`Unknown category_slug for product ${r.slug}: ${r.categorySlug}`)
    }
    if (slugs.has(r.slug)) throw new Error(`Duplicate slug: ${r.slug}`)
    slugs.add(r.slug)
    const skuKey = r.sku.toLowerCase()
    if (skus.has(skuKey)) throw new Error(`Duplicate sku: ${r.sku}`)
    skus.add(skuKey)
  }

  return all
}

function csvCell(value: string | number): string {
  const s = String(value)
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function buildCatalog100Csv(): string {
  const rows = buildCatalog100Products()
  const header =
    'slug,name,sku,price_cents,compare_at_price_cents,initial_stock,image_url,category_slug,description,delivery_information,return_policy,warranty_info,whats_in_the_box,package_length_mm,package_width_mm,package_height_mm,gross_weight_g,currency'
  const lines = [header]
  for (const r of rows) {
    lines.push(
      [
        r.slug,
        r.name,
        r.sku,
        r.priceCents,
        r.compareAtPriceCents ?? '',
        r.initialStock,
        catalogImageUrl(r.imageTags, r.sku),
        r.categorySlug,
        r.description,
        r.deliveryInformation,
        r.returnPolicy,
        r.warrantyInfo,
        r.whatsInTheBox,
        r.packageLengthMm,
        r.packageWidthMm,
        r.packageHeightMm,
        r.grossWeightG,
        'NAD',
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return `${lines.join('\n')}\n`
}
