import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useLocation, useSearchParams } from 'react-router-dom'
import { Avatar, Button, Stack, TextField, Typography } from '@mui/material'
import CreditCardOutlinedIcon from '@mui/icons-material/CreditCardOutlined'
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined'
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined'
import ArrowBackIosNewOutlinedIcon from '@mui/icons-material/ArrowBackIosNewOutlined'
import { OnboardingShell } from './OnboardingShell'

function safePrefix(pathname: string): string {
  return pathname.startsWith('/embed') ? '/embed' : ''
}

function safeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith('/')) return '/shop'
  if (raw.startsWith('/admin')) return '/shop'
  if (raw.startsWith('/onboarding')) return '/shop'
  return raw
}

type Step = 'form' | 'threeDS' | 'success' | 'failed'

export function OnboardingAddCardFlowPage() {
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const prefix = safePrefix(pathname)
  const returnTo = useMemo(() => safeReturnTo(searchParams.get('returnTo')), [searchParams])

  const [step, setStep] = useState<Step>('form')
  const [nickname, setNickname] = useState('My Card')
  const [number, setNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')

  useEffect(() => {
    if (step !== 'threeDS') return
    const t = window.setTimeout(() => {
      const ok = Math.random() > 0.18
      setStep(ok ? 'success' : 'failed')
    }, 1200)
    return () => window.clearTimeout(t)
  }, [step])

  const canSubmit = nickname.trim().length > 0 && number.trim().length >= 12 && expiry.trim().length >= 4 && cvv.trim().length >= 3

  return (
    <OnboardingShell title="Add a card" subtitle={step === 'form' ? undefined : null}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: -0.25 }}>
        <Button
          component={RouterLink}
          to={`${prefix}/onboarding/permissions?returnTo=${encodeURIComponent(returnTo)}`}
          variant="text"
          startIcon={<ArrowBackIosNewOutlinedIcon fontSize="small" />}
          sx={{ color: 'rgba(255,255,255,0.88)', fontWeight: 850, px: 0 }}
        >
          Back
        </Button>
        <Typography sx={{ color: 'rgba(255,255,255,0.92)', fontWeight: 900, letterSpacing: 2, fontSize: 12 }}>PAY TODAY</Typography>
      </Stack>

      {step === 'form' ? (
        <Stack spacing={1.75} sx={{ mt: 1 }}>
          <TextField
            label="Card Number"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            fullWidth
            placeholder="0000 0000 0000 0000"
            inputMode="numeric"
            variant="standard"
            InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.78)' } }}
            InputProps={{ sx: { color: '#fff' } }}
            sx={{ '& .MuiInput-underline:before': { borderBottomColor: 'rgba(255,255,255,0.35)' } }}
          />
          <TextField
            label="Name on Card"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            fullWidth
            variant="standard"
            InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.78)' } }}
            InputProps={{ sx: { color: '#fff' } }}
            sx={{ '& .MuiInput-underline:before': { borderBottomColor: 'rgba(255,255,255,0.35)' } }}
          />
          <TextField
            label="Expiry Date (MM/YY)"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            fullWidth
            placeholder="MM/YY"
            inputMode="numeric"
            variant="standard"
            InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.78)' } }}
            InputProps={{ sx: { color: '#fff' } }}
            sx={{ '& .MuiInput-underline:before': { borderBottomColor: 'rgba(255,255,255,0.35)' } }}
          />
          <TextField
            label="CVV Number"
            value={cvv}
            onChange={(e) => setCvv(e.target.value)}
            fullWidth
            placeholder="123"
            inputMode="numeric"
            type="password"
            variant="standard"
            InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.78)' } }}
            InputProps={{ sx: { color: '#fff' } }}
            sx={{ '& .MuiInput-underline:before': { borderBottomColor: 'rgba(255,255,255,0.35)' } }}
          />

          <Button
            variant="contained"
            size="large"
            disabled={!canSubmit}
            onClick={() => setStep('threeDS')}
            sx={{
              borderRadius: 999,
              fontWeight: 900,
              py: 1.15,
              mt: 1,
              bgcolor: 'rgba(34, 211, 238, 0.95)',
              color: 'rgba(10, 10, 40, 0.92)',
              '&:hover': { bgcolor: 'rgba(34, 211, 238, 1)' },
            }}
          >
            Save
          </Button>
        </Stack>
      ) : step === 'threeDS' ? (
        <Stack spacing={2.25} alignItems="center" textAlign="center" sx={{ pt: 8 }}>
          <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.92)', width: 64, height: 64 }}>
            <CreditCardOutlinedIcon />
          </Avatar>
          <Typography variant="h6" fontWeight={900} sx={{ letterSpacing: -0.2 }}>
            3D Secure Authentication
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.78)', lineHeight: 1.6 }}>
            Verifying with your bank…
          </Typography>
        </Stack>
      ) : step === 'success' ? (
        <Stack spacing={2.25} alignItems="center" textAlign="center" sx={{ pt: 8 }}>
          <Avatar sx={{ bgcolor: 'rgba(34, 211, 238, 0.18)', color: 'rgba(255,255,255,0.95)', width: 70, height: 70 }}>
            <VerifiedOutlinedIcon fontSize="large" />
          </Avatar>
          <Typography variant="h6" fontWeight={900} sx={{ letterSpacing: -0.2 }}>
            Card successfully added!
          </Typography>
          <Button
            component={RouterLink}
            to={`${prefix}/onboarding/add-bank?returnTo=${encodeURIComponent(returnTo)}`}
            variant="contained"
            size="large"
            sx={{
              borderRadius: 999,
              fontWeight: 900,
              py: 1.15,
              mt: 1,
              bgcolor: 'rgba(34, 211, 238, 0.95)',
              color: 'rgba(10, 10, 40, 0.92)',
              '&:hover': { bgcolor: 'rgba(34, 211, 238, 1)' },
            }}
          >
            Continue
          </Button>
        </Stack>
      ) : (
        <Stack spacing={2.25} alignItems="center" textAlign="center" sx={{ pt: 8 }}>
          <Avatar sx={{ bgcolor: 'rgba(0,0,0,0.22)', color: 'rgba(255,255,255,0.92)', width: 70, height: 70 }}>
            <CloseOutlinedIcon fontSize="large" />
          </Avatar>
          <Typography variant="h6" fontWeight={900} sx={{ letterSpacing: -0.2 }}>
            Failed.
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.78)', lineHeight: 1.6 }}>
            Something went wrong while verifying your card.
          </Typography>
          <Button
            variant="contained"
            size="large"
            onClick={() => setStep('form')}
            sx={{
              borderRadius: 999,
              fontWeight: 900,
              py: 1.15,
              mt: 1,
              bgcolor: 'rgba(34, 211, 238, 0.95)',
              color: 'rgba(10, 10, 40, 0.92)',
              '&:hover': { bgcolor: 'rgba(34, 211, 238, 1)' },
            }}
          >
            Try again
          </Button>
        </Stack>
      )}
    </OnboardingShell>
  )
}

