import { Typography, Button } from '@mui/material'
import { useParams } from 'react-router-dom'
import { WalletPageShell } from '../../components/wallet/WalletPageShell'
import { WalletDetailCard } from '../../components/wallet/WalletDetailCard'

const titles: Record<string, string> = {
  fund: 'Fund My Wallet',
  transfer: 'Transfer My Wallet',
  withdraw: 'Withdraw to Bank',
  'request-payment': 'Request a Payment',
  'split-bill': 'Split your bill',
  rewards: 'My Rewards',
}

export function WalletActionPlaceholderPage() {
  const { action } = useParams<{ action: string }>()
  const title = (action && titles[action]) || 'Wallet'

  return (
    <WalletPageShell title={title} showBack>
      <WalletDetailCard>
        <Typography color="text.secondary" sx={{ lineHeight: 1.55 }}>
          This flow will connect to PayToday wallet services when the backend is available. You can complete funding,
          transfers, and withdrawals here.
        </Typography>
        <Button variant="contained" disabled sx={{ alignSelf: 'flex-start' }}>
          Continue (coming soon)
        </Button>
      </WalletDetailCard>
    </WalletPageShell>
  )
}
