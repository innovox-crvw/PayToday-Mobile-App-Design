import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  CircularProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { PageHeader } from '../../components/page/PageHeader'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'
import CreditCardIcon from '@mui/icons-material/CreditCard'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import RequestQuoteIcon from '@mui/icons-material/RequestQuote'
import CallSplitIcon from '@mui/icons-material/CallSplit'
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard'
import PaymentsIcon from '@mui/icons-material/Payments'
import RedeemIcon from '@mui/icons-material/Redeem'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { formatNad, WALLET_BALANCE_CENTS } from '../../data/walletMock'
import { useAuthMe } from '../../hooks/useAuthMe'
import { readApiError } from '../../lib/apiOrigin'
import { CHROME_SHADOW_DEEP, WALLET_BALANCE_GRADIENT } from '../../theme/branding'

const menu = [
  { to: 'paytoday', label: 'PayToday Wallet', icon: <AccountBalanceWalletIcon /> },
  { to: 'cards', label: 'My Cards', icon: <CreditCardIcon /> },
  { to: 'bank', label: 'My Bank Details', icon: <AccountBalanceIcon /> },
  { to: 'transactions', label: 'My Transactions', icon: <ReceiptLongIcon /> },
  { to: 'request-payment', label: 'Request a Payment', icon: <RequestQuoteIcon /> },
  { to: 'split-bill', label: 'Split your bill', icon: <CallSplitIcon /> },
  { to: 'vouchers', label: 'Vouchers', icon: <CardGiftcardIcon /> },
  { to: 'cashout', label: 'Cashout', icon: <PaymentsIcon /> },
] as const

const QUICK_FUND_CENTS = [5_000, 10_000, 20_000, 50_000] as const

