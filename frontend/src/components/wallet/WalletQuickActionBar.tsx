import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, ButtonBase, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'

export type WalletQuickAction = {
  key: string
  label: string
  icon: ReactNode
  to?: string
  onClick?: () => void
}

export function WalletQuickActionBar(props: { actions: WalletQuickAction[] }) {
  const { actions } = props
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1,
        overflowX: 'auto',
        pb: 0.5,
        mx: { xs: -0.5, sm: 0 },
        px: { xs: 0.5, sm: 0 },
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
      }}
    >
      {actions.map((a) => {
        const inner = (
          <Stack
            alignItems="center"
            spacing={0.75}
            sx={{
              minWidth: 76,
              py: 1.25,
              px: 1,
              borderRadius: 2.5,
              border: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
              boxShadow: '0 4px 14px rgba(15, 23, 42, 0.06)',
            }}
          >
            <Box
              sx={(t) => ({
                width: 40,
                height: 40,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: alpha(t.palette.primary.main, 0.1),
                color: 'primary.main',
              })}
            >
              {a.icon}
            </Box>
            <Typography variant="caption" fontWeight={700} textAlign="center" sx={{ lineHeight: 1.2 }}>
              {a.label}
            </Typography>
          </Stack>
        )
        if (a.to) {
          return (
            <ButtonBase
              key={a.key}
              component={RouterLink}
              to={a.to}
              sx={{ borderRadius: 2.5, flexShrink: 0 }}
            >
              {inner}
            </ButtonBase>
          )
        }
        return (
          <ButtonBase key={a.key} onClick={a.onClick} sx={{ borderRadius: 2.5, flexShrink: 0 }}>
            {inner}
          </ButtonBase>
        )
      })}
    </Box>
  )
}
