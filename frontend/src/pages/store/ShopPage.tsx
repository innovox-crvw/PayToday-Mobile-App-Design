import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link as RouterLink, useLocation, useSearchParams } from 'react-router-dom'
import { Alert, Box, Card, CardActionArea, Divider, Snackbar, Stack, Typography } from '@mui/material'
import Grid from '@mui/material/Grid2'
import type { ProductDto, ProductListResponse } from '../../types/catalogue'
import type { StoreCategoryDto, StorePromotionDto } from '../../types/storefront'
import { apiUrl, readApiError } from '../../lib/apiOrigin'
import { PT_CATALOG_UPDATED } from '../../lib/catalogEvents'
import { friendlyFetchError } from '../../lib/fetchErrors'
import { formatMoney } from '../../lib/money'
import { storefrontVariantPriceRange } from '../../lib/productStock'
import { ShopUtilityHubRow } from '../../components/store/ShopUtilityHubRow'
import { ShopPageSection } from '../../components/store/ShopPageSection'
import { ShopCatalogStickyBar } from '../../components/store/ShopCatalogStickyBar'
import { ShopProductCard } from '../../components/store/ShopProductCard'
import { getDemoStoreBySlug, getDemoStoreSlugForProduct, getDemoStoreForProduct } from '../../data/demoStores'
import { addVariantToCart } from '../../lib/cartClient'
import { SHOP_V2 } from '../../theme/storeV2'

type SortKey = 'name' | 'price_asc' | 'price_desc'

function categoryDepth(c: StoreCategoryDto, all: StoreCategoryDto[]): number {
  let d = 0
  let cur: string | null | undefined = c.parentId
  const byId = new Map(all.map((x) => [x.id, x]))
  while (cur && d < 32) {
    d += 1
    cur = byId.get(cur)?.parentId ?? undefined
  }
  return d
}

