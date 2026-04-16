export type HubPaymentCategoryItemDto = {
  id: string
  categorySlug: string
  itemKind: 'business' | 'contact'
  displayName: string
  initials: string | null
  sortOrder: number
  paymentMethod?: string | null
}

export type HubPaymentCategoryItemsResponse = {
  source: string
  items: HubPaymentCategoryItemDto[]
  detail?: string
}
