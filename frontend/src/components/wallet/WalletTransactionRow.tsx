import { Link as RouterLink } from 'react-router-dom'
import { Box, ListItemButton, ListItemText, Stack, Typography } from '@mui/material'
import { formatNad, type WalletTransaction } from '../../data/walletMock'

type Props = {
  tx: WalletTransaction
  to: string
  compact?: boolean
}

export function WalletTransactionRow(props: Props) {
  const { tx, to, compact } = props
  const statusColor =
    tx.status === 'successful' ? 'success.main' : tx.status === 'pending' ? 'warning.main' : 'error.main'
  const statusLabel = tx.status === 'successful' ? 'Successful' : tx.status === 'pending' ? 'Pending' : 'Failed'

  return (
    <ListItemButton
      component={RouterLink}
      to={to}
      sx={{
        alignItems: 'flex-start',
        py: compact ? 1.25 : 1.75,
        px: 2,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <ListItemText
        primary={
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
            <Typography fontWeight={700} variant={compact ? 'body2' : 'body1'} noWrap sx={{ flex: 1 }}>
              {tx.business}
            </Typography>
            <Typography fontWeight={800} variant={compact ? 'body2' : 'body1'} sx={{ flexShrink: 0 }}>
              {formatNad(tx.amountCents)}
            </Typography>
          </Stack>
        }
        secondary={
          <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, mt: 0.35 }}>
            <Typography component="span" variant="caption" sx={{ color: statusColor, fontWeight: 700 }}>
              {statusLabel}
            </Typography>
            <Typography component="span" variant="caption" color="text.secondary" noWrap>
              {tx.paymentMethod} · {tx.date}
            </Typography>
          </Box>
        }
      />
    </ListItemButton>
  )
}
