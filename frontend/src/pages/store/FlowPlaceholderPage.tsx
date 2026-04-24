import { Typography } from '@mui/material'
import { ProfilePageShell } from '../../components/profile/ProfilePageShell'
import { WalletSubheader } from '../wallet/WalletSubheader'

export function FlowPlaceholderPage({ title, body }: { title: string; body: string }) {
  return (
    <ProfilePageShell>
      <WalletSubheader title={title} />
      <Typography color="text.secondary" variant="body2">
        {body}
      </Typography>
    </ProfilePageShell>
  )
}
