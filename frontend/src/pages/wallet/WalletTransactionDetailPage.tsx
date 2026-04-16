import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Alert, Box, CircularProgress, Divider, Stack, Typography } from '@mui/material'
import { WalletSubheader } from './WalletSubheader'
import { apiFetch } from '../../api/client'
import { formatNad, MOCK_TRANSACTIONS, type WalletTransaction } from '../../data/walletMock'

/** Matches store order UUIDs and demo_wallet_ledger row ids (e.g. NEWSEQUENTIALID). */
const REMOTE_TX_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <Stack spacing={0.5}>
      <Typography variant="caption" color="text.secondary" fontWeight={600}>
        {label}
      </Typography>
      <Typography fontWeight={700} sx={{ color: valueColor }}>
        {value}
      </Typography>
    </Stack>
  )
}

function statusLabel(s: WalletTransaction['status']): string {
  if (s === 'successful') return 'Successful'
  if (s === 'pending') return 'Pending payment'
  return 'Failed'
}

function statusColor(s: WalletTransaction['status']): string | undefined {
  if (s === 'successful') return 'success.main'
  if (s === 'pending') return 'warning.main'
  return 'error.main'
}

export function WalletTransactionDetailPage() {
  const { txId } = useParams<{ txId: string }>()
  const mockTx = useMemo(() => (txId ? MOCK_TRANSACTIONS.find((t) => t.id === txId) : undefined), [txId])
  const isRemoteTxId = Boolean(txId && REMOTE_TX_ID_RE.test(txId))

  const [remoteTx, setRemoteTx] = useState<WalletTransaction | null>(null)
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [remoteError, setRemoteError] = useState<string | null>(null)

  useEffect(() => {
    if (!txId || !isRemoteTxId) {
      setRemoteTx(null)
      setRemoteError(null)
      setRemoteLoading(false)
      return
    }
    let cancelled = false
    setRemoteLoading(true)
    setRemoteError(null)
    setRemoteTx(null)
    ;(async () => {
      try {
        const res = await apiFetch(`/api/wallet/transactions/${encodeURIComponent(txId)}`)
        if (cancelled) return
        if (res.status === 401) {
          setRemoteError('Sign in to view this transaction.')
          return
        }
        if (!res.ok) {
          const text = await res.text()
          let msg = text.trim() || `Request failed (${res.status})`
          try {
            const j = JSON.parse(text) as { error?: string }
            if (typeof j.error === 'string') msg = j.error
          } catch {
            /* ignore */
          }
          setRemoteError(msg)
          return
        }
        const data = (await res.json()) as WalletTransaction
        setRemoteTx(data)
      } catch (e) {
        if (!cancelled) setRemoteError(e instanceof Error ? e.message : 'Request failed')
      } finally {
        if (!cancelled) setRemoteLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [txId, isRemoteTxId])

  const tx = isRemoteTxId ? remoteTx : mockTx

  if (isRemoteTxId && remoteLoading) {
    return (
      <Stack spacing={2} sx={{ maxWidth: 480, mx: 'auto' }}>
        <WalletSubheader title="Transaction" />
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={36} />
        </Box>
      </Stack>
    )
  }

  if (isRemoteTxId && remoteError) {
    return (
      <Stack spacing={2} sx={{ maxWidth: 480, mx: 'auto' }}>
        <WalletSubheader title="Transaction" />
        <Alert severity="warning">{remoteError}</Alert>
      </Stack>
    )
  }

  if (!tx) {
    return (
      <Typography color="error" role="alert">
        Transaction not found
      </Typography>
    )
  }

  return (
    <Stack spacing={2.5} sx={{ maxWidth: 480, mx: 'auto' }}>
      <WalletSubheader title="Transaction" />
      <Stack spacing={2}>
        <Row label="Business" value={tx.business} />
        <Row label="Type" value={tx.type} />
        <Row label="Payment method" value={tx.paymentMethod} />
        <Row label="Amount" value={formatNad(tx.amountCents)} />
        <Row label="Reference" value={tx.reference} />
        <Row label="Date & time" value={tx.datetime} />
        {tx.orderStatus ? <Row label="Order status" value={tx.orderStatus} /> : null}
        {tx.contact && <Row label="Contact number" value={tx.contact} />}
        <Row label="Status" value={statusLabel(tx.status)} valueColor={statusColor(tx.status)} />
        {tx.status === 'failed' && tx.reason && (
          <>
            <Divider />
            <Row label="Reason" value={tx.reason} valueColor="error.main" />
          </>
        )}
      </Stack>
    </Stack>
  )
}
