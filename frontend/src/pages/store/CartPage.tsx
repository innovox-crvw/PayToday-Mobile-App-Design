import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  IconButton,
  Paper,
  Radio,
  RadioGroup,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import { alpha } from '@mui/material/styles'
import { PageHeader } from '../../components/page/PageHeader'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import RefreshIcon from '@mui/icons-material/Refresh'
import CreditCardIcon from '@mui/icons-material/CreditCard'
import PaymentsIcon from '@mui/icons-material/Payments'
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'
import SmartphoneIcon from '@mui/icons-material/Smartphone'
import { apiFetch, fetchCsrfToken, readResponseJson } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { formatMoney } from '../../lib/money'
import { setCartLineQuantity } from '../../lib/cartClient'
import type { CartTotalsPreview } from '../../types/storefront'

interface CartLine {
  lineId: string
  variantId: string
  quantity: number
  sku: string
  name: string
  productName: string
  variantName: string
  unitPriceCents: number
  currency: string
  imageUrl?: string | null
  compareAtPriceCents?: number | null
}

function lineAccent(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const hue = h % 360
  return `linear-gradient(160deg, hsl(${hue}, 55%, 48%) 0%, hsl(${(hue + 45) % 360}, 58%, 38%) 100%)`
}

type CartShippingChoice = 'standard' | 'express' | 'free'

function shippingCentsForChoice(preview: CartTotalsPreview, choice: CartShippingChoice): number {
  if (choice === 'express' && preview.shippingCentsExpress != null && preview.shippingCentsExpress > 0) {
    return preview.shippingCentsExpress
  }
  if (choice === 'free' && preview.qualifiesFreeShippingHome) return 0
  return preview.shippingCentsHome
}

function estimatedHomeTotalCents(preview: CartTotalsPreview, choice: CartShippingChoice): number {
  const ship = shippingCentsForChoice(preview, choice)
  const d = preview.discountCents ?? 0
  return Math.max(0, preview.subtotalCents + ship + preview.taxCents - d)
}

