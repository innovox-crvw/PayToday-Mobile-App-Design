import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Box, CircularProgress, Stack } from '@mui/material'
import { AppBrandLogo } from '../../components/brand/AppBrandLogo'
import { ONBOARDING_GRADIENT } from './onboardingBranding'

function safePrefix(pathname: string): string {
  return pathname.startsWith('/embed') ? '/embed' : ''
}

export function OnboardingLoadingPage() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const prefix = safePrefix(pathname)

  useEffect(() => {
    const t = window.setTimeout(() => {
      navigate(`${prefix}/onboarding/login`, { replace: true })
    }, 900)
    return () => window.clearTimeout(t)
  }, [navigate, prefix])

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        background: ONBOARDING_GRADIENT,
        display: 'grid',
        placeItems: 'center',
        px: 2,
        py: 4,
      }}
    >
      <Stack spacing={2} alignItems="center">
        <AppBrandLogo to={prefix || '/'} />
        <CircularProgress thickness={5} size={44} sx={{ color: 'rgba(255,255,255,0.92)' }} />
      </Stack>
    </Box>
  )
}

