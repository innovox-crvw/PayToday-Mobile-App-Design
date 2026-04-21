import { Link as RouterLink, useLocation } from 'react-router-dom'
import { Alert, Box, CircularProgress, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useHubNavigationTiles } from '../../hooks/useHubNavigationTiles'
import { PAYMENTS_HUB_TILES } from '../../data/hubNavigationStatic'
import { hubNavIcon } from '../../lib/hubNavIcons'
import type { HubNavigationTileDto } from '../../types/hubNavigation'
import { SHOP_V2 } from '../../theme/storeV2'

const PEOPLE_FIRST = new Set(['businesses', 'contacts'])

function resolveHref(pathPrefix: string, linkPath: string) {
  const rel = linkPath.replace(/^\//, '')
  if (!pathPrefix) return `/${rel}`
  return `${pathPrefix}/${rel}`.replace(/\/+/g, '/')
}

/** Flatten tiles: people & business first, then remaining (matches prior subgroup intent). */
function orderedHubTiles(tiles: HubNavigationTileDto[]): HubNavigationTileDto[] {
  const people: HubNavigationTileDto[] = []
  const rest: HubNavigationTileDto[] = []
  for (const t of tiles) {
    if (PEOPLE_FIRST.has(t.slug)) people.push(t)
    else rest.push(t)
  }
  return [...people, ...rest]
}

export function ShopUtilityHubRow() {
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const hubTiles = useHubNavigationTiles('payments')
  const raw = hubTiles.fromDatabase ? hubTiles.items : [...PAYMENTS_HUB_TILES]
  const tiles = orderedHubTiles(raw)

  return (
    <Box
      sx={{
        display: 'flex',
        overflowX: 'auto',
        gap: 2,
        py: 2,
        px: 1,
        mx: -0.5,
        borderRadius: SHOP_V2.radius,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
      }}
    >
      {hubTiles.loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', width: 1, py: 2 }}>
          <CircularProgress size={28} />
        </Box>
      ) : hubTiles.fromDatabase && raw.length === 0 ? (
        <Alert severity="info" sx={{ borderRadius: SHOP_V2.radius, width: 1 }}>
          No bill-pay shortcuts configured. Add <code>hub_navigation_tiles</code> with <code>hub_kind = &apos;payments&apos;</code>.
        </Alert>
      ) : (
        tiles.map((c) => (
          <Box
            key={c.slug}
            component={RouterLink}
            to={resolveHref(pathPrefix, c.linkPath)}
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
                  border: `1px solid ${alpha(SHOP_V2.accent, 0.22)}`,
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
        ))
      )}
    </Box>
  )
}
