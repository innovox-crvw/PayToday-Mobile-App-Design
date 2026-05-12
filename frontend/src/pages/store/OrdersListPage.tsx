import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useLocation, useSearchParams } from 'react-router-dom'
import { Alert, Card, CardActionArea, Skeleton, Stack, Tab, Tabs, Typography } from '@mui/material'
import { apiFetch } from '../../api/client'
import {
  ORDER_LIST_TABS,
  type OrderListCategory,
  assignOrderListCategory,
  getReadyForReviewOrderIds,
} from '../../lib/orderListCategory'
import { formatOrderStatusLabel } from '../../lib/orderStatusDisplay'
import { formatMoney } from '../../lib/money'

type Row = { orderId: string; status: string; total_cents: number; currency: string; created_at: string }

function parseCategoryParam(raw: string | null): OrderListCategory | null {
  const allowed = new Set(ORDER_LIST_TABS.map((t) => t.id))
  if (raw && allowed.has(raw as OrderListCategory)) return raw as OrderListCategory
  return null
}

export function OrdersListPage() {
  const { pathname } = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const [items, setItems] = useState<Row[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [reviewTick, setReviewTick] = useState(0)

  const readyForReviewIds = useMemo(() => {
    reviewTick
    return getReadyForReviewOrderIds()
  }, [reviewTick])

  const counts = useMemo(() => {
    const m: Record<OrderListCategory, number> = {
      to_pay: 0,
      to_deliver: 0,
      delivered: 0,
      to_review: 0,
      returns: 0,
    }
    for (const o of items) {
      m[assignOrderListCategory(o.status, o.orderId, readyForReviewIds)]++
    }
    return m
  }, [items, readyForReviewIds])

  const activeCategory =
    parseCategoryParam(searchParams.get('cat')) ??
    (ORDER_LIST_TABS.find((t) => counts[t.id] > 0)?.id ?? 'to_deliver')

  useEffect(() => {
    void (async () => {
      setListLoading(true)
      try {
        const res = await apiFetch('/api/orders/mine')
        if (res.status === 401) {
          setErr('Sign in to see your orders.')
          return
        }
        if (!res.ok) throw new Error(await res.text())
        const data = (await res.json()) as { items: Row[] }
        setItems(data.items ?? [])
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setListLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    const bump = () => setReviewTick((n) => n + 1)
    window.addEventListener('paytoday-store-review-updated', bump)
    const onVis = () => {
      if (document.visibilityState === 'visible') bump()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('paytoday-store-review-updated', bump)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const filtered = useMemo(
    () =>
      items.filter((o) => assignOrderListCategory(o.status, o.orderId, readyForReviewIds) === activeCategory),
    [items, readyForReviewIds, activeCategory],
  )

  function setCategory(cat: OrderListCategory) {
    setSearchParams({ cat })
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 560, mx: 'auto', py: 2 }}>
      <Typography variant="h5" fontWeight={800}>
        My orders
      </Typography>
      {err && <Alert severity="warning">{err}</Alert>}
      {listLoading && !err && (
        <Stack spacing={1} aria-busy="true" aria-label="Loading orders">
          {[0, 1, 2, 3].map((k) => (
            <Card key={k} variant="outlined">
              <CardActionArea disabled sx={{ p: 2 }}>
                <Skeleton width="40%" />
                <Skeleton width="60%" sx={{ mt: 1 }} />
                <Skeleton width="80%" sx={{ mt: 1 }} />
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      )}
      {!listLoading && !err && items.length > 0 && (
        <Tabs
          value={activeCategory}
          onChange={(_, v: OrderListCategory) => setCategory(v)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          aria-label="Order status filter"
          sx={{
            minHeight: 44,
            borderBottom: 1,
            borderColor: 'divider',
            '& .MuiTab-root': { fontWeight: 700, textTransform: 'none', minHeight: 44 },
          }}
        >
          {ORDER_LIST_TABS.map((t) => (
            <Tab
              key={t.id}
              value={t.id}
              label={counts[t.id] ? `${t.label} (${counts[t.id]})` : t.label}
            />
          ))}
        </Tabs>
      )}
      {!listLoading && !err && items.length === 0 && <Typography color="text.secondary">No orders yet.</Typography>}
      {!listLoading && !err && items.length > 0 && filtered.length === 0 && (
        <Typography color="text.secondary">No orders in this category.</Typography>
      )}
      {!listLoading &&
        filtered.map((o) => (
        <Card key={o.orderId} variant="outlined">
          <CardActionArea
            component={RouterLink}
            to={
              activeCategory === 'to_review'
                ? `${pathPrefix}/orders/${o.orderId}/review`
                : `${pathPrefix}/orders/${o.orderId}`
            }
            sx={{ p: 2 }}
          >
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
              Order {o.orderId}
            </Typography>
            <Typography fontWeight={700}>
              {formatMoney(o.total_cents, o.currency ?? 'NAD')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formatOrderStatusLabel(o.status)} · {new Date(o.created_at).toLocaleString()}
            </Typography>
            {activeCategory === 'to_review' ? (
              <Typography variant="body2" color="primary.main" sx={{ mt: 1, fontWeight: 600 }}>
                Tap to leave a quick review
              </Typography>
            ) : null}
          </CardActionArea>
        </Card>
        ))}
    </Stack>
  )
}
