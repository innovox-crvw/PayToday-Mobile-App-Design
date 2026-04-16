import { useMemo, useState } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { Box, Button, MobileStepper, Stack, Typography } from '@mui/material'
import KeyboardArrowLeft from '@mui/icons-material/KeyboardArrowLeft'
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight'
import { ONBOARDING_GRADIENT, ONBOARDING_PANEL_BG, ONBOARDING_PANEL_BORDER, ONBOARDING_PANEL_SHADOW } from './onboardingBranding'

type Slide = { title: string; subtitle: string }

function safePrefix(pathname: string): string {
  return pathname.startsWith('/embed') ? '/embed' : ''
}

export function IntroCarouselPage() {
  const { pathname } = useLocation()
  const prefix = safePrefix(pathname)

  const slides = useMemo<Slide[]>(
    () => [
      { title: 'Welcome to PayToday', subtitle: 'Your favourite way to pay.' },
      { title: 'Store, services and wallet', subtitle: 'Pay bills, buy vouchers, and manage cards in one place.' },
      { title: 'Safe by design', subtitle: 'Sign in, confirm with PIN, and track every payment.' },
      { title: 'Ready to dive in?', subtitle: 'Sign in to get started.' },
    ],
    [],
  )

  const [active, setActive] = useState(0)

  const isLast = active === slides.length - 1
  const primaryCtaLabel = isLast ? 'Continue' : 'Next'

  function onPrimary() {
    if (!isLast) {
      setActive((v) => Math.min(slides.length - 1, v + 1))
      return
    }
    // Last slide: show explicit options (sign-in / create / guest).
  }

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
      <Stack
        spacing={2.5}
        sx={{
          width: '100%',
          maxWidth: 420,
          borderRadius: 6,
          bgcolor: ONBOARDING_PANEL_BG,
          border: '1px solid',
          borderColor: ONBOARDING_PANEL_BORDER,
          boxShadow: ONBOARDING_PANEL_SHADOW,
          p: { xs: 3, sm: 3.5 },
        }}
      >
        <Stack spacing={0.75}>
          <Typography variant="overline" sx={{ fontWeight: 800, letterSpacing: 0.12, color: 'rgba(15, 23, 42, 0.72)' }}>
            PT INTRO
          </Typography>
          <Typography variant="h4" fontWeight={850} letterSpacing={-0.6} sx={{ lineHeight: 1.1 }}>
            {slides[active]?.title}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.55 }}>
            {slides[active]?.subtitle}
          </Typography>
        </Stack>

        {isLast ? (
          <Stack spacing={1.25}>
            <Button
              component={RouterLink}
              to={`${prefix}/onboarding/loading`}
              variant="contained"
              size="large"
              sx={{ borderRadius: 999, px: 3, fontWeight: 900, py: 1.2 }}
            >
              Sign in
            </Button>
            <Button
              component={RouterLink}
              to={`${prefix}/onboarding/login?mode=register`}
              variant="outlined"
              size="large"
              sx={{ borderRadius: 999, px: 3, fontWeight: 900, py: 1.2 }}
            >
              Create account
            </Button>
            <Button
              component={RouterLink}
              to={`${prefix}/shop`}
              variant="text"
              sx={{ fontWeight: 850, color: 'rgba(15, 23, 42, 0.72)' }}
            >
              Continue as guest
            </Button>
          </Stack>
        ) : (
          <Stack direction="row" spacing={1.25} alignItems="center" justifyContent="space-between">
            <Button
              component={RouterLink}
              to={`${prefix}/shop`}
              variant="text"
              sx={{ fontWeight: 800, color: 'rgba(15, 23, 42, 0.7)' }}
            >
              Skip
            </Button>
            <Button onClick={onPrimary} variant="contained" size="large" sx={{ borderRadius: 999, px: 3, fontWeight: 850 }}>
              {primaryCtaLabel}
            </Button>
          </Stack>
        )}

        <MobileStepper
          steps={slides.length}
          position="static"
          activeStep={active}
          sx={{
            p: 0,
            bgcolor: 'transparent',
            '& .MuiMobileStepper-dot': { bgcolor: 'rgba(15, 23, 42, 0.16)' },
            '& .MuiMobileStepper-dotActive': { bgcolor: 'primary.main' },
          }}
          nextButton={
            <Button
              size="small"
              onClick={() => setActive((v) => Math.min(slides.length - 1, v + 1))}
              disabled={isLast}
              sx={{ fontWeight: 800 }}
              endIcon={<KeyboardArrowRight />}
            >
              Next
            </Button>
          }
          backButton={
            <Button
              size="small"
              onClick={() => setActive((v) => Math.max(0, v - 1))}
              disabled={active === 0}
              sx={{ fontWeight: 800 }}
              startIcon={<KeyboardArrowLeft />}
            >
              Back
            </Button>
          }
        />
      </Stack>
    </Box>
  )
}

