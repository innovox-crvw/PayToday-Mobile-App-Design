import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Box, CircularProgress } from '@mui/material'
import { apiFetch } from '../../api/client'

function isStaffRole(role: string | undefined): boolean {
  return role === 'admin' || role === 'ops' || role === 'fulfillment'
}

export function RequireAdminStaff() {
  const [allowed, setAllowed] = useState(false)
  const navigate = useNavigate()
  const loc = useLocation()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch('/api/auth/me')
        if (cancelled) return
        if (!res.ok) {
          const q = new URLSearchParams({ returnTo: `${loc.pathname}${loc.search}` })
          navigate(`/admin/login?${q.toString()}`, { replace: true })
          return
        }
        const data = (await res.json()) as { user?: { role?: string } }
        if (isStaffRole(data.user?.role)) {
          if (!cancelled) setAllowed(true)
          return
        }
        const q = new URLSearchParams({
          returnTo: `${loc.pathname}${loc.search}`,
          needStaff: '1',
        })
        navigate(`/admin/login?${q.toString()}`, { replace: true })
      } catch {
        if (!cancelled) navigate('/admin/login', { replace: true })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loc.pathname, loc.search, navigate])

  if (!allowed) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress />
      </Box>
    )
  }

  return <Outlet />
}
