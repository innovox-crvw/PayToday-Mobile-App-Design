import type { ReactNode } from 'react'
import { Divider, Stack, Typography } from '@mui/material'

export type SurfaceSectionProps = {
  title: string
  /** Semantic heading level for the section title */
  titleComponent?: 'h2' | 'h3'
  children: ReactNode
  /** Vertical gap between title row and content (theme spacing units) */
  spacing?: number
  /**
   * `default` — bold h6 section title (legacy pages).
   * `rail` — banking-style: calmer title weight + divider under the heading row.
   */
  variant?: 'default' | 'rail'
  /** When `variant="rail"`, optional small caps line above the title (e.g. "Shortcuts"). */
  eyebrow?: string
}

export function SurfaceSection({
  title,
  titleComponent = 'h2',
  children,
  spacing = 2,
  variant = 'default',
  eyebrow,
}: SurfaceSectionProps) {
  if (variant === 'rail') {
    return (
      <Stack spacing={spacing} component="section" sx={{ minWidth: 0, width: 1 }}>
        <Stack spacing={0.75} sx={{ pb: 0.25 }}>
          {eyebrow ? (
            <Typography
              variant="overline"
              sx={{
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: 'text.secondary',
                lineHeight: 1.2,
              }}
            >
              {eyebrow}
            </Typography>
          ) : null}
          <Typography
            variant="subtitle1"
            component={titleComponent}
            sx={{ fontWeight: 700, letterSpacing: -0.02, lineHeight: 1.35, color: 'text.primary' }}
          >
            {title}
          </Typography>
          <Divider sx={{ borderColor: 'divider', opacity: 0.95 }} />
        </Stack>
        {children}
      </Stack>
    )
  }

  return (
    <Stack spacing={spacing} component="section" sx={{ minWidth: 0, width: 1 }}>
      <Typography variant="h6" component={titleComponent} sx={{ fontWeight: 800, letterSpacing: -0.2, lineHeight: 1.25 }}>
        {title}
      </Typography>
      {children}
    </Stack>
  )
}
