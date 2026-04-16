import type { MouseEvent, ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Badge,
  Box,
  Button,
  ButtonBase,
  Card,
  IconButton,
  InputBase,
  Paper,
  Stack,
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
import type { StoreCategoryDto, StorePromotionDto } from '../../types/storefront'
import { apiUrl } from '../../lib/apiOrigin'
import { getRecentVisits, recentVisitLink, type RecentVisitRecord } from '../../lib/recentVisits'
import { SurfaceSection } from '../../components/page/SurfaceSection'
import {
  CHROME_SHADOW_SOFT,
  HEADER_CHROME_GRADIENT,
  SURFACE_BORDER,
  SURFACE_SHADOW,
  SURFACE_SHADOW_HOVER,
  STORE_HERO_BANNER_GRADIENT,
} from '../../theme/branding'
import CardGiftcardOutlinedIcon from '@mui/icons-material/CardGiftcardOutlined'
import UmbrellaOutlinedIcon from '@mui/icons-material/UmbrellaOutlined'
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined'

type Brand = { id: string; abbr: string; bg: string; color?: string }

const popularBrands: Brand[] = [
  { id: 'fresh', abbr: 'FM', bg: '#2563EB', color: '#fff' },
  { id: 'fuel', abbr: 'CF', bg: '#0D9488', color: '#fff' },
  { id: 'grove', abbr: 'GM', bg: '#37474F' },
  { id: 'mtc', abbr: 'MT', bg: '#0D47A1', color: '#E3F2FD' },
  { id: 'paratus', abbr: 'PR', bg: '#1565C0' },
]

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
  if (s === 'electronics') return <PhoneIphoneOutlinedIcon sx={{ fontSize: 36, color: 'primary.main' }} />
  if (s === 'fashion') return <CheckroomOutlinedIcon sx={{ fontSize: 36, color: 'primary.main' }} />
  if (s === 'home') return <HomeOutlinedIcon sx={{ fontSize: 36, color: 'primary.main' }} />
  if (s === 'groceries') return <LocalGroceryStoreOutlinedIcon sx={{ fontSize: 36, color: 'primary.main' }} />
  return <HomeOutlinedIcon sx={{ fontSize: 36, color: 'primary.main' }} />
}

