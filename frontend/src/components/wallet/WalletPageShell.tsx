import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, IconButton, Stack, Typography } from '@mui/material'
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew'
import { useLocation, useNavigate } from 'react-router-dom'
import { APP_WALLET_DISPLAY_NAME } from '../../theme/branding'
import { WALLET_RAIL_MAX_WIDTH, WALLET_SECTION_GAP } from '../../theme/walletTheme'

type Props = {
  children: ReactNode
  /** Home hub vs inner wallet page */
  variant?: 'home' | 'sub'
  title?: string
  subtitle?: string
  showBack?: boolean
  backTo?: string
  rightSlot?: ReactNode
}

export function WalletPageShell(props: Props) {
  const { children, variant = 'sub', title, subtitle, showBack, backTo, rightSlot } = props
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const walletRoot = pathname.startsWith('/embed') ? '/embed/wallet' : '/wallet'

  const isHome = variant === 'home'
  const displayTitle = title ?? (isHome ? APP_WALLET_DISPLAY_NAME : '')

  return (
    <Stack
      spacing={WALLET_SECTION_GAP}
      sx={{
        maxWidth: isHome ? 'none' : WALLET_RAIL_MAX_WIDTH,
        mx: isHome ? 0 : 'auto',
        pb: { xs: 4, md: 3 },
        width: '100%',
        minWidth: 0,
        ...(isHome
          ? {
              ml: { xs: -2, sm: -3, md: -4, lg: -5 },
              mr: { xs: -2, sm: -3, md: -4, lg: -5 },
              pl: { xs: 2, sm: 3, md: 4, lg: 5 },
              pr: { xs: 2, sm: 3, md: 4, lg: 5 },
              boxSizing: 'border-box',
            }
          : {}),
      }}
    >
      {isHome ? null : (
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.5}
          sx={{
            py: 0.5,
            px: { xs: 0.25, sm: 0 },
          }}
        >
          {showBack ? (
            <IconButton
              onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
              aria-label="Back"
              size="medium"
              sx={{ flexShrink: 0 }}
            >
              <ArrowBackIosNewIcon sx={{ fontSize: 18 }} />
            </IconButton>
          ) : (
            <Box sx={{ width: 40, flexShrink: 0 }} />
          )}
          <Box sx={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
            <Typography variant="h6" component="h1" fontWeight={800} noWrap>
              {displayTitle}
            </Typography>
            {subtitle ? (
              <Typography variant="caption" color="text.secondary" display="block" noWrap>
                {subtitle}
              </Typography>
            ) : null}
          </Box>
          <Box sx={{ width: 40, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>{rightSlot}</Box>
        </Stack>
      )}

      {children}

      {!isHome && !showBack ? (
        <Button component={RouterLink} to={walletRoot} variant="text" sx={{ alignSelf: 'flex-start', fontWeight: 700 }}>
          Wallet home
        </Button>
      ) : null}
    </Stack>
  )
}
