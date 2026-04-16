import type { ConnectionPool } from 'mssql'

export type HubNavigationKind = 'payments' | 'services'

export type HubNavigationTileRow = {
  slug: string
  label: string
  iconKey: string
  listStyle: 'business' | 'contacts' | null
  linkPath: string
  /** Short line under the tile label, e.g. "Wallet · Card · USSD". */
  paymentMethodsCaption?: string | null
}

type DbRow = {
  slug: string
  label: string
  icon_key: string
  list_style: string | null
  link_path: string
  sort_order: number
  payment_methods_caption?: string | null
}

function mapListStyle(listStyle: string | null, kind: HubNavigationKind): 'business' | 'contacts' | null {
  if (kind === 'services') return null
  const s = listStyle?.trim().toLowerCase()
  if (s === 'contacts') return 'contacts'
  if (s === 'business') return 'business'
  return 'business'
}

export async function listHubNavigationTiles(
  pool: ConnectionPool,
  kind: HubNavigationKind,
): Promise<HubNavigationTileRow[]> {
  const r = await pool.request().input('kind', kind).query<DbRow>(
    `SELECT slug,
            label,
            icon_key,
            list_style,
            link_path,
            sort_order,
            payment_methods_caption
     FROM dbo.hub_navigation_tiles
     WHERE hub_kind = @kind AND is_active = 1
     ORDER BY sort_order, label`,
  )
  return r.recordset.map((row) => ({
    slug: row.slug,
    label: row.label,
    iconKey: row.icon_key,
    listStyle: mapListStyle(row.list_style, kind),
    linkPath: row.link_path.replace(/^\//u, ''),
    paymentMethodsCaption: row.payment_methods_caption?.trim() || null,
  }))
}
