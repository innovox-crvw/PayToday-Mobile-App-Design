import { useEffect, useState } from 'react'
import { Link as RouterLink, useLocation, useSearchParams } from 'react-router-dom'
import { Button, CircularProgress, Stack, Typography } from '@mui/material'
import { notifyCatalogInventoryMaybeChanged } from '../../lib/catalogEvents'
import { apiFetch, readResponseJson } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'

type StatusPayload = {
  paid?: boolean
  orderStatus?: string
  webhookConfirmed?: boolean
}

export function CheckoutSuccessPage() {
  const [sp] = useSearchParams()
  const { pathname } = useLocation()
  const orderId = sp.get('orderId') ?? ''
  const awaitingWebhook = sp.get('awaitingWebhook') === '1'
  const uncertain = sp.get('uncertain') === '1'
  const guestEmail = sp.get('email') ?? ''
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''

  const [poll, setPoll] = useState<{ status?: StatusPayload; err?: string }>({})

  useEffect(() => {
    notifyCatalogInventoryMaybeChanged()
  }, [])

  useEffect(() => {
    if (!orderId || !awaitingWebhook) return
    let cancelled = false
    const qs = new URLSearchParams({ orderId })
    if (guestEmail.trim()) qs.set('email', guestEmail.trim())

    const tick = async () => {
      try {
        const res = await apiFetch(`/api/payments/status?${qs.toString()}`)
        if (!res.ok) {
          const t = await res.text()
          if (!cancelled) setPoll({ err: t.slice(0, 200) })
          return
        }
        const data = await readResponseJson<StatusPayload>(res)
        if (!cancelled) setPoll({ status: data })
        if (data.paid) {
          notifyCatalogInventoryMaybeChanged()
        }
      } catch (e) {
        if (!cancelled) setPoll({ err: e instanceof Error ? e.message : 'Status check failed' })
      }
    }

    void tick()
    const id = window.setInterval(() => void tick(), 4000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [orderId, awaitingWebhook, guestEmail])

  const paid = poll.status?.paid === true
  const showPending = awaitingWebhook && !paid && !poll.err

  return (
    <Stack spacing={2} alignItems="center" sx={{ py: 4, textAlign: 'center', maxWidth: 480, mx: 'auto', px: 2 }}>
      <Typography variant="h5" fontWeight={800}>
        {paid ? 'Payment confirmed' : 'Thanks — we received your return from PayToday'}
      </Typography>
      {uncertain ? (
        <Typography variant="body2" color="text.secondary">
          The payment result was unclear from the redirect. We are confirming with PayToday in the background — stay on this page
          or check your order in a few minutes.
        </Typography>
      ) : null}
      {awaitingWebhook && !paid ? (
        <Typography variant="body2" color="text.secondary">
          Your order is confirmed when our server receives PayToday&apos;s webhook (authoritative). The return URL alone does not
          finalize payment.
        </Typography>
      ) : null}
      {showPending ? (
        <Stack alignItems="center" spacing={1} sx={{ py: 1 }}>
          <CircularProgress size={28} />
          <Typography variant="caption" color="text.secondary">
            {poll.status?.webhookConfirmed ? 'Processing…' : 'Waiting for payment confirmation…'}
          </Typography>
        </Stack>
      ) : null}
      {poll.err ? (
        <Typography variant="caption" color="error">
          {poll.err} — you can still open your order below.
        </Typography>
      ) : null}
      {paid ? (
        <Typography color="text.secondary">
          Order {orderId ? `#${orderId.slice(0, 8)}…` : ''} is paid.
        </Typography>
      ) : (
        <Typography color="text.secondary">
          Order {orderId ? `#${orderId.slice(0, 8)}…` : ''}
          {showPending ? ' — payment pending until webhook confirms.' : '.'}
        </Typography>
      )}
      {orderId && (
        <Button component={RouterLink} to={`${pathPrefix}/orders/${orderId}`} variant="contained">
          View order
        </Button>
      )}
      <Button component={RouterLink} to={`${pathPrefix}/shop`} variant="text" size="small">
        Continue shopping
      </Button>
      {import.meta.env.DEV && orderId ? (
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
          Poll:{' '}
          <a href={apiUrl(`/api/payments/status?orderId=${encodeURIComponent(orderId)}`)}
            target="_blank"
            rel="noreferrer"
          >
            GET /api/payments/status
          </a>
        </Typography>
      ) : null}
    </Stack>
  )
}
