import type { ReactNode } from 'react'
import { Box, Stack, Typography } from '@mui/material'

export type PageHeaderProps = {
  title: string
  subtitle?: string
  overline?: string
  /** Primary heading level for accessibility */
  titleComponent?: 'h1' | 'h2'
  titleVariant?: 'h3' | 'h4' | 'h5'
  action?: ReactNode
  breadcrumbs?: ReactNode
  align?: 'left' | 'center'
}

export function PageHeader({
  title,
  subtitle,
  overline,
  titleComponent = 'h1',
  titleVariant = 'h4',
  action,
  breadcrumbs,
  align = 'left',
}: PageHeaderProps) {
  const textAlign = align === 'center' ? { xs: 'center', md: 'center' } : { xs: 'center', md: 'left' }
  const mx = align === 'center' ? { xs: 'auto', md: 'auto' } : { xs: 'auto', md: 0 }

  return (
    <Stack spacing={1.25} sx={{ textAlign, alignItems: align === 'center' ? 'center' : { xs: 'center', md: 'stretch' } }}>
      {breadcrumbs ? <Box sx={{ width: 1, textAlign: { xs: 'center', md: 'left' } }}>{breadcrumbs}</Box> : null}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        alignItems={{ xs: 'center', sm: 'flex-start' }}
        justifyContent="space-between"
        sx={{ width: 1, gap: 1.5 }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {overline ? (
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
              {overline}
            </Typography>
          ) : null}
          <Typography variant={titleVariant} component={titleComponent} fontWeight={800} letterSpacing={-0.35}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, maxWidth: 520, mx }}>
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        {action ? (
          <Box sx={{ flexShrink: 0, alignSelf: { xs: 'center', sm: 'flex-start' } }}>{action}</Box>
        ) : null}
      </Stack>
    </Stack>
  )
}
