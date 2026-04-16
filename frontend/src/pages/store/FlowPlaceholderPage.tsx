import { Stack, Typography } from '@mui/material'
import { WalletSubheader } from '../wallet/WalletSubheader'

export function FlowPlaceholderPage({ title, body }: { title: string; body: string }) {
  return (
    <Stack spacing={2} sx={{ maxWidth: 520, mx: 'auto' }}>
      <WalletSubheader title={title} />
      <Typography color="text.secondary">{body}</Typography>
    </Stack>
  )
}
