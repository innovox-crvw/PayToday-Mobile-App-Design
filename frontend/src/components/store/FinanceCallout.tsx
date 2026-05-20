import { Alert, Box, Button, Stack, Typography } from '@mui/material'
import { formatMoney } from '../../lib/money'
import { FINANCING_MIN_PRICE_CENTS } from '../../lib/financingEligibility'
import { ACCESS_FINANCE_LOGO_SRC, FINANCE_LOGO_SX } from '../../lib/financeBranding'
import { SHOP_V2 } from '../../theme/storeV2'

const DEFAULT_FINANCING_APPLICATION_URL = 'https://nedaccess.today-ww.net/'

export function FinanceCallout(props: {
  applicationUrl?: string | null
  currency?: string
  title?: string
}) {
  const href = (props.applicationUrl ?? '').trim() || DEFAULT_FINANCING_APPLICATION_URL
  const minLabel = formatMoney(FINANCING_MIN_PRICE_CENTS, (props.currency ?? 'NAD').trim() || 'NAD')
  const title = props.title ?? 'Apply for finance'
  return (
    <Alert severity="info" icon={false} sx={{ borderRadius: SHOP_V2.radius, py: 1.25 }}>
      <Stack spacing={1.25} alignItems="flex-start">
        <Box component="img" src={ACCESS_FINANCE_LOGO_SRC} alt="ACCESS" sx={FINANCE_LOGO_SX} />
        <Typography variant="body2" sx={{ lineHeight: 1.45 }}>
          Financing may be available on this item from <strong>{minLabel}</strong> (current option price). Continue to
          ACCESS / NedAccess to start your application.
        </Typography>
        <Button
          component="a"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          variant="outlined"
          size="small"
          sx={{ fontWeight: 800 }}
        >
          {title}
        </Button>
      </Stack>
    </Alert>
  )
}
