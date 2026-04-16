/** Fired after payment capture or other inventory change so shop/product UIs refetch stock. */
export const PT_CATALOG_UPDATED = 'pt-catalog-updated'

export function notifyCatalogInventoryMaybeChanged(): void {
  window.dispatchEvent(new Event(PT_CATALOG_UPDATED))
}
