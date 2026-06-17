import { Stack } from '@mui/material'
import { sellingHoursSchedulesDiffer, type StoreHoursStatus } from '../../lib/storeHours'
import type { SellingHoursRow } from '../../lib/windhoekTime'
import { SellingTimesPanel } from './SellingTimesPanel'

type Props = {
  storeHours: StoreHoursStatus
  liquorRows: SellingHoursRow[]
  /** Alcohol in cart on a liquor-gated merchant with liquor hours configured. */
  showLiquorContext: boolean
  /** Store is closed or otherwise requires a scheduled window. */
  showStoreContext: boolean
}

/** Store and/or liquor selling hours for checkout time selection. */
export function CheckoutSellingTimesSection(props: Props) {
  const { storeHours, liquorRows, showLiquorContext, showStoreContext } = props
  if (!showLiquorContext && !showStoreContext) return null

  const storeRows = storeHours.items
  const hasStoreRows = storeHours.configured && storeRows.length > 0
  const hasLiquorRows = liquorRows.length > 0

  if (!hasStoreRows && !hasLiquorRows) return null

  /** Liquor merchants: always show two tables when both schedules exist and alcohol is in the cart. */
  const splitLiquorAndStore =
    showLiquorContext &&
    hasLiquorRows &&
    hasStoreRows &&
    (storeHours.liquorConfigured || sellingHoursSchedulesDiffer(storeRows, liquorRows))

  if (splitLiquorAndStore) {
    return (
      <Stack spacing={1.5}>
        <SellingTimesPanel
          title="Alcohol selling times"
          rows={liquorRows}
          openNow={storeHours.liquorConfigured ? storeHours.liquorOpenNow : undefined}
        />
        <SellingTimesPanel
          title="Store opening times"
          rows={storeRows}
          openNow={storeHours.openNow}
        />
      </Stack>
    )
  }

  if (showLiquorContext && hasLiquorRows) {
    const sameAsStore = hasStoreRows && !sellingHoursSchedulesDiffer(storeRows, liquorRows)
    return (
      <SellingTimesPanel
        title={sameAsStore ? 'Store & alcohol selling times' : 'Alcohol selling times'}
        rows={liquorRows}
        openNow={storeHours.liquorConfigured ? storeHours.liquorOpenNow : undefined}
      />
    )
  }

  if (showStoreContext && hasStoreRows) {
    return (
      <SellingTimesPanel
        title="Store opening times"
        rows={storeRows}
        openNow={storeHours.openNow}
      />
    )
  }

  return null
}
