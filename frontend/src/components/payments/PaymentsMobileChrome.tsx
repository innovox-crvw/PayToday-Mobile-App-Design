import { Link as RouterLink } from 'react-router-dom'
import { Badge, Box, IconButton, InputBase, Paper, Stack } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined'
import { CHROME_SHADOW_SOFT, HEADER_CHROME_GRADIENT } from '../../theme/branding'
import { AppBrandLogo } from '../brand/AppBrandLogo'

export function PaymentsMobileChrome({
  homePath,
  profilePath,
  cartPath,
  cartCount,
  notificationsPath,
  search,
  onSearchChange,
  onSearchSubmit,
}: {
  homePath: string
  profilePath: string
  cartPath: string
  cartCount: number
  notificationsPath: string
  search: string
  onSearchChange: (v: string) => void
  onSearchSubmit: () => void
}) {
  return (
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
            aria-label="My account"
          >
            <PersonOutlineIcon />
          </IconButton>
          <AppBrandLogo to={homePath} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <IconButton component={RouterLink} to={cartPath} sx={{ color: '#fff' }} aria-label="Cart">
              <Badge badgeContent={cartCount} color="warning">
                <ShoppingCartOutlinedIcon />
              </Badge>
            </IconButton>
            <IconButton component={RouterLink} to={notificationsPath} sx={{ color: '#fff' }} aria-label="Notifications">
              <Badge color="error" variant="dot">
                <NotificationsNoneIcon />
              </Badge>
            </IconButton>
          </Box>
        </Box>
        <Paper
          component="form"
          onSubmit={(e) => {
            e.preventDefault()
            onSearchSubmit()
          }}
          elevation={0}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1.25,
            borderRadius: 4,
            bgcolor: 'rgba(255,255,255,0.22)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <SearchIcon sx={{ color: 'rgba(255,255,255,0.9)' }} />
          <InputBase
            placeholder="Search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            sx={{
              flex: 1,
              color: '#fff',
              '& input::placeholder': { color: 'rgba(255,255,255,0.75)', opacity: 1 },
            }}
          />
        </Paper>
      </Stack>
    </Box>
  )
}
