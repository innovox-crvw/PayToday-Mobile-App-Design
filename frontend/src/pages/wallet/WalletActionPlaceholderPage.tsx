import { Typography, Stack, Button } from '@mui/material'
import { useParams } from 'react-router-dom'
import { WalletSubheader } from './WalletSubheader'

const titles: Record<string, string> = {
  fund: 'Fund My Wallet',
  transfer: 'Transfer My Wallet',
  withdraw: 'Withdraw to Bank',
  'request-payment': 'Request a Payment',
  'split-bill': 'Split your bill',
  vouchers: 'Vouchers',
  cashout: 'Cashout',
  rewards: 'My Rewards',
}

export function WalletActionPlaceholderPage() {
  const { action } = useParams<{ action: string }>()
  const title = (action && titles[action]) || 'Wallet'

  return (
    <Stack spacing={2} sx={{ maxWidth: 480, mx: 'auto' }}>
      <WalletSubheader title={title} />
      <Typography color="text.secondary">
        This flow will connect to PayToday wallet services when the backend is available. You can complete funding, transfers,
        and withdrawals here.
      </Typography>
      <Button variant="contained" disabled sx={{ alignSelf: 'flex-start' }}>
        Continue (coming soon)
      </Button>
    </Stack>
  )
}
