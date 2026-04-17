import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useLocation, useSearchParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import { WalletSubheader } from '../wallet/WalletSubheader'
import { useDemoBarcodeScanner } from '../../components/scan/useDemoBarcodeScanner'
import { interpretDemoScan, type DemoScanInterpretation } from '../../lib/demoScan'
import { formatNad } from '../../data/walletMock'

function ScanFrameOverlay() {
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Box
        sx={{
          width: '72%',
          maxWidth: 280,
          aspectRatio: '1',
          position: 'relative',
          border: '2px solid rgba(255,255,255,0.85)',
          borderRadius: 2,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '48%',
            height: 2,
            bgcolor: 'rgba(34, 211, 238, 0.9)',
            animation: 'pt-scanline 2.2s ease-in-out infinite',
            '@keyframes pt-scanline': {
              '0%, 100%': { transform: 'translateY(-36px)', opacity: 0.3 },
              '50%': { transform: 'translateY(36px)', opacity: 1 },
            },
          }}
        />
      </Box>
    </Box>
  )
}

export function ScanPayCodePage() {
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const backToScan = `${pathPrefix}/scan`

  const [tab, setTab] = useState(0)
  const [manualCode, setManualCode] = useState('')
  const [interpretation, setInterpretation] = useState<DemoScanInterpretation | null>(null)

  const cameraActive = tab === 0 && interpretation === null

  const handleDecode = useCallback((raw: string) => {
    setInterpretation(interpretDemoScan(raw))
  }, [])

  const { videoRef, error: camError, hasDetector } = useDemoBarcodeScanner(cameraActive, handleDecode)

  useEffect(() => {
    const pre = searchParams.get('code')?.trim()
    if (pre) {
      setInterpretation(interpretDemoScan(pre))
    }
  }, [searchParams])

  const paymentCodeTips = useMemo(
    () => (
      <Stack spacing={0.75}>
        <Typography variant="caption" color="text.secondary" component="div">
          <strong>Example codes:</strong> <code>PT-RETAIL-MAERUA</code>, <code>PT-PARKING-001</code>,{' '}
          <code>PT-FUEL-SHELL-KH</code> — or scan the QR from <strong>Receive via QR</strong> on another tab.
        </Typography>
      </Stack>
    ),
    [],
  )

  function submitManual() {
    const t = manualCode.trim()
    if (!t) return
    setInterpretation(interpretDemoScan(t))
  }

  function resetFlow() {
    setInterpretation(null)
    setManualCode('')
    setTab(0)
  }

  if (interpretation) {
    const amt = interpretation.suggestedAmountCents
    return (
      <Stack spacing={2} sx={{ maxWidth: 520, mx: 'auto', pb: 4 }}>
        <WalletSubheader title="Confirm payment" />
        <Card variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
          <Typography variant="overline" color="text.secondary" fontWeight={800}>
            Merchant
          </Typography>
          <Typography variant="h6" fontWeight={850} sx={{ mt: 0.5 }}>
            {interpretation.merchantName}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.55 }}>
            {interpretation.detail}
          </Typography>
          {amt != null ? (
            <Typography sx={{ mt: 2, fontWeight: 900, fontSize: '1.35rem' }}>
              {formatNad(amt)}
              <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontWeight: 600 }}>
                Suggested amount — you can change it in the next step.
              </Typography>
            </Typography>
          ) : null}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, fontFamily: 'monospace' }}>
            Ref: {interpretation.reference}
          </Typography>
        </Card>
        <Stack spacing={1.25}>
          <Button
            component={RouterLink}
            to={`${pathPrefix}/services/water`}
            variant="contained"
            size="large"
            sx={{ py: 1.25, fontWeight: 850 }}
          >
            Pay with wallet
          </Button>
          <Button variant="outlined" onClick={resetFlow} sx={{ fontWeight: 700 }}>
            Scan another code
          </Button>
          <Button component={RouterLink} to={backToScan} variant="text" sx={{ fontWeight: 700 }}>
            Back to scan hub
          </Button>
        </Stack>
      </Stack>
    )
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 520, mx: 'auto', pb: 4 }}>
      <WalletSubheader title="Pay by Code" />
      <Typography variant="body2" color="text.secondary">
        Use your camera to read QR or barcodes (Chrome / Edge), or type a code. Works without a hosted PayToday scan API.
      </Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Scan" sx={{ fontWeight: 800 }} />
        <Tab label="Enter code" sx={{ fontWeight: 800 }} />
      </Tabs>

      {tab === 0 ? (
        <Stack spacing={1.5}>
          <Box
            sx={{
              position: 'relative',
              borderRadius: 3,
              overflow: 'hidden',
              bgcolor: '#0b1020',
              aspectRatio: '3 / 4',
              maxHeight: 420,
              mx: 'auto',
              width: '100%',
            }}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
                transform: 'scaleX(1)',
              }}
            />
            <ScanFrameOverlay />
          </Box>
          {camError ? <Alert severity="warning">{camError}</Alert> : null}
          {!hasDetector && !camError ? (
            <Alert severity="info">
              This browser does not expose <strong>BarcodeDetector</strong>. You can still continue with{' '}
              <strong>Enter code</strong> or <strong>Simulate retail scan</strong> below.
            </Alert>
          ) : null}
          {paymentCodeTips}
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button variant="outlined" onClick={() => handleDecode('PT-RETAIL-MAERUA')} sx={{ fontWeight: 750 }}>
              Simulate retail scan
            </Button>
            <Button variant="outlined" onClick={() => handleDecode('PT-PARKING-001')} sx={{ fontWeight: 750 }}>
              Simulate parking code
            </Button>
          </Stack>
        </Stack>
      ) : (
        <Stack spacing={1.5}>
          <TextField
            label="Payment code or URL"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="PT-RETAIL-MAERUA or PT-PAYTO|you@email.com|5000"
            multiline
            minRows={2}
            fullWidth
          />
          {paymentCodeTips}
          <Button variant="contained" size="large" onClick={submitManual} disabled={!manualCode.trim()} sx={{ py: 1.15, fontWeight: 850 }}>
            Continue
          </Button>
        </Stack>
      )}

      <Button component={RouterLink} to={backToScan} variant="text" sx={{ alignSelf: 'center', fontWeight: 700 }}>
        Back
      </Button>
    </Stack>
  )
}
