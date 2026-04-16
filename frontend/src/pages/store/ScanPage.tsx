import { Link as RouterLink, useLocation } from 'react-router-dom'
import { Button, Card, List, ListItemButton, ListItemIcon, ListItemText, Stack, Typography } from '@mui/material'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import QrCode2Icon from '@mui/icons-material/QrCode2'
import BadgeIcon from '@mui/icons-material/Badge'

export function ScanPage() {
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const shopPath = `${pathPrefix}/shop`

  const items = [
    { to: `${pathPrefix}/scan/pay-code`, label: 'Pay by Code', icon: <QrCodeScannerIcon color="primary" /> },
    { to: `${pathPrefix}/scan/receive-qr`, label: 'Receive via QR', icon: <QrCode2Icon color="primary" /> },
    { to: `${pathPrefix}/scan/my-qr`, label: 'My QR Code', icon: <BadgeIcon color="primary" /> },
  ] as const

  return (
    <Stack spacing={2} sx={{ maxWidth: 480, mx: 'auto', py: 2, pb: 4 }}>
      <Typography variant="h5" fontWeight={800} textAlign="center">
        Scan
      </Typography>
      <Typography variant="body2" color="text.secondary" textAlign="center">
        <strong>Live demo:</strong> Pay by Code uses your camera (QR / barcodes in Chrome and Edge) or manual entry. Receive via QR and My QR render real QR patterns for walkthroughs — no{' '}
        <code>VITE_PAYTODAY_SCAN_API_BASE_URL</code> required. Wire production PayToday scan APIs when they are available.
      </Typography>
      <Card variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <List disablePadding>
          {items.map((item, i) => (
            <ListItemButton
              key={item.to}
              component={RouterLink}
              to={item.to}
              sx={{ py: 2, borderBottom: i < items.length - 1 ? 1 : 0, borderColor: 'divider' }}
            >
              <ListItemIcon sx={{ minWidth: 48 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 700 }} />
            </ListItemButton>
          ))}
        </List>
      </Card>
      <Button component={RouterLink} to={shopPath} variant="text" sx={{ alignSelf: 'center', fontWeight: 700 }}>
        Browse store
      </Button>
    </Stack>
  )
}
