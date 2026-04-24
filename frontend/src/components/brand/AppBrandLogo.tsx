import { Link as RouterLink } from 'react-router-dom'
import { Box, Typography } from '@mui/material'
import { APP_DISPLAY_NAME } from '../../theme/branding'

const brandLogoSrc = `${import.meta.env.BASE_URL}brand-logo.png`

const focusRing = {
  '&:focus-visible': {
    outline: '2px solid rgba(255,255,255,0.95)',
    outlineOffset: 2,
    borderRadius: 1,
  },
} as const

type AppBrandLogoProps = {
  to: string
  compact?: boolean
  /** `onDark`: purple / gradient headers. `onLight`: e.g. onboarding login backdrop. */
  wordmarkTone?: 'onDark' | 'onLight'
}

/** Header / nav: logo mark + AvoToday wordmark. */
export function AppBrandLogo({ to, compact, wordmarkTone = 'onDark' }: AppBrandLogoProps) {
  const wordmarkColor = wordmarkTone === 'onLight' ? '#5B21D6' : 'rgba(255,255,255,0.96)'

  return (
    <Box
      component={RouterLink}
      to={to}
      aria-label={`${APP_DISPLAY_NAME} home`}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 0.75 : 1,
        textDecoration: 'none',
        lineHeight: 0,
        flexShrink: 0,
        ...focusRing,
      }}
    >
      <Box
        component="img"
        src={brandLogoSrc}
        alt=""
        sx={{
          height: compact ? 28 : 34,
          width: 'auto',
          maxWidth: compact ? 120 : 140,
          display: 'block',
          objectFit: 'contain',
        }}
      />
      <Typography
        component="span"
        sx={{
          color: wordmarkColor,
          fontWeight: 800,
          letterSpacing: compact ? -0.02 : -0.03,
          fontSize: compact ? '0.9375rem' : '1.0625rem',
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {APP_DISPLAY_NAME}
      </Typography>
    </Box>
  )
}
