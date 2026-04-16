import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useLocation, useSearchParams } from 'react-router-dom'
import { Avatar, Box, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined'
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined'
import { NAMIBIAN_BANKS } from '../../data/walletMock'
import { ONBOARDING_GRADIENT, ONBOARDING_PANEL_BG, ONBOARDING_PANEL_BORDER, ONBOARDING_PANEL_SHADOW } from './onboardingBranding'

function safePrefix(pathname: string): string {
  return pathname.startsWith('/embed') ? '/embed' : ''
}

function safeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith('/')) return '/shop'
  if (raw.startsWith('/admin')) return '/shop'
  if (raw.startsWith('/onboarding')) return '/shop'
  return raw
}

type Step = 'form' | 'saving' | 'success'

export function OnboardingAddBankFlowPage() {
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const prefix = safePrefix(pathname)
  const returnTo = useMemo(() => safeReturnTo(searchParams.get('returnTo')), [searchParams])

  const [step, setStep] = useState<Step>('form')
  const [accountName, setAccountName] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')

  const canSubmit = accountName.trim().length > 0 && bankName.trim().length > 0 && accountNumber.trim().length >= 6

  useEffect(() => {
    if (step !== 'saving') return
    const t = window.setTimeout(() => setStep('success'), 900)
    return () => window.clearTimeout(t)
  }, [step])

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        background: ONBOARDING_GRADIENT,
        display: 'grid',
        placeItems: 'center',
        px: 2,
        py: 4,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 420,
          bgcolor: ONBOARDING_PANEL_BG,
          border: '1px solid',
          borderColor: ONBOARDING_PANEL_BORDER,
          borderRadius: 6,
          boxShadow: ONBOARDING_PANEL_SHADOW,
          p: { xs: 3, sm: 3.5 },
        }}
      >
        {step === 'form' ? (
          <Stack spacing={2.25}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <AccountBalanceOutlinedIcon sx={{ color: 'primary.main' }} />
              <Typography variant="h5" fontWeight={900} letterSpacing={-0.3}>
                Enter your bank details
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
              Link a bank account for payouts and withdrawals.
            </Typography>

            <Stack spacing={1.25}>
              <TextField label="Account name" value={accountName} onChange={(e) => setAccountName(e.target.value)} fullWidth />
              <TextField
                select
                label="Bank"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                fullWidth
                SelectProps={{ displayEmpty: true }}
              >
                <MenuItem value="" disabled>
                  Choose your bank
                </MenuItem>
                {NAMIBIAN_BANKS.map((b) => (
                  <MenuItem key={b} value={b}>
                    {b}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Account number"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                fullWidth
                inputMode="numeric"
              />
            </Stack>

            <Button
              variant="contained"
              size="large"
              disabled={!canSubmit}
              onClick={() => setStep('saving')}
              sx={{ borderRadius: 999, fontWeight: 900, py: 1.2 }}
            >
              Save
            </Button>

            <Button component={RouterLink} to={`${prefix}${returnTo}`} variant="text" sx={{ fontWeight: 850, color: 'rgba(15, 23, 42, 0.72)' }}>
              Skip
            </Button>
          </Stack>
        ) : step === 'saving' ? (
          <Stack spacing={2.25} alignItems="center" textAlign="center">
            <Avatar sx={{ bgcolor: 'rgba(79, 70, 229, 0.10)', color: 'primary.main', width: 64, height: 64 }}>
              <AccountBalanceOutlinedIcon />
            </Avatar>
            <Typography variant="h5" fontWeight={900} letterSpacing={-0.3}>
              Saving…
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
              Please wait while we link your bank account.
            </Typography>
          </Stack>
        ) : (
          <Stack spacing={2.25} alignItems="center" textAlign="center">
            <Avatar sx={{ bgcolor: 'rgba(16, 185, 129, 0.12)', color: '#059669', width: 70, height: 70 }}>
              <VerifiedOutlinedIcon fontSize="large" />
            </Avatar>
            <Typography variant="h5" fontWeight={900} letterSpacing={-0.3}>
              Bank details successfully added!
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
              You’re all set.
            </Typography>
            <Button component={RouterLink} to={`${prefix}${returnTo}`} variant="contained" size="large" sx={{ borderRadius: 999, fontWeight: 900, py: 1.2 }}>
              Finish
            </Button>
          </Stack>
        )}
      </Paper>
    </Box>
  )
}

