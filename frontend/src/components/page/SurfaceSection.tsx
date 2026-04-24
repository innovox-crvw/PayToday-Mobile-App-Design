import type { ReactNode } from 'react'
import { Box, Divider, Stack, Typography } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'

export type SurfaceSectionProps = {
  title: string
  /** Optional right-aligned control (e.g. “View more” link). */
  action?: ReactNode
  /** Semantic heading level for the section title */
  titleComponent?: 'h2' | 'h3'
  /** Merged into the section title `Typography` `sx` (default variant). */
  titleSx?: SxProps<Theme>
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
  action,
  titleComponent = 'h2',
  titleSx,
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
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1} sx={{ minWidth: 0 }}>
            <Typography
              variant="subtitle1"
              component={titleComponent}
              sx={{
                fontWeight: 700,
                letterSpacing: -0.02,
                lineHeight: 1.35,
                color: 'text.primary',
                flex: '1 1 auto',
                minWidth: 0,
                ...titleSx,
              }}
            >
              {title}
            </Typography>
            {action ? <Box sx={{ flexShrink: 0, pt: 0.125 }}>{action}</Box> : null}
          </Stack>
          <Divider sx={{ borderColor: 'divider', opacity: 0.95 }} />
        </Stack>
        {children}
      </Stack>
    )
  }

  return (
    <Stack spacing={spacing} component="section" sx={{ minWidth: 0, width: 1 }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1.5} sx={{ minWidth: 0 }}>
        <Typography
          variant="h6"
          component={titleComponent}
          sx={{
            fontWeight: 800,
            letterSpacing: -0.2,
            lineHeight: 1.25,
            color: 'text.primary',
            flex: '1 1 auto',
            minWidth: 0,
            ...titleSx,
          }}
        >
          {title}
        </Typography>
        {action ? <Box sx={{ flexShrink: 0, pt: 0.25 }}>{action}</Box> : null}
      </Stack>
      {children}
    </Stack>
  )
}
