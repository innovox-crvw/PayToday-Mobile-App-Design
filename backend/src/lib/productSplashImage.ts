import { createHash } from 'node:crypto'

/**
 * Match product name + slug to one stock-photo subject (first match wins — most specific rules first).
 * Tags are a single primary object so loremflickr returns the right item, not generic "electronics".
 */
const PRODUCT_TYPE_RULES: { re: RegExp; tag: string }[] = [
  { re: /\bsound\s*bar\b|\bsoundbar\b/i, tag: 'soundbar' },
  { re: /\bhome\s*theatre\b|\bhome\s*theater\b/i, tag: 'speakers' },
  { re: /\bbluetooth\s*speaker\b/i, tag: 'bluetooth,speaker' },
  { re: /\bspeaker\b/i, tag: 'speaker' },
  { re: /\bheadphones?\b|\bearphones?\b/i, tag: 'headphones' },
  { re: /\btv\s*stand\b|\btelevision\s*stand\b/i, tag: 'tv,stand' },
  { re: /\btelevision\b|\bsmart\s*tv\b/i, tag: 'television' },
  { re: /\bwashing\s*machine\b/i, tag: 'washing,machine' },
  { re: /\btumble\s*dryer\b|\bclothes\s*dryer\b/i, tag: 'tumble,dryer' },
  { re: /\brefrigerator\b|\bfridge\b/i, tag: 'refrigerator' },
  { re: /\bmicrowave\b/i, tag: 'microwave,oven' },
  { re: /\boven\b/i, tag: 'kitchen,oven' },
  { re: /\belectric\s*kettle\b|\bkettle\b/i, tag: 'electric,kettle' },
  { re: /\btoaster\b/i, tag: 'toaster' },
  { re: /\bclothes\s*iron\b|\bsteam\s*iron\b|\biron\b/i, tag: 'clothes,iron' },
  { re: /\bmattress\b/i, tag: 'mattress' },
  { re: /\bbed\s*frame\b|\bplatform\s*bed\b/i, tag: 'bed,frame' },
  { re: /\bheadboard\b/i, tag: 'headboard,bed' },
  { re: /\bdressing\s*table\b/i, tag: 'dressing,table' },
  { re: /\bnight\s*stand\b|\bnightstand\b/i, tag: 'nightstand' },
  { re: /\bwardrobe\b|\bcloset\b/i, tag: 'wardrobe' },
  { re: /\bbookshelf\b|\bbook\s*shelf\b/i, tag: 'bookshelf' },
  { re: /\bstudy\s*desk\b|\bwriting\s*desk\b|\boffice\s*desk\b/i, tag: 'desk' },
  { re: /\bdesk\s*lamp\b|\btable\s*lamp\b/i, tag: 'desk,lamp' },
  { re: /\bcoffee\s*table\b/i, tag: 'coffee,table' },
  { re: /\bdining\s*table\b/i, tag: 'dining,table' },
  { re: /\bdining\s*chair\b/i, tag: 'dining,chair' },
  { re: /\barmchair\b/i, tag: 'armchair' },
  { re: /\baccent\s*chair\b/i, tag: 'accent,chair' },
  { re: /\bsofa\b|\bcouch\b|\bsettee\b/i, tag: 'sofa' },
  { re: /\bsideboard\b|\bbuffet\s*cabinet\b/i, tag: 'sideboard' },
  { re: /\barea\s*rug\b|\brug\b/i, tag: 'rug' },
  { re: /\bextendable\b.*\btable\b/i, tag: 'extendable,dining,table' },
  { re: /\bglass\s*table\b/i, tag: 'glass,coffee,table' },
  { re: /\bbamboo\b.*\bnightstand\b/i, tag: 'nightstand' },
  { re: /\brolled\s*oats\b|\boats\b/i, tag: 'oats,cereal' },
  { re: /\bcoffee\s*beans\b/i, tag: 'coffee,beans' },
  { re: /\bapple\s*juice\b|\bjuice\b/i, tag: 'fruit,juice' },
  { re: /\bbanana\s*chips\b|\bchips\b/i, tag: 'banana,snacks' },
  { re: /\bcabernet\b|\bmerlot\b|\bshiraz\b|\bred\s*wine\b/i, tag: 'red,wine,bottle' },
  { re: /\bwhite\s*wine\b|\bchardonnay\b/i, tag: 'white,wine,bottle' },
  { re: /\bchampagne\b/i, tag: 'champagne,bottle' },
  { re: /\bgin\b/i, tag: 'gin,bottle' },
  { re: /\bvodka\b/i, tag: 'vodka,bottle' },
  { re: /\bwhisky\b|\bwhiskey\b|\bbrandy\b/i, tag: 'whisky,bottle' },
  { re: /\blager\b|\bcraft\s*beer\b|\bbeer\b/i, tag: 'beer,bottle' },
  { re: /\bcider\b/i, tag: 'cider,bottle' },
  { re: /\bwine\b/i, tag: 'wine,bottle' },
  { re: /\bsmartphone\b|\bmobile\s*phone\b/i, tag: 'smartphone' },
  { re: /\blaptop\b/i, tag: 'laptop' },
  { re: /\btablet\b/i, tag: 'tablet' },
  { re: /\bmonitor\b/i, tag: 'computer,monitor' },
]

