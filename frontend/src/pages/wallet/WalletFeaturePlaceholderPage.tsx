import { Stack, Typography } from '@mui/material'
import { WalletSubheader } from './WalletSubheader'

export function WalletFeaturePlaceholderPage({ title, body }: { title: string; body: string }) {
  return (
    <Stack spacing={2} sx={{ maxWidth: 480, mx: 'auto' }}>
      <WalletSubheader title={title} />
      <Typography color="text.secondary">{body}</Typography>
    </Stack>
  )
}
