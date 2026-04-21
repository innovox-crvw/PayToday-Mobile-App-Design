import { Navigate, useLocation } from 'react-router-dom'

/** Store account settings now live under **My account** (`/profile`). This route stays for bookmarks and checkout copy. */
export function AccountPage() {
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  return <Navigate to={`${pathPrefix}/profile`} replace />
}
