import { Alert, Typography } from '@mui/material'
import { SHOP_V2 } from '../../theme/storeV2'
import type { StoreHoursStatus } from '../../lib/storeHours'

export function StoreClosedBanner(props: { status: StoreHoursStatus }) {
  const { status } = props
  if (!status.configured || status.openNow) return null
  return (
    <Alert severity="warning" sx={{ borderRadius: SHOP_V2.radius }} role="status">
      <Typography variant="subtitle2" fontWeight={800} gutterBottom>
        Store is closed
      </Typography>
      <Typography variant="body2" sx={{ lineHeight: 1.45 }}>
        You can keep browsing. To place an order, choose <strong>Schedule order</strong> and pick a time when we are open.
      </Typography>
      {status.hoursSummary ? (
        <Typography variant="body2" sx={{ mt: 1, fontWeight: 600 }}>
          Hours: {status.hoursSummary}
        </Typography>
      ) : null}
      {status.nextOpenLabel ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Next open: {status.nextOpenLabel}
        </Typography>
      ) : null}
    </Alert>
  )
}
