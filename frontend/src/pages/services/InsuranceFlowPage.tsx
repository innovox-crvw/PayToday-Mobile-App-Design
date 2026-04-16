import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Divider,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew'
import FingerprintIcon from '@mui/icons-material/Fingerprint'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../api/client'

type Step = 'provider' | 'form' | 'confirm' | 'pin' | 'processing' | 'result'

const BRAND_GRADIENT = 'linear-gradient(165deg, #0B0B3A 0%, #4A00E0 45%, #8E2DE2 100%)'

function formatNad(cents: number): string {
  return `N$ ${(cents / 100).toFixed(2)}`
}

export function InsuranceFlowPage() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const backHref = pathPrefix ? `${pathPrefix}/services` : '/services'
  const notificationsHref = pathPrefix ? `${pathPrefix}/notifications` : '/notifications'

  const [step, setStep] = useState<Step>('provider')
  const [page, setPage] = useState(0)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [processingLog, setProcessingLog] = useState<string[]>([])
  const [resultOk, setResultOk] = useState(true)
  const [ref, setRef] = useState('')
  const [correlationId, setCorrelationId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const amountCents = 25600
  const providerName = 'NedLife Namibia'

  const headerAmount = useMemo(() => {
    if (step === 'provider' || step === 'form') return '—'
    return formatNad(amountCents)
  }, [step])

  async function startOutboxPipeline(stage: 'pending' | 'complete', correlation: string, referenceStr: string) {
    const base = {
      variant: 'services' as const,
      serviceSlug: 'insurance',
      payeeName: providerName,
      amountCents,
      payMethod: 'wallet',
      reference: referenceStr,
    }
    const body =
      stage === 'pending'
        ? base
        : {
            ...base,
            correlationId: correlation,
          }
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
    return { ok: true, correlationId: (parsed.correlationId ?? correlation).trim() }
  }

  async function runPaymentPipeline() {
    if (step === 'processing') return
    setError(null)
    setProcessingLog([])
    const reference = `PT-INS-${Date.now().toString(36).toUpperCase()}`
    setRef(reference)
    setCorrelationId('')
    setStep('processing')

    const append = (s: string) => setProcessingLog((p) => [...p, s])

    try {
      append('Validating details…')
      await new Promise((r) => setTimeout(r, 450))

      append('Creating payment session (demo)…')
      await new Promise((r) => setTimeout(r, 500))

      let cidLocal = ''
      try {
        const pending = await startOutboxPipeline('pending', '', reference)
        if (pending.ok) {
          cidLocal = pending.correlationId?.trim() || ''
          if (cidLocal) setCorrelationId(cidLocal)
          append('Queued outbox: hub_demo_pending_payment')
        } else {
          append(pending.msg ?? 'Outbox pending skipped.')
        }
      } catch (e) {
        append(`Outbox pending failed: ${e instanceof Error ? e.message : String(e)}`)
      }

      append('Confirming with wallet / biometrics (demo)…')
      await new Promise((r) => setTimeout(r, 650))

      try {
        if (cidLocal) {
          const done = await startOutboxPipeline('complete', cidLocal, reference)
          if (done.ok) {
            append('Wallet debited. Queued outbox: hub_demo_payment_completed')
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
      } catch (e) {
        append(`Outbox complete failed: ${e instanceof Error ? e.message : String(e)}`)
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

  const card = (
    <Paper
      elevation={0}
      sx={{
        mt: 2.5,
        borderRadius: 4,
        bgcolor: 'background.paper',
        color: 'text.primary',
        border: '1px solid rgba(15, 23, 42, 0.08)',
        boxShadow: '0 18px 46px rgba(15, 23, 42, 0.12)',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ p: { xs: 2.25, sm: 2.75 } }}>
        {step === 'provider' ? (
          <Stack spacing={2}>
            <Typography fontWeight={850} sx={{ fontSize: '1.05rem', letterSpacing: -0.2 }}>
              Insurance
            </Typography>
            <Paper
              variant="outlined"
              component={Button}
              onClick={() => setStep('form')}
              sx={{
                textAlign: 'left',
                p: 2,
                borderRadius: 3,
                borderColor: 'rgba(15, 23, 42, 0.12)',
                background: 'linear-gradient(135deg, #0A6B3B 0%, #0B8A47 60%, #0F9A52 100%)',
                color: '#fff',
                justifyContent: 'flex-start',
              }}
            >
              <Stack spacing={1} sx={{ width: 1 }}>
                <Typography fontWeight={900} sx={{ letterSpacing: 0.2 }}>
                  NEDNAMIBIA
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.9 }}>
                  Life Assurance
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.95, fontWeight: 750 }}>
                  NedLife Insurance
                </Typography>
              </Stack>
            </Paper>
          </Stack>
        ) : null}

        {step === 'form' ? (
          <Stack spacing={2}>
            <Typography fontWeight={850} sx={{ fontSize: '1.05rem', letterSpacing: -0.2 }}>
              {providerName}
            </Typography>
            <Paper variant="outlined" sx={{ borderRadius: 3, p: 2 }}>
              <Typography fontWeight={850} sx={{ mb: 1 }}>
                Nedbank Funeral Plan Application Form
              </Typography>
              <Tabs
                value={page}
                onChange={(_, v) => setPage(v)}
                variant="fullWidth"
                sx={{ mb: 1 }}
              >
                <Tab label="Page 1" />
                <Tab label="Page 2" />
              </Tabs>
              <Divider sx={{ mb: 1.5 }} />
              {page === 0 ? (
                <Stack spacing={1}>
                  <Typography variant="body2" color="text.secondary">
                    Complete this demo form to proceed.
                  </Typography>
                  <Typography variant="body2">1) Contact details</Typography>
                  <Typography variant="body2">2) Proof of identity</Typography>
                  <Typography variant="body2">3) Premium payer details</Typography>
                </Stack>
              ) : (
                <Stack spacing={1}>
                  <Typography variant="body2">4) Beneficiaries</Typography>
                  <Typography variant="body2">5) Terms & conditions</Typography>
                  <Typography variant="body2" color="text.secondary">
                    In the real product, this would be a hosted form or embedded flow.
                  </Typography>
                </Stack>
              )}
            </Paper>
            <Button variant="contained" size="large" fullWidth sx={{ py: 1.25, fontWeight: 850 }} onClick={() => setStep('confirm')}>
              Next
            </Button>
          </Stack>
        ) : null}

        {step === 'confirm' ? (
          <Stack spacing={2} alignItems="center" textAlign="center">
            <Typography fontWeight={850} sx={{ fontSize: '1.05rem', letterSpacing: -0.2 }}>
              Confirm Payment
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Payment to
            </Typography>
            <Typography fontWeight={900} sx={{ fontSize: '1.15rem' }}>
              {providerName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Amount
            </Typography>
            <Typography fontWeight={950} sx={{ fontSize: '1.4rem', color: 'primary.main' }}>
              {formatNad(amountCents)}
            </Typography>

            <Button
              startIcon={<FingerprintIcon />}
              variant="outlined"
              onClick={() => void runPaymentPipeline()}
              sx={{ borderRadius: 999, px: 3, fontWeight: 850 }}
            >
              Use Biometrics
            </Button>
            <Typography variant="caption" color="text.secondary">
              or
            </Typography>
            <Button variant="contained" onClick={() => setStep('pin')} sx={{ borderRadius: 999, px: 3, fontWeight: 850 }}>
              Enter App Pin
            </Button>
          </Stack>
        ) : null}

        {step === 'pin' ? (
          <Stack spacing={2} alignItems="center">
            <Typography fontWeight={850} sx={{ fontSize: '1.05rem', letterSpacing: -0.2 }}>
              Enter App PIN
            </Typography>
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
                    fontWeight: 850,
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
                      onClick={() => {
                        setPinError(null)
                        setPin((p) => (p.length >= 4 ? p : `${p}${d}`))
                      }}
                      sx={{ py: 1.25, fontWeight: 850, borderRadius: 2 }}
                    >
                      {d}
                    </Button>
                  ))}
                </Stack>
              ))}
              <Stack direction="row" gap={1}>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => {
                    setPinError(null)
                    setPin('')
                  }}
                  sx={{ py: 1.25, fontWeight: 850, borderRadius: 2 }}
                >
                  Clear
                </Button>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => {
                    setPinError(null)
                    setPin((p) => p.slice(0, -1))
                  }}
                  sx={{ py: 1.25, fontWeight: 850, borderRadius: 2 }}
                >
                  ⌫
                </Button>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => {
                    setPinError(null)
                    setPin((p) => (p.length >= 4 ? p : `${p}0`))
                  }}
                  sx={{ py: 1.25, fontWeight: 850, borderRadius: 2 }}
                >
                  0
                </Button>
              </Stack>
            </Stack>
            <Button
              variant="contained"
              size="large"
              fullWidth
              sx={{ py: 1.25, fontWeight: 850 }}
              onClick={() => {
                if (pin.length !== 4) {
                  setPinError('Enter a 4-digit PIN.')
                  return
                }
                setPinError(null)
                void runPaymentPipeline()
              }}
            >
              Continue
            </Button>
          </Stack>
        ) : null}

        {step === 'processing' ? (
          <Stack spacing={2}>
            <Typography fontWeight={850} sx={{ fontSize: '1.05rem', letterSpacing: -0.2 }}>
              Loading
            </Typography>
            <LinearProgress sx={{ borderRadius: 1 }} />
            <Stack spacing={1.1}>
              {processingLog.map((line, i) => (
                <Typography key={`${i}-${line}`} variant="body2" color="text.secondary">
                  {line}
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
            <Typography variant="h6" fontWeight={850}>
              {resultOk ? 'Success!' : 'Failed'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Payment {resultOk ? 'confirmation' : 'unsuccessful'}
            </Typography>
            <Typography fontWeight={900} sx={{ fontSize: '1.25rem' }}>
              {formatNad(amountCents)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {providerName}
            </Typography>

            {error ? <Alert severity="warning">{error}</Alert> : null}

            <Divider sx={{ my: 1 }} />

            <Typography variant="caption" color="text.secondary" fontWeight={750}>
              Transaction details
            </Typography>
            <Typography sx={{ fontFamily: 'monospace', fontWeight: 850, fontSize: '0.95rem' }}>
              {ref}
            </Typography>
            {correlationId ? (
              <Typography variant="caption" color="text.secondary">
                Session: {correlationId}
              </Typography>
            ) : null}

            <Button component={RouterLink} to={notificationsHref} variant="outlined" sx={{ borderRadius: 999, fontWeight: 850 }}>
              View notifications
            </Button>
            <Button component={RouterLink} to={backHref} variant="contained" sx={{ borderRadius: 999, fontWeight: 850 }}>
              Done
            </Button>
          </Stack>
        ) : null}
      </Box>
    </Paper>
  )

  return (
    <Box sx={{ minHeight: '100dvh', background: BRAND_GRADIENT, color: '#fff', pb: 4 }}>
      <Box sx={{ maxWidth: 520, mx: 'auto', px: 2, pt: 2.25 }}>
        <Stack direction="row" alignItems="center" gap={1.25}>
          <IconButton
            onClick={() => {
              if (step === 'provider') navigate(backHref)
              else if (step === 'form') setStep('provider')
              else if (step === 'confirm') setStep('form')
              else if (step === 'pin') setStep('confirm')
              else navigate(backHref)
            }}
            aria-label="Back"
            size="small"
            sx={{ color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            <ArrowBackIosNewIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography fontWeight={750} sx={{ fontSize: '0.95rem', opacity: 0.92 }}>
              PT App › Services › Insurance
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right', minWidth: 86 }}>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              Amount
            </Typography>
            <Typography fontWeight={850} sx={{ lineHeight: 1.1 }}>
              {headerAmount}
            </Typography>
          </Box>
        </Stack>
        {card}
      </Box>
    </Box>
  )
}

