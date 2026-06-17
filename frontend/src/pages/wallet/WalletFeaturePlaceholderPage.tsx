import { Typography } from '@mui/material'
import { WalletPageShell } from '../../components/wallet/WalletPageShell'
import { WalletDetailCard } from '../../components/wallet/WalletDetailCard'

export function WalletFeaturePlaceholderPage({ title, body }: { title: string; body: string }) {
  return (
    <WalletPageShell title={title} showBack>
      <WalletDetailCard>
        <Typography color="text.secondary" sx={{ lineHeight: 1.55 }}>
          {body}
        </Typography>
      </WalletDetailCard>
    </WalletPageShell>
  )
}