export function CartPage() {
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const [items, setItems] = useState<CartLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [clearBusy, setClearBusy] = useState(false)
  const [updatingVariantId, setUpdatingVariantId] = useState<string | null>(null)
  const [totalsPreview, setTotalsPreview] = useState<CartTotalsPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [shippingChoice, setShippingChoice] = useState<CartShippingChoice>('standard')
  const [promoInput, setPromoInput] = useState('')
  const [promoApplied, setPromoApplied] = useState<{ code: string; discountCents: number } | null>(null)
  const [promoErr, setPromoErr] = useState<string | null>(null)
  const [promoLoading, setPromoLoading] = useState(false)

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    setError(null)
    if (!opts?.silent) setLoading(true)
    try {
      const res = await fetch(apiUrl('/api/cart'), { credentials: 'include' })
      const data = await readResponseJson<{ items: CartLine[]; source?: string }>(res)
      if (!res.ok) {
        const msg = (data as { error?: string }).error ?? `Cart request failed (${res.status})`
        throw new Error(msg)
      }
      setItems(data.items ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cart')
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [])

  const loadPreview = useCallback(async () => {
    setPreviewError(null)
    setPreviewLoading(true)
    try {
      const params = new URLSearchParams({ preview: '1' })
      if (promoApplied?.code) params.set('discountCode', promoApplied.code)
      const res = await fetch(apiUrl(`/api/cart?${params.toString()}`), { credentials: 'include' })
      const data = await readResponseJson<{ totalsPreview?: CartTotalsPreview; error?: string }>(res)
      if (!res.ok) {
        setTotalsPreview(null)
        throw new Error((data as { error?: string }).error ?? 'Could not load totals')
      }
      setTotalsPreview(data.totalsPreview ?? null)
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Could not load totals')
      setTotalsPreview(null)
    } finally {
      setPreviewLoading(false)
    }
  }, [promoApplied?.code])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onUpd = () => void refresh({ silent: true })
    window.addEventListener('pt-cart-updated', onUpd)
    return () => window.removeEventListener('pt-cart-updated', onUpd)
  }, [refresh])

  useEffect(() => {
    if (loading) return
    if (items.length === 0) {
      setTotalsPreview(null)
      setShippingChoice('standard')
      return
    }
    void loadPreview()
  }, [items, loading, loadPreview])

  const displayTotal = useMemo(() => {
    if (!totalsPreview) return null
    return estimatedHomeTotalCents(totalsPreview, shippingChoice)
  }, [totalsPreview, shippingChoice])

  useEffect(() => {
    if (!totalsPreview) return
    if (shippingChoice === 'express' && (totalsPreview.shippingCentsExpress == null || totalsPreview.shippingCentsExpress <= 0)) {
      setShippingChoice('standard')
    }
    if (shippingChoice === 'free' && !totalsPreview.qualifiesFreeShippingHome) {
      setShippingChoice('standard')
    }
  }, [totalsPreview, shippingChoice])

  const displayShipping = useMemo(() => {
    if (!totalsPreview) return 0
    return shippingCentsForChoice(totalsPreview, shippingChoice)
  }, [totalsPreview, shippingChoice])

  async function clearEntireCart() {
    setClearBusy(true)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/cart', { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      setPromoApplied(null)
      setPromoInput('')
      window.dispatchEvent(new Event('pt-cart-updated'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear cart')
    } finally {
      setClearBusy(false)
    }
  }

  async function removeLine(variantId: string) {
    try {
      await fetchCsrfToken()
      const res = await apiFetch(`/api/cart/items/${encodeURIComponent(variantId)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      window.dispatchEvent(new Event('pt-cart-updated'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed')
    }
  }

  async function bumpQuantity(variantId: string, delta: number, currentQty: number) {
    const next = currentQty + delta
    if (next < 1) return
    setUpdatingVariantId(variantId)
    setError(null)
    try {
      await setCartLineQuantity(variantId, next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update quantity')
    } finally {
      setUpdatingVariantId(null)
    }
  }

  async function applyPromo() {
    const code = promoInput.trim()
    if (!code) return
    setPromoLoading(true)
    setPromoErr(null)
    try {
      const params = new URLSearchParams({ preview: '1', discountCode: code })
      const res = await fetch(apiUrl(`/api/cart?${params.toString()}`), { credentials: 'include' })
      const body = await readResponseJson<{
        discountCents?: number
        totalsPreview?: CartTotalsPreview
        error?: string
      }>(res)
      if (!res.ok) throw new Error(body.error ?? 'Invalid code')
      if (body.totalsPreview) setTotalsPreview(body.totalsPreview)
      setPromoApplied({
        code: code.toUpperCase(),
        discountCents: body.discountCents ?? body.totalsPreview?.discountCents ?? 0,
      })
      setPromoInput(code.toUpperCase())
    } catch (e) {
      setPromoErr(e instanceof Error ? e.message : 'Invalid code')
    } finally {
      setPromoLoading(false)
    }
  }

  function removePromo() {
    setPromoApplied(null)
    setPromoInput('')
    setPromoErr(null)
  }

  const currency = items[0]?.currency ?? totalsPreview?.currency ?? 'NAD'
  const headerUnderline = { borderBottom: (t: { palette: { primary: { main: string } } }) => `3px solid ${t.palette.primary.main}`, width: 'fit-content', pb: 0.25 }

  return (
    <Box sx={{ bgcolor: (t) => alpha(t.palette.grey[100], 0.6), minHeight: '100%', py: { xs: 2, md: 3 }, px: { xs: 1.5, sm: 2 } }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        <Box sx={{ mb: 2 }}>
          <PageHeader title="Shopping cart" titleVariant="h5" />
        </Box>

        {error && (
          <Alert severity="warning" role="alert" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading && (
          <Stack spacing={1.5} aria-busy="true" aria-label="Loading cart">
            {[0, 1, 2].map((k) => (
              <Skeleton key={k} variant="rounded" height={120} sx={{ borderRadius: 2 }} />
            ))}
          </Stack>
        )}

        {!loading && items.length === 0 && !error && (
          <Paper variant="outlined" sx={{ borderRadius: 2, p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">Your cart is empty.</Typography>
            <Button component={RouterLink} to={`${pathPrefix}/shop`} variant="contained" sx={{ mt: 2 }}>
              Browse shop
            </Button>
          </Paper>
        )}

        {!loading && items.length > 0 && (
          <Grid container spacing={{ xs: 2, md: 3 }}>
            <Grid size={{ xs: 12, md: 8 }}>
              <Stack spacing={2}>
                <Box
                  sx={{
                    display: { xs: 'none', sm: 'grid' },
                    gridTemplateColumns: 'minmax(200px,1fr) 100px 120px 100px',
                    gap: 2,
                    px: 2,
                    py: 1,
                    alignItems: 'center',
                  }}
                >
                  {(['Product', 'Price', 'Quantity', 'Total'] as const).map((label) => (
                    <Typography
                      key={label}
                      variant="caption"
                      fontWeight={800}
                      color="text.secondary"
                      letterSpacing={0.08}
                      sx={label === 'Product' ? {} : { textAlign: label === 'Quantity' ? 'center' : 'right' }}
                    >
                      {label.toUpperCase()}
                    </Typography>
                  ))}
                </Box>

                <Stack spacing={1.5}>
                  {items.map((i) => {
                    const lineBusy = updatingVariantId === i.variantId
                    const lineTotalCents = i.unitPriceCents * i.quantity
                    const compareAt = i.compareAtPriceCents
                    return (
                      <Paper
                        key={i.lineId}
                        variant="outlined"
                        sx={{
                          borderRadius: 2,
                          overflow: 'hidden',
                          borderColor: 'divider',
                          bgcolor: 'background.paper',
                        }}
                      >
                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', sm: 'minmax(200px,1fr) 100px 120px 100px' },
                            gap: { xs: 1.5, sm: 2 },
                            p: 2,
                            alignItems: 'center',
                          }}
                        >
                          <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ minWidth: 0 }}>
                            <Box
                              sx={{
                                width: 72,
                                height: 72,
                                flexShrink: 0,
                                borderRadius: 1.5,
                                overflow: 'hidden',
                                bgcolor: 'grey.100',
                              }}
                            >
                              {i.imageUrl ? (
                                <Box
                                  component="img"
                                  src={i.imageUrl}
                                  alt=""
                                  sx={{ width: 1, height: 1, objectFit: 'cover', display: 'block' }}
                                />
                              ) : (
                                <Box
                                  sx={{
                                    width: 1,
                                    height: 1,
                                    background: lineAccent(i.productName),
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <Typography sx={{ fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.95)' }}>
                                    {i.productName.trim().slice(0, 1).toUpperCase()}
                                  </Typography>
                                </Box>
                              )}
                            </Box>
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                              <Typography fontWeight={800} sx={{ lineHeight: 1.35 }}>
                                {i.productName}
                              </Typography>
                              <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 0.75 }}>
                                <Chip size="small" label={i.variantName} variant="outlined" sx={{ height: 24, fontSize: 11 }} />
                                <Chip size="small" label={`SKU ${i.sku}`} variant="outlined" sx={{ height: 24, fontSize: 11 }} />
                              </Stack>
                              <Button
                                size="small"
                                color="inherit"
                                startIcon={<DeleteOutlineIcon sx={{ fontSize: 18 }} />}
                                onClick={() => void removeLine(i.variantId)}
                                disabled={lineBusy}
                                sx={{ mt: 1, textTransform: 'none', fontWeight: 600, minWidth: 0, px: 0.5 }}
                              >
                                Remove
                              </Button>
                            </Box>
                          </Stack>

                          <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
                            {compareAt != null && compareAt > i.unitPriceCents ? (
                              <Stack spacing={0.25} alignItems={{ xs: 'flex-start', sm: 'flex-end' }}>
                                <Typography fontWeight={800}>{formatMoney(i.unitPriceCents, i.currency)}</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ textDecoration: 'line-through' }}>
                                  {formatMoney(compareAt, i.currency)}
                                </Typography>
                              </Stack>
                            ) : (
                              <Typography fontWeight={800}>{formatMoney(i.unitPriceCents, i.currency)}</Typography>
                            )}
                          </Box>

                          <Stack direction="row" alignItems="center" justifyContent={{ xs: 'flex-start', sm: 'center' }}>
                            <Stack
                              direction="row"
                              alignItems="center"
                              sx={{
                                border: 1,
                                borderColor: 'divider',
                                borderRadius: 2,
                                height: 40,
                                bgcolor: 'background.paper',
                              }}
                            >
                              <IconButton
                                size="small"
                                aria-label={`Decrease quantity of ${i.name}`}
                                disabled={lineBusy || i.quantity <= 1}
                                onClick={() => void bumpQuantity(i.variantId, -1, i.quantity)}
                              >
                                <RemoveIcon fontSize="small" />
                              </IconButton>
                              <Typography component="span" variant="body2" fontWeight={700} sx={{ minWidth: 28, textAlign: 'center' }}>
                                {i.quantity}
                              </Typography>
                              <IconButton
                                size="small"
                                aria-label={`Increase quantity of ${i.name}`}
                                disabled={lineBusy}
                                onClick={() => void bumpQuantity(i.variantId, 1, i.quantity)}
                              >
                                <AddIcon fontSize="small" />
                              </IconButton>
                            </Stack>
                          </Stack>

                          <Typography
                            fontWeight={800}
                            textAlign={{ xs: 'left', sm: 'right' }}
                            sx={{
                              borderBottom: (t) => `3px solid ${t.palette.primary.main}`,
                              width: 'fit-content',
                              justifySelf: { xs: 'start', sm: 'end' },
                            }}
                          >
                            {formatMoney(lineTotalCents, i.currency)}
                          </Typography>
                        </Box>
                      </Paper>
                    )
                  })}
                </Stack>

                <Paper variant="outlined" sx={{ borderRadius: 2, p: 2, bgcolor: 'background.paper' }}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={2}
                    alignItems={{ xs: 'stretch', sm: 'center' }}
                    justifyContent="space-between"
                  >
                    <Stack direction="row" spacing={1} sx={{ flex: 1, maxWidth: { sm: 420 } }}>
                      <TextField
                        size="small"
                        fullWidth
                        placeholder="Coupon code"
                        value={promoInput}
                        disabled={!!promoApplied}
                        onChange={(e) => {
                          setPromoInput(e.target.value.toUpperCase())
                          setPromoErr(null)
                        }}
                        error={!!promoErr}
                        helperText={promoErr ?? ' '}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                      />
                      {promoApplied ? (
                        <Button variant="outlined" color="error" onClick={removePromo} sx={{ flexShrink: 0, borderRadius: 2 }}>
                          Remove
                        </Button>
                      ) : (
                        <Button
                          variant="contained"
                          disabled={!promoInput.trim() || promoLoading}
                          onClick={() => void applyPromo()}
                          sx={{ flexShrink: 0, borderRadius: 2, px: 2.5 }}
                        >
                          {promoLoading ? <CircularProgress size={20} color="inherit" /> : 'Apply'}
                        </Button>
                      )}
                    </Stack>
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button
                        variant="outlined"
                        color="primary"
                        startIcon={<RefreshIcon />}
                        onClick={() => {
                          void refresh({ silent: true })
                          void loadPreview()
                        }}
                        sx={{ borderRadius: 2 }}
                      >
                        Update
                      </Button>
                      <Button
                        variant="outlined"
                        color="error"
                        startIcon={<DeleteOutlineIcon />}
                        disabled={clearBusy}
                        onClick={() => void clearEntireCart()}
                        sx={{ borderRadius: 2 }}
                      >
                        {clearBusy ? 'Clearing…' : 'Clear'}
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>
              </Stack>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Paper
                variant="outlined"
                sx={{
                  borderRadius: 2,
                  p: 2.5,
                  position: { md: 'sticky' },
                  top: { md: 96 },
                  bgcolor: 'background.paper',
                }}
              >
                <Typography variant="h6" fontWeight={800} sx={headerUnderline}>
                  Order summary
                </Typography>

                {previewError && (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    {previewError}
                  </Alert>
                )}

                {previewLoading && !totalsPreview ? (
                  <Stack spacing={1} sx={{ mt: 2 }}>
                    <Skeleton height={24} />
                    <Skeleton height={24} />
                    <Skeleton height={40} />
                  </Stack>
                ) : totalsPreview ? (
                  <Stack spacing={1.75} sx={{ mt: 2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                      <Typography color="text.secondary" fontWeight={700}>
                        Subtotal
                      </Typography>
                      <Typography fontWeight={800}>{formatMoney(totalsPreview.subtotalCents, totalsPreview.currency)}</Typography>
                    </Stack>

                    <Box>
                      <Typography variant="caption" color="text.secondary" fontWeight={800} letterSpacing={0.06} sx={{ display: 'block', mb: 0.75 }}>
                        SHIPPING (ESTIMATE)
                      </Typography>
                      <FormControl component="fieldset" variant="standard" fullWidth>
                        <RadioGroup
                          value={shippingChoice}
                          onChange={(_, v) => setShippingChoice(v as CartShippingChoice)}
                          sx={{ gap: 0.25 }}
                        >
                          <FormControlLabel
                            value="standard"
                            control={<Radio size="small" />}
                            label={
                              <Typography variant="body2">
                                Standard — {formatMoney(totalsPreview.shippingCentsHome, totalsPreview.currency)}
                              </Typography>
                            }
                          />
                          {totalsPreview.shippingCentsExpress != null && totalsPreview.shippingCentsExpress > 0 ? (
                            <FormControlLabel
                              value="express"
                              control={<Radio size="small" />}
                              label={
                                <Typography variant="body2">
                                  Express — {formatMoney(totalsPreview.shippingCentsExpress, totalsPreview.currency)}
                                </Typography>
                              }
                            />
                          ) : null}
                          <FormControlLabel
                            value="free"
                            control={<Radio size="small" />}
                            disabled={!totalsPreview.qualifiesFreeShippingHome}
                            label={
                              <Typography variant="body2" color={totalsPreview.qualifiesFreeShippingHome ? 'text.primary' : 'text.disabled'}>
                                Free shipping
                                {totalsPreview.freeShippingThresholdCents > 0
                                  ? ` (orders from ${formatMoney(totalsPreview.freeShippingThresholdCents, totalsPreview.currency)})`
                                  : ''}
                              </Typography>
                            }
                          />
                        </RadioGroup>
                      </FormControl>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        Final shipping is confirmed at checkout.
                      </Typography>
                    </Box>

                    <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                      <Typography color="text.secondary" fontWeight={700}>
                        Shipping (selected)
                      </Typography>
                      <Typography fontWeight={800}>
                        {displayShipping === 0 ? 'Free' : formatMoney(displayShipping, totalsPreview.currency)}
                      </Typography>
                    </Stack>

                    <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                      <Typography color="text.secondary" fontWeight={700}>
                        Tax (est.)
                      </Typography>
                      <Typography fontWeight={800}>{formatMoney(totalsPreview.taxCents, totalsPreview.currency)}</Typography>
                    </Stack>

                    {(totalsPreview.discountCents ?? 0) > 0 ? (
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography color="text.secondary" fontWeight={700}>
                          Discount
                        </Typography>
                        <Chip
                          size="small"
                          label={`-${formatMoney(totalsPreview.discountCents ?? 0, totalsPreview.currency)}`}
                          color="success"
                          variant="outlined"
                          sx={{ fontWeight: 800 }}
                        />
                      </Stack>
                    ) : null}

                    <Box
                      sx={{
                        mt: 1,
                        p: 2,
                        borderRadius: 2,
                        bgcolor: (t) => alpha(t.palette.grey[500], 0.08),
                      }}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                        <Typography fontWeight={900}>Total (est.)</Typography>
                        <Typography variant="h6" fontWeight={900} sx={headerUnderline}>
                          {displayTotal != null ? formatMoney(displayTotal, currency) : '—'}
                        </Typography>
                      </Stack>
                    </Box>

                    <Button
                      component={RouterLink}
                      to={`${pathPrefix}/checkout`}
                      variant="contained"
                      size="large"
                      fullWidth
                      endIcon={<ArrowForwardIcon />}
                      sx={{ mt: 1, py: 1.25, borderRadius: 2, fontWeight: 800 }}
                    >
                      Proceed to checkout
                    </Button>
                    <Button
                      component={RouterLink}
                      to={`${pathPrefix}/shop`}
                      variant="contained"
                      color="inherit"
                      size="large"
                      fullWidth
                      startIcon={<ArrowBackIcon />}
                      sx={{ py: 1.1, borderRadius: 2, fontWeight: 700, bgcolor: (t) => alpha(t.palette.grey[500], 0.12) }}
                    >
                      Continue shopping
                    </Button>

                    <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ display: 'block', mb: 1 }}>
                        We accept
                      </Typography>
                      <Stack direction="row" spacing={2} justifyContent="space-between" sx={{ color: 'text.secondary', opacity: 0.85 }}>
                        <CreditCardIcon aria-hidden />
                        <PaymentsIcon aria-hidden />
                        <AccountBalanceWalletIcon aria-hidden />
                        <SmartphoneIcon aria-hidden />
                      </Stack>
                    </Box>
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                    Totals unavailable.
                  </Typography>
                )}
              </Paper>
            </Grid>
          </Grid>
        )}
      </Box>
    </Box>
  )
}
