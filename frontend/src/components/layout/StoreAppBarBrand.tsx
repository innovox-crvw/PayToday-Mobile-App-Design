import { AppBrandLogo } from '../brand/AppBrandLogo'

/** Store chrome: same logo mark as payments / home hero (compact in mobile bar). */
export function StoreAppBarBrand({ homePath, compact }: { homePath: string; compact?: boolean }) {
  return <AppBrandLogo to={homePath} compact={compact} />
}
