import { Fragment, useMemo, useState } from 'react'
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom'
import {
  Avatar,
  Box,
  Button,
  CircularProgress,
  Divider,
  Link,
  List,
  ListItemButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import { ProfilePageShell } from './ProfilePageShell'
import {
  ACCOUNT_NAV_ITEMS,
  isAccountNavActive,
  resolveAccountNavHref,
  type AccountNavItem,
} from '../../pages/profile/accountNav'
import { useStorePathPrefix } from '../../pages/profile/profilePaths'
import { useAuthMe, SESSION_CHANGED_EVENT } from '../../hooks/useAuthMe'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { APP_DISPLAY_NAME } from '../../theme/branding'
import { SHOP_V2 } from '../../theme/storeV2'

function AccountSidebarNav({
  items,
  pathname,
  prefix,
  signedIn,
}: {
  items: AccountNavItem[]
  pathname: string
  prefix: string
  signedIn: boolean
}) {
  const groups = useMemo(() => {
    const primary = items.filter((i) => i.section === 'primary')
    const more = items.filter((i) => i.section === 'more')
    return [
      { label: null as string | null, items: primary },
      { label: 'More', items: more },
    ].filter((g) => g.items.length > 0)
  }, [items])

  return (
    <List disablePadding component="nav" aria-label="Account sections">
      {groups.map((group, gi) => (
        <Fragment key={group.label ?? 'primary'}>
          {gi > 0 ? <Divider sx={{ my: 1.5 }} /> : null}
          {group.label ? (
            <Typography
              variant="overline"
              sx={{ display: 'block', px: 0.5, mb: 0.75, fontWeight: 800, color: 'text.secondary', fontSize: '0.68rem' }}
            >
              {group.label}
            </Typography>
          ) : null}
          {group.items.map((item) => {
            const active = signedIn && isAccountNavActive(pathname, item, prefix)
            const href = resolveAccountNavHref(prefix, item)
            return (
              <ListItemButton
                key={item.id}
                component={RouterLink}
                to={href}
                selected={active}
                sx={{
                  py: 1,
                  px: 0.5,
                  borderRadius: 1,
                  mb: 0.25,
                  fontWeight: active ? 700 : 500,
                  color: item.danger ? (active ? 'error.main' : 'error.dark') : active ? SHOP_V2.accent : 'text.secondary',
                  '&.Mui-selected': {
                    bgcolor: 'transparent',
                    color: item.danger ? 'error.main' : SHOP_V2.accent,
                  },
                  '&.Mui-selected:hover': { bgcolor: 'rgba(93, 45, 145, 0.06)' },
                }}
              >
                <Typography variant="body2" fontWeight="inherit" sx={{ lineHeight: 1.45 }}>
                  {item.label}
                </Typography>
              </ListItemButton>
            )
          })}
        </Fragment>
      ))}
    </List>
  )
}

export function AccountLayout() {
  const prefix = useStorePathPrefix()
  const { pathname } = useLocation()
  const { user, loading } = useAuthMe()
  const [loggingOut, setLoggingOut] = useState(false)

  const signInPath = `${prefix}/onboarding/login?returnTo=${encodeURIComponent(`${prefix}/profile/personal`)}`
  const visibleNav = ACCOUNT_NAV_ITEMS.filter((item) => !item.authOnly || user)

  const initial =
    user?.fullName?.trim()?.charAt(0)?.toUpperCase() ?? user?.email?.charAt(0)?.toUpperCase() ?? ''
  const displayName = user?.fullName?.trim() || user?.email || 'Guest'

  async function logout() {
    setLoggingOut(true)
    try {
      await fetchCsrfToken()
      await apiFetch('/api/auth/logout', { method: 'POST' })
      window.dispatchEvent(new Event('pt-cart-updated'))
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
    } catch {
      /* ignore */
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <ProfilePageShell maxWidth={1120} innerSx={{ maxWidth: 1120 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        justifyContent="space-between"
        spacing={1.5}
        sx={{ mb: { xs: 2.5, md: 3 } }}
      >
        <Typography variant="h5" component="h1" fontWeight={800} sx={{ letterSpacing: -0.35 }}>
          {APP_DISPLAY_NAME} Account
        </Typography>
        {user ? (
          <Button
            variant="contained"
            color="secondary"
            disabled={loggingOut}
            onClick={() => void logout()}
            sx={{
              alignSelf: { xs: 'stretch', sm: 'flex-start' },
              fontWeight: 800,
              borderRadius: 2,
              px: 2.5,
              py: 1,
              boxShadow: '0 8px 24px rgba(138, 43, 226, 0.28)',
            }}
          >
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </Button>
        ) : (
          <Button
            component={RouterLink}
            to={signInPath}
            variant="contained"
            color="secondary"
            sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' }, fontWeight: 800, borderRadius: 2, px: 2.5 }}
          >
            Sign in
          </Button>
        )}
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(220px, 260px) minmax(0, 1fr)' },
          gap: { xs: 2.5, md: 4 },
          alignItems: 'start',
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, sm: 2.5 },
            borderRadius: 2.5,
            border: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Stack alignItems="center" spacing={1.25} sx={{ mb: 2.5, textAlign: 'center' }}>
            <Avatar
              sx={{
                width: 88,
                height: 88,
                bgcolor: user ? 'secondary.main' : 'action.hover',
                color: user ? '#fff' : 'text.secondary',
                fontSize: '2rem',
                fontWeight: 800,
              }}
            >
              {user ? initial || '?' : <PersonOutlineIcon sx={{ fontSize: 44 }} />}
            </Avatar>
            <Box sx={{ minWidth: 0, width: 1 }}>
              <Typography variant="subtitle1" fontWeight={800} noWrap title={displayName}>
                {displayName}
              </Typography>
              {user?.email ? (
                <Typography variant="body2" color="text.secondary" noWrap title={user.email}>
                  {user.email}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Sign in for saved details and wallet checkout.
                </Typography>
              )}
            </Box>
          </Stack>

          <AccountSidebarNav items={visibleNav} pathname={pathname} prefix={prefix} signedIn={Boolean(user)} />

          {!user && !loading ? (
            <Box sx={{ mt: 2 }}>
              <Link component={RouterLink} to={signInPath} underline="hover" fontWeight={700} sx={{ color: SHOP_V2.accent }}>
                Sign in to your account
              </Link>
            </Box>
          ) : null}
        </Paper>

        <Box sx={{ minWidth: 0 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress size={36} />
            </Box>
          ) : (
            <Outlet />
          )}
        </Box>
      </Box>
    </ProfilePageShell>
  )
}
