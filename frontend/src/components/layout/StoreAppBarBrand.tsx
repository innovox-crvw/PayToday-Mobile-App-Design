import { Link as RouterLink } from 'react-router-dom'
import { Box, Typography } from '@mui/material'

const focusRing = {
  '&:focus-visible': {
    outline: '2px solid rgba(255,255,255,0.95)',
    outlineOffset: 2,
    borderRadius: 1,
  },
} as const

export function StoreAppBarBrand({ homePath }: { homePath: string }) {
  return (
    <>
      <Typography
        component={RouterLink}
        to={homePath}
        variant="h6"
        sx={{
          fontWeight: 800,
          letterSpacing: 1,
          color: '#fff',
          textDecoration: 'none',
          mr: 1,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          ...focusRing,
        }}
      >
        PAY
        <Box
          component="span"
          sx={{
            border: '2px solid #fff',
            px: 1,
            py: 0.25,
            borderRadius: 1,
            letterSpacing: 2,
          }}
        >
          TODAY
        </Box>
      </Typography>
    </>
  )
}
