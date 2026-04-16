import { useMemo } from 'react'
import { Link as RouterLink, useLocation, useSearchParams } from 'react-router-dom'
import { Button, Stack, Typography } from '@mui/material'
import { OnboardingShell } from './OnboardingShell'

function safePrefix(pathname: string): string {
  return pathname.startsWith('/embed') ? '/embed' : ''
}

function safeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith('/')) return '/shop'
  if (raw.startsWith('/admin')) return '/shop'
  if (raw.startsWith('/onboarding')) return '/shop'
  return raw
}

export function OnboardingPermissionsPage() {
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const prefix = safePrefix(pathname)
  const returnTo = useMemo(() => safeReturnTo(searchParams.get('returnTo')), [searchParams])

  return (
    <OnboardingShell title="App Permissions Screen" subtitle="(Placeholder for mobile permission prompts)">
      <Stack spacing={2.25} alignItems="center" textAlign="center" sx={{ py: 10 }}>
        <Typography sx={{ color: 'rgba(255,255,255,0.82)', fontWeight: 750 }}>
          Login → App Permissions → Add a Card
        </Typography>
      </Stack>

      <Button
        component={RouterLink}
        to={`${prefix}/onboarding/add-card?returnTo=${encodeURIComponent(returnTo)}`}
        variant="contained"
        size="large"
        sx={{
          borderRadius: 999,
          fontWeight: 900,
          py: 1.15,
          mt: 1,
          bgcolor: 'rgba(34, 211, 238, 0.95)',
          color: 'rgba(10, 10, 40, 0.92)',
          '&:hover': { bgcolor: 'rgba(34, 211, 238, 1)' },
        }}
      >
        Continue
      </Button>

      <Button component={RouterLink} to={`${prefix}${returnTo}`} variant="text" sx={{ fontWeight: 850, color: 'rgba(255,255,255,0.78)', alignSelf: 'center', mt: 0.5 }}>
        Skip for now
      </Button>
    </OnboardingShell>
  )
}

