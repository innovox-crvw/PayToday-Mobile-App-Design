import type { ReactNode } from 'react'
import { Stack, Typography } from '@mui/material'

export type SurfaceSectionProps = {
  title: string
  /** Semantic heading level for the section title */
  titleComponent?: 'h2' | 'h3'
  children: ReactNode
  /** Vertical gap between title row and content (theme spacing) */
  spacing?: number
}

export function SurfaceSection({ title, titleComponent = 'h2', children, spacing = 2 }: SurfaceSectionProps) {
  return (
    <Stack spacing={spacing} component="section">
      <Typography variant="h6" component={titleComponent} sx={{ fontWeight: 800, letterSpacing: -0.2, lineHeight: 1.25 }}>
        {title}
      </Typography>
      {children}
    </Stack>
  )
}
