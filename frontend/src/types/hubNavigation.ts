export type HubNavigationTileDto = {
  slug: string
  label: string
  iconKey: string
  listStyle: 'business' | 'contacts' | null
  linkPath: string
  /** Shown under the tile label (e.g. accepted payment rails). */
  paymentMethodsCaption?: string | null
}
