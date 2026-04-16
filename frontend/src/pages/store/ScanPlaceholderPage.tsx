import { Stack, Typography } from '@mui/material'
import { isScanApiConfigured } from '../../lib/paytodayScanClient'
import { WalletSubheader } from '../wallet/WalletSubheader'

export function ScanPlaceholderPage({ title, body }: { title: string; body: string }) {
  const configured = isScanApiConfigured()
  return (
    <Stack spacing={2} sx={{ maxWidth: 520, mx: 'auto' }}>
      <WalletSubheader title={title} />
      <Typography color="text.secondary">{body}</Typography>
      <Typography variant="caption" color="text.secondary" component="p">
        {configured
          ? 'Scan API base URL is set in the app build. Wire specific pay/receive endpoints when PayToday publishes them.'
          : 'Set VITE_PAYTODAY_SCAN_API_BASE_URL in .env when PayToday provides the scan/pay API base URL. Until then this screen stays offline.'}
      </Typography>
    </Stack>
  )
}
