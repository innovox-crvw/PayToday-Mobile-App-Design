import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Divider,
  IconButton,
  LinearProgress,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import { WalletSubheader } from './WalletSubheader'
import { apiFetch } from '../../api/client'

type Step = 'vendor' | 'amount' | 'confirm' | 'pin' | 'processing' | 'result'

const BRAND_GRADIENT = 'linear-gradient(165deg, #0B0B3A 0%, #4A00E0 45%, #8E2DE2 100%)'

function formatNad(cents: number): string {
  return `N$ ${(cents / 100).toFixed(2)}`
}

const vendors = [
  { id: 'checkers', name: 'Checkers' },
  { id: 'picknpay', name: 'Pick n Pay' },
  { id: 'woermann', name: 'Woermann Brock' },
  { id: 'paytoday', name: 'PayToday' },
] as const

export function WalletVouchersFlowPage() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const prefix = pathname.startsWith('/embed') ? '/embed/wallet' : '/wallet'
  const backHref = `${prefix}`
  const notificationsHref = pathname.startsWith('/embed') ? '/embed/notifications' : '/notifications'

  const [step, setStep] = useState<Step>('vendor')
  const [vendorId, setVendorId] = useState<(typeof vendors)[number]['id'] | null>(null)
  const [customNad, setCustomNad] = useState('')
  const [amountCents, setAmountCents] = useState<number | null>(null)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [processingLog, setProcessingLog] = useState<string[]>([])
  const [resultOk, setResultOk] = useState(true)
  const [ref, setRef] = useState('')
  const [error, setError] = useState<string | null>(null)

  const vendorName = useMemo(() => vendors.find((v) => v.id === vendorId)?.name ?? '', [vendorId])
  const presets = useMemo(() => [1000, 2000, 5000, 10000, 12000], [])

  function parseCustomAmount(): number | null {
    const raw = customNad.replace(/,/gu, '.').trim()
    if (!raw) return null
    const n = Number.parseFloat(raw)
    if (!Number.isFinite(n) || n <= 0) return null
    return Math.round(n * 100)
  }

  async function startOutbox(stage: 'pending' | 'complete', correlationId: string, reference: string, cents: number) {
    const base = {
      variant: 'services' as const,
      serviceSlug: 'vouchers',
      payeeName: vendorName || 'Voucher vendor',
      amountCents: cents,
      payMethod: 'wallet',
      reference,
    }
    const body = stage === 'pending' ? base : { ...base, correlationId }
    const path = stage === 'pending' ? '/api/hub/demo-payment/pending' : '/api/hub/demo-payment/complete'
    const res = await apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const raw = await res.text()
    let parsed: { correlationId?: string; error?: string; code?: string } = {}
    try {
      parsed = JSON.parse(raw) as { correlationId?: string; error?: string; code?: string }
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      if (res.status === 503) {
        return {
          ok: false,
          msg: parsed.error?.trim() || 'Database unavailable — outbox / wallet step skipped.',
          code: parsed.code,
        }
      }
      const msg = parsed.error?.trim() || raw.trim() || (stage === 'pending' ? 'Pending failed' : 'Complete failed')
      return { ok: false, msg, code: parsed.code }
    }
    return { ok: true, correlationId: (parsed.correlationId ?? correlationId).trim() }
  }

  async function runPayment() {
    if (!vendorId) return
    const cents = amountCents ?? parseCustomAmount()
    if (cents == null || cents < 100) {
      setError('Enter at least N$ 1.00')
      return
    }
    setError(null)
    setProcessingLog([])
    setStep('processing')
    const append = (s: string) => setProcessingLog((p) => [...p, s])
    const reference = `PT-VCH-${Date.now().toString(36).toUpperCase()}`
    setRef(reference)

    try {
      append('Validating voucher request…')
      await new Promise((r) => setTimeout(r, 450))

      append('Creating voucher session…')
      await new Promise((r) => setTimeout(r, 500))

      let correlationId = ''
      const pending = await startOutbox('pending', '', reference, cents)
      if (pending.ok) {
        correlationId = pending.correlationId || ''
        append('Queued pending payment notification')
      } else {
        append(pending.msg ?? 'Outbox pending skipped.')
      }

      append('Confirming payment…')
      await new Promise((r) => setTimeout(r, 650))

      if (correlationId) {
        const done = await startOutbox('complete', correlationId, reference, cents)
        if (done.ok) {
          append('Wallet debited. Payment completed notification queued.')
          setResultOk(true)
        } else {
          append(done.msg ?? 'Payment completion failed.')
          setError(done.code === 'insufficient_wallet' ? done.msg ?? 'Insufficient wallet balance.' : done.msg ?? '')
          setResultOk(false)
        }
      } else {
        append('No correlation id — skipped wallet debit and completion.')
        setResultOk(false)
      }

      await new Promise((r) => setTimeout(r, 450))
      setStep('result')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed')
      setResultOk(false)
      setStep('result')
    }
  }

  const header = (
    <Stack direction="row" alignItems="center" gap={1}>
      <IconButton
        onClick={() => {
          if (step === 'vendor') navigate(backHref)
          else if (step === 'amount') setStep('vendor')
          else if (step === 'confirm') setStep('amount')
          else if (step === 'pin') setStep('confirm')
          else navigate(backHref)
        }}
        aria-label="Back"
        size="small"
      >
        <ArrowBackIosNewIcon sx={{ fontSize: 18, color: '#fff' }} />
      </IconButton>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ color: 'rgba(255,255,255,0.88)', fontWeight: 750, fontSize: '0.95rem' }}>
          3-Way Vouchers
        </Typography>
        <Typography sx={{ color: '#fff', fontWeight: 900, letterSpacing: -0.2, fontSize: '1.15rem' }} noWrap>
          {vendorName || 'Select a vendor'}
        </Typography>
      </Box>
    </Stack>
  )

  return (
    <Box sx={{ minHeight: '100dvh', background: BRAND_GRADIENT, color: '#fff', pb: 4 }}>
      <Box sx={{ maxWidth: 520, mx: 'auto', px: 2, pt: 2.25 }}>
        {header}
        <Paper
          elevation={0}
          sx={{
            mt: 2.25,
            borderRadius: 4,
            bgcolor: 'background.paper',
            color: 'text.primary',
            border: '1px solid rgba(15, 23, 42, 0.08)',
            boxShadow: '0 18px 46px rgba(15, 23, 42, 0.12)',
            overflow: 'hidden',
          }}
        >
          <Box sx={{ p: { xs: 2.25, sm: 2.75 } }}>
            {step === 'vendor' ? (
              <Stack spacing={1.5}>
                <WalletSubheader title="Select a vendor" />
                <List disablePadding>
                  {vendors.map((v) => (
                    <ListItemButton
                      key={v.id}
                      onClick={() => {
                        setVendorId(v.id)
                        setStep('amount')
                        setError(null)
                      }}
                      sx={{ borderRadius: 2, mb: 1, border: '1px solid rgba(15, 23, 42, 0.08)' }}
                    >
                      <ListItemText primary={v.name} primaryTypographyProps={{ fontWeight: 800 }} />
                    </ListItemButton>
                  ))}
                </List>
              </Stack>
            ) : null}

            {step === 'amount' ? (
              <Stack spacing={2}>
                <Typography fontWeight={900}>Amount</Typography>
                <Stack direction="row" flexWrap="wrap" gap={1}>
                  {presets.map((c) => (
                    <Button
                      key={c}
                      variant={amountCents === c && !customNad.trim() ? 'contained' : 'outlined'}
                      onClick={() => {
                        setAmountCents(c)
                        setCustomNad('')
                        setError(null)
                      }}
                      sx={{ borderRadius: 999, fontWeight: 850 }}
                    >
                      {formatNad(c)}
                    </Button>
                  ))}
                </Stack>
                <TextField
                  placeholder="Custom amount (N$)"
                  value={customNad}
                  onChange={(e) => {
                    setCustomNad(e.target.value)
                    setAmountCents(null)
                  }}
                  inputProps={{ inputMode: 'decimal' }}
                />
                {error ? <Alert severity="warning">{error}</Alert> : null}
                <Button
                  variant="contained"
                  size="large"
                  fullWidth
                  sx={{ py: 1.25, fontWeight: 900 }}
                  onClick={() => setStep('confirm')}
                >
                  Continue
                </Button>
              </Stack>
            ) : null}

            {step === 'confirm' ? (
              <Stack spacing={2} textAlign="center" alignItems="center">
                <Typography fontWeight={900}>Confirm Payment</Typography>
                <Typography variant="caption" color="text.secondary">
                  Payment to
                </Typography>
                <Typography fontWeight={900} sx={{ fontSize: '1.15rem' }}>
                  {vendorName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Amount
                </Typography>
                <Typography fontWeight={950} sx={{ fontSize: '1.35rem', color: 'primary.main' }}>
                  {formatNad(amountCents ?? parseCustomAmount() ?? 0)}
                </Typography>
                <Button
                  variant="contained"
                  sx={{ borderRadius: 999, px: 3, fontWeight: 900 }}
                  onClick={() => {
                    setPin('')
                    setPinError(null)
                    setStep('pin')
                  }}
                >
                  Enter App Pin
                </Button>
              </Stack>
            ) : null}

            {step === 'pin' ? (
              <Stack spacing={2} alignItems="center">
                <Typography fontWeight={900}>Enter App PIN</Typography>
                <Stack direction="row" justifyContent="center" gap={1} sx={{ py: 1 }}>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Box
                      key={i}
                      sx={{
                        width: 44,
                        height: 54,
                        borderRadius: 2,
                        border: '1px solid rgba(15, 23, 42, 0.14)',
                        bgcolor: 'rgba(15, 23, 42, 0.02)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 900,
                        fontSize: '1.05rem',
                      }}
                    >
                      {pin[i] ? '•' : ''}
                    </Box>
                  ))}
                </Stack>
                {pinError ? <Alert severity="warning" sx={{ width: 1 }}>{pinError}</Alert> : null}
                <Stack spacing={1} sx={{ width: 1 }}>
                  {[
                    ['1', '2', '3'],
                    ['4', '5', '6'],
                    ['7', '8', '9'],
                  ].map((row) => (
                    <Stack key={row.join('')} direction="row" gap={1}>
                      {row.map((d) => (
                        <Button
                          key={d}
                          variant="outlined"
                          fullWidth
                          onClick={() => setPin((p) => (p.length >= 4 ? p : `${p}${d}`))}
                          sx={{ py: 1.25, fontWeight: 900, borderRadius: 2 }}
                        >
                          {d}
                        </Button>
                      ))}
                    </Stack>
                  ))}
                  <Stack direction="row" gap={1}>
                    <Button variant="outlined" fullWidth onClick={() => setPin('')} sx={{ py: 1.25, fontWeight: 900, borderRadius: 2 }}>
                      Clear
                    </Button>
                    <Button variant="outlined" fullWidth onClick={() => setPin((p) => p.slice(0, -1))} sx={{ py: 1.25, fontWeight: 900, borderRadius: 2 }}>
                      ⌫
                    </Button>
                    <Button variant="outlined" fullWidth onClick={() => setPin((p) => (p.length >= 4 ? p : `${p}0`))} sx={{ py: 1.25, fontWeight: 900, borderRadius: 2 }}>
                      0
                    </Button>
                  </Stack>
                </Stack>
                <Button
                  variant="contained"
                  size="large"
                  fullWidth
                  sx={{ py: 1.25, fontWeight: 900 }}
                  onClick={() => {
                    if (pin.length !== 4) {
                      setPinError('Enter a 4-digit PIN.')
                      return
                    }
                    setPinError(null)
                    void runPayment()
                  }}
                >
                  Continue
                </Button>
              </Stack>
            ) : null}

            {step === 'processing' ? (
              <Stack spacing={2}>
                <Typography fontWeight={900}>Loading</Typography>
                <LinearProgress sx={{ borderRadius: 1 }} />
                <Stack spacing={1}>
                  {processingLog.map((l, i) => (
                    <Typography key={`${i}-${l}`} variant="body2" color="text.secondary">
                      {l}
                    </Typography>
                  ))}
                </Stack>
              </Stack>
            ) : null}

            {step === 'result' ? (
              <Stack spacing={2} sx={{ textAlign: 'center' }}>
                <Box
                  sx={{
                    width: 112,
                    height: 112,
                    borderRadius: '50%',
                    border: (t) => `8px solid ${resultOk ? t.palette.success.main : t.palette.error.main}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mx: 'auto',
                  }}
                >
                  {resultOk ? (
                    <CheckCircleOutlineIcon sx={{ fontSize: 48, color: 'success.main' }} />
                  ) : (
                    <ErrorOutlineIcon sx={{ fontSize: 48, color: 'error.main' }} />
                  )}
                </Box>
                <Typography variant="h6" fontWeight={900}>
                  {resultOk ? 'Success!' : 'Failed'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Payment {resultOk ? 'confirmation' : 'unsuccessful'}
                </Typography>
                <Typography fontWeight={900} sx={{ fontSize: '1.25rem' }}>
                  {formatNad(amountCents ?? parseCustomAmount() ?? 0)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {vendorName}
                </Typography>
                {error ? <Alert severity="warning">{error}</Alert> : null}
                <Divider sx={{ my: 1 }} />
                <Typography variant="caption" color="text.secondary" fontWeight={800}>
                  Transaction details
                </Typography>
                <Typography sx={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '0.95rem' }}>
                  {ref}
                </Typography>
                <Button component={RouterLink} to={notificationsHref} variant="outlined" sx={{ borderRadius: 999, fontWeight: 900 }}>
                  View notifications
                </Button>
                <Button component={RouterLink} to={backHref} variant="contained" sx={{ borderRadius: 999, fontWeight: 900 }}>
                  Done
                </Button>
              </Stack>
            ) : null}
          </Box>
        </Paper>
      </Box>
    </Box>
  )
}

