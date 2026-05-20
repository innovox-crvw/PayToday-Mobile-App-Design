export type AccountNavId =
  | 'personal'
  | 'addresses'
  | 'billing'
  | 'orders'
  | 'settings'
  | 'support'
  | 'legal'
  | 'feedback'
  | 'delete-account'

export type AccountNavItem = {
  id: AccountNavId
  label: string
  /** Profile-relative (`personal`) or store-root (`../wallet`). */
  path: string
  authOnly?: boolean
  danger?: boolean
  section?: 'primary' | 'more'
}

export const ACCOUNT_NAV_ITEMS: AccountNavItem[] = [
  { id: 'personal', label: 'Personal information', path: 'personal', authOnly: true, section: 'primary' },
  { id: 'addresses', label: 'Addresses', path: 'addresses', authOnly: true, section: 'primary' },
  { id: 'billing', label: 'Billing & payments', path: '../wallet', section: 'primary' },
  { id: 'orders', label: 'Order history', path: '../orders', section: 'primary' },
  { id: 'settings', label: 'Settings', path: 'settings', authOnly: true, section: 'primary' },
  { id: 'support', label: 'Support', path: 'support', section: 'more' },
  { id: 'legal', label: 'Legal', path: 'legal', section: 'more' },
  { id: 'feedback', label: 'Feedback', path: 'feedback', section: 'more' },
  { id: 'delete-account', label: 'Delete account', path: 'delete-account', authOnly: true, danger: true, section: 'more' },
]

export function resolveAccountNavHref(prefix: string, item: AccountNavItem): string {
  if (item.path.startsWith('../')) {
    const rest = item.path.slice(3)
    return prefix ? `${prefix}/${rest}` : `/${rest}`
  }
  return prefix ? `${prefix}/profile/${item.path}` : `/profile/${item.path}`
}

export function isAccountNavActive(pathname: string, item: AccountNavItem, prefix: string): boolean {
  if (item.id === 'billing') return pathname.includes('/wallet')
  if (item.id === 'orders') return /\/orders(\/|$)/.test(pathname)
  const href = resolveAccountNavHref(prefix, item)
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function formatDobDisplay(iso: string | null | undefined): string {
  if (!iso?.trim()) return 'Not set'
  const d = new Date(`${iso.trim()}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso.trim()
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
}

export function formatUiLanguageDisplay(code: string): string {
  const c = code.trim()
  if (!c || c === 'en') return 'English'
  if (c === 'af') return 'Afrikaans'
  return c
}
