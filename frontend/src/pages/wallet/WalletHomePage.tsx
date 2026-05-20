import { useCallback, useEffect, useRef, useState } from 'react'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Box,
  ButtonBase,
  Card,
  FormControl,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material'
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'
import CreditCardIcon from '@mui/icons-material/CreditCard'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import RequestQuoteIcon from '@mui/icons-material/RequestQuote'
import CallSplitIcon from '@mui/icons-material/CallSplit'
import SavingsOutlinedIcon from '@mui/icons-material/SavingsOutlined'
import RedeemIcon from '@mui/icons-material/Redeem'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined'
import { WalletPageShell } from '../../components/wallet/WalletPageShell'
import { WalletBalanceHero } from '../../components/wallet/WalletBalanceHero'
import { WalletQuickActionsPanel } from '../../components/wallet/WalletQuickActionsPanel'
import { WalletNavList } from '../../components/wallet/WalletNavList'
import { WalletRecentActivityList } from '../../components/wallet/WalletRecentActivityList'
import { WalletAddFundsCard } from '../../components/wallet/WalletAddFundsCard'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { formatNad, MOCK_TRANSACTIONS, WALLET_BALANCE_CENTS, type WalletTransaction } from '../../data/walletMock'
import { useAuthMe } from '../../hooks/useAuthMe'
import { readApiError } from '../../lib/apiOrigin'
import { APP_WALLET_DISPLAY_NAME } from '../../theme/branding'
import { WALLET_REWARDS_SIDEBAR_BG, walletCardSx } from '../../theme/walletTheme'

const QUICK_FUND_CENTS = [5_000, 10_000, 20_000, 50_000] as const

