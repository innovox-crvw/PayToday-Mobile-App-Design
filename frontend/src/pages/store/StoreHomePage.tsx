import type { MouseEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Badge,
  Box,
  Button,
  ButtonBase,
  Card,
  Chip,
  CircularProgress,
  IconButton,
  InputBase,
  Paper,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import SearchIcon from '@mui/icons-material/Search'
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import type { PopularStoreDto, StoreCategoryDto, StorePromotionDto } from '../../types/storefront'
import type { HubPaymentCategoryItemDto, HubPaymentCategoryItemsResponse } from '../../types/paymentCategoryItems'
import type { ProductDto, ProductListResponse } from '../../types/catalogue'
import { apiUrl } from '../../lib/apiOrigin'
import { resolvePromotionDisplayUrl } from '../../lib/promotionImageUrl'
import { PAYMENTS_HUB_TILES, SERVICES_HUB_TILES } from '../../data/hubNavigationStatic'
import { hubNavIcon } from '../../lib/hubNavIcons'
import { useAuthMe } from '../../hooks/useAuthMe'
import { SurfaceSection } from '../../components/page/SurfaceSection'
import {
  APP_DISPLAY_NAME,
  SERVICES_CARD_GRADIENT,
  STORE_HOME_CARD_SHADOW,
  STORE_HOME_HERO_DOT_ACTIVE,
  STORE_HOME_HERO_DOT_INACTIVE,
  STORE_HOME_HERO_SLIDE_SCRIM,
  STORE_DESKTOP_CANVAS_GREY,
  STORE_HOME_SURFACE_RADIUS_PX,
  SURFACE_BORDER,
  SURFACE_SHADOW,
} from '../../theme/branding'
import { AppBrandLogo } from '../../components/brand/AppBrandLogo'
import { formatMoney } from '../../lib/money'
import { storefrontVariantPriceRange, variantSavingsCents } from '../../lib/productStock'
import { StoreHomeProductRailCard } from '../../components/store/StoreHomeProductRailCard'
import { PrepaidProviderLogo } from '../../components/store/PrepaidProviderLogo'
import { SHOP_V2 } from '../../theme/storeV2'

/** Light outline so tiles and section shells read clearly on the grey home canvas. */
const homeOutline = `1px solid ${SURFACE_BORDER}`

type Brand = { id: string; abbr: string; bg: string; color?: string }

/** Shown when SQL is off, the popular-stores query errors, or there are no qualifying orders in the window. */
const STATIC_POPULAR_BRANDS: Brand[] = [
  { id: 'fresh', abbr: 'FM', bg: '#2563EB', color: '#fff' },
  { id: 'fuel', abbr: 'CF', bg: '#0D9488', color: '#fff' },
  { id: 'grove', abbr: 'GM', bg: '#37474F' },
  { id: 'mtc', abbr: 'MT', bg: '#0D47A1', color: '#E3F2FD' },
  { id: 'paratus', abbr: 'PR', bg: '#1565C0' },
]

/** Fixed window for `/api/storefront/popular-stores` (UI no longer exposes range controls). */
const POPULAR_STORES_RANK_WINDOW_DAYS = 30

function hubLogoHue(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const hue = h % 360
  return `hsl(${hue}, 55%, 42%)`
}

function dealScore(p: ProductDto): number {
  let max = 0
  for (const v of p.variants) {
    const s = variantSavingsCents(v)
    if (s != null && s > max) max = s
  }
  return max
}

function hasDeal(p: ProductDto): boolean {
  return dealScore(p) > 0
}

function selectHomeDealProducts(items: ProductDto[], cap: number): ProductDto[] {
  const deals = items.filter(hasDeal)
  const sorted = [...deals].sort((a, b) => dealScore(b) - dealScore(a))
  if (sorted.length >= cap) return sorted.slice(0, cap)
  const filler = items.filter((p) => !hasDeal(p))
  return [...sorted, ...filler].slice(0, cap)
}

function railPriceLabel(p: ProductDto): string {
  const v0 = p.variants[0]
  const range = storefrontVariantPriceRange(p)
  if (range && p.variants.length > 1 && range.min !== range.max) {
    return `From ${formatMoney(range.min, range.currency)}`
  }
  return v0 ? formatMoney(v0.priceCents, v0.currency) : '—'
}

type HeroSlide = {
  key: string
  title: string
  subtitle: string
  link: string
  imageUrl: string
}

const fallbackHeroSlides: {
  slug: string
  title: string
  subtitle: string
  linkPath: '/shop' | '/wallet'
}[] = [
  { slug: 'welcome', title: 'Deals near you', subtitle: `Pay with ${APP_DISPLAY_NAME} in one tap.`, linkPath: '/shop' },
  { slug: 'pickup', title: 'Store pickup', subtitle: 'Order online, collect at a pickup point.', linkPath: '/shop' },
  { slug: 'secure', title: 'Secure payments', subtitle: 'Your wallet, your way.', linkPath: '/wallet' },
]

function resolveStoreLink(linkPath: string | null | undefined, pathPrefix: string, fallback: string): string {
  if (!linkPath?.trim()) return fallback
  const p = linkPath.startsWith('/') ? linkPath : `/${linkPath}`
  const rel = p.replace(/^\//, '')
  if (!pathPrefix) return `/${rel}`
  return `${pathPrefix}/${rel}`.replace(/\/+/g, '/')
}

function recentShortcutAccent(label: string): string {
  let h = 0
  for (let i = 0; i < label.length; i += 1) h = (h * 31 + label.charCodeAt(i)) >>> 0
  const hue = h % 360
  return `linear-gradient(160deg, hsl(${hue}, 55%, 48%) 0%, hsl(${(hue + 45) % 360}, 58%, 38%) 100%)`
}

function twoLetterAbbr(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
  const w = parts[0] ?? ''
  if (!w) return '?'
  return w.slice(0, 2).toUpperCase()
}

/** Hide native scrollbar; row still scrolls with touch/mouse wheel on the tiles. */
function hideHorizontalScrollbar() {
  return {
    scrollbarWidth: 'none' as const,
    msOverflowStyle: 'none' as const,
    '&::-webkit-scrollbar': {
      display: 'none',
      height: 0,
    },
  }
}

function BrandChip({ b, to }: { b: Brand; to: string }) {
  return (
    <Box
      component={RouterLink}
      to={to}
      sx={{
        flexShrink: 0,
        width: 64,
        height: 64,
        borderRadius: 1,
        background: b.bg,
        color: b.color ?? '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textDecoration: 'none',
        boxShadow: '0 4px 14px rgba(15,23,42,0.12)',
        border: homeOutline,
        boxSizing: 'border-box',
      }}
    >
      <Typography sx={{ fontWeight: 900, fontSize: '1.35rem', lineHeight: 1 }}>{b.abbr}</Typography>
    </Box>
  )
}

function PopularStoreChip({ item, to }: { item: PopularStoreDto; to: string }) {
  const label = (item.brandName?.trim() || item.brandSlug).trim()
  const abbr = twoLetterAbbr(label)
  const bg = recentShortcutAccent(label)
  return (
    <Box sx={{ flexShrink: 0, width: 76, textAlign: 'center' }}>
      <Box
        component={RouterLink}
        to={to}
        aria-label={label}
        sx={{
          textDecoration: 'none',
          color: 'inherit',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0.65,
        }}
      >
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: 1,
            background: bg,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(15,23,42,0.12)',
            fontWeight: 900,
            fontSize: '1.1rem',
            lineHeight: 1,
            letterSpacing: 0.5,
            border: homeOutline,
            boxSizing: 'border-box',
          }}
        >
          {abbr}
        </Box>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            lineHeight: 1.2,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            maxWidth: '100%',
          }}
        >
          {label}
        </Typography>
      </Box>
    </Box>
  )
}

