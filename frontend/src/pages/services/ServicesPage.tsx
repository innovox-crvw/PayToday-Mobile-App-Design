import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import { Box, CircularProgress, Stack, Typography, useMediaQuery, useTheme } from '@mui/material'
import Grid from '@mui/material/Grid2'
import type { ReactNode } from 'react'
import { PaymentsMobileChrome } from '../../components/payments/PaymentsMobileChrome'
import { SERVICES_HUB_TILES } from '../../data/hubNavigationStatic'
import { readResponseJson } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { useHubNavigationTiles } from '../../hooks/useHubNavigationTiles'
import { hubNavIcon } from '../../lib/hubNavIcons'
import type { HubNavigationTileDto } from '../../types/hubNavigation'
import { partitionServicesHubTiles, SERVICES_HUB_EMPTY_HINTS, SERVICES_HUB_TAB_LABELS } from '../../lib/servicesHubTabs'

function resolveHref(pathPrefix: string, linkPath: string) {
  const rel = linkPath.replace(/^\//, '')
  if (!pathPrefix) return `/${rel}`
  return `${pathPrefix}/${rel}`.replace(/\/+/g, '/')
}

function ServiceTile({ to, label, icon, caption }: { to: string; label: string; icon: ReactNode; caption?: string | null }) {
  return (
    <Box
      component={RouterLink}
      to={to}
      sx={{
        textDecoration: 'none',
        color: 'inherit',
        textAlign: 'center',
      }}
    >
      <Box
        sx={{
          aspectRatio: '1',
          maxWidth: 72,
          mx: 'auto',
          borderRadius: 3,
          bgcolor: '#2563EB',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 6px 20px rgba(37, 99, 235, 0.32)',
          transition: 'transform 0.16s ease-out, box-shadow 0.16s ease-out',
          '&:hover': { transform: 'scale(1.04)', boxShadow: '0 10px 26px rgba(37, 99, 235, 0.38)' },
        }}
      >
        {icon}
      </Box>
      <Typography sx={{ mt: 1, fontSize: '0.7rem', fontWeight: 600, lineHeight: 1.2, color: 'text.primary' }}>{label}</Typography>
      {caption?.trim() ? (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 0.35, px: 0.25, display: 'block', fontSize: '0.58rem', lineHeight: 1.25, fontWeight: 500 }}
        >
          {caption.trim()}
        </Typography>
      ) : null}
    </Box>
  )
}

function ServiceTilesGrid(props: {
  tiles: readonly HubNavigationTileDto[]
  emptyHint: string
  pathPrefix: string
}) {
  const { tiles, emptyHint, pathPrefix } = props
  const prefix = pathPrefix || ''

  if (tiles.length === 0) {
    return (
      <Typography color="text.secondary" textAlign="center" sx={{ py: 2, px: 1 }}>
        {emptyHint}
      </Typography>
    )
  }

  return (
    <Grid container spacing={2} columns={4}>
      {tiles.map((t) => (
        <Grid size={{ xs: 1, sm: 1 }} key={t.slug}>
          <ServiceTile
            to={resolveHref(prefix, t.linkPath)}
            label={t.label}
            icon={hubNavIcon(t.iconKey)}
            caption={t.paymentMethodsCaption}
          />
        </Grid>
      ))}
    </Grid>
  )
}

/** Prepaid services hub: essential slugs plus former “more” tiles (parking, vouchers, etc.) in one grid. */
export function ServicesPage() {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const homePath = pathPrefix || '/'
  const profilePath = `${pathPrefix}/profile`
  const notificationsPath = `${pathPrefix}/notifications`
  const cartPath = `${pathPrefix}/cart`
  const shopPath = `${pathPrefix}/shop`

  const [search, setSearch] = useState('')
  const [cartCount, setCartCount] = useState(0)
  const hubTiles = useHubNavigationTiles('services')
  const serviceTiles = hubTiles.fromDatabase ? hubTiles.items : SERVICES_HUB_TILES

  const partition = useMemo(() => partitionServicesHubTiles(serviceTiles), [serviceTiles])
  const sectionTiles = useMemo(() => [...partition.essentials, ...partition.more], [partition])
  const emptyHint =
    partition.essentials.length === 0 && partition.more.length === 0
      ? `${SERVICES_HUB_EMPTY_HINTS.essentials} ${SERVICES_HUB_EMPTY_HINTS.more}`.trim()
      : SERVICES_HUB_EMPTY_HINTS.essentials
  const sectionTitle = SERVICES_HUB_TAB_LABELS.essentials

  useEffect(() => {
    let cancelled = false
    async function loadCart() {
      try {
        const res = await fetch(apiUrl('/api/cart'), { credentials: 'include' })
        if (!res.ok) return
        const data = await readResponseJson<{ items?: { quantity: number }[] }>(res)
        const n = data.items?.reduce((s, i) => s + i.quantity, 0) ?? 0
        if (!cancelled) setCartCount(n)
      } catch {
        /* ignore */
      }
    }
    void loadCart()
    const onUpd = () => void loadCart()
    window.addEventListener('pt-cart-updated', onUpd)
    return () => {
      cancelled = true
      window.removeEventListener('pt-cart-updated', onUpd)
    }
  }, [])

  function submitSearch() {
    const q = search.trim()
    if (q) navigate(`${shopPath}?q=${encodeURIComponent(q)}`)
    else navigate(shopPath)
  }

  const prefix = pathPrefix || ''

  const sheet = (
    <Box
      sx={{
        bgcolor: '#fff',
        borderRadius: isMobile ? '24px 24px 0 0' : 3,
        mt: isMobile ? -2 : 0,
        pt: 3,
        pb: 4,
        px: { xs: 2, sm: 3 },
        boxShadow: isMobile ? '0 -4px 24px rgba(15,23,42,0.06)' : '0 4px 24px rgba(15,23,42,0.06)',
      }}
    >
      <Typography variant="h6" textAlign="center" fontWeight={800} sx={{ mb: 2, letterSpacing: -0.3 }}>
        {sectionTitle}
      </Typography>
      {hubTiles.loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={32} />
        </Box>
      ) : hubTiles.fromDatabase && serviceTiles.length === 0 ? (
        <Typography color="text.secondary" textAlign="center">
          No service tiles in the database yet. Add rows to{' '}
          <Typography component="span" variant="body2" sx={{ fontFamily: 'monospace' }}>
            hub_navigation_tiles
          </Typography>{' '}
          (hub_kind = &apos;services&apos;).
        </Typography>
      ) : (
        <ServiceTilesGrid tiles={sectionTiles} emptyHint={emptyHint} pathPrefix={prefix} />
      )}
    </Box>
  )

  if (isMobile) {
    return (
      <Stack spacing={0}>
        <PaymentsMobileChrome
          homePath={homePath}
          profilePath={profilePath}
          cartPath={cartPath}
          cartCount={cartCount}
          notificationsPath={notificationsPath}
          search={search}
          onSearchChange={setSearch}
          onSearchSubmit={submitSearch}
        />
        {sheet}
      </Stack>
    )
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h4" fontWeight={800}>
        {sectionTitle}
      </Typography>
      {sheet}
    </Stack>
  )
}
