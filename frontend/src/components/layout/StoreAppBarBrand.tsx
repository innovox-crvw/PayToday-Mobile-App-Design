import { Link as RouterLink } from 'react-router-dom'
import { Box, Typography } from '@mui/material'

const focusRing = {
  '&:focus-visible': {
    outline: '2px solid rgba(255,255,255,0.95)',
    outlineOffset: 2,
    borderRadius: 1,
  },
} as const

export function StoreAppBarBrand({ homePath, compact }: { homePath: string; compact?: boolean }) {
  return (
    <Typography
      component={RouterLink}
      to={homePath}
      variant={compact ? 'subtitle1' : 'h6'}
      sx={{
        fontWeight: 800,
        letterSpacing: compact ? 0.6 : 1,
        color: '#fff',
        textDecoration: 'none',
        mr: compact ? 0.5 : 0,
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 0.5 : 0.75,
        fontSize: compact ? '0.95rem' : undefined,
        flexShrink: 0,
        textShadow: compact ? undefined : '0 1px 2px rgba(15, 23, 42, 0.2)',
        ...focusRing,
      }}
    >
      PAY
      <Box
        component="span"
        sx={{
          border: compact ? '1.5px solid #fff' : '2px solid #fff',
          px: compact ? 0.65 : 1,
          py: compact ? 0.15 : 0.25,
          borderRadius: 1,
          letterSpacing: compact ? 1.25 : 2,
          fontSize: compact ? '0.8rem' : undefined,
        }}
      >
        TODAY
      </Box>
    </Typography>
  )
}
