import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  LinearProgress,
  Link,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { Link as RouterLink, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../../api/client'
import { demoPresetAmountsCents, formatNadFromCents } from '../../data/hubDemoPayConfig'
import { getPaymentHubTileBySlug, SERVICES_HUB_TILES } from '../../data/hubNavigationStatic'
import { tileToPaymentCategory } from '../../data/paymentsCatalog'
import { useHubNavigationTiles } from '../../hooks/useHubNavigationTiles'
import { apiUrl, readApiError } from '../../lib/apiOrigin'
import type { HubPaymentCategoryItemDto, HubPaymentCategoryItemsResponse } from '../../types/paymentCategoryItems'

type Step = 'review' | 'amount' | 'method' | 'pin' | 'processing' | 'done'

type PayRail = 'wallet' | 'card' | 'ussd' | 'bank_eft'

type Payee = {
  name: string
  paymentMethodHint: string
  categoryLabel: string
}

type Props = { variant: 'payments' | 'services' }

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

const RAILS: { value: PayRail; label: string; hint: string }[] = [
  { value: 'wallet', label: 'PayToday Wallet', hint: 'Instant debit from wallet balance (simulated).' },
  { value: 'card', label: 'Card ·••• 5145', hint: 'Hosted card + 3-D Secure style wait (simulated).' },
  { value: 'ussd', label: 'USSD', hint: 'PIN prompt on handset (simulated delay).' },
  { value: 'bank_eft', label: 'Bank EFT', hint: 'Reference allocation + instruction (simulated instant).' },
]

export function HubPaymentDemoFlowPage({ variant }: Props) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const params = useParams<{ categoryId?: string; itemId?: string; slug?: string }>()
  const categoryId = params.categoryId?.trim() ?? ''
  const itemId = params.itemId?.trim() ?? ''
  const serviceSlug = (params.slug?.trim() ?? '').toLowerCase()

  const paymentsHub = useHubNavigationTiles('payments')
  const servicesHub = useHubNavigationTiles('services')

  const [step, setStep] = useState<Step>('review')
  const [payee, setPayee] = useState<Payee | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [amountCents, setAmountCents] = useState<number | null>(null)
  const [customNad, setCustomNad] = useState('')
  const [payMethod, setPayMethod] = useState<PayRail>('wallet')
  const [paymentRef, setPaymentRef] = useState('')
  const [processingLog, setProcessingLog] = useState<string[]>([])
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [paymentOk, setPaymentOk] = useState(true)
  const [session, setSession] = useState<'unknown' | 'in' | 'out'>('unknown')
  const pipelineLock = useRef(false)

  const categoryKey = variant === 'services' ? serviceSlug : categoryId

  const notificationsHref = pathPrefix ? `${pathPrefix}/notifications` : '/notifications'

  const backHref = useMemo(() => {
    if (variant === 'services') return pathPrefix ? `${pathPrefix}/services` : '/services'
    return pathPrefix ? `${pathPrefix}/payments/${encodeURIComponent(categoryId)}` : `/payments/${encodeURIComponent(categoryId)}`
  }, [variant, pathPrefix, categoryId])

  useEffect(() => {
    let cancelled = false
    fetch(apiUrl('/api/auth/me'), { credentials: 'include' }).then((r) => {
      if (!cancelled) setSession(r.ok ? 'in' : 'out')
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadError(null)
      try {
        if (variant === 'payments') {
          if (!categoryId || !itemId) {
            setPayee(null)
            setLoadError('Missing payment destination.')
            return
          }
          const tile =
            paymentsHub.fromDatabase && paymentsHub.items.length > 0
              ? paymentsHub.items.find((t) => t.slug === categoryId)
              : getPaymentHubTileBySlug(categoryId)
          const cat = tile ? tileToPaymentCategory(tile) : null
          const categoryLabel = cat?.label ?? categoryId

          const res = await fetch(apiUrl(`/api/hub/payment-category-items?category=${encodeURIComponent(categoryId)}`))
          if (!res.ok) throw new Error(await readApiError(res))
          const data = (await res.json()) as HubPaymentCategoryItemsResponse
          const row = (data.items ?? []).find((it) => it.id === itemId) as HubPaymentCategoryItemDto | undefined
          if (cancelled) return
          if (!row) {
            setLoadError('That payee is not in the current list. Go back and pick again.')
            setPayee(null)
            return
          }
          setPayee({
            name: row.displayName,
            paymentMethodHint: row.paymentMethod?.trim() || 'Wallet · Card · USSD · EFT',
            categoryLabel,
          })
        } else {
          if (!serviceSlug) {
            setPayee(null)
            setLoadError('Missing service.')
            return
          }
          if (serviceSlug === 'store') {
            setPayee(null)
            return
          }
          const tile =
            servicesHub.fromDatabase && servicesHub.items.length > 0
              ? servicesHub.items.find((t) => t.slug === serviceSlug)
              : SERVICES_HUB_TILES.find((t) => t.slug === serviceSlug)
          if (cancelled) return
          if (!tile) {
            setLoadError('Unknown service.')
            setPayee(null)
            return
          }
          setPayee({
            name: tile.label,
            paymentMethodHint: tile.paymentMethodsCaption?.trim() || 'Wallet · Card · USSD · EFT',
            categoryLabel: 'Services',
          })
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Could not load')
          setPayee(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    variant,
    categoryId,
    itemId,
    serviceSlug,
    paymentsHub.fromDatabase,
    paymentsHub.items,
    servicesHub.fromDatabase,
    servicesHub.items,
  ])

  const presets = useMemo(() => demoPresetAmountsCents(categoryKey), [categoryKey])

  const ensureSession = useCallback(async (): Promise<'in' | 'out'> => {
    if (session === 'in' || session === 'out') return session
    const r = await fetch(apiUrl('/api/auth/me'), { credentials: 'include' })
    const next = r.ok ? 'in' : 'out'
    setSession(next)
    return next
  }, [session])

  const startProcessing = useCallback(async () => {
    if (!payee || amountCents == null || pipelineLock.current) return
    pipelineLock.current = true
    setLoadError(null)
    const ref = `PT-${Date.now().toString(36).toUpperCase()}`
    setPaymentRef(ref)
    setProcessingLog([])
    setStep('processing')

    const append = (msg: string) => setProcessingLog((p) => [...p, msg])

    try {
      const s = await ensureSession()

      append('Validating payee, amount, and payment rail…')
      await sleep(400)

      append('Handing off to PayToday payment session (simulated gateway redirect)…')
      await sleep(350)

      let correlationId = ''

      if (s === 'in') {
        const base = {
          payeeName: payee.name,
          amountCents,
          payMethod,
          reference: ref,
        }
        const pendingBody =
          variant === 'payments'
            ? { variant: 'payments' as const, ...base, categorySlug: categoryId, itemId }
            : { variant: 'services' as const, ...base, serviceSlug }
        try {
          const res = await apiFetch('/api/hub/demo-payment/pending', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pendingBody),
          })
          if (res.status === 503) {
            append('Database unavailable — could not write to notification_outbox. The payment flow continues in the app.')
          } else if (!res.ok) {
            const t = await readApiError(res)
            append(`Pending notification: ${t.slice(0, 140)}`)
          } else {
            const j = (await res.json()) as { correlationId?: string }
            correlationId = (j.correlationId ?? '').trim()
            if (correlationId) {
              append('Recorded pending payment notification (same pipeline as store checkout).')
            } else {
              append('Pending API returned no session id — completion step skipped.')
            }
          }
        } catch (e) {
          append(`Pending step failed: ${e instanceof Error ? e.message : String(e)}`)
        }
      } else {
        append('Not signed in — skipped notification outbox. Sign in under Account to receive email and in-app notifications.')
      }

      await sleep(300)

      if (payMethod === 'card') {
        append('3-D Secure / issuer authorisation (simulated wait)…')
        await sleep(1100)
      } else if (payMethod === 'ussd') {
        append('USSD menu + PIN capture from handset (simulated)…')
        await sleep(1000)
      } else if (payMethod === 'bank_eft') {
        append('Issuing unique EFT reference and marking instruction as sent (simulated instant confirm)…')
        await sleep(800)
      } else {
        append('Wallet balance check and instant debit (simulated)…')
        await sleep(700)
      }

      append('Confirming settlement with PayToday core (simulated)…')
      await sleep(400)

      if (s === 'in' && correlationId) {
        const completeBody =
          variant === 'payments'
            ? {
                variant: 'payments' as const,
                categorySlug: categoryId,
                itemId,
                payeeName: payee.name,
                amountCents,
                payMethod,
                reference: ref,
                correlationId,
              }
            : {
                variant: 'services' as const,
                serviceSlug,
                payeeName: payee.name,
                amountCents,
                payMethod,
                reference: ref,
                correlationId,
              }
        let walletOutcomeSet = false
        try {
          const res = await apiFetch('/api/hub/demo-payment/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(completeBody),
          })
          const raw = await res.text()
          let j: { error?: string; code?: string } = {}
          try {
            j = JSON.parse(raw) as { error?: string; code?: string }
          } catch {
            /* ignore */
          }
          if (payMethod === 'wallet') {
            walletOutcomeSet = true
            if (res.ok) {
              append('Wallet debited. Payment completed notification queued (email and in-app when the worker runs).')
              setPaymentOk(true)
            } else {
              setPaymentOk(false)
              const msg = (j.error ?? raw).trim().slice(0, 220)
              if (j.code === 'insufficient_wallet') {
                append(`Wallet: ${msg}`)
              } else if (res.status === 503 && j.code === 'wallet_demo_unavailable') {
                append(`Wallet unavailable: ${msg}`)
              } else {
                append(`Complete step: ${msg || `HTTP ${res.status}`}`)
              }
            }
          } else if (res.status === 503) {
            append('Database unavailable — skipped “payment completed” outbox row.')
          } else if (!res.ok) {
            const t = (j.error ?? raw).trim().slice(0, 140) || `HTTP ${res.status}`
            append(`Completed notification: ${t}`)
          } else {
            append('Payment completed notification queued. The background worker delivers email and in-app messages.')
          }
        } catch (e) {
          append(`Complete step failed: ${e instanceof Error ? e.message : String(e)}`)
          if (payMethod === 'wallet') {
            walletOutcomeSet = true
            setPaymentOk(false)
          }
        }
        if (payMethod === 'wallet' && !walletOutcomeSet) {
          setPaymentOk(false)
        }
      } else if (s === 'in' && !correlationId) {
        append('Skipped completion row — no correlation id from pending step.')
      }

      await sleep(400)
      if (!(payMethod === 'wallet' && correlationId)) {
        /* Simulated outcome for non-wallet rails: mostly success. */
        const ok = Math.random() > 0.12
        setPaymentOk(ok)
      }
      setStep('done')
    } finally {
      pipelineLock.current = false
    }
  }, [
    payee,
    amountCents,
    payMethod,
    variant,
    categoryId,
    itemId,
    serviceSlug,
    ensureSession,
  ])

  function parseCustomAmount(): number | null {
    const raw = customNad.replace(/,/gu, '.').trim()
    if (!raw) return null
    const n = Number.parseFloat(raw)
    if (!Number.isFinite(n) || n <= 0) return null
    return Math.round(n * 100)
  }

  function goAmountNext() {
    const trimmed = customNad.trim()
    const fromCustom = parseCustomAmount()
    const cents = trimmed ? fromCustom : amountCents
    if (cents == null || cents < 100) {
      setLoadError('Enter at least N$ 1.00 or pick a preset.')
      return
    }
    setLoadError(null)
    setAmountCents(cents)
    setStep('method')
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (loadError && !payee && step === 'review') {
    return (
      <Stack spacing={2} sx={{ maxWidth: 480, mx: 'auto', px: 2, py: 2 }}>
        <Stack direction="row" alignItems="center" gap={1}>
          <IconButton component={RouterLink} to={backHref} aria-label="Back" size="small">
            <ArrowBackIosNewIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <Typography variant="h6" fontWeight={800}>
            Payment
          </Typography>
        </Stack>
        <Alert severity="warning">{loadError}</Alert>
        <Button component={RouterLink} to={backHref} variant="contained">
          Back
        </Button>
      </Stack>
    )
  }

  if (variant === 'services' && serviceSlug === 'store') {
    const shop = pathPrefix ? `${pathPrefix}/shop` : '/shop'
    return <Navigate to={shop} replace />
  }

  if (!payee) {
    return null
  }

  if (variant === 'payments' && (!categoryId || !itemId)) {
    const p = pathPrefix ? `${pathPrefix}/payments` : '/payments'
    return <Navigate to={p} replace />
  }

  const railLabel = RAILS.find((r) => r.value === payMethod)?.label ?? payMethod

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        background: 'linear-gradient(165deg, #0B0B3A 0%, #4A00E0 45%, #8E2DE2 100%)',
        color: '#fff',
        pb: 4,
      }}
    >
      <Box sx={{ maxWidth: 520, mx: 'auto', px: 2, pt: 2.25 }}>
        <Stack direction="row" alignItems="center" gap={1.25}>
          {step === 'done' ? (
            <Box sx={{ width: 40 }} />
          ) : (
            <IconButton
              onClick={() => {
                if (step === 'review') navigate(backHref)
                else if (step === 'amount') setStep('review')
                else if (step === 'method') setStep('amount')
                else if (step === 'pin') setStep('method')
                else if (step === 'processing') navigate(backHref)
                else navigate(backHref)
              }}
              aria-label="Back"
              size="small"
              disabled={step === 'processing'}
              sx={{ color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <ArrowBackIosNewIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography fontWeight={750} sx={{ fontSize: '0.95rem', opacity: 0.92 }}>
              {variant === 'services' ? 'Services' : 'Business payment'}
            </Typography>
            <Typography fontWeight={850} sx={{ fontSize: '1.2rem', letterSpacing: -0.25, lineHeight: 1.2 }} noWrap>
              {payee.name}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right', minWidth: 86 }}>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              Amount
            </Typography>
            <Typography fontWeight={850} sx={{ lineHeight: 1.1 }}>
              {amountCents != null ? formatNadFromCents(amountCents) : '—'}
            </Typography>
          </Box>
        </Stack>

        {loadError && step !== 'review' ? <Alert severity="warning" sx={{ mt: 2 }}>{loadError}</Alert> : null}

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
            {step === 'review' ? (
              <Stack spacing={2}>
                <Typography fontWeight={850} sx={{ fontSize: '1.05rem', letterSpacing: -0.2 }}>
                  Ready to pay
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                  {payee.categoryLabel}
                  {variant === 'payments' ? ` · item ${itemId.slice(0, 8)}…` : ''}
                </Typography>
                <Button fullWidth variant="contained" size="large" sx={{ py: 1.25, fontWeight: 850 }} onClick={() => setStep('amount')}>
                  Continue
                </Button>
                {session === 'out' ? (
                  <Alert severity="info">
                    Sign in on <strong>Account</strong> to receive email and in-app notifications for this flow.
                  </Alert>
                ) : null}
              </Stack>
            ) : null}

            {step === 'amount' ? (
              <Stack spacing={2}>
                <Typography fontWeight={850} sx={{ fontSize: '1.05rem', letterSpacing: -0.2 }}>
                  Enter amount
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={1}>
                  {presets.map((c) => (
                    <Chip
                      key={c}
                      label={formatNadFromCents(c)}
                      onClick={() => {
                        setAmountCents(c)
                        setCustomNad('')
                        setLoadError(null)
                      }}
                      color={amountCents === c && !customNad.trim() ? 'primary' : 'default'}
                      variant={amountCents === c && !customNad.trim() ? 'filled' : 'outlined'}
                      sx={{ fontWeight: 750 }}
                    />
                  ))}
                </Stack>
                <TextField
                  fullWidth
                  placeholder="Custom amount (N$)"
                  value={customNad}
                  onChange={(e) => {
                    setCustomNad(e.target.value)
                    setAmountCents(null)
                  }}
                  inputProps={{ inputMode: 'decimal' }}
                />
                <Button fullWidth variant="contained" size="large" sx={{ py: 1.25, fontWeight: 850 }} onClick={goAmountNext}>
                  Confirm
                </Button>
              </Stack>
            ) : null}

            {step === 'method' && amountCents != null ? (
              <Stack spacing={2}>
                <Typography fontWeight={850} sx={{ fontSize: '1.05rem', letterSpacing: -0.2 }}>
                  Payment method
                </Typography>
                <FormControl component="fieldset" fullWidth>
                  <RadioGroup value={payMethod} onChange={(e) => setPayMethod(e.target.value as PayRail)}>
                    {RAILS.map((r) => (
                      <Paper key={r.value} variant="outlined" sx={{ mb: 1, p: 1.1, borderRadius: 2 }}>
                        <FormControlLabel
                          value={r.value}
                          control={<Radio />}
                          label={
                            <Box>
                              <Typography variant="body2" fontWeight={750}>
                                {r.label}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {r.hint}
                              </Typography>
                            </Box>
                          }
                          sx={{ alignItems: 'flex-start', ml: 0 }}
                        />
                      </Paper>
                    ))}
                  </RadioGroup>
                </FormControl>
                <Button
                  fullWidth
                  variant="contained"
                  size="large"
                  sx={{ py: 1.25, fontWeight: 850 }}
                  onClick={() => {
                    setPin('')
                    setPinError(null)
                    setStep('pin')
                  }}
                >
                  Pay {formatNadFromCents(amountCents)}
                </Button>
              </Stack>
            ) : null}

            {step === 'pin' && amountCents != null ? (
              <Stack spacing={2}>
                <Typography fontWeight={850} sx={{ fontSize: '1.05rem', letterSpacing: -0.2 }}>
                  Enter PIN
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {railLabel} · {formatNadFromCents(amountCents)}
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
                {pinError ? <Alert severity="warning">{pinError}</Alert> : null}
                <Stack spacing={1}>
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
                  fullWidth
                  variant="contained"
                  size="large"
                  sx={{ py: 1.25, fontWeight: 850 }}
                  onClick={() => {
                    if (pin.length !== 4) {
                      setPinError('Enter a 4-digit PIN.')
                      return
                    }
                    setPinError(null)
                    void startProcessing()
                  }}
                >
                  Continue
                </Button>
              </Stack>
            ) : null}

            {step === 'processing' ? (
              <Stack spacing={2}>
                <Typography fontWeight={850} sx={{ fontSize: '1.05rem', letterSpacing: -0.2 }}>
                  Processing…
                </Typography>
                <LinearProgress sx={{ borderRadius: 1 }} />
                <Stack spacing={1.1}>
                  {processingLog.map((line, i) => (
                    <Stack direction="row" alignItems="flex-start" gap={1} key={`${i}-${line.slice(0, 24)}`}>
                      <CheckCircleIcon sx={{ fontSize: 18, color: 'success.main', mt: 0.15 }} />
                      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.45 }}>
                        {line}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </Stack>
            ) : null}

            {step === 'done' && amountCents != null ? (
              <Stack spacing={2} sx={{ textAlign: 'center' }}>
                <Box
                  sx={{
                    width: 112,
                    height: 112,
                    borderRadius: '50%',
                    border: (t) => `8px solid ${paymentOk ? t.palette.success.main : t.palette.error.main}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mx: 'auto',
                  }}
                >
                  {paymentOk ? (
                    <CheckCircleOutlineIcon sx={{ fontSize: 48, color: 'success.main' }} />
                  ) : (
                    <ErrorOutlineIcon sx={{ fontSize: 48, color: 'error.main' }} />
                  )}
                </Box>
                <Typography variant="h6" fontWeight={850}>
                  {paymentOk ? 'Success!' : 'Failed'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Payment {paymentOk ? 'confirmation' : 'unsuccessful'}
                </Typography>
                <Typography fontWeight={900} sx={{ fontSize: '1.25rem' }}>
                  {formatNadFromCents(amountCents)}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {payee.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {railLabel}
                </Typography>

                <Divider sx={{ my: 1.5 }} />

                <Typography variant="caption" color="text.secondary" fontWeight={750}>
                  Reference
                </Typography>
                <Typography sx={{ fontFamily: 'monospace', fontWeight: 850, fontSize: '0.95rem' }}>
                  {paymentRef}
                </Typography>

                {session === 'in' ? (
                  <Alert severity="success" sx={{ textAlign: 'left' }}>
                    Open{' '}
                    <Link component={RouterLink} to={notificationsHref} underline="hover" fontWeight={750}>
                      Notifications
                    </Link>{' '}
                    after a short wait to show the in-app feed.
                  </Alert>
                ) : null}

                <Button component={RouterLink} to={backHref} fullWidth variant="contained" sx={{ py: 1.25, fontWeight: 850 }}>
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
