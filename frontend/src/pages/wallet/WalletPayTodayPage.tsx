import { Link as RouterLink, useLocation } from 'react-router-dom'
import { Card, List, ListItemButton, ListItemIcon, ListItemText, Stack, Typography } from '@mui/material'
import AddCardIcon from '@mui/icons-material/AddCard'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { WalletSubheader } from './WalletSubheader'

const actions = [
  { key: 'fund', label: 'Fund My Wallet', sub: 'Add money from a card or bank', icon: <AddCardIcon /> },
  { key: 'transfer', label: 'Transfer My Wallet', sub: 'Send to another PayToday user', icon: <SwapHorizIcon /> },
  { key: 'withdraw', label: 'Withdraw to Bank Account', sub: 'Move balance to your linked account', icon: <AccountBalanceIcon /> },
] as const

export function WalletPayTodayPage() {
  const { pathname } = useLocation()
  const prefix = pathname.startsWith('/embed') ? '/embed/wallet' : '/wallet'

  return (
    <Stack spacing={2} sx={{ maxWidth: 560, mx: 'auto' }}>
      <WalletSubheader title="PayToday Wallet" />
      <Typography variant="body2" color="text.secondary" sx={{ px: 0.5 }}>
        Manage how you add, move, or withdraw your wallet balance.
      </Typography>
      <Card variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider', overflow: 'hidden' }}>
        <List disablePadding>
          {actions.map((a, i) => (
            <ListItemButton
              key={a.key}
              component={RouterLink}
              to={`${prefix}/paytoday/${a.key}`}
              sx={{
                py: 2,
                alignItems: 'flex-start',
                borderBottom: i < actions.length - 1 ? 1 : 0,
                borderColor: 'divider',
              }}
            >
              <ListItemIcon sx={{ color: 'primary.main', minWidth: 48, mt: 0.5 }}>{a.icon}</ListItemIcon>
              <ListItemText primary={a.label} secondary={a.sub} primaryTypographyProps={{ fontWeight: 700 }} />
              <ChevronRightIcon color="action" sx={{ mt: 1 }} />
            </ListItemButton>
          ))}
        </List>
      </Card>
    </Stack>
  )
}
