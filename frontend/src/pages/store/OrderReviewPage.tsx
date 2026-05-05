import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Rating,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { apiUrl } from '../../lib/apiOrigin'
import {
  fetchOrderReviewFromApi,
  getOrderReview,
  getReadyForReviewOrderIds,
  type StoredOrderReview,
  submitOrderReview,
} from '../../lib/orderListCategory'
import { formatMoney } from '../../lib/money'

type Detail = {
  order: {
    orderId: string
    status: string
    total_cents: number
    currency: string
  }
  lines: { productName: string; sku: string; quantity: number }[]
}

function emailFromSearch(search: string): string {
  return new URLSearchParams(search).get('email')?.trim() ?? ''
}

export function OrderReviewPage() {
  const { orderId } = useParams()
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const ordersHref = `${pathPrefix}/orders`

  const [guestEmailActive] = useState(() => emailFromSearch(search))
  const [detail, setDetail] = useState<Detail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [reviewRating, setReviewRating] = useState<number | null>(null)
  const [reviewComment, setReviewComment] = useState('')
  const [reviewSubmitBusy, setReviewSubmitBusy] = useState(false)
  const [msg, setMsg] = useState<{ severity: 'success' | 'warning'; text: string } | null>(null)
  const [apiReview, setApiReview] = useState<StoredOrderReview | null | undefined>(undefined)

  const loadDetail = useCallback(async () => {
    if (!orderId) return
    const path = guestEmailActive.trim()
      ? `/api/orders/${orderId}?email=${encodeURIComponent(guestEmailActive.trim())}`
      : `/api/orders/${orderId}`
    const res = await fetch(apiUrl(path), { credentials: 'include' })
    if (!res.ok) throw new Error(await res.text())
    setDetail((await res.json()) as Detail)
  }, [orderId, guestEmailActive])

  useEffect(() => {
    if (!orderId) return
    void (async () => {
      try {
        setErr(null)
        await loadDetail()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to load')
      }
    })()
  }, [orderId, loadDetail])

  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    setApiReview(undefined)
    void fetchOrderReviewFromApi(orderId, { guestEmail: guestEmailActive.trim() || undefined }).then(
      (r) => {
        if (!cancelled) setApiReview(r)
      },
      () => {
        if (!cancelled) setApiReview(null)
      },
    )
    return () => {
      cancelled = true
    }
  }, [orderId, guestEmailActive])

  const existingReview = orderId ? apiReview ?? getOrderReview(orderId) : null
  const inQueue = orderId ? getReadyForReviewOrderIds().has(orderId) : false

  const backRow = (
    <Button component={RouterLink} to={ordersHref} variant="text" size="small" sx={{ alignSelf: 'flex-start', px: 0 }}>
      ← My orders
    </Button>
  )

  if (err) {
    return (
      <Stack spacing={2} sx={{ maxWidth: 480, mx: 'auto', py: 3, px: 2 }}>
        {backRow}
        <Alert severity="error">{err}</Alert>
      </Stack>
    )
  }

  if (!detail?.order) {
    return (
      <Stack spacing={2} alignItems="center" sx={{ py: 6 }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary">Loading…</Typography>
      </Stack>
    )
  }

  const o = detail.order
  const st = o.status

  if (st !== 'delivered') {
    return (
      <Stack spacing={2} sx={{ maxWidth: 480, mx: 'auto', py: 3, px: 2 }}>
        {backRow}
        <Typography variant="h5" fontWeight={800}>
          Review
        </Typography>
        <Alert severity="info">Reviews are only available after your order is marked delivered.</Alert>
        <Button component={RouterLink} to={`${pathPrefix}/orders/${orderId}`} variant="outlined">
          View order
        </Button>
      </Stack>
    )
  }

  if (existingReview) {
    return (
      <Stack spacing={2} sx={{ maxWidth: 480, mx: 'auto', py: 3, px: 2 }}>
        {backRow}
        <Typography variant="h5" fontWeight={800}>
          Your review
        </Typography>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Order <span style={{ fontFamily: 'monospace' }}>{o.orderId}</span>
            </Typography>
            <Rating value={existingReview.rating} readOnly sx={{ '& .MuiRating-iconFilled': { color: 'primary.main' } }} />
            {existingReview.comment.trim() ? (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {existingReview.comment.trim()}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary" fontStyle="italic">
                No written feedback.
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary">
              Submitted {new Date(existingReview.submittedAt).toLocaleString()}
            </Typography>
          </Stack>
        </Paper>
        <Button component={RouterLink} to={ordersHref} variant="contained">
          Back to My orders
        </Button>
      </Stack>
    )
  }

  if (!inQueue) {
    return (
      <Stack spacing={2} sx={{ maxWidth: 480, mx: 'auto', py: 3, px: 2 }}>
        {backRow}
        <Typography variant="h5" fontWeight={800}>
          Review
        </Typography>
        <Alert severity="info">
          This order isn&apos;t in your <strong>To review</strong> list. Open the full order to confirm receipt first, or leave a
          review from My orders when it appears under To review.
        </Alert>
        <Button component={RouterLink} to={`${pathPrefix}/orders/${orderId}`} variant="outlined">
          View full order
        </Button>
      </Stack>
    )
  }

  const itemSummary =
    detail.lines.length === 0
      ? 'Items from your order'
      : detail.lines.length === 1
        ? detail.lines[0].productName
        : `${detail.lines.length} items · ${detail.lines[0].productName}${detail.lines.length > 1 ? '…' : ''}`

  return (
    <Stack spacing={2.5} sx={{ maxWidth: 480, mx: 'auto', py: 3, px: 2 }}>
      {backRow}
      <Typography variant="h5" fontWeight={800}>
        Rate your order
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Order{' '}
        <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
          {o.orderId}
        </Box>
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {itemSummary}
      </Typography>
      <Typography variant="subtitle1" fontWeight={700}>
        {formatMoney(o.total_cents, o.currency)}
      </Typography>

      {msg ? <Alert severity={msg.severity}>{msg.text}</Alert> : null}

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: 'background.default' }}>
        <Stack spacing={2}>
          <div>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
              How was everything?
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Your rating helps us improve. Add a short note if you like.
            </Typography>
          </div>
          <Stack spacing={0.5} alignItems="flex-start">
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Overall
            </Typography>
            <Rating
              name="order-rating"
              value={reviewRating}
              onChange={(_e, v) => setReviewRating(v)}
              size="large"
              sx={{ '& .MuiRating-iconFilled': { color: 'primary.main' } }}
            />
          </Stack>
          <TextField
            label="Comments (optional)"
            placeholder="Quality, packaging, delivery…"
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
            fullWidth
            multiline
            minRows={3}
            inputProps={{ maxLength: 2000 }}
            helperText={`${reviewComment.length}/2000`}
          />
          <Button
            variant="contained"
            disabled={reviewRating == null || reviewSubmitBusy}
            onClick={() => {
              if (reviewRating == null || !orderId) return
              setReviewSubmitBusy(true)
              setMsg(null)
              void (async () => {
                try {
                  await submitOrderReview(orderId, { rating: reviewRating, comment: reviewComment }, {
                    guestEmail: guestEmailActive.trim() || undefined,
                  })
                  navigate(`${ordersHref}?cat=delivered`, { replace: true })
                } catch (e) {
                  setMsg({
                    severity: 'warning',
                    text: e instanceof Error ? e.message : 'Could not save review.',
                  })
                } finally {
                  setReviewSubmitBusy(false)
                }
              })()
            }}
          >
            {reviewSubmitBusy ? 'Submitting…' : 'Submit review'}
          </Button>
          <Typography variant="caption" color="text.secondary">
            After submitting, you&apos;ll find this order under <strong>Delivered</strong> on My orders.
          </Typography>
        </Stack>
      </Paper>

      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
        <RouterLink to={`${pathPrefix}/orders/${orderId}`} style={{ color: 'inherit', fontWeight: 600 }}>
          Full order details
        </RouterLink>
      </Typography>
    </Stack>
  )
}
