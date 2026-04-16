import { useEffect, useRef, useState } from 'react'
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Divider,
  Link,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined'
import type { ProductDto, ProductListResponse } from '../../types/catalogue'
import { PT_CATALOG_UPDATED } from '../../lib/catalogEvents'
import { apiUrl, readApiError } from '../../lib/apiOrigin'
import { friendlyFetchError } from '../../lib/fetchErrors'
import { storefrontPrimaryVariantStock } from '../../lib/productStock'
import { formatMoney } from '../../lib/money'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { ProductImage } from '../../components/store/ProductImage'
import { getDemoStoreForProduct, getDemoStoreSlugForProduct } from '../../data/demoStores'

function normalizeProduct(raw: unknown): ProductDto {
  const p = raw as ProductDto
  return {
    ...p,
    brandSlug: p.brandSlug ?? null,
    brandName: p.brandName ?? null,
  }
}

const tabIds = ['description', 'delivery', 'returns', 'warranty', 'inbox'] as const

export function ProductPage() {
  const { slug } = useParams<{ slug: string }>()
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const shopPath = `${pathPrefix}/shop`
  const [product, setProduct] = useState<ProductDto | null>(null)
  const [related, setRelated] = useState<ProductDto[]>([])
  const [error, setError] = useState<string | null>(null)
  const [qty, setQty] = useState(1)
  const [adding, setAdding] = useState(false)
  const [addedMsg, setAddedMsg] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState(0)
  const [catalogTick, setCatalogTick] = useState(0)
  const productFetchSeq = useRef(0)
  const relatedFetchSeq = useRef(0)

  useEffect(() => {
    const bump = () => setCatalogTick((t) => t + 1)
    window.addEventListener(PT_CATALOG_UPDATED, bump)
    return () => window.removeEventListener(PT_CATALOG_UPDATED, bump)
  }, [])

  useEffect(() => {
    if (!slug) return
    setError(null)
    setProduct(null)
    const seq = ++productFetchSeq.current
    ;(async () => {
      try {
        const res = await fetch(apiUrl(`/api/products/${encodeURIComponent(slug)}`))
        if (seq !== productFetchSeq.current) return
        if (res.status === 404) {
          setError('Product not found')
          return
        }
        if (!res.ok) throw new Error(await readApiError(res))
        const data = normalizeProduct(await res.json())
        if (seq !== productFetchSeq.current) return
        setProduct(data)
        setError(null)
      } catch (e) {
        if (seq !== productFetchSeq.current) return
        if (e instanceof Error && e.name === 'AbortError') return
        setError(friendlyFetchError(e))
      }
    })()
  }, [slug, catalogTick])

  useEffect(() => {
    const storeKey = product && slug ? getDemoStoreSlugForProduct(slug) : null
    if (!storeKey || !slug) {
      setRelated([])
      return
    }
    const seq = ++relatedFetchSeq.current
    ;(async () => {
      try {
        const res = await fetch(apiUrl('/api/products'))
        if (seq !== relatedFetchSeq.current) return
        if (!res.ok) {
          setRelated([])
          return
        }
        const data = (await res.json()) as ProductListResponse
        const others = (data.items ?? [])
          .filter((p) => p.slug !== slug && getDemoStoreSlugForProduct(p.slug) === storeKey)
          .slice(0, 12)
        if (seq !== relatedFetchSeq.current) return
        setRelated(others)
      } catch {
        if (seq !== relatedFetchSeq.current) return
        setRelated([])
      }
    })()
  }, [product?.id, slug, catalogTick])

  useEffect(() => {
    const v = product?.variants[0]
    if (!v) return
    const max = Math.max(0, v.stockQuantity)
    if (max <= 0) return
    setQty((q) => Math.min(Math.max(1, q), max))
  }, [product?.id, product?.variants[0]?.stockQuantity])

  async function addToCart(variantId: string) {
    setAdding(true)
    setAddedMsg(null)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId, quantity: qty }),
      })
      if (!res.ok) {
        const raw = await res.text()
        let msg = raw || 'Could not add to cart'
        try {
          const j = JSON.parse(raw) as { error?: string }
          if (typeof j.error === 'string' && j.error.trim()) msg = j.error.trim()
        } catch {
          /* plain text */
        }
        throw new Error(msg)
      }
      setAddedMsg('Added to cart.')
      window.dispatchEvent(new Event('pt-cart-updated'))
    } catch (e) {
      setAddedMsg(e instanceof Error ? e.message : 'Failed')
    } finally {
      setAdding(false)
    }
  }

  if (error) {
    return (
      <Typography color="error" role="alert">
        {error}
      </Typography>
    )
  }
  if (!product) {
    return <Typography>Loading…</Typography>
  }

  const v0 = product.variants[0]
  const stock = v0 ? Math.max(0, v0.stockQuantity) : 0
  const demoStore = getDemoStoreForProduct(product.slug)
  const retailerHref = demoStore ? `${shopPath}?store=${encodeURIComponent(demoStore.slug)}` : shopPath
  const priceLine = v0 ? formatMoney(v0.priceCents, v0.currency) : '—'

  return (
    <Stack spacing={0} sx={{ maxWidth: 1100, mx: 'auto' }}>
      {/* Top: gallery + buy column (like reference) */}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={{ xs: 2.5, md: 3 }}
        alignItems={{ md: 'flex-start' }}
        sx={{ mb: 2 }}
      >
        <Box
          sx={{
            flex: { md: '1 1 58%' },
            minWidth: 0,
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(15, 23, 42, 0.08)',
            bgcolor: 'background.paper',
          }}
        >
          <ProductImage imageUrl={product.imageUrl} alt={product.name} ratio="1" />
        </Box>

        <Stack
          spacing={2}
          sx={{
            flex: { md: '1 1 42%' },
            minWidth: { md: 280 },
            p: { xs: 0, md: 1 },
          }}
        >
          <Typography variant="h4" component="h1" fontWeight={800} letterSpacing={-0.4} sx={{ lineHeight: 1.2 }}>
            {product.name}
          </Typography>

          {demoStore ? (
            <Link
              component={RouterLink}
              to={retailerHref}
              underline="hover"
              sx={{
                fontWeight: 700,
                fontSize: '1rem',
                color: 'success.main',
                alignSelf: 'flex-start',
              }}
            >
              {demoStore.name}
            </Link>
          ) : null}

          {v0 ? (
            <>
              <Typography variant="h5" color="primary" fontWeight={800}>
                {priceLine}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                SKU {v0.sku} · {stock} in stock (reserved at checkout; released if the order is cancelled before payment)
              </Typography>
              {stock > 0 && stock <= 5 ? (
                <Typography variant="caption" color="warning.main" fontWeight={700}>
                  Low stock — only {stock} left at the warehouse shown in the catalogue.
                </Typography>
              ) : null}
              {stock <= 0 ? (
                <Typography variant="body2" color="error" fontWeight={700}>
                  Currently out of stock.
                </Typography>
              ) : null}
              <Typography variant="body2" color="text.secondary">
                Standard delivery options apply at checkout. Pay with PayToday.
              </Typography>
              <TextField
                type="number"
                label="Quantity"
                size="small"
                value={stock <= 0 ? 0 : qty}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10)
                  if (!Number.isFinite(n) || n < 1) {
                    setQty(1)
                    return
                  }
                  setQty(Math.min(n, stock))
                }}
                inputProps={{ min: stock ? 1 : 0, max: Math.max(stock, 1) }}
                disabled={stock <= 0}
                sx={{ width: 120 }}
              />
              <Button
                variant="contained"
                color="success"
                size="large"
                disabled={adding || stock <= 0}
                onClick={() => void addToCart(v0.id)}
                sx={{ fontWeight: 800, py: 1.5 }}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: '100%' }}>
                  <span>Add to cart</span>
                  <Box component="span" sx={{ opacity: 0.95, fontWeight: 800 }}>
                    {priceLine}
                  </Box>
                </Stack>
              </Button>
              <Button component={RouterLink} to={`${pathPrefix}/cart`} variant="outlined" size="large" fullWidth>
                View cart
              </Button>
            </>
          ) : null}

          {addedMsg ? (
            <Typography color={addedMsg.startsWith('Added') ? 'success.main' : 'error'} variant="body2" fontWeight={600}>
              {addedMsg}
            </Typography>
          ) : null}
        </Stack>
      </Stack>

      {/* Tabs: description & policy stubs */}
      <Card variant="outlined" sx={{ borderColor: 'divider', borderRadius: 3, mb: 3 }}>
        <Tabs
          value={detailTab}
          onChange={(_, v) => setDetailTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            px: { xs: 1, sm: 2 },
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 700, minHeight: 48 },
            '& .Mui-selected': { color: 'success.main' },
            '& .MuiTabs-indicator': { bgcolor: 'success.main' },
          }}
        >
          <Tab label="Description" id={`product-tab-${tabIds[0]}`} />
          <Tab label="Delivery information" id={`product-tab-${tabIds[1]}`} />
          <Tab label="Return policy" id={`product-tab-${tabIds[2]}`} />
          <Tab label="Warranty info" id={`product-tab-${tabIds[3]}`} />
          <Tab label="What's in the box" id={`product-tab-${tabIds[4]}`} aria-label="What is in the box" />
        </Tabs>
        <CardContent sx={{ px: { xs: 2, sm: 3 }, py: 2.5 }}>
          {detailTab === 0 && (
            <Typography color="text.secondary" sx={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {product.description || 'No description provided for this item.'}
            </Typography>
          )}
          {detailTab === 1 && (
            <Typography color="text.secondary" sx={{ lineHeight: 1.7 }}>
              Delivery times and fees depend on your address and chosen method. You will see options at checkout after you add this
              product to your cart.
            </Typography>
          )}
          {detailTab === 2 && (
            <Typography color="text.secondary" sx={{ lineHeight: 1.7 }}>
              Returns follow the retailer&apos;s policy and local consumer rules. Contact support through your order details if you
              need a return or exchange.
            </Typography>
          )}
          {detailTab === 3 && (
            <Typography color="text.secondary" sx={{ lineHeight: 1.7 }}>
              Warranty coverage depends on the manufacturer and product category. Keep your PayToday receipt and order confirmation
              as proof of purchase.
            </Typography>
          )}
          {detailTab === 4 && (
            <Typography color="text.secondary" sx={{ lineHeight: 1.7 }}>
              Contents are as listed on the product page and packaging. If something is missing, reach out with your order number.
            </Typography>
          )}
        </CardContent>
      </Card>

      <Divider sx={{ mb: 3 }} />

      {/* Below everything: same-shop products (reference “You might also like” + Shop row) */}
      {demoStore ? (
        <Box sx={{ pb: 4 }}>
          <Typography variant="h5" fontWeight={800} letterSpacing={-0.3} gutterBottom>
            You might also like
          </Typography>
          <Typography variant="subtitle1" color="text.secondary" fontWeight={600} sx={{ mb: 2 }}>
            Shop · {demoStore.name}
          </Typography>

          {related.length > 0 ? (
            <Box
              sx={{
                display: 'flex',
                gap: 2,
                overflowX: 'auto',
                pb: 1,
                mx: { xs: -1, sm: 0 },
                px: { xs: 1, sm: 0 },
                scrollSnapType: 'x mandatory',
                WebkitOverflowScrolling: 'touch',
                '&::-webkit-scrollbar': { height: 8 },
                '&::-webkit-scrollbar-thumb': {
                  borderRadius: 4,
                  bgcolor: 'action.hover',
                },
              }}
            >
              {related.map((p) => {
                const rv = p.variants[0]
                const price = rv ? formatMoney(rv.priceCents, rv.currency) : '—'
                return (
                  <Card
                    key={p.id}
                    variant="outlined"
                    sx={{
                      flex: '0 0 auto',
                      width: { xs: 168, sm: 200 },
                      scrollSnapAlign: 'start',
                      borderRadius: 3,
                      borderColor: 'divider',
                      bgcolor: 'background.paper',
                    }}
                  >
                    <CardActionArea
                      component={RouterLink}
                      to={`${pathPrefix}/shop/${p.slug}`}
                      sx={{ display: 'block', textAlign: 'left' }}
                    >
                      <ProductImage imageUrl={p.imageUrl} alt={p.name} ratio="1" />
                      <CardContent sx={{ pt: 1.5, pb: 2, px: 1.5 }}>
                        <Typography
                          variant="body2"
                          fontWeight={700}
                          sx={{
                            lineHeight: 1.35,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            minHeight: 40,
                            mb: 0.5,
                          }}
                        >
                          {p.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: 'success.main', fontWeight: 700, display: 'block', mb: 0.75 }}
                        >
                          {demoStore.name}
                        </Typography>
                        <Typography variant="subtitle2" fontWeight={800} color="text.primary">
                          {price}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                          {storefrontPrimaryVariantStock(p) <= 0
                            ? 'Out of stock'
                            : `${storefrontPrimaryVariantStock(p)} in stock`}
                        </Typography>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                )
              })}
            </Box>
          ) : (
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              More products from this shop will appear here as they are added to the catalogue.
            </Typography>
          )}

          <Button
            component={RouterLink}
            to={retailerHref}
            variant="outlined"
            color="success"
            size="large"
            startIcon={<StorefrontOutlinedIcon />}
            sx={{ mt: 2, fontWeight: 700 }}
          >
            Visit {demoStore.name} in the store
          </Button>
        </Box>
      ) : null}
    </Stack>
  )
}
