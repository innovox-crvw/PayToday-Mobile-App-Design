import type { ReactNode } from 'react'
import type { SxProps, Theme } from '@mui/material/styles'
import { Paper, Stack, Typography } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import { SURFACE_BORDER, SURFACE_SHADOW } from '../../theme/branding'

export type ShopPageSectionAccent = 'primary' | 'neutral'

export function ShopPageSection(props: {
  title: string
  subtitle?: string
  children: ReactNode
  anchorId?: string
  accent?: ShopPageSectionAccent
  paperSx?: SxProps<Theme>
}) {
  const { title, subtitle, children, anchorId, accent = 'neutral', paperSx } = props
  const theme = useTheme()
  const accentColor = accent === 'primary' ? theme.palette.primary.main : theme.palette.divider
  const surfaceTint = accent === 'primary' ? 0.04 : 0.02

  return (
    <Paper
      id={anchorId}
      component="section"
      variant="outlined"
      elevation={0}
      sx={{
        borderRadius: 3,
        border: `1px solid ${SURFACE_BORDER}`,
        borderLeft: `3px solid ${accentColor}`,
        bgcolor: alpha(theme.palette.primary.main, surfaceTint),
        boxShadow: SURFACE_SHADOW,
        overflow: 'hidden',
        ...paperSx,
      }}
    >
      <Stack spacing={1.5} sx={{ p: { xs: 1.75, sm: 2.25 } }}>
        <Stack spacing={0.5}>
          <Typography component="h2" variant="subtitle1" fontWeight={800} letterSpacing={-0.2}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55, maxWidth: 720 }}>
              {subtitle}
            </Typography>
          ) : null}
        </Stack>
        {children}
      </Stack>
    </Paper>
  )
}
