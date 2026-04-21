import { Link as RouterLink, useLocation } from 'react-router-dom'
import { Box, Button, Card, CardActionArea, CardContent, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import QrCode2Icon from '@mui/icons-material/QrCode2'
import BadgeIcon from '@mui/icons-material/Badge'
import { PageHeader } from '../../components/page/PageHeader'

export function ScanPage() {
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const scanBase = `${pathPrefix}/wallet/scan`
  const shopPath = `${pathPrefix}/shop`
  const walletPath = `${pathPrefix}/wallet`

  const items = [
    {
      to: `${scanBase}/pay-code`,
      title: 'Pay by code',
      body: 'Scan a QR or barcode with your camera, or type a retail code.',
      icon: <QrCodeScannerIcon sx={{ fontSize: 28 }} />,
    },
    {
      to: `${scanBase}/receive-qr`,
      title: 'Receive via QR',
      body: 'Show a QR someone can scan to pay you in this demo.',
      icon: <QrCode2Icon sx={{ fontSize: 28 }} />,
    },
    {
      to: `${scanBase}/my-qr`,
      title: 'My QR code',
      body: 'Static handle and wallet link for in-person payments.',
      icon: <BadgeIcon sx={{ fontSize: 28 }} />,
    },
  ] as const

  return (
    <Stack spacing={2.5} sx={{ maxWidth: 560, mx: 'auto', py: { xs: 0.5, sm: 1 }, pb: 4 }}>
      <PageHeader
        overline="Wallet"
        title="Scan & pay"
        titleVariant="h4"
        subtitle="Use your camera where supported (Chrome / Edge), or enter codes manually. Production PayToday scan APIs can plug in later."
      />

      <Stack spacing={1.5}>
        {items.map((item) => (
          <Card
            key={item.to}
            variant="outlined"
            sx={{
              borderRadius: 3,
              borderColor: 'divider',
              overflow: 'hidden',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 12px 28px rgba(15, 23, 42, 0.08)' },
            }}
          >
            <CardActionArea component={RouterLink} to={item.to} sx={{ alignItems: 'stretch', display: 'block' }}>
              <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
                <Stack direction="row" spacing={2} alignItems="flex-start">
                  <Box
                    sx={(t) => ({
                      width: 52,
                      height: 52,
                      borderRadius: 2.5,
                      flexShrink: 0,
                      bgcolor: alpha(t.palette.primary.main, 0.1),
                      color: 'primary.main',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    })}
                  >
                    {item.icon}
                  </Box>
                  <Stack spacing={0.5} minWidth={0}>
                    <Typography fontWeight={800} letterSpacing={-0.2}>
                      {item.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.45 }}>
                      {item.body}
                    </Typography>
                  </Stack>
                </Stack>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Stack>

      <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" sx={{ pt: 0.5 }}>
        <Button component={RouterLink} to={walletPath} variant="text" sx={{ fontWeight: 700 }}>
          Wallet overview
        </Button>
        <Button component={RouterLink} to={shopPath} variant="text" sx={{ fontWeight: 700 }}>
          Browse store
        </Button>
      </Stack>
    </Stack>
  )
}