function resolvePromoHref(linkPath: string | null, pathPrefix: string, shop: string): string {
  if (!linkPath?.trim()) return shop
  const p = linkPath.startsWith('/') ? linkPath : `/${linkPath}`
  const rel = p.replace(/^\//, '')
  if (!pathPrefix) return `/${rel}`
  return `${pathPrefix}/${rel}`.replace(/\/+/g, '/')
}

const sectionPaperSx = { borderRadius: SHOP_V2.radius }

export function ShopPage() {
  const { pathname } = useLocation()
  const embed = pathname.startsWith('/embed')
  const pathPrefix = embed ? '/embed' : ''
  const shop = `${pathPrefix}/shop`
  const [searchParams, setSearchParams] = useSearchParams()

  const q = searchParams.get('q') ?? ''
  const categorySlug = searchParams.get('category') ?? ''
  const storeSlug = (searchParams.get('store') ?? searchParams.get('brand') ?? '').trim().toLowerCase()
  const sort = (searchParams.get('sort') ?? 'name') as SortKey

  const [items, setItems] = useState<ProductDto[]>([])
  const [categories, setCategories] = useState<StoreCategoryDto[]>([])
  const [promotions, setPromotions] = useState<StorePromotionDto[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sqlWarning, setSqlWarning] = useState<string | null>(null)
  const [catalogTick, setCatalogTick] = useState(0)
  const [cartSnack, setCartSnack] = useState<string | null>(null)
  const productsFetchSeq = useRef(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [cRes, pRes] = await Promise.all([
          fetch(apiUrl('/api/categories')),
          fetch(apiUrl('/api/promotions')),
        ])
        if (cancelled) return
        if (cRes.ok) {
          const c = (await cRes.json()) as { items?: StoreCategoryDto[] }
          setCategories(c.items ?? [])
        }
        if (pRes.ok) {
          const p = (await pRes.json()) as { items?: StorePromotionDto[] }
          setPromotions(p.items ?? [])
        }
      } catch {
        /* optional merchandising */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const seq = ++productsFetchSeq.current
    ;(async () => {
      try {
        setError(null)
        const params = new URLSearchParams()
        if (q.trim()) params.set('q', q.trim())
        if (categorySlug.trim()) params.set('category', categorySlug.trim())
        if (sort && sort !== 'name') params.set('sort', sort)
        const res = await fetch(apiUrl(`/api/products?${params.toString()}`))
        if (seq !== productsFetchSeq.current) return
        if (!res.ok) throw new Error(await readApiError(res))
        const data = (await res.json()) as ProductListResponse
        if (seq !== productsFetchSeq.current) return
        setItems(data.items ?? [])
        if (data.catalogFallbackReason === 'sql_unreachable') {
          const parts = [
            'SQL is configured but the API cannot connect — showing cached catalogue data only. Open http://localhost:4000/api/health for details.',
          ]
          if (data.sqlConnectHint) parts.push(data.sqlConnectHint)
          setSqlWarning(parts.join(' '))
        } else {
          setSqlWarning(null)
        }
        setError(null)
      } catch (e) {
        if (seq !== productsFetchSeq.current) return
        if (e instanceof Error && e.name === 'AbortError') return
        setSqlWarning(null)
        setError(friendlyFetchError(e))
      }
    })()
  }, [q, categorySlug, sort, catalogTick])

  useEffect(() => {
    const bump = () => setCatalogTick((t) => t + 1)
    window.addEventListener(PT_CATALOG_UPDATED, bump)
    return () => window.removeEventListener(PT_CATALOG_UPDATED, bump)
  }, [])

  function setCategory(next: string) {
    const nextParams = new URLSearchParams(searchParams)
    if (next) nextParams.set('category', next)
    else nextParams.delete('category')
    setSearchParams(nextParams, { replace: true })
  }

  function setSort(next: SortKey) {
    const nextParams = new URLSearchParams(searchParams)
    if (next === 'name') nextParams.delete('sort')
    else nextParams.set('sort', next)
    setSearchParams(nextParams, { replace: true })
  }

  function setStoreFilter(next: string) {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('brand')
    const t = (next ?? '').trim().toLowerCase()
    if (t) nextParams.set('store', t)
    else nextParams.delete('store')
    setSearchParams(nextParams, { replace: true })
  }

  const sortedCategories = useMemo(() => {
    return [...categories].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name),
    )
  }, [categories])

  const categoryChips = useMemo(
    () =>
      sortedCategories.map((c) => {
        const depth = categoryDepth(c, sortedCategories)
        const label = `${depth > 0 ? `${'\u203A '.repeat(Math.min(depth, 6))}` : ''}${c.name}`
        return { slug: c.slug, label }
      }),
    [sortedCategories],
  )

  const displayItems = useMemo(() => {
    if (!storeSlug) return items
    return items.filter((p) => getDemoStoreSlugForProduct(p.slug) === storeSlug)
  }, [items, storeSlug])

  const activeStoreMeta = useMemo(() => (storeSlug ? getDemoStoreBySlug(storeSlug) : null), [storeSlug])

  const handleQuickAdd = useCallback(async (variantId: string) => {
    try {
      await addVariantToCart(variantId, 1)
      setCartSnack('Added to cart')
    } catch (e) {
      setCartSnack(e instanceof Error ? e.message : 'Could not add to cart')
    }
  }, [])

  if (error) {
    return (
      <Typography color="error" role="alert">
        {error}
      </Typography>
    )
  }

  return (
    <Box
      sx={{
        bgcolor: SHOP_V2.pageBackground,
        mx: { xs: -2, sm: -3 },
        px: { xs: 2, sm: 3 },
        py: { xs: 0.5, sm: 1 },
        mb: { xs: -2, sm: -3 },
        borderRadius: { md: SHOP_V2.radius },
      }}
    >
      <Stack spacing={3}>
        {sqlWarning ? (
          <Alert severity="warning" sx={{ borderRadius: SHOP_V2.radius }}>
            {sqlWarning}
          </Alert>
        ) : null}
        <Stack spacing={0.5}>
          <Typography variant="h5" component="h1" fontWeight={800} letterSpacing={-0.3}>
            Shop
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Scroll shortcuts for bills, then filter and browse products — tuned for quick discovery.
          </Typography>
        </Stack>

        <ShopPageSection
          anchorId="shop-bill-pay"
          accent="primary"
          title="Instant pay"
          subtitle="Tap an icon to open that bill-pay category."
          paperSx={{
            ...sectionPaperSx,
            borderLeft: `3px solid ${SHOP_V2.accent}`,
            bgcolor: 'background.paper',
          }}
        >
          <ShopUtilityHubRow />
        </ShopPageSection>

        <Divider sx={{ borderColor: 'divider' }} />

        <ShopPageSection
          anchorId="shop-products"
          accent="neutral"
          title="Browse products"
          subtitle="Featured picks, then filters and catalogue."
          paperSx={{ ...sectionPaperSx, bgcolor: 'background.paper' }}
        >
          <Stack spacing={2.25}>
            {storeSlug ? (
              <Alert severity="info" icon={false} sx={{ borderRadius: SHOP_V2.radius, py: 0.5 }}>
                <Typography variant="body2" fontWeight={600}>
                  Filtering by {activeStoreMeta?.name ?? storeSlug}
                  {activeStoreMeta?.shortDescription ? ` — ${activeStoreMeta.shortDescription}` : ''}
                  {' · '}
                  <Typography
                    component="button"
                    type="button"
                    variant="body2"
                    onClick={() => setStoreFilter('')}
                    sx={{
                      fontWeight: 700,
                      border: 'none',
                      background: 'none',
                      p: 0,
                      cursor: 'pointer',
                      color: 'primary.main',
                      textDecoration: 'underline',
                    }}
                  >
                    Clear store
                  </Typography>
                </Typography>
              </Alert>
            ) : null}

            {promotions.length > 0 ? (
              <Stack spacing={1}>
                <Typography component="h3" sx={{ fontWeight: 700, fontSize: '0.9rem' }}>
                  Featured
                </Typography>
                <Stack direction="row" gap={1.5} sx={{ overflowX: 'auto', pb: 0.5, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
                  {promotions.map((pr) => (
                    <Card
                      key={pr.id}
                      variant="outlined"
                      sx={{ flexShrink: 0, width: 220, borderRadius: SHOP_V2.radius, borderColor: 'divider' }}
                    >
                      <CardActionArea
                        component={RouterLink}
                        to={resolvePromoHref(pr.linkPath, pathPrefix, shop)}
                        sx={{ p: 2, textAlign: 'left', minHeight: 88 }}
                      >
                        <Typography fontWeight={800} fontSize="0.9rem">
                          {pr.title}
                        </Typography>
                        {pr.subtitle ? (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            {pr.subtitle}
                          </Typography>
                        ) : null}
                      </CardActionArea>
                    </Card>
                  ))}
                </Stack>
              </Stack>
            ) : null}

            <ShopCatalogStickyBar
              sort={sort}
              onSortChange={setSort}
              storeSlug={storeSlug}
              onStoreFilter={setStoreFilter}
              categorySlug={categorySlug}
              onCategory={setCategory}
              categoryChips={categoryChips}
            />

            {displayItems.length === 0 && items.length > 0 && storeSlug ? (
              <Typography color="text.secondary">
                No products are listed under this store in the current catalogue. Try another store or clear the filter.
              </Typography>
            ) : null}

            <Grid container spacing={{ xs: 1.25, sm: 1.5 }}>
              {displayItems.map((p) => {
                const v0 = p.variants[0]
                const range = storefrontVariantPriceRange(p)
                const price =
                  range && p.variants.length > 1 && range.min !== range.max
                    ? `From ${formatMoney(range.min, range.currency)}`
                    : v0
                      ? formatMoney(v0.priceCents, v0.currency)
                      : '—'
                const demoStore = getDemoStoreForProduct(p.slug)
                return (
                  <Grid key={p.id} size={{ xs: 4, sm: 3, md: 3, lg: 2 }}>
                    <ShopProductCard
                      product={p}
                      pathPrefix={pathPrefix}
                      priceLabel={price}
                      demoStore={demoStore ? { name: demoStore.name, slug: demoStore.slug } : null}
                      onQuickAdd={handleQuickAdd}
                    />
                  </Grid>
                )
              })}
            </Grid>
          </Stack>
        </ShopPageSection>
      </Stack>

      <Snackbar
        open={Boolean(cartSnack)}
        message={cartSnack ?? ''}
        autoHideDuration={3200}
        onClose={() => setCartSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  )
}
