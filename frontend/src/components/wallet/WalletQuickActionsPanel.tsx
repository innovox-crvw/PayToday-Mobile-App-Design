import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, ButtonBase, Card, Typography } from '@mui/material'
import { WALLET_QUICK_ACTION_BG, walletCardSx } from '../../theme/walletTheme'

export type WalletQuickActionItem = {
  to: string
  title: string
  subtitle: string
  icon: ReactNode
}

export function WalletQuickActionsPanel(props: { actions: WalletQuickActionItem[] }) {
  const { actions } = props
  return (
    <Card elevation={0} sx={walletCardSx}>
      <Box sx={{ px: { xs: 1.5, sm: 2.25 }, pt: { xs: 1.5, sm: 2 }, pb: { xs: 0.75, sm: 1 } }}>
        <Typography variant="subtitle1" fontWeight={800} fontSize={{ xs: '0.95rem', sm: '1rem' }}>
          Quick Actions
        </Typography>
      </Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: { xs: 1, sm: 1.25 },
          px: { xs: 1.5, sm: 2 },
          pb: { xs: 1.5, sm: 2 },
        }}
      >
        {actions.map((a) => (
          <ButtonBase
            key={a.to}
            component={RouterLink}
            to={a.to}
            sx={{
              width: 1,
              borderRadius: 2,
              bgcolor: WALLET_QUICK_ACTION_BG,
              color: '#fff',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: { xs: 0.5, sm: 0.75 },
              px: { xs: 0.75, sm: 1.25 },
              py: { xs: 1.25, sm: 1.5 },
              minHeight: { xs: 88, sm: 100 },
              transition: 'filter 0.15s ease',
              '&:hover': { filter: 'brightness(1.06)' },
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                '& .MuiSvgIcon-root': { fontSize: { xs: 26, sm: 28 } },
              }}
            >
              {a.icon}
            </Box>
            <Box sx={{ minWidth: 0, width: 1 }}>
              <Typography
                fontWeight={700}
                sx={{
                  fontSize: { xs: '0.7rem', sm: '0.8rem', md: '0.875rem' },
                  lineHeight: 1.25,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {a.title}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  opacity: 0.88,
                  lineHeight: 1.3,
                  display: { xs: 'none', sm: '-webkit-box' },
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  mt: 0.35,
                  fontSize: { sm: '0.68rem', md: '0.72rem' },
                }}
              >
                {a.subtitle}
              </Typography>
            </Box>
          </ButtonBase>
        ))}
      </Box>
    </Card>
  )
}
