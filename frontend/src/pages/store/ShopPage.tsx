import { useEffect, useMemo, useRef, useState } from 'react'
import { Link as RouterLink, useLocation, useSearchParams } from 'react-router-dom'
import {
  Alert,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import SearchIcon from '@mui/icons-material/Search'
import type { ProductDto, ProductListResponse } from '../../types/catalogue'
import type { StoreCategoryDto, StorePromotionDto } from '../../types/storefront'
import { apiUrl, readApiError } from '../../lib/apiOrigin'
import { PT_CATALOG_UPDATED } from '../../lib/catalogEvents'
import { friendlyFetchError } from '../../lib/fetchErrors'
import { formatMoney } from '../../lib/money'
import { storefrontPrimaryVariantStock } from '../../lib/productStock'
import { ProductImage } from '../../components/store/ProductImage'
import { DEMO_STORES, getDemoStoreBySlug, getDemoStoreSlugForProduct, getDemoStoreForProduct } from '../../data/demoStores'

type SortKey = 'name' | 'price_asc' | 'price_desc'

function resolvePromoHref(linkPath: string | null, pathPrefix: string, shop: string): string {
  if (!linkPath?.trim()) return shop
  const p = linkPath.startsWith('/') ? linkPath : `/${linkPath}`
  const rel = p.replace(/^\//, '')
  if (!pathPrefix) return `/${rel}`
  return `${pathPrefix}/${rel}`.replace(/\/+/g, '/')
}

export function ShopPage() {
  const { pathname } = useLocation()
  const embed = pathname.startsWith('/embed')
  const pathPrefix = embed ? '/embed' : ''
  const shop = `${pathPrefix}/shop`
  const [searchParams, setSearchParams] = useSearchParams()

  const q = searchParams.get('q') ?? ''
  const categorySlug = searchParams.get('category') ?? ''
  /** Demo retailer filter (`store`); `brand` kept for older links. */
  const storeSlug = (searchParams.get('store') ?? searchParams.get('brand') ?? '').trim().toLowerCase()
  const sort = (searchParams.get('sort') ?? 'name') as SortKey

  const [items, setItems] = useState<ProductDto[]>([])
  const [categories, setCategories] = useState<StoreCategoryDto[]>([])
  const [promotions, setPromotions] = useState<StorePromotionDto[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sqlWarning, setSqlWarning] = useState<string | null>(null)
  const [catalogTick, setCatalogTick] = useState(0)
  const productsFetchSeq = useRef(0)

  const [qInput, setQInput] = useState(q)

  useEffect(() => {
    setQInput(q)
  }, [q])

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
            'SQL is configured but the API cannot connect — showing demo products only. Open http://localhost:4000/api/health for details.',
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

  function submitSearch() {
    const nextParams = new URLSearchParams(searchParams)
    const t = qInput.trim()
    if (t) nextParams.set('q', t)
    else nextParams.delete('q')
    setSearchParams(nextParams, { replace: true })
  }

  const categoryChips = useMemo(() => {
    const list = categories.length ? categories : []
    return list
  }, [categories])

  const displayItems = useMemo(() => {
    if (!storeSlug) return items
    return items.filter((p) => getDemoStoreSlugForProduct(p.slug) === storeSlug)
  }, [items, storeSlug])

  const activeStoreMeta = useMemo(() => (storeSlug ? getDemoStoreBySlug(storeSlug) : null), [storeSlug])

  if (error) {
    return (
      <Typography color="error" role="alert">
        {error}
      </Typography>
    )
  }

  return (
    <Stack spacing={2.5}>
      {sqlWarning ? (
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          {sqlWarning}
        </Alert>
      ) : null}
      <Stack spacing={0.5}>
        <Typography variant="h5" component="h1" fontWeight={800} letterSpacing={-0.3}>
          Shop
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Search, browse by category, peek into demo retailer shelves, and sort by price or name
        </Typography>
      </Stack>

      {storeSlug ? (
        <Alert
          severity="info"
          icon={false}
          sx={{ borderRadius: 2, py: 0.5 }}
          action={
            <Chip
              label="All retailers"
              size="small"
              onDelete={() => setStoreFilter('')}
              sx={{ fontWeight: 600 }}
            />
          }
        >
          <Typography variant="body2" fontWeight={600}>
            {activeStoreMeta?.name ?? storeSlug}
            {activeStoreMeta?.shortDescription ? ` — ${activeStoreMeta.shortDescription}` : ''}
          </Typography>
        </Alert>
      ) : null}

      {promotions.length > 0 ? (
        <Stack spacing={1}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>Promotions</Typography>
          <Stack direction="row" gap={1.5} sx={{ overflowX: 'auto', pb: 0.5, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
            {promotions.map((pr) => (
              <Card
                key={pr.id}
                variant="outlined"
                sx={{ flexShrink: 0, width: 220, borderRadius: 3, borderColor: 'divider' }}
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

      <TextField
        value={qInput}
        onChange={(e) => setQInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submitSearch()
          }
        }}
        fullWidth
        size="medium"
        placeholder="Search products…"
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ color: 'text.secondary' }} />
            </InputAdornment>
          ),
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            borderRadius: 3,
            bgcolor: 'background.paper',
          },
        }}
      />

      <TextField select label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} size="small" sx={{ maxWidth: 220 }}>
        <MenuItem value="name">Name</MenuItem>
        <MenuItem value="price_asc">Price: low to high</MenuItem>
        <MenuItem value="price_desc">Price: high to low</MenuItem>
      </TextField>

      <Stack direction="row" gap={1} sx={{ flexWrap: 'wrap' }}>
        <Chip
          label="All"
          onClick={() => setCategory('')}
          color={!categorySlug ? 'primary' : 'default'}
          variant={!categorySlug ? 'filled' : 'outlined'}
          sx={{ fontWeight: 600 }}
        />
        {categoryChips.map((c) => (
          <Chip
            key={c.slug}
            label={c.name}
            onClick={() => setCategory(c.slug)}
            color={categorySlug === c.slug ? 'primary' : 'default'}
            variant={categorySlug === c.slug ? 'filled' : 'outlined'}
            sx={{ fontWeight: 600 }}
          />
        ))}
      </Stack>

      <Stack spacing={0.75}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'text.secondary' }}>Stores</Typography>
        <Stack direction="row" gap={1} sx={{ flexWrap: 'wrap' }}>
          <Chip
            label="All stores"
            onClick={() => setStoreFilter('')}
            color={!storeSlug ? 'secondary' : 'default'}
            variant={!storeSlug ? 'filled' : 'outlined'}
            sx={{ fontWeight: 600 }}
          />
          {DEMO_STORES.map((s) => (
            <Chip
              key={s.slug}
              label={s.name}
              onClick={() => setStoreFilter(s.slug)}
              color={storeSlug === s.slug ? 'secondary' : 'default'}
              variant={storeSlug === s.slug ? 'filled' : 'outlined'}
              sx={{ fontWeight: 600 }}
            />
          ))}
        </Stack>
      </Stack>

      {displayItems.length === 0 && items.length > 0 && storeSlug ? (
        <Typography color="text.secondary">No products are listed under this store in the current catalogue. Try another store or clear the filter.</Typography>
      ) : null}

      <Grid container spacing={2}>
        {displayItems.map((p) => {
          const v0 = p.variants[0]
          const price = v0 ? formatMoney(v0.priceCents, v0.currency) : '—'
          const demoStore = getDemoStoreForProduct(p.slug)
          const stockTotal = storefrontPrimaryVariantStock(p)
          return (
            <Grid key={p.id} size={{ xs: 6, sm: 6, md: 4 }}>
              <Card
                variant="outlined"
                sx={{
                  height: '100%',
                  overflow: 'hidden',
                  borderColor: 'divider',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: '0 12px 32px rgba(15, 23, 42, 0.1)',
                  },
                }}
              >
                <CardActionArea
                  component={RouterLink}
                  to={`${pathPrefix}/shop/${p.slug}`}
                  sx={{ height: '100%', alignItems: 'stretch', display: 'block' }}
                >
                  <ProductImage imageUrl={p.imageUrl} alt={p.name} ratio="1" />
                  <CardContent sx={{ pt: 2, pb: 2 }}>
                    <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mb: 1 }}>
                      <Chip
                        label={p.categoryName || p.categorySlug || '—'}
                        size="small"
                        sx={{
                          height: 22,
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          bgcolor: 'action.hover',
                        }}
                      />
                      {demoStore ? (
                        <Chip
                          label={demoStore.name}
                          size="small"
                          color="secondary"
                          variant="outlined"
                          sx={{ height: 22, fontSize: '0.65rem', fontWeight: 700 }}
                          component={RouterLink}
                          to={`${shop}?store=${encodeURIComponent(demoStore.slug)}`}
                          clickable
                        />
                      ) : null}
                      <Chip
                        label={stockTotal <= 0 ? 'Out of stock' : `${stockTotal} in stock`}
                        size="small"
                        color={stockTotal <= 0 ? 'error' : stockTotal <= 5 ? 'warning' : 'success'}
                        variant={stockTotal <= 0 ? 'filled' : 'outlined'}
                        sx={{ height: 22, fontSize: '0.65rem', fontWeight: 700 }}
                      />
                    </Stack>
                    <Typography
                      fontWeight={800}
                      gutterBottom
                      sx={{
                        lineHeight: 1.25,
                        minHeight: 40,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {p.name}
                    </Typography>
                    <Typography variant="subtitle1" color="primary" fontWeight={800}>
                      {price}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          )
        })}
      </Grid>
    </Stack>
  )
}
