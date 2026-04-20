import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { Alert, Box, Button, Card, CardContent, IconButton, Stack, Typography } from '@mui/material'
import { PageHeader } from '../../components/page/PageHeader'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { apiFetch, fetchCsrfToken, readResponseJson } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { formatMoney } from '../../lib/money'
import type { CartTotalsPreview } from '../../types/storefront'

interface CartLine {
  lineId: string
  variantId: string
  quantity: number
  sku: string
  name: string
  unitPriceCents: number
  currency: string
}

function lineAccent(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const hue = h % 360
  return `linear-gradient(160deg, hsl(${hue}, 55%, 48%) 0%, hsl(${(hue + 45) % 360}, 58%, 38%) 100%)`
}

export function CartPage() {
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const [items, setItems] = useState<CartLine[]>([])
  const [totalsPreview, setTotalsPreview] = useState<CartTotalsPreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(apiUrl('/api/cart?preview=1'), { credentials: 'include' })
      const data = await readResponseJson<{ items: CartLine[]; source?: string; totalsPreview?: CartTotalsPreview }>(res)
      if (!res.ok) {
        const msg = (data as { error?: string }).error ?? `Cart request failed (${res.status})`
        throw new Error(msg)
      }
      setItems(data.items ?? [])
      setTotalsPreview(data.totalsPreview ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cart')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onUpd = () => void refresh()
    window.addEventListener('pt-cart-updated', onUpd)
    return () => window.removeEventListener('pt-cart-updated', onUpd)
  }, [refresh])

  async function clearEntireCart() {
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/cart', { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      void refresh()
      window.dispatchEvent(new Event('pt-cart-updated'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear cart')
    }
  }

  async function removeLine(variantId: string) {
    try {
      await fetchCsrfToken()
      const res = await apiFetch(`/api/cart/items/${encodeURIComponent(variantId)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      void refresh()
      window.dispatchEvent(new Event('pt-cart-updated'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed')
    }
  }

  const subtotal = items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0)
  const currency = items[0]?.currency ?? 'NAD'

  const tp = totalsPreview
  const showShippingRow = tp && items.length > 0

  return (
    <Stack spacing={2.5} sx={{ maxWidth: 560, mx: 'auto' }}>
      <PageHeader title="Cart" titleVariant="h5" />
      {error && (
        <Alert severity="warning" role="alert">
          {error}
        </Alert>
      )}
      {tp && tp.freeShippingThresholdCents > 0 && items.length > 0 && !tp.qualifiesFreeShippingHome ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          Add {formatMoney(tp.freeShippingThresholdCents - tp.subtotalCents, tp.currency)} more for free home delivery
          {tp.flatShippingCents > 0 ? ` (otherwise ${formatMoney(tp.flatShippingCents, tp.currency)} shipping)` : ''}.
        </Alert>
      ) : null}
      {tp && tp.qualifiesFreeShippingHome && items.length > 0 ? (
        <Alert severity="success" sx={{ borderRadius: 2 }}>
          Your order qualifies for free home delivery.
        </Alert>
      ) : null}
      {items.length === 0 && !error && (
        <Card variant="outlined" sx={{ borderColor: 'divider' }}>
          <CardContent sx={{ py: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">Your cart is empty.</Typography>
            <Button component={RouterLink} to={`${pathPrefix}/shop`} variant="contained" sx={{ mt: 2 }}>
              Browse shop
            </Button>
          </CardContent>
        </Card>
      )}
      <Stack spacing={1.5}>
        {items.map((i) => (
          <Card key={i.lineId} variant="outlined" sx={{ borderColor: 'divider', overflow: 'hidden' }}>
            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
              <Stack direction="row" alignItems="stretch">
                <Box
                  sx={{
                    width: 88,
                    minHeight: 88,
                    flexShrink: 0,
                    background: lineAccent(i.name),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Typography sx={{ fontSize: 24, fontWeight: 800, color: 'rgba(255,255,255,0.95)' }}>
                    {i.name.trim().slice(0, 1).toUpperCase()}
                  </Typography>
                </Box>
                <Stack direction="row" alignItems="center" sx={{ flex: 1, p: 2, minWidth: 0 }} spacing={1}>
                  <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontWeight={800} sx={{ lineHeight: 1.3 }}>
                      {i.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {i.quantity} × {formatMoney(i.unitPriceCents, i.currency)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {i.sku}
                    </Typography>
                  </Stack>
                  <IconButton edge="end" aria-label="Remove" onClick={() => void removeLine(i.variantId)} color="default">
                    <DeleteOutlineIcon />
                  </IconButton>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
      {items.length > 0 && (
        <Card variant="outlined" sx={{ borderColor: 'divider', bgcolor: 'action.hover' }}>
          <CardContent sx={{ py: 2.5 }}>
            <Stack spacing={2}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Prices are captured when each item is added; catalogue changes won&apos;t change these line amounts.
              </Typography>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                <Typography fontWeight={700} color="text.secondary">
                  Subtotal
                </Typography>
                <Typography variant="h6" fontWeight={800}>
                  {formatMoney(subtotal, currency)}
                </Typography>
              </Stack>
              {tp && (tp.discountCents ?? 0) > 0 ? (
                <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                  <Typography fontWeight={700} color="text.secondary">
                    Discounts
                  </Typography>
                  <Typography fontWeight={800} color="success.main">
                    −{formatMoney(tp.discountCents ?? 0, tp.currency)}
                  </Typography>
                </Stack>
              ) : null}
              {showShippingRow ? (
                <>
                  <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                    <Typography fontWeight={700} color="text.secondary">
                      Est. home delivery
                    </Typography>
                    <Typography fontWeight={800}>
                      {tp!.shippingCentsHome === 0 ? 'Free' : formatMoney(tp!.shippingCentsHome, tp!.currency)}
                    </Typography>
                  </Stack>
                  {tp!.taxCents > 0 ? (
                    <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                      <Typography fontWeight={700} color="text.secondary">
                        VAT (est.)
                      </Typography>
                      <Typography fontWeight={800}>{formatMoney(tp!.taxCents, tp!.currency)}</Typography>
                    </Stack>
                  ) : null}
                  <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                    <Typography fontWeight={700} color="text.secondary">
                      Est. total (home)
                    </Typography>
                    <Typography variant="h6" fontWeight={800}>
                      {formatMoney(tp!.totalHomeCents, tp!.currency)}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    Pickup at a pickup point has no delivery fee. Final totals are confirmed at checkout.
                  </Typography>
                </>
              ) : null}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button
                  type="button"
                  variant="outlined"
                  color="inherit"
                  fullWidth
                  onClick={() => void clearEntireCart()}
                >
                  Clear cart
                </Button>
                <Button component={RouterLink} to={`${pathPrefix}/checkout`} variant="contained" size="large" fullWidth>
                  Checkout
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  )
}
