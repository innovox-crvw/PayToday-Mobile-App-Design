import type { ReactNode } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'

type Props = {
  title: string
  description?: string
  actionLabel?: string
  actionTo?: string
  children: ReactNode
}

export function WalletSection(props: Props) {
  const { title, description, actionLabel, actionTo, children } = props
  return (
    <Stack spacing={1}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1} sx={{ px: 0.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" fontWeight={800}>
            {title}
          </Typography>
          {description ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35, lineHeight: 1.45 }}>
              {description}
            </Typography>
          ) : null}
        </Box>
        {actionLabel && actionTo ? (
          <Typography
            component={RouterLink}
            to={actionTo}
            variant="body2"
            color="primary"
            sx={{ fontWeight: 700, flexShrink: 0, textDecoration: 'none' }}
          >
            {actionLabel}
          </Typography>
        ) : null}
      </Stack>
      {children}
    </Stack>
  )
}