export function StoreHomePage() {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const navigate = useNavigate()
  const { pathname, search: locationSearch } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  useAuthMe()
  const shop = `${pathPrefix}/shop`
  const profilePath = `${pathPrefix}/profile`
  const notificationsPath = `${pathPrefix}/notifications`

  function href(path: string) {
    const rel = path.replace(/^\//, '')
    if (!pathPrefix) return `/${rel}`
    return `${pathPrefix}/${rel}`.replace(/\/+/g, '/')
  }

  const [heroIndex, setHeroIndex] = useState(0)
  const [search, setSearch] = useState('')
  /** `undefined` while loading `/api/auth/me`; `''` if guest; first name or email local-part when signed in. */
  const [memberGreeting, setMemberGreeting] = useState<string | undefined>(undefined)
  const [categories, setCategories] = useState<StoreCategoryDto[]>([])
  const [promotions, setPromotions] = useState<StorePromotionDto[]>([])
  const [popularItems, setPopularItems] = useState<PopularStoreDto[]>([])
  const [popularLoading, setPopularLoading] = useState(true)
  const [dealProducts, setDealProducts] = useState<ProductDto[]>([])
  const [dealsLoading, setDealsLoading] = useState(true)
  const [airtimeItems, setAirtimeItems] = useState<HubPaymentCategoryItemDto[]>([])
  const [voucherItems, setVoucherItems] = useState<HubPaymentCategoryItemDto[]>([])
  const [hubAirtimeLoading, setHubAirtimeLoading] = useState(true)
  const [hubVoucherLoading, setHubVoucherLoading] = useState(true)

  const sortedCategories = useMemo(
    () =>
      [...categories]
        .filter((c) => Boolean(c?.slug?.trim()))
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)),
    [categories],
  )

  const welcomeTitle = useMemo(() => {
    if (memberGreeting === undefined) return 'Welcome'
    if (!memberGreeting) return `Welcome to ${APP_DISPLAY_NAME}`
    return `Welcome back, ${memberGreeting}`
  }, [memberGreeting])

  const heroSlides: HeroSlide[] = useMemo(() => {
    if (promotions.length > 0) {
      return promotions.map((p) => ({
        key: p.id,
        title: p.title,
        subtitle: p.subtitle ?? '',
        link: resolveStoreLink(p.linkPath, pathPrefix, shop),
        imageUrl: resolvePromotionDisplayUrl(p.slug, p.imageUrl),
      }))
    }
    return fallbackHeroSlides.map((h) => ({
      key: `fb-${h.slug}`,
      title: h.title,
      subtitle: h.subtitle,
      link: resolveStoreLink(h.linkPath, pathPrefix, shop),
      imageUrl: resolvePromotionDisplayUrl(h.slug, null),
    }))
  }, [promotions, pathPrefix, shop])

  useEffect(() => {
    setHeroIndex(0)
  }, [heroSlides.length])

  const onShopRoute = /\/shop\/?$/.test(pathname) || pathname.endsWith('/shop')
  useEffect(() => {
    if (!onShopRoute) return
    const sp = new URLSearchParams(locationSearch)
    setSearch(sp.get('q') ?? '')
  }, [onShopRoute, locationSearch])

  const nHero = heroSlides.length
  const heroSlidePercent = nHero > 0 ? 100 / nHero : 100

  function goHeroPrev(e?: MouseEvent) {
    e?.preventDefault()
    e?.stopPropagation()
    if (nHero <= 1) return
    setHeroIndex((i) => (i - 1 + nHero) % nHero)
  }

  function goHeroNext(e?: MouseEvent) {
    e?.preventDefault()
    e?.stopPropagation()
    if (nHero <= 1) return
    setHeroIndex((i) => (i + 1) % nHero)
  }

  useEffect(() => {
    const n = heroSlides.length
    if (n <= 1) return
    const t = window.setInterval(() => {
      setHeroIndex((i) => (i + 1) % n)
    }, 5000)
    return () => window.clearInterval(t)
  }, [heroSlides.length])

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
        /* merchandising optional */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const me = await fetch(apiUrl('/api/auth/me'), { credentials: 'include' })
        if (!me.ok) {
          setMemberGreeting('')
          return
        }
        const data = (await me.json()) as { user?: { fullName?: string | null; email?: string } }
        const fn = data.user?.fullName?.trim()
        if (fn) {
          setMemberGreeting(fn.split(/\s+/)[0] ?? fn)
          return
        }
        const em = data.user?.email?.trim()
        if (em) {
          const local = em.split('@')[0]
          setMemberGreeting(local || '')
          return
        }
        setMemberGreeting('')
      } catch {
        setMemberGreeting('')
      }
    })()
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setPopularLoading(true)
      try {
        const res = await fetch(
          apiUrl(`/api/storefront/popular-stores?days=${POPULAR_STORES_RANK_WINDOW_DAYS}&limit=12`),
        )
        if (!res.ok) {
          if (!cancelled) setPopularItems([])
          return
        }
        const data = (await res.json()) as {
          items?: PopularStoreDto[]
        }
        if (cancelled) return
        setPopularItems(Array.isArray(data.items) ? data.items : [])
      } catch {
        if (!cancelled) {
          setPopularItems([])
        }
      } finally {
        if (!cancelled) setPopularLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setDealsLoading(true)
      try {
        const res = await fetch(apiUrl('/api/products?sort=price_asc&includeImages=1'))
        if (!res.ok) {
          if (!cancelled) setDealProducts([])
          return
        }
        const data = (await res.json()) as ProductListResponse
        if (cancelled) return
        setDealProducts(selectHomeDealProducts(data.items ?? [], 12))
      } catch {
        if (!cancelled) setDealProducts([])
      } finally {
        if (!cancelled) setDealsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setHubAirtimeLoading(true)
      setHubVoucherLoading(true)
      try {
        const [aRes, vRes] = await Promise.all([
          fetch(apiUrl('/api/hub/payment-category-items?category=airtime')),
          fetch(apiUrl('/api/hub/payment-category-items?category=vouchers')),
        ])
        if (cancelled) return
        if (aRes.ok) {
          const a = (await aRes.json()) as HubPaymentCategoryItemsResponse
          setAirtimeItems(Array.isArray(a.items) ? a.items : [])
        } else {
          setAirtimeItems([])
        }
        if (vRes.ok) {
          const v = (await vRes.json()) as HubPaymentCategoryItemsResponse
          setVoucherItems(Array.isArray(v.items) ? v.items : [])
        } else {
          setVoucherItems([])
        }
      } catch {
        if (!cancelled) {
          setAirtimeItems([])
          setVoucherItems([])
        }
      } finally {
        if (!cancelled) {
          setHubAirtimeLoading(false)
          setHubVoucherLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** Popular + categories + horizontal strips; `minWidth: 0` so flex doesn’t swallow overflow on mobile. */
  const homeHorizontalStripSx = useMemo(
    () => ({
      display: 'flex',
      flexDirection: 'row',
      flexWrap: 'nowrap',
      gap: 1.5,
      width: '100%',
      maxWidth: '100%',
      minWidth: 0,
      overflowX: 'auto',
      overflowY: 'hidden',
      pb: 1,
      mx: { xs: -0.5, sm: 0 },
      px: { xs: 0.5, sm: 0 },
      WebkitOverflowScrolling: 'touch',
      overscrollBehaviorX: 'contain',
      scrollSnapType: reduceMotion ? ('none' as const) : ('x proximity' as const),
      ...hideHorizontalScrollbar(),
    }),
    [reduceMotion],
  )

  /** Services: below `md`, 2-column grid; `md+` horizontal strip (scrollbar hidden). */
  const homeSectionTilesSx = useMemo(
    () => ({
      display: { xs: 'grid', md: 'flex' },
      gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))' },
      gap: { xs: 2, md: 1.5 },
      overflowX: { xs: 'visible', md: 'auto' },
      overflowY: { md: 'visible' },
      pb: { xs: 0, md: 0.5 },
      mx: { xs: 0, md: -0.5 },
      px: { xs: 0, md: 0.5 },
      '@media (min-width: 900px)': {
        flexWrap: 'nowrap',
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        WebkitOverflowScrolling: 'touch',
        overscrollBehaviorX: 'contain',
        ...hideHorizontalScrollbar(),
      },
    }),
    [],
  )

  function submitSearch() {
    const q = search.trim()
    if (q) navigate(`${shop}?q=${encodeURIComponent(q)}`)
    else navigate(shop)
  }

  const searchForm = (
    <Paper
      component="form"
      onSubmit={(e) => {
        e.preventDefault()
        submitSearch()
      }}
      elevation={0}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 1.25,
        minWidth: 0,
        width: 1,
        borderRadius: 999,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        boxShadow: SURFACE_SHADOW,
      }}
    >
      <SearchIcon sx={{ color: 'text.secondary' }} />
      <InputBase
        placeholder="Search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{
          flex: 1,
          minWidth: 0,
          color: 'text.primary',
          '& input::placeholder': {
            color: 'text.secondary',
            opacity: 1,
          },
        }}
      />
    </Paper>
  )

  /** Sections that sit on the grey home canvas (no white card shell). */
  const homeSectionOnCanvasSx = {
    borderRadius: `${STORE_HOME_SURFACE_RADIUS_PX}px`,
    bgcolor: STORE_DESKTOP_CANVAS_GREY,
    boxShadow: 'none',
    border: homeOutline,
    p: { xs: 2, sm: 2.5 },
    overflow: 'hidden',
  } as const

  const sectionTitleSx = {
    fontWeight: 800,
    letterSpacing: -0.35,
    fontSize: '1.05rem',
    color: '#0f172a',
  } as const

  const shopBillPayAnchor = `${shop}#shop-bill-pay`
  const shopProductsAnchor = `${shop}#shop-products`
  const dealsViewMoreTo = `${shop}?sort=price_asc#shop-products`

  function viewMoreAction(to: string) {
    return (
      <Button
        component={RouterLink}
        to={to}
        size="small"
        variant="text"
        color="primary"
        endIcon={<ChevronRightIcon sx={{ fontSize: '1.05rem !important' }} />}
        sx={{ fontWeight: 700, textTransform: 'none', whiteSpace: 'nowrap', minWidth: 0 }}
      >
        View more
      </Button>
    )
  }

  return (
    <Stack
      spacing={0}
      sx={{
        // Bottom nav clearance is on `StoreLayout` `Container` only — no extra `pb` here (avoids double tail / long scroll).
        pb: { xs: 0, md: 2 },
        minWidth: 0,
        boxSizing: 'border-box',
        // Mobile: bleed to viewport edges without `100vw` (avoids scrollbar gutter overflow + strip on the right).
        bgcolor: STORE_DESKTOP_CANVAS_GREY,
        ...(isMobile
          ? {
              width: { xs: (t) => `calc(100% + ${t.spacing(4)})`, sm: (t) => `calc(100% + ${t.spacing(6)})` },
              maxWidth: 'none',
              ml: { xs: -2, sm: -3 },
              mr: { xs: -2, sm: -3 },
            }
          : {
              width: 1,
              mx: { xs: -2, sm: -3, md: -4, lg: -5 },
            }),
      }}
    >
      {isMobile ? (
        <Box
          sx={{
            pt: { xs: 1.75, sm: 2 },
            pb: { xs: 2, sm: 2.5 },
            px: { xs: 2, sm: 2.5 },
            bgcolor: STORE_DESKTOP_CANVAS_GREY,
          }}
        >
          <Stack spacing={{ xs: 1.5, sm: 1.75 }} sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, minWidth: 0 }}>
              <IconButton
                component={RouterLink}
                to={profilePath}
                sx={{
                  color: 'text.primary',
                  border: 1,
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                  flexShrink: 0,
                }}
                aria-label="My account"
              >
                <PersonOutlineIcon />
              </IconButton>
              <Box sx={{ minWidth: 0, flex: 1, display: 'flex', justifyContent: 'center' }}>
                <AppBrandLogo to={pathPrefix || '/'} wordmarkTone="onLight" />
              </Box>
              <IconButton
                component={RouterLink}
                to={notificationsPath}
                sx={{
                  color: 'text.primary',
                  border: 1,
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                  flexShrink: 0,
                }}
                aria-label="Notifications"
              >
                <Badge color="error" variant="dot">
                  <NotificationsNoneIcon />
                </Badge>
              </IconButton>
            </Box>
            <Typography
              component="h1"
              sx={{
                fontWeight: 800,
                fontSize: { xs: 'clamp(1.25rem, 4.5vw, 1.5rem)', sm: '1.5rem' },
                letterSpacing: -0.5,
                lineHeight: 1.2,
                wordBreak: 'break-word',
                color: 'text.primary',
              }}
            >
              {welcomeTitle}
            </Typography>
            {searchForm}
          </Stack>
        </Box>
      ) : null}

      <Stack
        spacing={{ xs: 3, md: 4 }}
        sx={{
          pt: { xs: 2, md: 2 },
          pb: { xs: 0, sm: 0, md: 0 },
          width: 1,
          minWidth: 0,
          px: { xs: 2, sm: 3, md: 4, lg: 5 },
          boxSizing: 'border-box',
          bgcolor: STORE_DESKTOP_CANVAS_GREY,
        }}
      >
        {!isMobile ? (
          <Typography
            component="h1"
            variant="h4"
            sx={{
              fontWeight: 800,
              letterSpacing: -0.55,
              lineHeight: 1.2,
              color: 'text.primary',
            }}
          >
            {welcomeTitle}
          </Typography>
        ) : null}

        {/* Hero carousel: placement images + horizontal slide */}
        <Stack spacing={1.5} alignItems="center">
          <Card
            component="section"
            aria-roledescription="carousel"
            aria-label="Promotions"
            elevation={0}
            sx={{
              position: 'relative',
              width: '100%',
              borderRadius: `${STORE_HOME_SURFACE_RADIUS_PX}px`,
              bgcolor: 'background.paper',
              boxShadow: STORE_HOME_CARD_SHADOW,
              border: homeOutline,
              overflow: 'hidden',
            }}
          >
            {nHero > 1 ? (
              <>
                <IconButton
                  type="button"
                  aria-label="Previous promotion"
                  onClick={goHeroPrev}
                  size="small"
                  sx={{
                    position: 'absolute',
                    left: 4,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 2,
                    color: '#fff',
                    bgcolor: 'rgba(0,0,0,0.35)',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.5)' },
                  }}
                >
                  <ChevronLeftIcon />
                </IconButton>
                <IconButton
                  type="button"
                  aria-label="Next promotion"
                  onClick={goHeroNext}
                  size="small"
                  sx={{
                    position: 'absolute',
                    right: 4,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 2,
                    color: '#fff',
                    bgcolor: 'rgba(0,0,0,0.35)',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.5)' },
                  }}
                >
                  <ChevronRightIcon />
                </IconButton>
              </>
            ) : null}
            <Box sx={{ overflow: 'hidden', width: '100%' }}>
              <Box
                sx={{
                  display: 'flex',
                  width: `${nHero * 100}%`,
                  transform: `translateX(-${(100 * heroIndex) / Math.max(nHero, 1)}%)`,
                  transition: reduceMotion ? 'none' : theme.transitions.create('transform', { duration: 480, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }),
                }}
              >
                {heroSlides.map((slide) => (
                  <Box
                    key={slide.key}
                    component={RouterLink}
                    to={slide.link}
                    aria-hidden={heroSlides[heroIndex]?.key !== slide.key}
                    tabIndex={heroSlides[heroIndex]?.key === slide.key ? 0 : -1}
                    sx={{
                      flex: `0 0 ${heroSlidePercent}%`,
                      width: `${heroSlidePercent}%`,
                      minHeight: { xs: 200, sm: 220, md: 240 },
                      position: 'relative',
                      display: 'block',
                      textDecoration: 'none',
                      backgroundImage: `url(${slide.imageUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat',
                      outline: 'none',
                      borderRadius: `${Math.max(STORE_HOME_SURFACE_RADIUS_PX - 6, 8)}px`,
                      '&:focus-visible': { boxShadow: (t) => `inset 0 0 0 3px ${t.palette.primary.main}` },
                    }}
                  >
                    <Box
                      aria-hidden
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        background: STORE_HOME_HERO_SLIDE_SCRIM,
                        borderRadius: 'inherit',
                      }}
                    />
                    <Stack
                      spacing={0.75}
                      sx={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        p: { xs: 2, sm: 2.5 },
                        textAlign: 'left',
                      }}
                    >
                      <Typography variant="h6" fontWeight={800} sx={{ color: '#fff', textShadow: '0 1px 8px rgba(0,0,0,0.35)' }}>
                        {slide.title}
                      </Typography>
                      {slide.subtitle ? (
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 6px rgba(0,0,0,0.35)' }}>
                          {slide.subtitle}
                        </Typography>
                      ) : null}
                    </Stack>
                  </Box>
                ))}
              </Box>
            </Box>
          </Card>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }} role="tablist" aria-label="Choose promotion">
            {heroSlides.map((slide, i) => (
              <ButtonBase
                key={slide.key}
                onClick={() => setHeroIndex(i)}
                role="tab"
                aria-selected={i === heroIndex}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setHeroIndex(i)
                  if (e.key === 'ArrowLeft') goHeroPrev()
                  if (e.key === 'ArrowRight') goHeroNext()
                }}
                sx={{
                  borderRadius: 99,
                  width: i === heroIndex ? 18 : 6,
                  height: 6,
                  minWidth: 6,
                  bgcolor: i === heroIndex ? STORE_HOME_HERO_DOT_ACTIVE : STORE_HOME_HERO_DOT_INACTIVE,
                  cursor: 'pointer',
                  transition: 'width 0.2s, background-color 0.2s',
                  '&:hover': { opacity: 0.92 },
                  '&:focus-visible': { outline: (t) => `2px solid ${t.palette.primary.main}`, outlineOffset: 2 },
                }}
              />
            ))}
          </Box>
        </Stack>
        {sortedCategories.length > 0 ? (
          <SurfaceSection title="Explore our shop" titleSx={sectionTitleSx} action={viewMoreAction(shopProductsAnchor)}>
            <Box sx={{ ...homeSectionOnCanvasSx, py: { xs: 1.75, sm: 2 } }}>
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 1,
                  justifyContent: 'flex-start',
                }}
              >
                {sortedCategories.map((c) => (
                  <Chip
                    key={`explore-${c.slug}`}
                    component={RouterLink}
                    to={`${shop}?category=${encodeURIComponent(c.slug)}`}
                    clickable
                    variant="outlined"
                    label={c.name}
                    sx={{
                      fontWeight: 700,
                      borderRadius: 2,
                      border: homeOutline,
                      bgcolor: 'background.paper',
                      '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                    }}
                  />
                ))}
              </Box>
            </Box>
          </SurfaceSection>
        ) : null}

        <SurfaceSection title="Instant pay" titleSx={sectionTitleSx} action={viewMoreAction(shopBillPayAnchor)}>
          <Box sx={homeSectionOnCanvasSx}>
            <Box
              role="region"
              aria-label="Bill pay categories — swipe to scroll"
              sx={{
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'nowrap',
                gap: 2,
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
                overflowX: 'auto',
                overflowY: 'hidden',
                py: 0.5,
                ...hideHorizontalScrollbar(),
              }}
            >
              {PAYMENTS_HUB_TILES.map((c) => (
                <Box
                  key={c.slug}
                  component={RouterLink}
                  to={href(c.linkPath)}
                  sx={{
                    flex: '0 0 auto',
                    width: 76,
                    textDecoration: 'none',
                    color: 'inherit',
                    textAlign: 'center',
                  }}
                >
                  <Stack spacing={0.75} alignItems="center">
                    <Box
                      sx={(t) => ({
                        width: 56,
                        height: 56,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: alpha(SHOP_V2.accent, 0.12),
                        color: SHOP_V2.accent,
                        border: homeOutline,
                        boxShadow: `0 6px 16px ${alpha(SHOP_V2.accent, 0.15)}`,
                        transition: t.transitions.create(['transform', 'box-shadow'], { duration: 160 }),
                        '&:hover': {
                          transform: 'scale(1.05)',
                          boxShadow: `0 8px 20px ${alpha(SHOP_V2.accent, 0.22)}`,
                        },
                        '& svg': { fontSize: 26 },
                      })}
                    >
                      {hubNavIcon(c.iconKey)}
                    </Box>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.65rem',
                        lineHeight: 1.2,
                        maxWidth: 76,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {c.label}
                    </Typography>
                  </Stack>
                </Box>
              ))}
            </Box>
          </Box>
        </SurfaceSection>

        {dealsLoading || dealProducts.length > 0 ? (
          <SurfaceSection title="Super deals" titleSx={sectionTitleSx} action={viewMoreAction(dealsViewMoreTo)}>
            <Box sx={homeSectionOnCanvasSx}>
              {dealsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2.5 }}>
                  <CircularProgress size={28} aria-label="Loading deals" />
                </Box>
              ) : (
                <Box
                  role="region"
                  aria-label="Deal products — swipe to scroll"
                  sx={{ ...homeHorizontalStripSx, gap: 1.25, alignItems: 'stretch' }}
                >
                  {dealProducts.map((p) => (
                    <StoreHomeProductRailCard
                      key={p.id}
                      product={p}
                      pathPrefix={pathPrefix}
                      priceLabel={railPriceLabel(p)}
                    />
                  ))}
                </Box>
              )}
            </Box>
          </SurfaceSection>
        ) : null}

        <SurfaceSection title="Popular" titleSx={sectionTitleSx} action={viewMoreAction(shopProductsAnchor)}>
          <Box sx={homeSectionOnCanvasSx}>
            <Stack spacing={1.25}>
              {popularLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2.5 }}>
                  <CircularProgress size={28} aria-label="Loading popular stores" />
                </Box>
              ) : (
                <Box
                  role="region"
                  aria-label="Popular stores — swipe left or right on the tiles to scroll"
                  sx={homeHorizontalStripSx}
                >
                  {popularItems.length > 0
                    ? popularItems.map((item) => (
                        <Box
                          key={item.brandSlug}
                          sx={{
                            flexShrink: 0,
                            scrollSnapAlign: 'start',
                            display: 'flex',
                            justifyContent: 'center',
                          }}
                        >
                          <PopularStoreChip
                            item={item}
                            to={`${shop}?store=${encodeURIComponent(item.brandSlug)}`}
                          />
                        </Box>
                      ))
                    : STATIC_POPULAR_BRANDS.map((b) => (
                        <Box
                          key={`pop-${b.id}`}
                          sx={{
                            flexShrink: 0,
                            scrollSnapAlign: 'start',
                            display: 'flex',
                            justifyContent: 'center',
                          }}
                        >
                          <BrandChip b={b} to={`${shop}?store=${encodeURIComponent(b.id)}`} />
                        </Box>
                      ))}
                </Box>
              )}
            </Stack>
          </Box>
        </SurfaceSection>

        {hubAirtimeLoading || airtimeItems.length > 0 ? (
          <SurfaceSection title="Prepaids" titleSx={sectionTitleSx} action={viewMoreAction(href('payments/airtime'))}>
            <Box sx={homeSectionOnCanvasSx}>
              {hubAirtimeLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2.5 }}>
                  <CircularProgress size={28} aria-label="Loading airtime providers" />
                </Box>
              ) : (
                <Box
                  role="region"
                  aria-label="Airtime providers — swipe to scroll"
                  sx={{ ...homeHorizontalStripSx, gap: 1.75, justifyContent: 'flex-start' }}
                >
                  {airtimeItems.map((row) => (
                    <Box
                      key={row.id}
                      component={RouterLink}
                      to={href(`payments/airtime/pay/${encodeURIComponent(row.id)}`)}
                      sx={{
                        flexShrink: 0,
                        width: 88,
                        minWidth: 88,
                        maxWidth: 88,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        textAlign: 'left',
                        textDecoration: 'none',
                        color: 'inherit',
                        scrollSnapAlign: 'start',
                      }}
                    >
                      <PrepaidProviderLogo displayName={row.displayName} id={row.id} initials={row.initials} size={52} />
                      <Typography
                        variant="caption"
                        sx={{
                          mt: 0.65,
                          fontWeight: 700,
                          lineHeight: 1.2,
                          width: '100%',
                          textAlign: 'left',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {row.displayName}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </SurfaceSection>
        ) : null}

        {hubVoucherLoading || voucherItems.length > 0 ? (
          <SurfaceSection title="Vouchers" titleSx={sectionTitleSx} action={viewMoreAction(href('payments/vouchers'))}>
            <Box sx={homeSectionOnCanvasSx}>
              {hubVoucherLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2.5 }}>
                  <CircularProgress size={28} aria-label="Loading vouchers" />
                </Box>
              ) : (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
                    gap: 1,
                  }}
                >
                  {voucherItems.map((row) => {
                    const glyph = row.displayName.trim().charAt(0).toUpperCase() || '?'
                    return (
                      <Button
                        key={row.id}
                        component={RouterLink}
                        to={href(`payments/vouchers/pay/${encodeURIComponent(row.id)}`)}
                        variant="outlined"
                        fullWidth
                        sx={{
                          justifyContent: 'flex-start',
                          textAlign: 'left',
                          textTransform: 'none',
                          borderRadius: 2,
                          py: 1,
                          px: 1.25,
                          border: homeOutline,
                          bgcolor: 'background.paper',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          minWidth: 0,
                          '& .MuiButton-startIcon': { mr: 1 },
                          '& .MuiButton-endIcon': { ml: 0.5, flexShrink: 0 },
                          '&:hover': { bgcolor: alpha('#fff', 0.55), borderColor: SURFACE_BORDER },
                        }}
                        startIcon={
                          <Box
                            sx={{
                              width: 36,
                              height: 36,
                              borderRadius: 1,
                              flexShrink: 0,
                              bgcolor: hubLogoHue(row.displayName),
                              color: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800,
                              fontSize: '0.85rem',
                            }}
                          >
                            {glyph}
                          </Box>
                        }
                        endIcon={<ChevronRightIcon sx={{ fontSize: '1.1rem', color: 'text.secondary' }} />}
                      >
                        <Box
                          component="span"
                          sx={{
                            flex: 1,
                            minWidth: 0,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            lineHeight: 1.25,
                            textAlign: 'left',
                          }}
                        >
                          {row.displayName}
                        </Box>
                      </Button>
                    )
                  })}
                </Box>
              )}
            </Box>
          </SurfaceSection>
        ) : null}

        <SurfaceSection title="Services" titleSx={sectionTitleSx} action={viewMoreAction(href('services'))}>
          <Box sx={homeSectionTilesSx}>
            {SERVICES_HUB_TILES.map((s) => {
              const to = href(s.linkPath)
              return (
                <Box
                  key={s.slug}
                  sx={{
                    width: { xs: '100%', md: 132 },
                    minWidth: 0,
                    flexShrink: { md: 0 },
                    textAlign: 'center',
                  }}
                >
                  <Card
                    component={RouterLink}
                    to={to}
                    elevation={0}
                    sx={{
                      height: { xs: 108, md: 118 },
                      borderRadius: `${STORE_HOME_SURFACE_RADIUS_PX}px`,
                      background: SERVICES_CARD_GRADIENT,
                      border: homeOutline,
                      boxSizing: 'border-box',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textDecoration: 'none',
                      boxShadow: '0 10px 28px rgba(79, 70, 229, 0.35)',
                      width: 1,
                      transition: 'transform 0.15s, box-shadow 0.15s',
                      color: '#fff',
                      '& .MuiSvgIcon-root': { fontSize: { xs: '2.5rem', md: '3rem' } },
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: '0 14px 36px rgba(79, 70, 229, 0.42)',
                      },
                    }}
                  >
                    {hubNavIcon(s.iconKey)}
                  </Card>
                  <Typography sx={{ mt: 1, fontWeight: 700, fontSize: '0.875rem', color: 'text.secondary' }}>
                    {s.label}
                  </Typography>
                </Box>
              )
            })}
          </Box>
        </SurfaceSection>

      </Stack>
    </Stack>
  )
}
