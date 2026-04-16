import { useLocation } from 'react-router-dom'

export function useStorePathPrefix() {
  const { pathname } = useLocation()
  return pathname.startsWith('/embed') ? '/embed' : ''
}
