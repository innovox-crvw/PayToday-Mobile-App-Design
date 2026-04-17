const STORAGE_KEY = 'pt_recent_svc_cat_pay_v3'

/** Max recent shortcuts stored and shown on the store home “Recent” row. */
export const MAX_RECENT_VISIT_ITEMS = 5

export type RecentVisitRecord = {
  dedupeKey: string
  /** Path without `/embed`. */
  relPath: string
  label: string
  at: number
}

function normalizeRelPath(path: string): string {
  let p = path.startsWith('/') ? path : `/${path}`
  p = p.replace(/^\/embed(?=\/|$)/, '') || '/'
  return p === '' ? '/' : p
}

function titleCaseSlug(slug: string | null | undefined): string {
  return (slug ?? '')
    .split(/[-_]/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function isHomeRelPath(relPath: string): boolean {
  const p = normalizeRelPath(relPath)
  return p === '/' || p === ''
}

export function recordRecentVisit(input: { dedupeKey: string; relPath: string; label: string }) {
  const relPath = normalizeRelPath(input.relPath)
  const label = input.label.trim().slice(0, 96)
  if (!label || isHomeRelPath(relPath)) return

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list: RecentVisitRecord[] = raw ? JSON.parse(raw) : []
    if (!Array.isArray(list)) return

    const next = list.filter((x) => x.dedupeKey !== input.dedupeKey)
    next.unshift({
      dedupeKey: input.dedupeKey,
      relPath,
      label,
      at: Date.now(),
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, MAX_RECENT_VISIT_ITEMS)))
    window.dispatchEvent(new Event('pt-recent-visits-updated'))
  } catch {
    /* storage full / disabled */
  }
}

export function getRecentVisits(): RecentVisitRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as RecentVisitRecord[]
    if (!Array.isArray(list)) return []
    return list.filter((r) => !isHomeRelPath(r.relPath) && r.dedupeKey !== 'home')
  } catch {
    return []
  }
}

/** Build router `to` for current shell (`/embed` vs root). */
export function recentVisitLink(relPath: string, pathPrefix: string): string {
  const p = normalizeRelPath(relPath)
  if (pathPrefix === '/embed') return `/embed${p}`
  return p
}

/**
 * Only **leaf** destinations: shop **category** filter, a **service** sub-route (not `/services` hub),
 * and **payment category** (not `/payments` hub). Home (`/` or `/embed` root), Wallet, etc. are never recorded.
 */
export function parseLocationForRecent(
  pathname: string,
  search: string,
): { dedupeKey: string; relPath: string; label: string } | null {
  const rawBase = pathname.replace(/^\/embed(?=\/|$)/, '') || '/'
  const norm = rawBase === '' ? '/' : rawBase

  /* App / embed root — never Recent */
  if (norm === '/' || norm === '') return null

  if (norm === '/shop') {
    const q = new URLSearchParams(search)
    const cat = q.get('category')?.trim() ?? ''
    if (!cat) return null
    const dedupeKey = `shop:category:${cat}`
    const relPath = `/shop${search}`
    return { dedupeKey, relPath, label: titleCaseSlug(cat) }
  }

  if (norm.startsWith('/shop/') && norm !== '/shop') return null

  if (norm === '/services' || norm === '/services/') return null
  if (norm.startsWith('/services/')) {
    const seg = norm.slice('/services/'.length).split('/').filter(Boolean)[0] ?? ''
    if (!seg) return null
    const titled: Record<string, string> = {
      water: 'Water',
      insurance: 'Insurance',
      ussd: 'USSD',
    }
    const label =
      titled[seg] ?? seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    return { dedupeKey: `services:${seg}`, relPath: norm.split('?')[0] ?? norm, label }
  }

  if (norm === '/payments' || norm === '/payments/') return null
  if (norm.startsWith('/payments/')) {
    const parts = norm.split('/').filter(Boolean)
    const id =
      parts[1] === 'category' && parts[2]
        ? parts[2]
        : parts[1] && parts[1] !== 'category'
          ? parts[1]
          : ''
    if (!id) return null
    const relPath = `/payments/${id}`
    return {
      dedupeKey: `payments:${id}`,
      relPath,
      label: titleCaseSlug(id),
    }
  }

  return null
}