export function WalletHomePage() {
  const { pathname } = useLocation()
  const prefix = pathname.startsWith('/embed') ? '/embed/wallet' : '/wallet'
  const profilePath = pathname.startsWith('/embed') ? '/embed/profile' : '/profile'
  const { user, loading: authLoading } = useAuthMe()

  const [balanceCents, setBalanceCents] = useState<number | null>(null)
  const [walletDemoAvailable, setWalletDemoAvailable] = useState(true)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [fundNad, setFundNad] = useState('')
  const [fundBusy, setFundBusy] = useState(false)
  const [fundMsg, setFundMsg] = useState<string | null>(null)

  const loadBalance = useCallback(async () => {
    if (!user) {
      setBalanceCents(null)
      setWalletDemoAvailable(true)
      return
    }
    setBalanceLoading(true)
    setFundMsg(null)
    try {
      const res = await apiFetch('/api/wallet/balance')
      if (!res.ok) {
        setBalanceCents(null)
        setWalletDemoAvailable(false)
        return
      }
      const data = (await res.json()) as { balanceCents?: number; walletDemoAvailable?: boolean }
      setBalanceCents(typeof data.balanceCents === 'number' ? data.balanceCents : 0)
      setWalletDemoAvailable(data.walletDemoAvailable !== false)
    } catch {
      setBalanceCents(null)
      setWalletDemoAvailable(false)
    } finally {
      setBalanceLoading(false)
    }
  }, [user])

  useEffect(() => {
    void loadBalance()
  }, [loadBalance])

  const displayCents = user ? (balanceCents ?? 0) : WALLET_BALANCE_CENTS
  const showBalanceSpinner = Boolean(user && balanceLoading)

  async function addDemoFunds(amountCents: number) {
    if (!user) return
    setFundBusy(true)
    setFundMsg(null)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/wallet/demo/fund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents }),
      })
      if (!res.ok) {
        setFundMsg(await readApiError(res))
        return
      }
      const data = (await res.json()) as { balanceCents?: number }
      if (typeof data.balanceCents === 'number') setBalanceCents(data.balanceCents)
      else void loadBalance()
      setFundMsg(`Added ${formatNad(amountCents)} to your demo wallet.`)
      setFundNad('')
    } catch (e) {
      setFundMsg(e instanceof Error ? e.message : 'Could not add funds')
    } finally {
      setFundBusy(false)
    }
  }

  function parseFundInput(): number | null {
    const raw = fundNad.replace(/,/gu, '.').trim()
    if (!raw) return null
    const n = Number.parseFloat(raw)
    if (!Number.isFinite(n) || n <= 0) return null
    return Math.round(n * 100)
  }

  return (
    <Stack spacing={{ xs: 2.5, md: 3.5 }} sx={{ maxWidth: { xs: 560, md: 720 }, mx: 'auto', pb: { xs: 2, md: 4 } }}>
      <PageHeader
        overline="Wallet"
        title="Overview"
        titleVariant="h4"
        subtitle="Balances, funding sources, and activity — same place you pay and get paid."
      />

      <Card
        elevation={0}
        sx={{
          borderRadius: 3,
          background: WALLET_BALANCE_GRADIENT,
          color: '#fff',
          p: { xs: 3, md: 3.5 },
          boxShadow: CHROME_SHADOW_DEEP,
          position: 'relative',
          overflow: 'hidden',
          '&::after': {
            content: '""',
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(120% 80% at 100% 0%, rgba(255,255,255,0.14) 0%, transparent 55%)',
            pointerEvents: 'none',
          },
        }}
      >
        <Stack spacing={2} sx={{ position: 'relative', zIndex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1.5} justifyContent={{ xs: 'center', md: 'flex-start' }}>
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 2,
                bgcolor: 'rgba(255,255,255,0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AccountBalanceWalletIcon sx={{ fontSize: 26 }} />
            </Box>
            <Box>
              <Typography variant="body2" sx={{ opacity: 0.92, fontWeight: 600 }}>
                Available balance
              </Typography>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.25 }}>
                {showBalanceSpinner ? (
                  <CircularProgress size={28} sx={{ color: 'rgba(255,255,255,0.85)' }} />
                ) : (
                  <Typography variant="h4" fontWeight={800} letterSpacing={-0.55}>
                    {formatNad(displayCents)}
                  </Typography>
                )}
              </Stack>
            </Box>
          </Stack>
          <Typography variant="caption" sx={{ opacity: 0.85, textAlign: { xs: 'center', md: 'left' } }}>
            {user
              ? walletDemoAvailable
                ? 'Demo wallet tied to your account: add funds below, then pay with “PayToday Wallet” in hub demos or Vouchers.'
                : 'Demo wallet tables are not on this database yet. Run backend/scripts/paytoday-add-demo-wallet.sql, then refresh.'
              : 'Sample balance for guests. Sign in to use a working demo balance (fund + spend).'}
          </Typography>
        </Stack>
      </Card>

      {user && walletDemoAvailable ? (
        <Card variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider', p: { xs: 2, md: 2.5 } }}>
          <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1 }}>
            Add demo funds
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            For testing only — credits your demo wallet so hub payments and vouchers can debit it.
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 1.5 }}>
            {QUICK_FUND_CENTS.map((c) => (
              <Button
                key={c}
                size="small"
                variant="outlined"
                disabled={fundBusy}
                onClick={() => void addDemoFunds(c)}
                sx={{ fontWeight: 700 }}
              >
                +{formatNad(c)}
              </Button>
            ))}
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ sm: 'flex-start' }}>
            <TextField
              label="Amount (N$)"
              value={fundNad}
              onChange={(e) => setFundNad(e.target.value)}
              placeholder="e.g. 250"
              size="small"
              disabled={fundBusy}
              inputProps={{ inputMode: 'decimal' }}
              sx={{ flex: 1, minWidth: 0 }}
            />
            <Button
              variant="contained"
              disabled={fundBusy || authLoading}
              onClick={() => {
                const c = parseFundInput()
                if (c == null || c < 100) {
                  setFundMsg('Enter at least N$1.00.')
                  return
                }
                void addDemoFunds(c)
              }}
              sx={{ fontWeight: 800, minWidth: { sm: 140 }, mt: { xs: 0, sm: 0.5 } }}
            >
              {fundBusy ? 'Adding…' : 'Add funds'}
            </Button>
          </Stack>
          {fundMsg ? (
            <Alert severity={fundMsg.startsWith('Added') ? 'success' : 'warning'} sx={{ mt: 1.5 }}>
              {fundMsg}
            </Alert>
          ) : null}
        </Card>
      ) : null}

      <Button
        component={RouterLink}
        to={`${prefix}/rewards`}
        variant="outlined"
        color="primary"
        fullWidth
        size="large"
        startIcon={<RedeemIcon />}
        sx={{ borderRadius: 2, fontWeight: 700, py: 1.25, maxWidth: { md: 360 }, alignSelf: { md: 'flex-start' } }}
      >
        My Rewards
      </Button>

      <Stack spacing={1}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ px: 0.5, fontWeight: 700 }}>
          Wallet services
        </Typography>
        <Card variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider', overflow: 'hidden' }}>
          <List disablePadding>
            {menu.map((item, i) => (
              <ListItemButton
                key={item.to}
                component={RouterLink}
                to={`${prefix}/${item.to}`}
                sx={{
                  py: 2,
                  px: 2,
                  borderBottom: i < menu.length - 1 ? 1 : 0,
                  borderColor: 'divider',
                  borderRadius: 0,
                }}
              >
                <ListItemIcon sx={{ color: 'primary.main', minWidth: 48 }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 600, fontSize: '0.95rem' }} />
                <ChevronRightIcon color="action" sx={{ opacity: 0.7 }} />
              </ListItemButton>
            ))}
          </List>
        </Card>
      </Stack>

      <Card variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider' }}>
        <ListItemButton component={RouterLink} to={profilePath} sx={{ py: 2, px: 2, borderRadius: 3 }}>
          <ListItemIcon sx={{ minWidth: 48 }}>
            <PersonOutlineIcon color="primary" />
          </ListItemIcon>
          <ListItemText
            primary="Profile & preferences"
            secondary="Personal details, support, feedback — sign in from profile"
            primaryTypographyProps={{ fontWeight: 600 }}
            secondaryTypographyProps={{ variant: 'body2', sx: { mt: 0.25 } }}
          />
          <ChevronRightIcon color="action" sx={{ opacity: 0.7 }} />
        </ListItemButton>
      </Card>
    </Stack>
  )
}
