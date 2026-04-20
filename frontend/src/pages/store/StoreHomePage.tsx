import type { MouseEvent, ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Badge,
  Box,
  Button,
  ButtonBase,
  Card,
  CircularProgress,
  IconButton,
  InputBase,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import SearchIcon from '@mui/icons-material/Search'
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import NoteAltOutlinedIcon from '@mui/icons-material/NoteAltOutlined'
import DirectionsCarOutlinedIcon from '@mui/icons-material/DirectionsCarOutlined'
import PhoneIphoneOutlinedIcon from '@mui/icons-material/PhoneIphoneOutlined'
import CheckroomOutlinedIcon from '@mui/icons-material/CheckroomOutlined'
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined'
import LocalGroceryStoreOutlinedIcon from '@mui/icons-material/LocalGroceryStoreOutlined'
import type { PopularStoreDto, StoreCategoryDto, StorePromotionDto } from '../../types/storefront'
import { apiUrl, readApiError } from '../../lib/apiOrigin'
import { getRecentVisits, MAX_RECENT_VISIT_ITEMS, recentVisitLink, type RecentVisitRecord } from '../../lib/recentVisits'
import { SurfaceSection } from '../../components/page/SurfaceSection'
import {
  CHROME_SHADOW_SOFT,
  HEADER_CHROME_GRADIENT,
  SURFACE_BORDER,
  SURFACE_SHADOW,
  SURFACE_SHADOW_HOVER,
} from '../../theme/branding'
import CardGiftcardOutlinedIcon from '@mui/icons-material/CardGiftcardOutlined'
import UmbrellaOutlinedIcon from '@mui/icons-material/UmbrellaOutlined'
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined'

type Brand = { id: string; abbr: string; bg: string; color?: string }

/** Shown when SQL is off, the popular-stores query errors, or there are no qualifying orders in the window. */
const STATIC_POPULAR_BRANDS: Brand[] = [
  { id: 'fresh', abbr: 'FM', bg: '#2563EB', color: '#fff' },
  { id: 'fuel', abbr: 'CF', bg: '#0D9488', color: '#fff' },
  { id: 'grove', abbr: 'GM', bg: '#37474F' },
  { id: 'mtc', abbr: 'MT', bg: '#0D47A1', color: '#E3F2FD' },
  { id: 'paratus', abbr: 'PR', bg: '#1565C0' },
]

function formatPopularDateRange(fromIso: string | null | undefined, toIso: string | null | undefined): string {
  if (!fromIso?.trim() || !toIso?.trim()) return ''
  try {
    const from = new Date(fromIso)
    const to = new Date(toIso)
    const df = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    return `${df.format(from)} – ${df.format(to)}`
  } catch {
    return ''
  }
}

/** Stock-style placement art when `image_url` is empty (Unsplash, free to use). */
const HERO_PLACEHOLDER_IMAGES: Record<string, string> = {
  welcome:
    'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1400&q=80',
  pickup:
    'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1400&q=80',
  secure:
    'https://images.unsplash.com/photo-1563013544-824ae1b704d3?auto=format&fit=crop&w=1400&q=80',
}

const DEFAULT_HERO_IMAGE =
  'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1400&q=80'

function resolveHeroImageUrl(slug: string | null | undefined, imageUrl: string | null | undefined): string {
  const trimmed = imageUrl?.trim()
  if (trimmed) return trimmed
  const key = (slug ?? '').toLowerCase()
  return HERO_PLACEHOLDER_IMAGES[key] ?? DEFAULT_HERO_IMAGE
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
  { slug: 'welcome', title: 'Deals near you', subtitle: 'Pay with PayToday in one tap.', linkPath: '/shop' },
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

function categoryIcon(slug: string | null | undefined): ReactNode {
  const s = (slug ?? '').toLowerCase()
  const sx = { fontSize: 36, color: 'primary.main' } as const
  if (s === 'electronics') return <PhoneIphoneOutlinedIcon sx={sx} />
  if (s === 'fashion') return <CheckroomOutlinedIcon sx={sx} />
  if (s === 'home') return <HomeOutlinedIcon sx={sx} />
  if (s === 'groceries') return <LocalGroceryStoreOutlinedIcon sx={sx} />
  return <HomeOutlinedIcon sx={sx} />
}

const services = [
  { key: 'classifieds', label: 'Classifieds', icon: <NoteAltOutlinedIcon sx={{ color: '#F87171' }} /> },
  { key: 'parking', label: 'Parking', icon: <DirectionsCarOutlinedIcon sx={{ color: '#93C5FD' }} /> },
  {
    key: 'vouchers',
    label: 'Vouchers',
    icon: <CardGiftcardOutlinedIcon sx={{ color: '#FCD34D' }} />,
  },
  {
    key: 'insurance',
    label: 'Insurance',
    icon: <UmbrellaOutlinedIcon sx={{ color: '#C4B5FD' }} />,
  },
  {
    key: 'store',
    label: 'Store',
    icon: <ShoppingCartOutlinedIcon sx={{ color: '#5B21D6' }} />,
  },
]

function PayTodayLogo({ to }: { to: string }) {
  return (
    <Typography
      component={RouterLink}
      to={to}
      sx={{
        fontWeight: 800,
        letterSpacing: 2,
        color: '#fff',
        textDecoration: 'none',
        fontSize: '0.95rem',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
      }}
    >
      PAY
      <Box
        component="span"
        sx={{
          border: '2px solid rgba(255,255,255,0.95)',
          px: 1,
          py: 0.25,
          borderRadius: 0.5,
          letterSpacing: 3,
        }}
      >
        TODAY
      </Box>
    </Typography>
  )
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

function RecentShortcutChip({ to, label }: { to: string; label: string }) {
  const abbr = twoLetterAbbr(label)
  return (
    <Box sx={{ flexShrink: 0, width: 76, textAlign: 'center' }}>
      <Box
        component={RouterLink}
        to={to}
        sx={{
          textDecoration: 'none',
          color: 'inherit',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0.75,
        }}
      >
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: 1,
            background: recentShortcutAccent(label),
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(15,23,42,0.12)',
            fontWeight: 900,
            fontSize: '1rem',
            lineHeight: 1,
            letterSpacing: 0.5,
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
  const stats = `${item.unitsSold} sold · ${item.orderCount} orders`
  return (
    <Box sx={{ flexShrink: 0, width: 76, textAlign: 'center' }}>
      <Box
        component={RouterLink}
        to={to}
        aria-label={`${label}, ${stats}`}
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
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.58rem', lineHeight: 1.2, fontWeight: 600 }}>
          {stats}
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
  const [recentVisits, setRecentVisits] = useState<RecentVisitRecord[]>(() => getRecentVisits())
  const [popularDays, setPopularDays] = useState<7 | 30 | 90>(30)
  const [popularItems, setPopularItems] = useState<PopularStoreDto[]>([])
  const [popularRangeFrom, setPopularRangeFrom] = useState<string | null>(null)
  const [popularRangeTo, setPopularRangeTo] = useState<string | null>(null)
  const [popularSource, setPopularSource] = useState<string | null>(null)
  const [popularLoading, setPopularLoading] = useState(true)
  const [popularError, setPopularError] = useState<string | null>(null)

  const welcomeTitle =
    memberGreeting === undefined
      ? 'Welcome'
      : memberGreeting
        ? `Welcome back, ${memberGreeting}`
        : 'Welcome to PayToday'
  const welcomeSubtitle: string | null =
    memberGreeting === undefined
      ? null
      : memberGreeting
        ? 'Good to see you again.'
        : 'Browse the shop, pay bills, and more in one place.'

  const heroSlides: HeroSlide[] = useMemo(() => {
    if (promotions.length > 0) {
      return promotions.map((p) => ({
        key: p.id,
        title: p.title,
        subtitle: p.subtitle ?? '',
        link: resolveStoreLink(p.linkPath, pathPrefix, shop),
        imageUrl: resolveHeroImageUrl(p.slug, p.imageUrl),
      }))
    }
    return fallbackHeroSlides.map((h) => ({
      key: `fb-${h.slug}`,
      title: h.title,
      subtitle: h.subtitle,
      link: resolveStoreLink(h.linkPath, pathPrefix, shop),
      imageUrl: resolveHeroImageUrl(h.slug, null),
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
    const syncRecent = () => setRecentVisits(getRecentVisits())
    syncRecent()
    window.addEventListener('pt-recent-visits-updated', syncRecent)
    window.addEventListener('storage', syncRecent)
    return () => {
      window.removeEventListener('pt-recent-visits-updated', syncRecent)
      window.removeEventListener('storage', syncRecent)
    }
  }, [])

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
      setPopularError(null)
      try {
        const res = await fetch(
          apiUrl(`/api/storefront/popular-stores?days=${popularDays}&limit=12`),
        )
        if (!res.ok) {
          const msg = await readApiError(res)
          if (!cancelled) {
            setPopularItems([])
            setPopularRangeFrom(null)
            setPopularRangeTo(null)
            setPopularSource('error')
            setPopularError(msg)
          }
          return
        }
        const data = (await res.json()) as {
          source?: string
          items?: PopularStoreDto[]
          rangeFromIso?: string | null
          rangeToIso?: string | null
        }
        if (cancelled) return
        setPopularItems(Array.isArray(data.items) ? data.items : [])
        setPopularRangeFrom(data.rangeFromIso ?? null)
        setPopularRangeTo(data.rangeToIso ?? null)
        setPopularSource(data.source ?? null)
      } catch (e) {
        if (!cancelled) {
          setPopularItems([])
          setPopularRangeFrom(null)
          setPopularRangeTo(null)
          setPopularSource('error')
          setPopularError(e instanceof Error ? e.message : 'Could not load popular stores')
        }
      } finally {
        if (!cancelled) setPopularLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [popularDays])

  /** Popular + categories + recent: horizontal strips; `minWidth: 0` so flex doesn’t swallow overflow on mobile. */
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

  /** Recent + Services: below `md`, 2-column grid; `md+` horizontal strip (scrollbar hidden). */
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
        borderRadius: 1,
        minWidth: 0,
        width: 1,
        ...(isMobile
          ? {
              bgcolor: 'rgba(255,255,255,0.22)',
              backdropFilter: 'blur(8px)',
            }
          : {
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'divider',
              boxShadow: SURFACE_SHADOW,
            }),
      }}
    >
      <SearchIcon sx={{ color: isMobile ? 'rgba(255,255,255,0.9)' : 'text.secondary' }} />
      <InputBase
        placeholder="Search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{
          flex: 1,
          minWidth: 0,
          color: isMobile ? '#fff' : 'text.primary',
          '& input::placeholder': {
            color: isMobile ? 'rgba(255,255,255,0.75)' : 'text.secondary',
            opacity: 1,
          },
        }}
      />
    </Paper>
  )

  return (
    <Stack spacing={0} sx={{ pb: 2, width: 1, minWidth: 0 }}>
      {isMobile ? (
        <Box
          sx={{
            background: HEADER_CHROME_GRADIENT,
            color: '#fff',
            borderRadius: { xs: '0 0 6px 6px', sm: '0 0 8px 8px' },
            pt: { xs: 1.75, sm: 2 },
            pb: { xs: 2.5, sm: 3 },
            px: { xs: 2, sm: 2.5 },
            mx: { xs: -2, sm: -3 },
            boxShadow: CHROME_SHADOW_SOFT,
          }}
        >
          <Stack spacing={{ xs: 1.75, sm: 2 }} sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, minWidth: 0 }}>
              <IconButton
                component={RouterLink}
                to={profilePath}
                sx={{ color: '#fff', border: '1px solid rgba(255,255,255,0.35)', flexShrink: 0 }}
                aria-label="Profile"
              >
                <PersonOutlineIcon />
              </IconButton>
              <Box sx={{ minWidth: 0, flex: 1, display: 'flex', justifyContent: 'center' }}>
                <PayTodayLogo to={pathPrefix || '/'} />
              </Box>
              <IconButton
                component={RouterLink}
                to={notificationsPath}
                sx={{ color: '#fff', flexShrink: 0 }}
                aria-label="Notifications"
              >
                <Badge color="error" variant="dot">
                  <NotificationsNoneIcon />
                </Badge>
              </IconButton>
            </Box>
            <Stack spacing={0.25} sx={{ minWidth: 0 }}>
              <Typography
                component="h1"
                sx={{
                  fontWeight: 800,
                  fontSize: { xs: 'clamp(1.1rem, 4.2vw, 1.35rem)', sm: '1.35rem' },
                  letterSpacing: -0.3,
                  lineHeight: 1.25,
                  wordBreak: 'break-word',
                }}
              >
                {welcomeTitle}
              </Typography>
              {welcomeSubtitle ? (
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.85)', lineHeight: 1.45 }}>
                  {welcomeSubtitle}
                </Typography>
              ) : null}
            </Stack>
            {searchForm}
          </Stack>
        </Box>
      ) : null}

      <Stack
        spacing={{ xs: 3, md: 4 }}
        sx={{
          pt: { xs: 3, md: 2 },
          width: 1,
          minWidth: 0,
        }}
      >
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
              borderRadius: 1,
              bgcolor: '#0f172a',
              boxShadow: '0 8px 32px rgba(15,23,42,0.12)',
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
                      '&:focus-visible': { boxShadow: (t) => `inset 0 0 0 3px ${t.palette.primary.main}` },
                    }}
                  >
                    <Box
                      aria-hidden
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        background:
                          'linear-gradient(to top, rgba(15,23,42,0.92) 0%, rgba(15,23,42,0.45) 42%, rgba(15,23,42,0.12) 100%)',
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
                  borderRadius: 0.5,
                  width: i === heroIndex ? 18 : 6,
                  height: 6,
                  minWidth: 6,
                  bgcolor: i === heroIndex ? 'primary.main' : 'action.disabledBackground',
                  cursor: 'pointer',
                  transition: 'width 0.2s, background-color 0.2s',
                  '&:hover': { opacity: 0.92 },
                  '&:focus-visible': { outline: (t) => `2px solid ${t.palette.primary.main}`, outlineOffset: 2 },
                }}
              />
            ))}
          </Box>
        </Stack>

        <SurfaceSection title="Popular">
          <Stack spacing={1.25}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              flexWrap="wrap"
              gap={1}
              sx={{ pr: { xs: 0, sm: 0.5 } }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, maxWidth: '100%' }}>
                {popularLoading
                  ? 'Loading top stores…'
                  : popularItems.length > 0 && popularSource === 'database'
                    ? `Top stores by units sold (${formatPopularDateRange(popularRangeFrom, popularRangeTo) || `last ${popularDays} days`})`
                    : popularSource === 'database' && popularItems.length === 0
                      ? `No paid orders in the last ${popularDays} days yet — sample stores below`
                      : popularError
                        ? 'Could not load rankings — sample stores below'
                        : 'Sample stores — connect SQL and complete orders to see live rankings'}
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={popularDays}
                onChange={(_e, v) => {
                  if (v === 7 || v === 30 || v === 90) setPopularDays(v)
                }}
                aria-label="Date range for popular stores"
              >
                <ToggleButton value={7} sx={{ px: 1.25, fontWeight: 700 }}>
                  7d
                </ToggleButton>
                <ToggleButton value={30} sx={{ px: 1.25, fontWeight: 700 }}>
                  30d
                </ToggleButton>
                <ToggleButton value={90} sx={{ px: 1.25, fontWeight: 700 }}>
                  90d
                </ToggleButton>
              </ToggleButtonGroup>
            </Stack>
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
        </SurfaceSection>

        {categories.length > 0 ? (
          <SurfaceSection title="Shop by category">
            <Box role="region" aria-label="Categories — swipe left or right on the tiles to scroll" sx={homeHorizontalStripSx}>
              {categories.filter((c) => Boolean(c?.slug?.trim())).map((c) => (
                <Box
                  key={c.slug}
                  sx={{
                    flexShrink: 0,
                    width: 108,
                    scrollSnapAlign: 'start',
                    textAlign: 'center',
                  }}
                >
                  <Card
                    component={RouterLink}
                    to={`${shop}?category=${encodeURIComponent(c.slug)}`}
                    elevation={0}
                    sx={{
                      borderRadius: 1,
                      border: 1,
                      borderColor: 'divider',
                      textDecoration: 'none',
                      height: 118,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 1,
                      width: 1,
                      boxSizing: 'border-box',
                      px: 0.5,
                      py: 1,
                      transition: 'transform 0.15s',
                      '&:hover': { transform: 'translateY(-2px)' },
                    }}
                  >
                    {categoryIcon(c.slug)}
                    <Typography
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        px: 0.25,
                        lineHeight: 1.2,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        wordBreak: 'break-word',
                        textAlign: 'center',
                      }}
                    >
                      {c.name}
                    </Typography>
                  </Card>
                </Box>
              ))}
            </Box>
          </SurfaceSection>
        ) : null}

        <SurfaceSection title="Recent">
          {recentVisits.length === 0 ? (
            <Stack spacing={1.25} alignItems="flex-start">
              <Typography variant="body2" color="text.secondary">
                Shortcuts appear here after you open categories and services.
              </Typography>
              <Button
                component={RouterLink}
                to={shop}
                size="small"
                variant="outlined"
                sx={{ fontWeight: 700, borderRadius: 1 }}
              >
                Browse store
              </Button>
            </Stack>
          ) : (
            <Box role="region" aria-label="Recent shortcuts — swipe left or right on the tiles to scroll" sx={homeHorizontalStripSx}>
              {recentVisits.slice(0, MAX_RECENT_VISIT_ITEMS).map((r) => (
                <Box
                  key={r.dedupeKey}
                  sx={{
                    flexShrink: 0,
                    width: 76,
                    scrollSnapAlign: 'start',
                    display: 'flex',
                    justifyContent: 'center',
                  }}
                >
                  <RecentShortcutChip to={recentVisitLink(r.relPath, pathPrefix)} label={r.label} />
                </Box>
              ))}
            </Box>
          )}
        </SurfaceSection>

        <SurfaceSection title="Services">
          <Box sx={homeSectionTilesSx}>
            {services.map((s) => {
              const to =
                s.key === 'classifieds'
                  ? href('classifieds')
                  : s.key === 'parking'
                    ? href('payments/parking')
                    : s.key === 'vouchers' || s.key === 'insurance'
                      ? href('services')
                      : s.key === 'store'
                        ? shop
                        : shop
              return (
              <Box
                key={s.key}
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
                    borderRadius: 1,
                    bgcolor: 'background.paper',
                    border: `1px solid ${SURFACE_BORDER}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textDecoration: 'none',
                    boxShadow: SURFACE_SHADOW,
                    width: 1,
                    boxSizing: 'border-box',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                    '&:hover': { transform: 'translateY(-2px)', boxShadow: SURFACE_SHADOW_HOVER },
                    '& .MuiSvgIcon-root': { fontSize: { xs: '2.5rem', md: '3rem' } },
                  }}
                >
                  {s.icon}
                </Card>
                <Typography sx={{ mt: 1, fontWeight: 700, fontSize: '0.875rem', color: 'text.primary' }}>{s.label}</Typography>
              </Box>
              )
            })}
          </Box>
        </SurfaceSection>

        <Typography variant="caption" color="text.secondary" textAlign="center" sx={{ display: 'block', pt: 1 }}>
          Recent and Popular open the store. Classifieds, parking, vouchers, and insurance link into those flows.
        </Typography>
      </Stack>
    </Stack>
  )
}
