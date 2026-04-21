import { useEffect, useMemo, useRef, useState } from 'react'
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom'
import {
  Box,
  Button,
  Chip,
  Card,
  CardActionArea,
  CardContent,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined'
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined'
import type { ProductDto, ProductListResponse, ProductVariantDto } from '../../types/catalogue'
import { PT_CATALOG_UPDATED } from '../../lib/catalogEvents'
import { apiUrl, readApiError } from '../../lib/apiOrigin'
import { friendlyFetchError } from '../../lib/fetchErrors'
import {
  effectiveSellableMax,
  stockLabelForVariant,
  storefrontPrimaryVariantStock,
  storefrontVariantPriceRange,
  variantDiscountPercent,
  variantIsPurchasable,
  variantSavingsCents,
} from '../../lib/productStock'
import { formatMoney } from '../../lib/money'
import { addVariantToCart } from '../../lib/cartClient'
import { ProductImage } from '../../components/store/ProductImage'
import { getDemoStoreForProduct, getDemoStoreSlugForProduct } from '../../data/demoStores'
import { SHOP_V2 } from '../../theme/storeV2'

type CartFeedback = { kind: 'success'; qtyAdded: number } | { kind: 'error'; message: string }

function isUuidLike(s: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(s.trim())
}

/** Prefer human-readable name; never show UUID-looking strings from seed data. */
function variantChoiceLabel(v: ProductVariantDto): string {
  const name = (v.name ?? '').trim()
  if (name && !isUuidLike(name)) return name
  const sku = (v.sku ?? '').trim()
  if (sku) return sku
  return 'Option'
}

/** Optional promo rows under price (PayToday-neutral copy). Set false to hide. */
const SHOW_PRODUCT_TOP_PROMO_STUBS = false

function normalizeProduct(raw: unknown): ProductDto {
  const p = raw as ProductDto
  return {
    ...p,
    brandSlug: p.brandSlug ?? null,
    brandName: p.brandName ?? null,
    images: (p.images ?? []).map((im) => ({
      id: im.id,
      url: im.url,
      sortOrder: im.sortOrder,
      variantId: im.variantId ?? null,
    })),
    variants: (p.variants ?? []).map((v) => ({
      ...v,
      compareAtPriceCents: v.compareAtPriceCents ?? null,
      inventoryPolicy: v.inventoryPolicy ?? 'track',
      options: v.options ?? [],
    })),
  }
}

const tabIds = ['description', 'delivery', 'returns', 'warranty', 'inbox'] as const

const DESCRIPTION_PREVIEW_CHARS = 280

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
  const [cartFeedback, setCartFeedback] = useState<CartFeedback | null>(null)
  const [detailTab, setDetailTab] = useState(0)
  const [catalogTick, setCatalogTick] = useState(0)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [shareSnack, setShareSnack] = useState<string | null>(null)
  const productFetchSeq = useRef(0)
  const relatedFetchSeq = useRef(0)
  const relatedRailRef = useRef<HTMLDivElement | null>(null)

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
    if (!product?.variants.length) return
    setSelectedVariantId((cur) => {
      if (cur && product.variants.some((v) => v.id === cur)) return cur
      return product.variants[0]!.id
    })
  }, [product?.id, product?.variants])

  useEffect(() => {
    const v = product?.variants.find((x) => x.id === selectedVariantId) ?? product?.variants[0]
    if (!v) return
    const max = effectiveSellableMax(v)
    if (max <= 0 || !variantIsPurchasable(v)) {
      setQty(0)
      return
    }
    setQty((q) => Math.min(Math.max(1, q), max))
  }, [product?.id, selectedVariantId, product?.variants])

  useEffect(() => {
    setGalleryIndex(0)
  }, [selectedVariantId, product?.id])

  useEffect(() => {
    setDescriptionExpanded(false)
  }, [product?.id])

  useEffect(() => {
    setCartFeedback(null)
  }, [selectedVariantId])

  useEffect(() => {
    setCartFeedback((fb) => (fb?.kind === 'success' ? null : fb))
  }, [qty])

  const galleryImages = useMemo(() => {
    if (!product) return []
    const sorted = [...(product.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
    if (sorted.length > 0 && selectedVariantId) {
      const forVariant = sorted.filter((i) => i.variantId === selectedVariantId)
      const general = sorted.filter((i) => !i.variantId)
      const rest = sorted.filter(
        (i) => i.variantId && i.variantId !== selectedVariantId,
      )
      const merged = [...forVariant, ...general, ...rest]
      return merged.length ? merged : sorted
    }
    if (sorted.length > 0) return sorted
    return product.imageUrl ? [{ url: product.imageUrl, sortOrder: 0, variantId: null as string | null }] : []
  }, [product, selectedVariantId])

  const heroImageUrl = galleryImages[galleryIndex]?.url ?? product?.imageUrl ?? null

  async function addToCart(variantId: string) {
    setAdding(true)
    setCartFeedback(null)
    const qtyAdded = qty
    try {
      await addVariantToCart(variantId, qtyAdded)
      setCartFeedback({ kind: 'success', qtyAdded })
    } catch (e) {
      setCartFeedback({ kind: 'error', message: e instanceof Error ? e.message : 'Failed' })
    } finally {
      setAdding(false)
    }
  }

  function scrollRelatedRow(dir: -1 | 1) {
    const el = relatedRailRef.current
    if (!el) return
    el.scrollBy({ left: Math.min(el.clientWidth * 0.85, 300) * dir, behavior: 'smooth' })
  }

  async function handleShareProduct() {
    if (!product) return
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title: product.name, url })
        setShareSnack('Shared')
      } catch {
        return
      }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setShareSnack('Link copied to clipboard')
    } catch {
      setShareSnack('Could not copy link')
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

  const variant =
    product.variants.find((v) => v.id === selectedVariantId) ?? product.variants[0] ?? null
  const stock = variant ? Math.max(0, variant.stockQuantity) : 0
  const maxQty = variant ? effectiveSellableMax(variant) : 0
  const canBuy = variant ? variantIsPurchasable(variant) : false
  const demoStore = getDemoStoreForProduct(product.slug)
  const retailerHref = demoStore ? `${shopPath}?store=${encodeURIComponent(demoStore.slug)}` : shopPath
  const priceLine = variant ? formatMoney(variant.priceCents, variant.currency) : '—'
  const compareLine =
    variant && variant.compareAtPriceCents != null && variant.compareAtPriceCents > variant.priceCents
      ? formatMoney(variant.compareAtPriceCents, variant.currency)
      : null
  const discountPct = variant ? variantDiscountPercent(variant) : null
  const savingsCents = variant ? variantSavingsCents(variant) : null
  const savingsLine =
    savingsCents != null && savingsCents > 0 && variant ? formatMoney(savingsCents, variant.currency) : null

  const rawDescription = product.description || 'No description provided for this item.'
  const descriptionNeedsTruncate = rawDescription.length > DESCRIPTION_PREVIEW_CHARS
  const descriptionShown =
    descriptionNeedsTruncate && !descriptionExpanded
      ? `${rawDescription.slice(0, DESCRIPTION_PREVIEW_CHARS).trimEnd()}…`
      : rawDescription

  return (
    <Box
      sx={{
        bgcolor: SHOP_V2.pageBackground,
        mx: { xs: -2, sm: -3 },
        px: { xs: 2, sm: 3 },
        py: { xs: 1.5, sm: 2 },
        mb: { xs: -2, sm: -3 },
        borderRadius: { md: SHOP_V2.radius },
      }}
    >
      <Stack spacing={0} sx={{ maxWidth: 1100, mx: 'auto' }}>
        {/* Top: gallery + buy column (Avo-style) */}
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={{ xs: 1.5, md: 2 }}
          alignItems={{ xs: 'stretch', md: 'stretch' }}
          sx={{ mb: 2 }}
        >
          <Paper
            elevation={0}
            variant="outlined"
            sx={{
              flex: { md: '1 1 62%' },
              minWidth: 0,
              width: { xs: '100%', md: 'auto' },
              maxWidth: { xs: '100%', md: 'none' },
              mx: { xs: 0, md: 0 },
              alignSelf: { md: 'stretch' },
              borderRadius: SHOP_V2.radius,
              bgcolor: 'background.paper',
              borderColor: 'divider',
              boxShadow: '0 4px 24px rgba(15, 23, 42, 0.08)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Listing tiles stay full-bleed; PDP hero is capped and centred so details feel tighter. */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                width: 1,
                pt: { xs: 1.25, sm: 1.5 },
                px: { xs: 1.5, sm: 2 },
                pb: { xs: 0.75, sm: 1 },
                bgcolor: 'background.paper',
              }}
            >
              <Box
                sx={{
                  position: 'relative',
                  width: 1,
                  maxWidth: { xs: 300, sm: 320, md: 360 },
                  mx: 'auto',
                  borderRadius: 2,
                  overflow: 'hidden',
                  bgcolor: 'grey.100',
                  boxShadow: 'inset 0 0 0 1px rgba(15, 23, 42, 0.06)',
                }}
              >
                <ProductImage
                  imageUrl={heroImageUrl}
                  alt={product.name}
                  ratio="1"
                  widthFraction={1}
                  frame="default"
                  imageLayout="hero"
                />
                {discountPct != null ? (
                  <Chip
                    size="small"
                    label={`${discountPct}% off`}
                    sx={{
                      position: 'absolute',
                      left: 8,
                      bottom: 8,
                      fontWeight: 800,
                      fontSize: '0.7rem',
                      bgcolor: SHOP_V2.success,
                      color: '#fff',
                      boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
                      '& .MuiChip-label': { px: 1 },
                    }}
                  />
                ) : null}
                {galleryImages.length > 1 ? (
                  <>
                    <IconButton
                      type="button"
                      aria-label="Previous image"
                      onClick={() =>
                        setGalleryIndex((i) => (i - 1 + galleryImages.length) % galleryImages.length)
                      }
                      sx={{
                        position: 'absolute',
                        left: 4,
                        top: '50%',
                        transform: { xs: 'translateY(-50%) scale(0.88)', md: 'translateY(-50%)' },
                        bgcolor: 'rgba(255,255,255,0.92)',
                        boxShadow: 1,
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.98)' },
                      }}
                      size="small"
                    >
                      <ChevronLeftIcon sx={{ fontSize: { xs: 20, sm: 24 } }} />
                    </IconButton>
                    <IconButton
                      type="button"
                      aria-label="Next image"
                      onClick={() => setGalleryIndex((i) => (i + 1) % galleryImages.length)}
                      sx={{
                        position: 'absolute',
                        right: 4,
                        top: '50%',
                        transform: { xs: 'translateY(-50%) scale(0.88)', md: 'translateY(-50%)' },
                        bgcolor: 'rgba(255,255,255,0.92)',
                        boxShadow: 1,
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.98)' },
                      }}
                      size="small"
                    >
                      <ChevronRightIcon sx={{ fontSize: { xs: 20, sm: 24 } }} />
                    </IconButton>
                  </>
                ) : null}
                <IconButton
                  type="button"
                  aria-label="Share product link"
                  onClick={() => void handleShareProduct()}
                  sx={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    transform: { xs: 'scale(0.9)', md: 'none' },
                    bgcolor: 'rgba(255,255,255,0.92)',
                    boxShadow: 1,
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.98)' },
                  }}
                  size="small"
                >
                  <ShareOutlinedIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />
                </IconButton>
              </Box>
            </Box>
            {galleryImages.length > 1 ? (
              <Stack
                direction="row"
                justifyContent="center"
                alignItems="center"
                gap={0.5}
                sx={{ py: 0.65, px: 2, bgcolor: 'rgba(15, 23, 42, 0.04)' }}
              >
                {galleryImages.map((_, idx) => (
                  <Box
                    key={`dot-${String(idx)}`}
                    component="button"
                    type="button"
                    aria-label={`Show image ${idx + 1} of ${galleryImages.length}`}
                    aria-current={idx === galleryIndex ? 'true' : undefined}
                    onClick={() => setGalleryIndex(idx)}
                    sx={{
                      width: idx === galleryIndex ? 20 : 7,
                      height: 7,
                      p: 0,
                      border: 'none',
                      borderRadius: 99,
                      cursor: 'pointer',
                      bgcolor: idx === galleryIndex ? SHOP_V2.success : 'action.disabledBackground',
                      opacity: idx === galleryIndex ? 1 : 0.55,
                      transition: 'width 0.2s ease, opacity 0.15s ease',
                      '&:hover': { opacity: 1 },
                    }}
                  />
                ))}
              </Stack>
            ) : null}
            {galleryImages.length > 1 ? (
              <Stack
                direction="row"
                gap={0.75}
                justifyContent="center"
                flexWrap="wrap"
                sx={{ px: 2, pb: 1, pt: 0, overflowX: 'auto', bgcolor: 'rgba(15, 23, 42, 0.04)' }}
              >
                {galleryImages.map((im, idx) => (
                  <Box
                    key={`${im.url}-${idx}`}
                    onClick={() => setGalleryIndex(idx)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setGalleryIndex(idx)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Thumbnail ${idx + 1}`}
                    sx={{
                      width: { xs: 48, sm: 56 },
                      height: { xs: 48, sm: 56 },
                      flexShrink: 0,
                      borderRadius: 1.5,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      outline: idx === galleryIndex ? '2px solid' : 'none',
                      outlineOffset: 2,
                      outlineColor: SHOP_V2.success,
                      opacity: idx === galleryIndex ? 1 : 0.72,
                      boxShadow: idx === galleryIndex ? '0 2px 8px rgba(45, 145, 93, 0.25)' : 'none',
                      transition: 'opacity 0.15s ease, box-shadow 0.15s ease',
                      '&:hover': { opacity: 1 },
                    }}
                  >
                    <ProductImage imageUrl={im.url} alt="" ratio="1" imageLayout="hero" frame="default" />
                  </Box>
                ))}
              </Stack>
            ) : null}
          </Paper>

        <Paper
          elevation={0}
          variant="outlined"
          sx={{
            flex: { md: '1 1 38%' },
            minWidth: { md: 280 },
            maxWidth: { xs: '100%', md: 'none' },
            mx: { xs: 0, md: 0 },
            width: { xs: '100%', md: 'auto' },
            alignSelf: { md: 'stretch' },
            bgcolor: 'background.paper',
            borderColor: 'divider',
            borderRadius: SHOP_V2.radius,
            boxShadow: '0 4px 24px rgba(15, 23, 42, 0.08)',
            p: { xs: 2, sm: 2.25 },
            display: 'flex',
            flexDirection: 'column',
            minHeight: { md: 0 },
          }}
        >
          <Stack sx={{ flex: 1, minHeight: 0, width: 1, display: 'flex', flexDirection: 'column' }}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: { xs: 0.5, md: 0.65 },
              flex: '0 0 auto',
            }}
          >
            <Typography
              variant="h5"
              component="h1"
              fontWeight={800}
              letterSpacing={-0.4}
              sx={{
                lineHeight: 1.25,
                fontSize: { xs: '1.05rem', sm: '1.15rem', md: '1.4rem' },
                color: 'text.primary',
              }}
            >
              {product.name}
            </Typography>

            {demoStore ? (
              <Link
                component={RouterLink}
                to={retailerHref}
                underline="hover"
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: '0.8rem', sm: '0.9rem' },
                  color: SHOP_V2.accent,
                  alignSelf: 'flex-start',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  mt: 0.25,
                }}
              >
                <StorefrontOutlinedIcon sx={{ fontSize: 18, opacity: 0.9 }} />
                {demoStore.name}
              </Link>
            ) : null}

            {variant ? (
              <>
                {variant.options.length > 0 && product.variants.length <= 1 ? (
                  <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: -0.15 }}>
                    {variant.options.map((o, i) => (
                      <Chip
                        key={`${o.name}-${i}`}
                        size="small"
                        label={`${o.name}: ${o.value}`}
                        variant="outlined"
                        sx={{ fontSize: { xs: '0.62rem', sm: '0.7rem' }, '& .MuiChip-label': { px: 0.65 } }}
                      />
                    ))}
                  </Stack>
                ) : null}
                {product.variants.length > 1 ? (
                  <FormControl
                    fullWidth
                    size="small"
                    sx={{
                      mt: 0.15,
                      '& .MuiSelect-select': { fontSize: { xs: '0.74rem', sm: '0.82rem' }, py: 0.65 },
                    }}
                  >
                    <InputLabel id="product-variant-label">Option</InputLabel>
                    <Select
                      labelId="product-variant-label"
                      id="product-variant-select"
                      label="Option"
                      value={variant.id}
                      onChange={(e) => setSelectedVariantId(String(e.target.value))}
                      renderValue={(selectedId) => {
                        const v = product.variants.find((x) => x.id === selectedId)
                        if (!v) return 'Option'
                        const was =
                          v.compareAtPriceCents != null && v.compareAtPriceCents > v.priceCents
                            ? formatMoney(v.compareAtPriceCents, v.currency)
                            : null
                        return (
                          <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 0.75, py: 0.25 }}>
                            <Typography component="span" variant="body2" fontWeight={700}>
                              {variantChoiceLabel(v)}
                            </Typography>
                            {was ? (
                              <Typography
                                component="span"
                                variant="caption"
                                sx={{ textDecoration: 'line-through', color: 'text.secondary', fontWeight: 600 }}
                              >
                                {was}
                              </Typography>
                            ) : null}
                            <Typography component="span" variant="body2" fontWeight={800} sx={{ color: SHOP_V2.success }}>
                              {formatMoney(v.priceCents, v.currency)}
                            </Typography>
                          </Box>
                        )
                      }}
                    >
                      {product.variants.map((v) => {
                        const was =
                          v.compareAtPriceCents != null && v.compareAtPriceCents > v.priceCents
                            ? formatMoney(v.compareAtPriceCents, v.currency)
                            : null
                        const optPct = variantDiscountPercent(v)
                        return (
                          <MenuItem key={v.id} value={v.id} disabled={!variantIsPurchasable(v)} sx={{ alignItems: 'flex-start', py: 1 }}>
                            <Stack spacing={0.35} sx={{ width: 1 }}>
                              <Typography variant="body2" fontWeight={700}>
                                {variantChoiceLabel(v)}
                                {!variantIsPurchasable(v) ? ' (unavailable)' : ''}
                              </Typography>
                              <Stack direction="row" alignItems="baseline" gap={1} flexWrap="wrap">
                                {was ? (
                                  <Typography variant="body2" sx={{ textDecoration: 'line-through', color: 'text.secondary' }}>
                                    {was}
                                  </Typography>
                                ) : null}
                                <Typography variant="body2" fontWeight={800} sx={{ color: SHOP_V2.success }}>
                                  {formatMoney(v.priceCents, v.currency)}
                                </Typography>
                                {was && optPct != null ? (
                                  <Chip
                                    size="small"
                                    label={`${optPct}% off`}
                                    sx={{ height: 22, fontWeight: 800, fontSize: '0.65rem', bgcolor: SHOP_V2.success, color: '#fff' }}
                                  />
                                ) : null}
                              </Stack>
                            </Stack>
                          </MenuItem>
                        )
                      })}
                    </Select>
                  </FormControl>
                ) : null}
                <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                  {discountPct != null ? (
                    <Chip
                      label={`${discountPct}% off`}
                      size="small"
                      sx={{
                        alignSelf: 'flex-start',
                        fontWeight: 800,
                        fontSize: '0.7rem',
                        bgcolor: 'rgba(45, 145, 93, 0.12)',
                        color: SHOP_V2.success,
                        border: `1px solid rgba(45, 145, 93, 0.35)`,
                      }}
                    />
                  ) : null}
                  {compareLine ? (
                    <Typography
                      component="p"
                      color="text.secondary"
                      sx={{
                        m: 0,
                        textDecoration: 'line-through',
                        fontSize: { xs: '0.85rem', sm: '0.95rem' },
                        fontWeight: 600,
                        letterSpacing: 0.02,
                      }}
                    >
                      Was {compareLine}
                    </Typography>
                  ) : null}
                  <Stack direction="row" alignItems="baseline" gap={1} flexWrap="wrap">
                    {compareLine ? (
                      <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 0.08 }}>
                        Now
                      </Typography>
                    ) : null}
                    <Typography
                      component="p"
                      fontWeight={800}
                      sx={{
                        color: SHOP_V2.success,
                        m: 0,
                        fontSize: { xs: '1.35rem', sm: '1.55rem', md: '1.75rem' },
                        letterSpacing: -0.5,
                        lineHeight: 1.1,
                      }}
                    >
                      {priceLine}
                    </Typography>
                  </Stack>
                </Stack>
                {SHOW_PRODUCT_TOP_PROMO_STUBS ? (
                  <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderStyle: 'dashed',
                        cursor: 'default',
                      }}
                    >
                      <Typography variant="caption" fontWeight={700}>
                        PayToday checkout perks
                      </Typography>
                      <ChevronRightIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                    </Paper>
                    <Typography variant="caption" color="success.main" fontWeight={700}>
                      More payment options at checkout
                    </Typography>
                  </Stack>
                ) : null}
                <Divider sx={{ my: 1.25, borderColor: 'rgba(15, 23, 42, 0.08)' }} />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: 'block',
                    fontSize: { xs: '0.62rem', sm: '0.7rem' },
                    lineHeight: 1.35,
                  }}
                >
                  SKU {variant.sku} · {stockLabelForVariant(variant)}
                  {(variant.inventoryPolicy ?? 'track') === 'track'
                    ? ' · Reserved until paid or order cancelled'
                    : ''}
                  {' · '}
                  Delivery options shown at checkout.
                </Typography>
                {(variant.inventoryPolicy ?? 'track') === 'track' && stock > 0 && stock <= 5 ? (
                  <Typography variant="caption" color="warning.main" fontWeight={700} sx={{ fontSize: '0.65rem' }}>
                    Low stock: {stock} left
                  </Typography>
                ) : null}
                {!canBuy ? (
                  <Typography variant="caption" color="error" fontWeight={700}>
                    Out of stock
                  </Typography>
                ) : null}
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 0.5 }}>
                  <Typography variant="body2" fontWeight={700} color="text.secondary" sx={{ minWidth: 72 }}>
                    Quantity
                  </Typography>
                  <TextField
                    type="number"
                    label=""
                    placeholder="1"
                    size="small"
                    hiddenLabel
                    value={!canBuy ? 0 : qty}
                    onChange={(e) => {
                      const n = Number.parseInt(e.target.value, 10)
                      if (!Number.isFinite(n) || n < 1) {
                        setQty(1)
                        return
                      }
                      setQty(Math.min(n, maxQty))
                    }}
                    inputProps={{ min: canBuy ? 1 : 0, max: Math.max(maxQty, 1), 'aria-label': 'Quantity' }}
                    disabled={!canBuy}
                    sx={{
                      width: { xs: 80, sm: 96 },
                      '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'action.hover' },
                      '& .MuiInputBase-input': { py: 0.85, fontSize: { xs: '0.9rem', sm: '0.95rem' }, fontWeight: 700, textAlign: 'center' },
                    }}
                  />
                </Stack>
              </>
            ) : null}
          </Box>

          <Box
            sx={{
              flex: { md: 1 },
              minHeight: { md: 0 },
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              gap: 0.6,
              mt: { xs: 0.75, md: 0.5 },
            }}
          >
            {variant ? (
              <>
                <Button
                  variant="contained"
                  size="large"
                  disabled={adding || !canBuy}
                  onClick={() => void addToCart(variant.id)}
                  sx={{
                    fontWeight: 800,
                    minHeight: 48,
                    py: { xs: 1, sm: 1.15 },
                    px: { xs: 1.25, sm: 1.75 },
                    fontSize: { xs: '0.82rem', sm: '0.92rem' },
                    borderRadius: SHOP_V2.radius,
                    bgcolor: SHOP_V2.success,
                    color: '#fff',
                    boxShadow: '0 6px 20px rgba(45, 145, 93, 0.35)',
                    '&:hover': { bgcolor: SHOP_V2.success, opacity: 0.96, boxShadow: '0 8px 24px rgba(45, 145, 93, 0.4)' },
                    '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'action.disabled', boxShadow: 'none' },
                  }}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: '100%', gap: 1.25 }}>
                    <Box
                      component="span"
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        minWidth: 0,
                        textAlign: 'left',
                      }}
                    >
                      {compareLine ? (
                        <>
                          <Typography
                            component="span"
                            sx={{
                              fontSize: { xs: '0.7rem', sm: '0.72rem' },
                              fontWeight: 700,
                              textDecoration: 'line-through',
                              color: 'rgba(255,255,255,0.82)',
                              lineHeight: 1.15,
                            }}
                          >
                            {compareLine}
                          </Typography>
                          <Typography
                            component="span"
                            sx={{ fontWeight: 800, fontSize: { xs: '0.88rem', sm: '0.95rem' }, lineHeight: 1.2 }}
                          >
                            {priceLine}
                          </Typography>
                        </>
                      ) : (
                        <Typography component="span" sx={{ fontWeight: 800, fontSize: { xs: '0.9rem', sm: '0.95rem' } }}>
                          {priceLine}
                        </Typography>
                      )}
                    </Box>
                    <span style={{ flexShrink: 0 }}>Add to cart</span>
                  </Stack>
                </Button>
                {compareLine && savingsLine ? (
                  <Typography variant="body2" fontWeight={700} sx={{ color: SHOP_V2.success, textAlign: 'center', lineHeight: 1.35 }}>
                    You save {savingsLine} on this item
                  </Typography>
                ) : null}
                <Button
                  component={RouterLink}
                  to={`${pathPrefix}/cart`}
                  variant="outlined"
                  size="medium"
                  fullWidth
                  sx={{ fontSize: { xs: '0.76rem', sm: '0.85rem' }, py: { xs: 0.75, sm: 0.95 } }}
                >
                  View cart
                </Button>
              </>
            ) : null}

            {cartFeedback?.kind === 'success' ? (
              <Typography variant="body2" role="status" aria-live="polite" color="text.secondary" sx={{ textAlign: 'center', lineHeight: 1.4 }}>
                Added {cartFeedback.qtyAdded} to cart · {priceLine}
              </Typography>
            ) : cartFeedback?.kind === 'error' ? (
              <Typography variant="body2" role="alert" color="error" sx={{ textAlign: 'center', lineHeight: 1.4 }}>
                {cartFeedback.message}
              </Typography>
            ) : null}
          </Box>
          </Stack>
        </Paper>
      </Stack>

      {/* Tabs: flat Avo-style */}
      <Box
        sx={{
          mb: 3,
          borderRadius: SHOP_V2.radius,
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
          overflow: 'hidden',
        }}
      >
        <Tabs
          value={detailTab}
          onChange={(_, v) => setDetailTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            px: { xs: 1, sm: 2 },
            bgcolor: 'background.paper',
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 700, minHeight: 48 },
            '& .Mui-selected': { color: SHOP_V2.success },
            '& .MuiTabs-indicator': { bgcolor: SHOP_V2.success },
          }}
        >
          <Tab label="Description" id={`product-tab-${tabIds[0]}`} />
          <Tab label="Delivery information" id={`product-tab-${tabIds[1]}`} />
          <Tab label="Return policy" id={`product-tab-${tabIds[2]}`} />
          <Tab label="Warranty info" id={`product-tab-${tabIds[3]}`} />
          <Tab label="What's in the box" id={`product-tab-${tabIds[4]}`} aria-label="What is in the box" />
        </Tabs>
        <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.5 }}>
          {detailTab === 0 && (
            <Stack spacing={1}>
              <Typography color="text.secondary" sx={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {descriptionShown}
              </Typography>
              {descriptionNeedsTruncate ? (
                <Button
                  type="button"
                  size="small"
                  onClick={() => setDescriptionExpanded((e) => !e)}
                  sx={{ alignSelf: 'flex-start', fontWeight: 700, color: SHOP_V2.accent }}
                >
                  {descriptionExpanded ? 'View less' : 'View more'}
                </Button>
              ) : null}
            </Stack>
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
        </Box>
      </Box>

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
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ width: '100%' }}>
              <IconButton
                type="button"
                aria-label="Scroll related products left"
                onClick={() => scrollRelatedRow(-1)}
                sx={{
                  flexShrink: 0,
                  bgcolor: 'grey.900',
                  color: 'common.white',
                  '&:hover': { bgcolor: 'grey.800' },
                }}
                size="small"
              >
                <ChevronLeftIcon fontSize="small" />
              </IconButton>
              <Box
                ref={relatedRailRef}
                sx={{
                  display: 'flex',
                  gap: 1.5,
                  overflowX: 'auto',
                  py: 0.5,
                  pb: 1,
                  minWidth: 0,
                  flex: 1,
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
                  const range = storefrontVariantPriceRange(p)
                  const price =
                    range && p.variants.length > 1 && range.min !== range.max
                      ? `From ${formatMoney(range.min, range.currency)}`
                      : rv
                        ? formatMoney(rv.priceCents, rv.currency)
                        : '—'
                  return (
                    <Card
                      key={p.id}
                      variant="outlined"
                      sx={{
                        flex: '0 0 auto',
                        width: { xs: 152, sm: 176 },
                        scrollSnapAlign: 'start',
                        borderRadius: SHOP_V2.radius,
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
                        <CardContent sx={{ pt: 1.25, pb: 1.75, px: 1.25 }}>
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
                              fontSize: '0.8rem',
                            }}
                          >
                            {p.name}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ color: SHOP_V2.accent, fontWeight: 700, display: 'block', mb: 0.5 }}
                          >
                            {demoStore.name}
                          </Typography>
                          <Typography variant="subtitle2" fontWeight={800} sx={{ color: SHOP_V2.success }}>
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
              <IconButton
                type="button"
                aria-label="Scroll related products right"
                onClick={() => scrollRelatedRow(1)}
                sx={{
                  flexShrink: 0,
                  bgcolor: 'grey.900',
                  color: 'common.white',
                  '&:hover': { bgcolor: 'grey.800' },
                }}
                size="small"
              >
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </Stack>
          ) : (
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              More products from this shop will appear here as they are added to the catalogue.
            </Typography>
          )}

          <Button
            component={RouterLink}
            to={retailerHref}
            variant="outlined"
            size="large"
            startIcon={<StorefrontOutlinedIcon />}
            sx={{
              mt: 2,
              fontWeight: 700,
              borderColor: SHOP_V2.accent,
              color: SHOP_V2.accent,
              '&:hover': { borderColor: SHOP_V2.accent, bgcolor: 'rgba(93, 45, 145, 0.06)' },
            }}
          >
            Visit {demoStore.name} in the store
          </Button>
        </Box>
      ) : null}

      <Snackbar
        open={Boolean(shareSnack)}
        message={shareSnack ?? ''}
        autoHideDuration={2600}
        onClose={() => setShareSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
      </Stack>
    </Box>
  )
}
