import { Navigate } from 'react-router-dom'
import { useStorePathPrefix } from './profilePaths'

/** `/profile` → personal information (account hub). */
export function ProfileHubPage() {
  const prefix = useStorePathPrefix()
  return <Navigate to={`${prefix}/profile/personal`} replace />
}
