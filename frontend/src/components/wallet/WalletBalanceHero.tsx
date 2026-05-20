import { Box, Card, CircularProgress, IconButton, Stack, Typography } from '@mui/material'
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined'
import RefreshIcon from '@mui/icons-material/Refresh'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import { formatNad } from '../../data/walletMock'
import { walletHeroSx } from '../../theme/walletTheme'

type Props = {
  balanceCents: number
  loading?: boolean
  caption: string
  hideBalance: boolean
  onToggleHide: () => void
  onRefresh?: () => void
  refreshing?: boolean
  compact?: boolean
}

export function WalletBalanceHero(props: Props) {
  const { balanceCents, loading, caption, hideBalance, onToggleHide, onRefresh, refreshing, compact } = props
  const display = hideBalance ? '••••••' : formatNad(balanceCents)

  return (
    <Card
      elevation={0}
      sx={{
        ...walletHeroSx,
        p: { xs: 2.25, md: compact ? 2.25 : 2.75 },
        minHeight: compact ? 168 : undefined,
        height: compact ? 1 : undefined,
      }}
    >
      <Stack spacing={1.25} sx={{ position: 'relative', zIndex: 1, height: compact ? 1 : undefined }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 1.5,
              bgcolor: 'rgba(255,255,255,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '0.85rem',
              letterSpacing: -0.5,
            }}
          >
            N$
          </Box>
          <Stack direction="row" spacing={0.25} alignItems="center">
            {onRefresh ? (
              <IconButton
                size="small"
                onClick={onRefresh}
                disabled={refreshing}
                aria-label="Refresh balance"
                sx={{ color: 'rgba(255,255,255,0.85)' }}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            ) : null}
            <IconButton
              size="small"
              onClick={onToggleHide}
              aria-label={hideBalance ? 'Show balance' : 'Hide balance'}
              sx={{ color: 'rgba(255,255,255,0.85)' }}
            >
              {hideBalance ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
            </IconButton>
            <AccountBalanceWalletOutlinedIcon sx={{ fontSize: 28, opacity: 0.95, ml: 0.25 }} />
          </Stack>
        </Stack>

        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Typography variant="body2" sx={{ opacity: 0.92, fontWeight: 600, fontSize: '0.8rem' }}>
            Available balance
          </Typography>
          {loading ? (
            <CircularProgress size={32} sx={{ color: 'rgba(255,255,255,0.85)', my: 1 }} />
          ) : (
            <Typography
              variant={compact ? 'h5' : 'h4'}
              fontWeight={800}
              letterSpacing={-0.55}
              sx={{ lineHeight: 1.15, my: 0.25 }}
            >
              {display}
            </Typography>
          )}
        </Box>

        <Typography variant="caption" sx={{ opacity: 0.85, lineHeight: 1.4, fontSize: '0.72rem' }}>
          {caption}
        </Typography>
      </Stack>
    </Card>
  )
}
