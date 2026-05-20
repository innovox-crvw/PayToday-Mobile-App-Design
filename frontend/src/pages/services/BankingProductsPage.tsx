import type { ReactNode } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { Box, Paper, Stack, Typography } from '@mui/material'
import PolicyOutlinedIcon from '@mui/icons-material/PolicyOutlined'
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { SERVICES_HUB_TAB_LABELS } from '../../lib/servicesHubTabs'
import { ACCESS_FINANCE_LOGO_SRC, FINANCE_LOGO_SX } from '../../lib/financeBranding'

function ProductRow(props: {
  to: string
  title: string
  subtitle: string
  icon?: ReactNode
  logoSrc?: string
}) {
  const { to, title, subtitle, icon, logoSrc } = props
  return (
    <Paper
      component={RouterLink}
      to={to}
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 3,
        textDecoration: 'none',
        color: 'inherit',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
      }}
    >
      {logoSrc ? (
        <Box component="img" src={logoSrc} alt="" sx={{ ...FINANCE_LOGO_SX, height: 36 }} />
      ) : (
        <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography fontWeight={800}>{title}</Typography>
        <Typography variant="body2" color="text.secondary">
          {subtitle}
        </Typography>
      </Box>
      <ChevronRightIcon color="action" />
    </Paper>
  )
}

export function BankingProductsPage() {
  const { pathname } = useLocation()
  const prefix = pathname.startsWith('/embed') ? '/embed' : ''

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', px: 2, py: 3 }}>
      <Typography variant="h5" fontWeight={800} sx={{ mb: 0.5 }}>
        {SERVICES_HUB_TAB_LABELS.insurance}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Insurance and financing products from our banking partners.
      </Typography>
      <Stack spacing={1.5}>
        <ProductRow
          to={`${prefix}/services/insurance/nedlife`}
          title="Insurance"
          subtitle="NedLife and funeral cover applications"
          icon={<PolicyOutlinedIcon fontSize="large" />}
        />
        <ProductRow
          to={`${prefix}/services/finance`}
          title="Finance"
          subtitle="ACCESS — apply for financing on eligible purchases"
          logoSrc={ACCESS_FINANCE_LOGO_SRC}
        />
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: 'grey.50' }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <AccountBalanceOutlinedIcon color="primary" />
            <Typography variant="body2" color="text.secondary">
              Store purchases over N$5,000 in finance-eligible categories also show a finance option on the product page.
            </Typography>
          </Stack>
        </Paper>
      </Stack>
    </Box>
  )
}
