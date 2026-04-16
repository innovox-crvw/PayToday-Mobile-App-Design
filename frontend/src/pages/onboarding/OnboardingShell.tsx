import type { PropsWithChildren, ReactNode } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import { ONBOARDING_GRADIENT } from './onboardingBranding'

type Props = PropsWithChildren<{
  title?: ReactNode
  subtitle?: ReactNode
  topRightBrand?: boolean
}>

export function OnboardingShell({ children, title, subtitle, topRightBrand = true }: Props) {
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        background: ONBOARDING_GRADIENT,
        position: 'relative',
        overflow: 'hidden',
        px: { xs: 2, sm: 3, md: 4 },
        py: { xs: 3, md: 4, lg: 5 },
        display: 'grid',
        placeItems: 'center',
        '&:before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(600px 360px at 18% 18%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.00) 58%), radial-gradient(520px 420px at 86% 24%, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.00) 62%), radial-gradient(700px 520px at 60% 92%, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.00) 60%)',
          pointerEvents: 'none',
        },
      }}
    >
      {topRightBrand ? (
        <Typography
          aria-hidden
          sx={{
            position: 'absolute',
            top: 18,
            right: 20,
            color: 'rgba(255,255,255,0.92)',
            fontWeight: 900,
            letterSpacing: 2.2,
            fontSize: 12,
            userSelect: 'none',
          }}
        >
          PAY TODAY
        </Typography>
      ) : null}

      <Box
        sx={{
          width: '100%',
          maxWidth: { xs: 440, sm: 520, md: 920, lg: 980 },
          display: 'grid',
          placeItems: 'center',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: { xs: 420, sm: 460, md: 880, lg: 920 },
            minHeight: 'auto',
            borderRadius: { xs: 2, md: 3 },
            px: { xs: 2.5, sm: 3.25, md: 4, lg: 4.5 },
            py: { xs: 3.25, md: 3.75, lg: 4.25 },
            color: '#fff',
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 45%, rgba(0,0,0,0.10) 100%)',
            border: { xs: '1px solid rgba(255,255,255,0.12)', md: '1px solid rgba(255,255,255,0.16)' },
            boxShadow: { xs: '0 12px 40px rgba(0,0,0,0.18)', md: '0 32px 96px rgba(0,0,0,0.38)' },
            position: 'relative',
            overflow: 'hidden',
            '&:before': {
              content: '""',
              position: 'absolute',
              inset: -2,
              background:
                'radial-gradient(220px 220px at 18% 18%, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 60%), radial-gradient(280px 280px at 85% 10%, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 66%), radial-gradient(260px 260px at 70% 75%, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 64%)',
              pointerEvents: 'none',
            },
          }}
        >
          <Stack spacing={{ xs: 2.5, md: 3 }} sx={{ position: 'relative', zIndex: 1 }}>
            {title ? (
              <Stack spacing={1}>
                <Typography
                  variant="h4"
                  component="h1"
                  fontWeight={900}
                  letterSpacing={{ xs: -0.5, sm: -0.65 }}
                  sx={{
                    lineHeight: 1.06,
                    fontSize: { xs: '1.65rem', sm: '1.85rem', md: '2rem' },
                    textWrap: 'balance',
                  }}
                >
                  {title}
                </Typography>
                {subtitle ? (
                  <Typography
                    sx={{
                      color: 'rgba(255,255,255,0.78)',
                      lineHeight: 1.55,
                      fontWeight: 500,
                    fontSize: { xs: '0.9375rem', md: '1rem' },
                    maxWidth: { xs: '36ch', md: '52ch' },
                  }}
                  >
                    {subtitle}
                  </Typography>
                ) : null}
              </Stack>
            ) : null}

            {children}
          </Stack>
        </Box>
      </Box>
    </Box>
  )
}

