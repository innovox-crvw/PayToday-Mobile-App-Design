import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Alert,
  Box,
  Card,
  CircularProgress,
  IconButton,
  InputAdornment,
  List,
  Menu,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import FilterListIcon from '@mui/icons-material/FilterList'
import IosShareIcon from '@mui/icons-material/IosShare'
import { WalletPageShell } from '../../components/wallet/WalletPageShell'
import { WalletTransactionRow } from '../../components/wallet/WalletTransactionRow'
import { walletCardSx } from '../../theme/walletTheme'
import { apiFetch } from '../../api/client'
import { MOCK_TRANSACTIONS, type TxSource, type WalletTransaction } from '../../data/walletMock'
import { useAuthMe } from '../../hooks/useAuthMe'
import { readApiError } from '../../lib/apiOrigin'

export function WalletTransactionsPage() {
  const { pathname } = useLocation()
  const prefix = pathname.startsWith('/embed') ? '/embed/wallet' : '/wallet'
  const { user, loading: authLoading } = useAuthMe()

  const [tab, setTab] = useState<TxSource | 'all'>('all')
  const [q, setQ] = useState('')
  const [filterAnchor, setFilterAnchor] = useState<null | HTMLElement>(null)
  const [exportAnchor, setExportAnchor] = useState<null | HTMLElement>(null)
  const [remoteItems, setRemoteItems] = useState<WalletTransaction[]>([])
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [remoteError, setRemoteError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading || !user) {
      setRemoteItems([])
      setRemoteError(null)
      setRemoteLoading(false)
      return
    }
    let cancelled = false
    setRemoteLoading(true)
    setRemoteError(null)
    ;(async () => {
      try {
        const res = await apiFetch('/api/wallet/transactions')
        if (cancelled) return
        if (!res.ok) {
          setRemoteError(await readApiError(res))
          setRemoteItems([])
          return
        }
        const data = (await res.json()) as { items?: WalletTransaction[] }
        setRemoteItems(Array.isArray(data.items) ? data.items : [])
      } catch (e) {
        if (!cancelled) {
          setRemoteError(e instanceof Error ? e.message : 'Could not load transactions')
          setRemoteItems([])
        }
      } finally {
        if (!cancelled) setRemoteLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, authLoading])

  const sourceRows = user ? remoteItems : MOCK_TRANSACTIONS

  const filtered = useMemo(() => {
    return sourceRows.filter((t) => {
      if (tab !== 'all' && t.source !== tab) return false
      if (
        q.trim() &&
        !(t.business ?? '').toLowerCase().includes(q.trim().toLowerCase()) &&
        !(t.reference ?? '').toLowerCase().includes(q.trim().toLowerCase())
      )
        return false
      return true
    })
  }, [tab, q, sourceRows])

  return (
    <WalletPageShell
      title="My Transactions"
      showBack
      rightSlot={
        <Stack direction="row" spacing={0.5}>
          <IconButton size="small" aria-label="Filter" onClick={(e) => setFilterAnchor(e.currentTarget)}>
            <FilterListIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" aria-label="Export" onClick={(e) => setExportAnchor(e.currentTarget)}>
            <IosShareIcon fontSize="small" />
          </IconButton>
        </Stack>
      }
    >

      <Menu anchorEl={filterAnchor} open={Boolean(filterAnchor)} onClose={() => setFilterAnchor(null)}>
        <MenuItem disabled sx={{ fontWeight: 800, opacity: 1 }}>
          Filter by
        </MenuItem>
        <MenuItem onClick={() => setFilterAnchor(null)}>Date</MenuItem>
        <MenuItem onClick={() => setFilterAnchor(null)}>Business</MenuItem>
        <MenuItem onClick={() => setFilterAnchor(null)}>Transaction Type</MenuItem>
        <MenuItem onClick={() => setFilterAnchor(null)}>Payment Successful</MenuItem>
        <MenuItem onClick={() => setFilterAnchor(null)}>Payment Failed</MenuItem>
      </Menu>
      <Menu anchorEl={exportAnchor} open={Boolean(exportAnchor)} onClose={() => setExportAnchor(null)}>
        <MenuItem disabled sx={{ fontWeight: 800, opacity: 1 }}>
          Export as
        </MenuItem>
        <MenuItem
          onClick={() => {
            setExportAnchor(null)
            window.alert('Export PDF — connect to reporting API when ready.')
          }}
        >
          PDF
        </MenuItem>
        <MenuItem
          onClick={() => {
            setExportAnchor(null)
            window.alert('Export XLS — connect to reporting API when ready.')
          }}
        >
          XLS
        </MenuItem>
      </Menu>

      <TextField
        size="small"
        placeholder="Search transactions"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        fullWidth
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" color="action" />
            </InputAdornment>
          ),
        }}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
      />

      <Tabs
        value={tab}
        onChange={(_e, v) => setTab(v)}
        variant="fullWidth"
        sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 40, '& .MuiTab-root': { minHeight: 40, textTransform: 'none', fontWeight: 700 } }}
      >
        <Tab label="All" value="all" />
        <Tab label="Card" value="card" />
        <Tab label="Wallet" value="wallet" />
      </Tabs>

      {authLoading || (user && remoteLoading) ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={36} />
        </Box>
      ) : null}

      {user && remoteError ? (
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          {remoteError}
        </Alert>
      ) : null}

      {!authLoading && !(user && remoteLoading) ? (
        <Card elevation={0} sx={walletCardSx}>
          <List disablePadding>
            {filtered.length === 0 ? (
              <Box sx={{ px: 2, py: 4 }}>
                <Typography color="text.secondary" textAlign="center" variant="body2">
                  {user && remoteItems.length > 0
                    ? 'Nothing in this tab. Try All or Wallet.'
                    : user
                      ? 'No store orders yet. When you check out while signed in, they appear here.'
                      : 'No transactions match your search.'}
                </Typography>
              </Box>
            ) : (
              filtered.map((t) => (
                <WalletTransactionRow key={t.id} tx={t} to={`${prefix}/transactions/${t.id}`} />
              ))
            )}
          </List>
        </Card>
      ) : null}
    </WalletPageShell>
  )
}