export function WalletHomePage() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const prefix = pathname.startsWith('/embed') ? '/embed/wallet' : '/wallet'
  const ordersPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const { user, loading: authLoading } = useAuthMe()
  const addFundsRef = useRef<HTMLDivElement | null>(null)

  const [balanceCents, setBalanceCents] = useState<number | null>(null)
  const [walletDemoAvailable, setWalletDemoAvailable] = useState(true)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [hideBalance, setHideBalance] = useState(false)
  const [fundNad, setFundNad] = useState('')
  const [fundBusy, setFundBusy] = useState(false)
  const [fundMsg, setFundMsg] = useState<string | null>(null)
  const [recentTx, setRecentTx] = useState<WalletTransaction[]>([])
  const [recentLoading, setRecentLoading] = useState(false)
  const [dueInstalments, setDueInstalments] = useState<
    {
      order_id: string
      instalment_id: string
      instalment_number: number
      amount_cents: number
      currency: string
      due_date: string
    }[]
  >([])

  const loadDueInstalments = useCallback(async () => {
    if (!user) {
      setDueInstalments([])
      return
    }
    try {
      const res = await apiFetch('/api/wallet/payment-plan-instalments-due')
      if (!res.ok) return
      const data = (await res.json()) as { items?: typeof dueInstalments }
      setDueInstalments(data.items ?? [])
    } catch {
      setDueInstalments([])
    }
  }, [user])

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

  const loadRecentTx = useCallback(async () => {
    if (!user) {
      setRecentTx(MOCK_TRANSACTIONS.slice(0, 5))
      return
    }
    setRecentLoading(true)
    try {
      const res = await apiFetch('/api/wallet/transactions')
      if (!res.ok) {
        setRecentTx([])
        return
      }
      const data = (await res.json()) as { items?: WalletTransaction[] }
      setRecentTx((data.items ?? []).slice(0, 5))
    } catch {
      setRecentTx([])
    } finally {
      setRecentLoading(false)
    }
  }, [user])

  useEffect(() => {
    void loadBalance()
  }, [loadBalance])

  useEffect(() => {
    void loadRecentTx()
  }, [loadRecentTx])

  useEffect(() => {
    const onWalletUpdated = () => {
      void loadBalance()
      void loadDueInstalments()
      void loadRecentTx()
    }
    window.addEventListener('pt-wallet-updated', onWalletUpdated)
    return () => window.removeEventListener('pt-wallet-updated', onWalletUpdated)
  }, [loadBalance, loadDueInstalments, loadRecentTx])

  useEffect(() => {
    void loadDueInstalments()
  }, [loadDueInstalments])

  const displayCents = user ? (balanceCents ?? 0) : WALLET_BALANCE_CENTS
  const balanceCaption = user
    ? walletDemoAvailable
      ? 'Your account wallet - use for payments at a PayToday Wallet merchant or bill-pay.'
      : 'Wallet funding is not available on this database. Contact your administrator, then refresh.'
    : 'Sample balance for guests. Sign in to fund and spend from your wallet.'

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
      setFundMsg(`Added ${formatNad(amountCents)} to your wallet.`)
      setFundNad('')
      window.dispatchEvent(new Event('pt-wallet-updated'))
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

  const quickScanActions = [
    {
      to: `${prefix}/scan/pay-code`,
      title: 'Scan Code to Pay',
      subtitle: 'Enter merchant code manually',
      icon: <QrCodeScannerIcon sx={{ fontSize: 28 }} />,
    },
    {
      to: `${prefix}/scan/receive-qr`,
      title: 'Generate Receive QR',
      subtitle: 'Show to receive funds',
      icon: <QrCodeScannerIcon sx={{ fontSize: 28 }} />,
    },
    {
      to: `${prefix}/scan/my-qr`,
      title: 'View My Static QR',
      subtitle: 'For consistent personal use',
      icon: <QrCodeScannerIcon sx={{ fontSize: 28 }} />,
    },
  ] as const

  const sidebarServices = [
    { to: `${prefix}/paytoday`, label: APP_WALLET_DISPLAY_NAME, icon: <AccountBalanceWalletIcon /> },
    { to: `${prefix}/cards`, label: 'My Cards', icon: <CreditCardIcon /> },
    { to: `${prefix}/bank`, label: 'My Bank Details', icon: <AccountBalanceIcon /> },
    { to: `${prefix}/transactions`, label: 'My Transactions', icon: <ReceiptLongIcon /> },
    { to: `${prefix}/request-payment`, label: 'Request a Payment', icon: <RequestQuoteIcon /> },
    { to: `${prefix}/split-bill`, label: 'Split your bill', icon: <CallSplitIcon /> },
    { to: `${prefix}/savings`, label: 'Savings pocket', icon: <SavingsOutlinedIcon /> },
  ]

  return (
    <WalletPageShell variant="home">
      <Stack
        direction={{ xs: 'column', lg: 'row' }}
        spacing={2.5}
        alignItems={{ lg: 'flex-start' }}
        sx={{ width: 1 }}
      >
        <Stack spacing={2} sx={{ flex: 1, minWidth: 0, width: 1 }}>
          <WalletBalanceHero
            balanceCents={displayCents}
            loading={Boolean(user && balanceLoading)}
            caption={balanceCaption}
            hideBalance={hideBalance}
            onToggleHide={() => setHideBalance((v) => !v)}
            onRefresh={user ? () => void loadBalance() : undefined}
            refreshing={balanceLoading}
          />

          <WalletQuickActionsPanel actions={[...quickScanActions]} />

          <Box ref={addFundsRef}>
            {user && walletDemoAvailable ? (
              <WalletAddFundsCard
                quickAmountsCents={QUICK_FUND_CENTS}
                fundNad={fundNad}
                fundBusy={fundBusy}
                fundMsg={fundMsg}
                authLoading={authLoading}
                onFundNadChange={setFundNad}
                onQuickFund={(c) => void addDemoFunds(c)}
                onSubmitCustom={() => {
                  const c = parseFundInput()
                  if (c == null || c < 100) {
                    setFundMsg('Enter at least N$1.00.')
                    return
                  }
                  void addDemoFunds(c)
                }}
              />
            ) : null}
          </Box>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="stretch">
            <Box sx={{ flex: { md: '0 0 42%' }, minWidth: { md: 280 }, maxWidth: 1 }}>
              <Card elevation={0} sx={{ ...walletCardSx, p: 2, height: 1 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5, minWidth: 0 }}>
                  <CalendarMonthOutlinedIcon color="primary" fontSize="small" sx={{ flexShrink: 0 }} />
                  <Typography variant="subtitle1" fontWeight={800} noWrap>
                    Payment plans
                  </Typography>
                </Stack>
                {user ? (
                  <FormControl fullWidth size="small">
                    <Select
                      value=""
                      displayEmpty
                      aria-label="Due instalments"
                      onChange={(e) => {
                        const path = e.target.value
                        if (path) navigate(path)
                      }}
                      renderValue={() => (
                        <Typography variant="body2" color="text.secondary" noWrap>
                          Due instalments
                        </Typography>
                      )}
                      sx={{
                        borderRadius: 2,
                        bgcolor: 'background.paper',
                        '& .MuiSelect-select': { py: 1.25 },
                      }}
                    >
                      <MenuItem value="" disabled sx={{ whiteSpace: 'normal' }}>
                        {dueInstalments.length === 0
                          ? 'No due instalments'
                          : 'Select instalment to pay'}
                      </MenuItem>
                      {dueInstalments.slice(0, 8).map((row) => (
                        <MenuItem
                          key={row.instalment_id}
                          value={`${ordersPrefix}/orders/${row.order_id}`}
                          sx={{ whiteSpace: 'normal' }}
                        >
                          <Typography variant="body2" component="span" sx={{ lineHeight: 1.4 }}>
                            #{row.instalment_number} · {formatNad(row.amount_cents)}
                            <br />
                            <Typography component="span" variant="caption" color="text.secondary">
                              Due {row.due_date}
                            </Typography>
                          </Typography>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Sign in to view payment plan instalments.
                  </Typography>
                )}
              </Card>
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <WalletRecentActivityList
                items={recentTx}
                viewAllTo={`${prefix}/transactions`}
                loading={recentLoading}
              />
            </Box>
          </Stack>
        </Stack>

        <Stack spacing={2} sx={{ width: { xs: 1, lg: 300 }, flexShrink: 0 }}>
          <ButtonBase
            component={RouterLink}
            to={`${prefix}/rewards`}
            sx={{
              width: 1,
              borderRadius: 2,
              bgcolor: WALLET_REWARDS_SIDEBAR_BG,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1.25,
              py: 2.25,
              px: 2,
              transition: 'filter 0.15s ease',
              '&:hover': { filter: 'brightness(1.06)' },
            }}
          >
            <RedeemIcon sx={{ fontSize: 28 }} />
            <Typography fontWeight={800} fontSize="1.05rem">
              Claim My Rewards
            </Typography>
          </ButtonBase>

          <Box>
            <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1.25, px: 0.25 }}>
              Wallet Services
            </Typography>
            <WalletNavList groups={[{ items: sidebarServices }]} />
          </Box>
        </Stack>
      </Stack>
    </WalletPageShell>
  )
}
