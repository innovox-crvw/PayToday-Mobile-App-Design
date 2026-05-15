import { Alert, Button, Stack, Typography } from '@mui/material'
import { formatMoney } from '../../lib/money'
import { FINANCING_MIN_PRICE_CENTS } from '../../lib/financingEligibility'
import { SHOP_V2 } from '../../theme/storeV2'

const DEFAULT_FINANCING_APPLICATION_URL = 'https://nedaccess.today-ww.net/'

export function NedbankFinanceCallout(props: {
  /** NedAccess (or other) URL where customers complete financing — opens in a new tab. */
  applicationUrl?: string | null
  /** Variant currency for the minimum line (defaults NAD). */
  currency?: string
}) {
  const href = (props.applicationUrl ?? '').trim() || DEFAULT_FINANCING_APPLICATION_URL
  const minLabel = formatMoney(FINANCING_MIN_PRICE_CENTS, (props.currency ?? 'NAD').trim() || 'NAD')
  return (
    <Alert severity="info" icon={false} sx={{ borderRadius: SHOP_V2.radius, py: 1 }}>
      <Stack spacing={1.25} alignItems="flex-start">
        <Typography variant="body2" sx={{ lineHeight: 1.45 }}>
          Financing may be available on this item from <strong>{minLabel}</strong> (current option price). Continue to NedAccess
          to start your application.
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
          Apply for finance
        </Button>
      </Stack>
    </Alert>
  )
}
