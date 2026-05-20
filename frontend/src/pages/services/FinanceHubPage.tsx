import { useEffect, useState } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { Alert, Box, Button, Stack, Typography } from '@mui/material'
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew'
import { apiUrl } from '../../lib/apiOrigin'
import { readResponseJson } from '../../api/client'
import { ACCESS_FINANCE_LOGO_SRC, FINANCE_LOGO_SX } from '../../lib/financeBranding'
import { FINANCING_MIN_PRICE_CENTS } from '../../lib/financingEligibility'
import { formatMoney } from '../../lib/money'
import { servicesInsuranceHref } from '../../lib/servicesHubTabs'
import type { StorefrontConfig } from '../../types/storefront'

const DEFAULT_URL = 'https://nedaccess.today-ww.net/'

export function FinanceHubPage() {
  const { pathname } = useLocation()
  const prefix = pathname.startsWith('/embed') ? '/embed' : ''
  const backHref = servicesInsuranceHref(prefix)
  const [url, setUrl] = useState(DEFAULT_URL)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(apiUrl('/api/storefront/config'), { credentials: 'include' })
        if (!res.ok) return
        const data = await readResponseJson<StorefrontConfig>(res)
        const u = (data.nedbankFinanceUrl ?? '').trim()
        if (u) setUrl(u)
      } catch {
        /* ignore */
      }
    })()
  }, [])

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', px: 2, py: 3 }}>
      <Button component={RouterLink} to={backHref} startIcon={<ArrowBackIosNewIcon />} size="small" sx={{ mb: 2, fontWeight: 700 }}>
        Banking products
      </Button>
      <Box component="img" src={ACCESS_FINANCE_LOGO_SRC} alt="ACCESS" sx={{ ...FINANCE_LOGO_SX, height: 40, mb: 2 }} />
      <Typography variant="h5" fontWeight={800} sx={{ mb: 1 }}>
        Finance
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Apply for financing through ACCESS / NedAccess. Eligible store items from{' '}
        {formatMoney(FINANCING_MIN_PRICE_CENTS, 'NAD')} in finance-enabled categories show the same option on the product
        page.
      </Typography>
      <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
        You will continue on our partner&apos;s secure site to complete your application.
      </Alert>
      <Stack direction="row" spacing={1}>
        <Button component="a" href={url} target="_blank" rel="noopener noreferrer" variant="contained" sx={{ fontWeight: 800 }}>
          Apply for finance
        </Button>
        <Button component={RouterLink} to={`${prefix}/shop`} variant="outlined" sx={{ fontWeight: 700 }}>
          Browse store
        </Button>
      </Stack>
    </Box>
  )
}
