import { useEffect, useMemo, useRef, useState } from 'react'
import { Link as RouterLink, useLocation, useSearchParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material'
import { ProductImage } from '../../components/store/ProductImage'
import { resolvePromotionDisplayUrl } from '../../lib/promotionImageUrl'
import Grid from '@mui/material/Grid2'
import type { ProductDto, ProductListResponse } from '../../types/catalogue'
import type { StoreCategoryDto, StorePromotionDto, StorefrontConfig } from '../../types/storefront'
import { apiUrl, readApiError } from '../../lib/apiOrigin'
import {
  liquorBlockedGuestMessage,
  liquorBlockedMinorMessage,
  liquorBlockedShortTitle,
} from '../../lib/liquorRestrictionMessages'
import { PT_CATALOG_UPDATED } from '../../lib/catalogEvents'
import { friendlyFetchError } from '../../lib/fetchErrors'
import { formatMoney } from '../../lib/money'
import { storefrontVariantPriceRange } from '../../lib/productStock'
import { ShopPageSection } from '../../components/store/ShopPageSection'
import { ShopCatalogStickyBar } from '../../components/store/ShopCatalogStickyBar'
import { ShopProductCard } from '../../components/store/ShopProductCard'
import { getDemoStoreBySlug, getDemoStoreSlugForProduct, getDemoStoreForProduct } from '../../data/demoStores'
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

/** True when the URL category slug matches a configured root or sits under it in `categories`. */
function categorySlugTouchesMinorRestrictionRoots(
  categorySlug: string,
  categories: StoreCategoryDto[],
  rootsLower: string[],
): boolean {
  if (!categorySlug.trim() || rootsLower.length === 0) return false
  const slugLower = categorySlug.trim().toLowerCase()
  const rootSet = new Set(rootsLower)
  if (rootSet.has(slugLower)) return true
  const cat = categories.find((c) => c.slug.trim().toLowerCase() === slugLower)
  if (!cat) return false
  const byId = new Map(categories.map((c) => [c.id, c]))
  let cur: StoreCategoryDto | undefined = cat
  let d = 0
  while (cur && d < 64) {
    if (rootSet.has(cur.slug.trim().toLowerCase())) return true
    const pid = cur.parentId?.trim()
    if (!pid) break
    cur = byId.get(pid)
    d += 1
  }
  return false
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
  const [storefront, setStorefront] = useState<StorefrontConfig | null>(null)
  const [sessionSub, setSessionSub] = useState<string | undefined>(undefined)
  const [sessionIsAdult, setSessionIsAdult] = useState<boolean | undefined>(undefined)
  const [ageRestrictedCategoryHidden, setAgeRestrictedCategoryHidden] = useState(false)
  /** Shown when navigating into a liquor/wine (etc.) category as a non-adult; re-opens when `category` changes. */
  const [minorRestrictedCategoryDialogOpen, setMinorRestrictedCategoryDialogOpen] = useState(false)
  const productsFetchSeq = useRef(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [cfgRes, meRes] = await Promise.all([
          fetch(apiUrl('/api/storefront-config'), { credentials: 'include' }),
          fetch(apiUrl('/api/auth/me'), { credentials: 'include' }),
        ])
        if (cancelled) return
        if (cfgRes.ok) {
          const cfg = (await cfgRes.json()) as StorefrontConfig
          setStorefront(cfg)
        }
        if (meRes.ok) {
          const me = (await meRes.json()) as { user?: { sub?: string; isAdult?: boolean } }
          setSessionSub(me.user?.sub)
          setSessionIsAdult(me.user?.isAdult)
        } else {
          setSessionSub(undefined)
          setSessionIsAdult(undefined)
        }
      } catch {
        if (!cancelled) {
          setStorefront(null)
          setSessionSub(undefined)
          setSessionIsAdult(undefined)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [cRes, pRes] = await Promise.all([
          fetch(apiUrl('/api/categories?onlyWithProducts=1'), { credentials: 'include' }),
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
        const res = await fetch(apiUrl(`/api/products?${params.toString()}`), { credentials: 'include' })
        if (seq !== productsFetchSeq.current) return
        if (!res.ok) throw new Error(await readApiError(res))
        const data = (await res.json()) as ProductListResponse
        if (seq !== productsFetchSeq.current) return
        setItems(data.items ?? [])
        setAgeRestrictedCategoryHidden(Boolean(data.ageRestrictedCategoryHidden))
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
        setAgeRestrictedCategoryHidden(false)
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

  const minorRestrictionRootsLower = useMemo(
    () =>
      (storefront?.minorRestrictedCategorySlugs ?? [])
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    [storefront?.minorRestrictedCategorySlugs],
  )

  const categoryTouchesMinorRestriction = useMemo(
    () =>
      categorySlugTouchesMinorRestrictionRoots(categorySlug, sortedCategories, minorRestrictionRootsLower),
    [categorySlug, sortedCategories, minorRestrictionRootsLower],
  )

  const showMinorRestrictedCategoryDialog = Boolean(
    storefront?.liquorGatingEnabled && sessionIsAdult !== true && categoryTouchesMinorRestriction,
  )

  useEffect(() => {
    if (!showMinorRestrictedCategoryDialog) {
      setMinorRestrictedCategoryDialogOpen(false)
      return
    }
    // Open on each navigation into a restricted category (slug change), not once per browser session.
    setMinorRestrictedCategoryDialogOpen(true)
  }, [categorySlug, showMinorRestrictedCategoryDialog])

  const showLiquorCategoryWarning = useMemo(() => {
    if (!storefront?.liquorGatingEnabled) return false
    if (!categorySlug.trim()) return false
    return ageRestrictedCategoryHidden
  }, [storefront?.liquorGatingEnabled, categorySlug, ageRestrictedCategoryHidden])

  const liquorShopMessage = useMemo(() => {
    if (sessionSub && sessionIsAdult === false) return liquorBlockedMinorMessage()
    return liquorBlockedGuestMessage()
  }, [sessionSub, sessionIsAdult])

  const minorRestrictedCategoryDialogBody = useMemo(() => {
    const base =
      sessionSub && sessionIsAdult === false ? liquorBlockedMinorMessage() : liquorBlockedGuestMessage()
    return `${base} Liquor and wine categories follow the same rules as other alcoholic products.`
  }, [sessionSub, sessionIsAdult])

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
            Filter by category or store, search the catalogue, and browse products — tuned for quick discovery.
          </Typography>
        </Stack>

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
                <Stack
                  direction="row"
                  gap={1.5}
                  sx={{ overflowX: 'auto', pb: 0.5, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}
                >
                  {promotions.map((pr) => {
                    const promoImg = resolvePromotionDisplayUrl(pr.slug, pr.imageUrl)
                    return (
                      <Card
                        key={pr.id}
                        variant="outlined"
                        sx={{
                          flexShrink: 0,
                          width: { xs: 200, sm: 240 },
                          borderRadius: SHOP_V2.radius,
                          borderColor: 'divider',
                          overflow: 'hidden',
                        }}
                      >
                        <CardActionArea
                          component={RouterLink}
                          to={resolvePromoHref(pr.linkPath, pathPrefix, shop)}
                          sx={{ display: 'block', textAlign: 'left' }}
                        >
                          <ProductImage
                            imageUrl={promoImg}
                            alt={pr.title}
                            ratio="16 / 9"
                            imageLayout="hero"
                            frame="default"
                          />
                          <Box sx={{ px: 1.75, py: 1.5 }}>
                            <Typography fontWeight={800} fontSize="0.9rem" sx={{ lineHeight: 1.25 }}>
                              {pr.title}
                            </Typography>
                            {pr.subtitle ? (
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.35 }}>
                                {pr.subtitle}
                              </Typography>
                            ) : null}
                          </Box>
                        </CardActionArea>
                      </Card>
                    )
                  })}
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

            {showLiquorCategoryWarning ? (
              <Alert severity="warning" role="alert" sx={{ borderRadius: SHOP_V2.radius }}>
                <Typography variant="subtitle2" fontWeight={800} gutterBottom>
                  {liquorBlockedShortTitle()}
                </Typography>
                <Typography variant="body2" sx={{ mb: 1.5, lineHeight: 1.45 }}>
                  {liquorShopMessage}
                </Typography>
                <Button
                  component={RouterLink}
                  to={pathPrefix ? `${pathPrefix}/profile` : '/profile'}
                  variant="contained"
                  size="small"
                  sx={{ fontWeight: 800 }}
                >
                  My account
                </Button>
              </Alert>
            ) : null}

            <Dialog
              open={minorRestrictedCategoryDialogOpen && showMinorRestrictedCategoryDialog}
              onClose={() => setMinorRestrictedCategoryDialogOpen(false)}
              fullWidth
              maxWidth="sm"
              aria-labelledby="minor-restricted-category-dialog-title"
            >
              <DialogTitle id="minor-restricted-category-dialog-title" sx={{ fontWeight: 800 }}>
                Liquor and wine — age restricted
              </DialogTitle>
              <DialogContent>
                <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                  {minorRestrictedCategoryDialogBody}
                </Typography>
              </DialogContent>
              <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
                <Button
                  component={RouterLink}
                  to={pathPrefix ? `${pathPrefix}/profile` : '/profile'}
                  variant="outlined"
                  size="small"
                  sx={{ fontWeight: 700 }}
                  onClick={() => setMinorRestrictedCategoryDialogOpen(false)}
                >
                  My account
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  sx={{ fontWeight: 800 }}
                  onClick={() => setMinorRestrictedCategoryDialogOpen(false)}
                >
                  OK
                </Button>
              </DialogActions>
            </Dialog>

            {displayItems.length === 0 && items.length > 0 && storeSlug ? (
              <Typography color="text.secondary">
                No products are listed under this store in the current catalogue. Try another store or clear the filter.
              </Typography>
            ) : null}

            <Grid container spacing={{ xs: 2, sm: 1.75, md: 1.5 }}>
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
                  <Grid key={p.id} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
                    <ShopProductCard
                      product={p}
                      pathPrefix={pathPrefix}
                      priceLabel={price}
                      demoStore={demoStore ? { name: demoStore.name, slug: demoStore.slug } : null}
                    />
                  </Grid>
                )
              })}
            </Grid>
          </Stack>
        </ShopPageSection>
      </Stack>

    </Box>
  )
}
