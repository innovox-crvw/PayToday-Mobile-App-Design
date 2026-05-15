import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { Alert, Box, Button, Card, Stack, TextField, Typography } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { WalletSubheader } from '../wallet/WalletSubheader'
import { DemoQrImage } from '../../components/scan/DemoQrImage'
import { useAuthMe } from '../../hooks/useAuthMe'
import { buildReceiveDemoPayload } from '../../lib/demoScan'

function parseAmountCents(raw: string): number | null {
  const t = raw.replace(/,/gu, '.').trim()
  if (!t) return null
  const n = Number.parseFloat(t)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}

export function ScanReceiveQrPage() {
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const backToScan = `${pathPrefix}/wallet/scan`
  const { user } = useAuthMe()

  const email = user?.email?.trim() || ''
  const [amountNad, setAmountNad] = useState('')
  const [tick, setTick] = useState(0)

  const amountCents = useMemo(() => parseAmountCents(amountNad), [amountNad])

  const payload = useMemo(
    () => buildReceiveDemoPayload(email || 'guest@example.com', amountCents),
    [email, amountCents],
  )

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 45_000)
    return () => window.clearInterval(id)
  }, [])

  const rawLine = useMemo(() => `${payload}|t=${tick}`, [payload, tick])

  function copyPayload() {
    void navigator.clipboard.writeText(rawLine)
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 520, mx: 'auto', pb: 4 }}>
      <WalletSubheader title="Receive via QR" />
      <Typography variant="body2" color="text.secondary">
        This receive QR encodes a <strong>PT-PAYTO</strong> string. Another device can open <strong>Pay by Code</strong> and scan
        it (Chrome) or paste the copied line. QR refreshes every 45s like a rotating checkout token.
      </Typography>

      <Card variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
        <Typography variant="subtitle2" fontWeight={800} gutterBottom>
          Request amount (optional)
        </Typography>
        <TextField
          label="Amount (N$) — leave empty for open amount"
          value={amountNad}
          onChange={(e) => setAmountNad(e.target.value)}
          placeholder="e.g. 150"
          size="small"
          fullWidth
          inputProps={{ inputMode: 'decimal' }}
          sx={{ mb: 1 }}
        />
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
          Receiving as: <strong>{email || 'guest (sign in for your email in the payload)'}</strong>
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
          <DemoQrImage value={rawLine} size={256} label="Receive payment QR" />
        </Box>
        <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 2 }} flexWrap="wrap">
          <Button startIcon={<ContentCopyIcon />} variant="outlined" onClick={copyPayload} sx={{ fontWeight: 750 }}>
            Copy payload
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, fontFamily: 'monospace', wordBreak: 'break-all' }}>
          {rawLine}
        </Typography>
      </Card>

      <Alert severity="success" variant="outlined">
        <strong>Tip:</strong> open <RouterLink to={`${pathPrefix}/wallet/scan/pay-code`}>Pay by Code</RouterLink> on a second
        window, use the <strong>Scan</strong> tab, and point it at this QR (or paste the copied line under Enter code).
      </Alert>

      <Button component={RouterLink} to={backToScan} variant="text" sx={{ alignSelf: 'center', fontWeight: 700 }}>
        Back
      </Button>
    </Stack>
  )
}
