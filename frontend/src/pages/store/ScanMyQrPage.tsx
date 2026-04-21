import { useMemo } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { Alert, Box, Button, Card, Stack, Typography } from '@mui/material'
import { WalletSubheader } from '../wallet/WalletSubheader'
import { DemoQrImage } from '../../components/scan/DemoQrImage'
import { useAuthMe } from '../../hooks/useAuthMe'
import { buildReceiveDemoPayload } from '../../lib/demoScan'

export function ScanMyQrPage() {
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const backToScan = `${pathPrefix}/wallet/scan`
  const { user } = useAuthMe()

  const walletUrl = useMemo(() => `${window.location.origin}${pathPrefix}/wallet`, [pathPrefix])

  const staticPayString = useMemo(
    () => buildReceiveDemoPayload(user?.email?.trim() || 'guest@example.com', null),
    [user?.email],
  )

  return (
    <Stack spacing={2} sx={{ maxWidth: 520, mx: 'auto', pb: 4 }}>
      <WalletSubheader title="My QR Code" />
      <Typography variant="body2" color="text.secondary">
        Two ways to get paid: open your <strong>Wallet</strong> in the browser, or share a static <strong>PT-PAYTO</strong> handle
        others can pay (same encoding as Receive via QR, without rotation).
      </Typography>

      <Card variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
        <Typography variant="subtitle2" fontWeight={800} gutterBottom>
          Open wallet in app
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
          Scan from your camera app to jump to this build’s wallet area.
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
          <DemoQrImage value={walletUrl} size={220} label="QR linking to wallet in this app" />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', fontFamily: 'monospace', wordBreak: 'break-all' }}>
          {walletUrl}
        </Typography>
      </Card>

      <Card variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
        <Typography variant="subtitle2" fontWeight={800} gutterBottom>
          Static pay handle
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
          For in-person “show my code” — payer uses Pay by Code to scan or paste.
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
          <DemoQrImage value={staticPayString} size={220} label="Static PT-PAYTO QR" />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', fontFamily: 'monospace', wordBreak: 'break-all' }}>
          {staticPayString}
        </Typography>
      </Card>

      <Alert severity="info" variant="outlined">
        In production, keys rotate and settlement is bound to your account. Here, both patterns are suitable for offline previews and training.
      </Alert>

      <Button component={RouterLink} to={backToScan} variant="text" sx={{ alignSelf: 'center', fontWeight: 700 }}>
        Back
      </Button>
    </Stack>
  )
}