const BRAND_WORDS =
  /\b(alpine|samsung|lg|kic|defy|hisense|whirlpool|gommagomma|cloud|nine|restonic|house|brand|nictus|csv|demo|test|pro|max|plus|mini|catalog|shelf|item|hh-[a-z]{2})\b/gi

/** Detect primary object tag from combined name + slug text. */
export function detectPrimaryProductTag(name: string, productSlug?: string | null): string | null {
  const hay = `${name} ${productSlug ?? ''}`.replace(BRAND_WORDS, ' ')
  for (const { re, tag } of PRODUCT_TYPE_RULES) {
    if (re.test(hay)) return tag
  }
  return null
}

/** Flickr search string: one product subject + studio hint (max 3 comma groups). */
export function buildFlickrTags(input: {
  name: string
  categorySlug?: string | null
  categoryName?: string | null
  productSlug?: string | null
}): string {
  const primary = detectPrimaryProductTag(input.name, input.productSlug)
  if (primary) {
    return `${primary},product,studio`
  }

  const slug = (input.categorySlug ?? '').trim().toLowerCase()
  const categoryFallback: Record<string, string> = {
    electronics: 'electronic,device,product',
    groceries: 'grocery,packaged,food',
    home: 'home,appliance,product',
    liquor: 'alcohol,bottle,product',
    wine: 'wine,bottle',
    beer: 'beer,bottle',
  }
  const fallback = categoryFallback[slug] ?? 'retail,product,studio'
  const words = input.name
    .toLowerCase()
    .replace(BRAND_WORDS, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .slice(0, 2)
  if (words.length > 0) {
    return `${words.join(',')},product,studio`
  }
  return fallback
}

/** Stable lock seed — unique per product so two "kettle" SKUs get different photos. */
export function flickrLockSeed(productId: string): number {
  const hex = createHash('sha256').update(productId).digest('hex').slice(0, 8)
  return Number.parseInt(hex, 16) % 2_000_000_000
}

export function buildProductSplashImageUrl(productId: string, tags: string, size = 800): string {
  const lock = flickrLockSeed(productId)
  const encoded = encodeURIComponent(tags)
  return `https://loremflickr.com/${size}/${size}/${encoded}?lock=${lock}`
}

const PLACEHOLDER_HINTS = [
  'placeholder',
  'picsum',
  'loremflickr',
  'placehold',
  'dummyimage',
  'via.placeholder',
  'unsplash.it',
  'source.unsplash',
  'data:image',
  'no-image',
  'default-product',
]

export function isWeakProductImageUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return true
  const u = url.trim().toLowerCase()
  if (PLACEHOLDER_HINTS.some((h) => u.includes(h))) return true
  return false
}

export function buildSplashAttributionNote(tags: string): string {
  return `Product photo matched to: ${tags} (loremflickr.com). Replace with your own pack shot when ready.`
}