const services = [
  { key: 'classifieds', label: 'Classifieds', icon: <NoteAltOutlinedIcon sx={{ fontSize: 48, color: '#F87171' }} /> },
  { key: 'parking', label: 'Parking', icon: <DirectionsCarOutlinedIcon sx={{ fontSize: 48, color: '#93C5FD' }} /> },
  {
    key: 'vouchers',
    label: 'Vouchers',
    icon: <CardGiftcardOutlinedIcon sx={{ fontSize: 48, color: '#FCD34D' }} />,
  },
  {
    key: 'insurance',
    label: 'Insurance',
    icon: <UmbrellaOutlinedIcon sx={{ fontSize: 48, color: '#C4B5FD' }} />,
  },
  {
    key: 'store',
    label: 'Store',
    icon: <ShoppingCartOutlinedIcon sx={{ fontSize: 48, color: '#fff' }} />,
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
          borderRadius: 1,
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
            borderRadius: '50%',
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

function BrandChip({ b, to }: { b: Brand; to: string }) {
  return (
    <Box
      component={RouterLink}
      to={to}
      sx={{
        flexShrink: 0,
        width: 64,
        height: 64,
        borderRadius: '50%',
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

  const scrollRowSx = useMemo(
    () => ({
      display: 'flex',
      gap: 1.5,
      overflowX: 'auto' as const,
      pb: 0.5,
      mx: { xs: -0.5, sm: 0 },
      px: { xs: 0.5, sm: 0 },
      scrollbarWidth: 'none' as const,
      '&::-webkit-scrollbar': { display: 'none' },
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
        borderRadius: 4,
        ...(isMobile
          ? {
              bgcolor: 'rgba(255,255,255,0.22)',
              backdropFilter: 'blur(8px)',
            }
          : {
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'divider',
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
    <Stack spacing={0} sx={{ pb: 2 }}>
      {isMobile ? (
        <Box
          sx={{
            background: HEADER_CHROME_GRADIENT,
            color: '#fff',
            borderRadius: '0 0 24px 24px',
            pt: 2,
            pb: 3,
            px: 2,
            mx: -2,
            boxShadow: CHROME_SHADOW_SOFT,
          }}
        >
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <IconButton
                component={RouterLink}
                to={profilePath}
                sx={{ color: '#fff', border: '1px solid rgba(255,255,255,0.35)' }}
                aria-label="Profile"
              >
                <PersonOutlineIcon />
              </IconButton>
              <PayTodayLogo to={pathPrefix || '/'} />
              <IconButton component={RouterLink} to={notificationsPath} sx={{ color: '#fff' }} aria-label="Notifications">
                <Badge color="error" variant="dot">
                  <NotificationsNoneIcon />
                </Badge>
              </IconButton>
            </Box>
            <Stack spacing={0.25}>
              <Typography component="h1" sx={{ fontWeight: 800, fontSize: '1.35rem', letterSpacing: -0.3, lineHeight: 1.25 }}>
                {welcomeTitle}
              </Typography>
              {welcomeSubtitle ? (
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.85)' }}>
                  {welcomeSubtitle}
                </Typography>
              ) : null}
            </Stack>
            {searchForm}
          </Stack>
        </Box>
      ) : null}

      <Stack spacing={{ xs: 3, md: 4 }} sx={{ pt: { xs: 3, md: 0 }, maxWidth: { md: 1120 }, mx: { md: 'auto' }, width: 1 }}>
        {!isMobile ? (
          <Box
            sx={{
              background: STORE_HERO_BANNER_GRADIENT,
              borderRadius: 4,
              px: { md: 3 },
              py: { md: 3 },
              color: '#fff',
              boxShadow: '0 12px 40px rgba(37, 99, 235, 0.25)',
            }}
          >
            <Typography variant="overline" sx={{ opacity: 0.92, letterSpacing: 2, fontWeight: 700 }}>
              PayToday store
            </Typography>
            <Typography variant="h4" component="h1" fontWeight={800} letterSpacing={-0.5} sx={{ mt: 0.5 }}>
              Shop products — pay with PayToday
            </Typography>
            <Typography variant="body1" sx={{ mt: 1, opacity: 0.95, maxWidth: 560 }}>
              Browse DB-backed catalog items, then checkout on the secure PayToday gateway.
            </Typography>
          </Box>
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
              borderRadius: 4,
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
                      minHeight: { xs: 200, sm: 240 },
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
                  borderRadius: 999,
                  width: i === heroIndex ? 22 : 8,
                  height: 8,
                  bgcolor: i === heroIndex ? 'primary.main' : 'action.disabledBackground',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, width 0.2s, background-color 0.2s',
                  '&:hover': { transform: 'scale(1.12)' },
                  '&:focus-visible': { outline: (t) => `2px solid ${t.palette.primary.main}`, outlineOffset: 2 },
                }}
              />
            ))}
          </Box>
        </Stack>

        {categories.length > 0 ? (
          <SurfaceSection title="Shop by category">
            <Box sx={scrollRowSx}>
              {categories.filter((c) => Boolean(c?.slug?.trim())).map((c) => (
                <Box key={c.slug} sx={{ flexShrink: 0, width: 108, textAlign: 'center' }}>
                  <Card
                    component={RouterLink}
                    to={`${shop}?category=${encodeURIComponent(c.slug)}`}
                    elevation={0}
                    sx={{
                      borderRadius: 3,
                      border: 1,
                      borderColor: 'divider',
                      textDecoration: 'none',
                      py: 2,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 1,
                      transition: 'transform 0.15s',
                      '&:hover': { transform: 'translateY(-2px)' },
                    }}
                  >
                    {categoryIcon(c.slug)}
                    <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', px: 0.5, lineHeight: 1.2 }}>{c.name}</Typography>
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
                sx={{ fontWeight: 700, borderRadius: 999 }}
              >
                Browse store
              </Button>
            </Stack>
          ) : (
            <Box sx={scrollRowSx}>
              {recentVisits.map((r) => (
                <RecentShortcutChip
                  key={r.dedupeKey}
                  to={recentVisitLink(r.relPath, pathPrefix)}
                  label={r.label}
                />
              ))}
            </Box>
          )}
        </SurfaceSection>

        <SurfaceSection title="Services">
          <Box sx={scrollRowSx}>
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
              <Box key={s.key} sx={{ flexShrink: 0, width: 132, textAlign: 'center' }}>
                <Card
                  component={RouterLink}
                  to={to}
                  elevation={0}
                  sx={{
                    height: 118,
                    borderRadius: 3,
                    bgcolor: 'background.paper',
                    border: `1px solid ${SURFACE_BORDER}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textDecoration: 'none',
                    boxShadow: SURFACE_SHADOW,
                    transition: 'transform 0.15s, box-shadow 0.15s',
                    '&:hover': { transform: 'translateY(-2px)', boxShadow: SURFACE_SHADOW_HOVER },
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

        <SurfaceSection title="Popular">
          <Box sx={scrollRowSx}>
            {popularBrands.map((b) => (
              <BrandChip key={`pop-${b.id}`} b={b} to={shop} />
            ))}
          </Box>
        </SurfaceSection>

        <Typography variant="caption" color="text.secondary" textAlign="center" sx={{ display: 'block', pt: 1 }}>
          Recent and Popular open the store. Classifieds, parking, vouchers, and insurance link into those flows.
        </Typography>
      </Stack>
    </Stack>
  )
}
