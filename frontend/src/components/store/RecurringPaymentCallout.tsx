import { useMemo, useState } from 'react'
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined'
import { Alert, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { formatMoney } from '../../lib/money'
import { splitTotalIntoInstalmentAmounts } from '../../lib/paymentPlanPreview'
import { SHOP_V2 } from '../../theme/storeV2'
import { APP_WALLET_DISPLAY_NAME } from '../../theme/branding'

export type RecurringTermMonths = 3 | 6 | 12

const TERMS: RecurringTermMonths[] = [3, 6, 12]

type Props = {
  currency?: string
  /** Product-page estimate (subtotal only). */
  subtotalCents?: number | null
  /** Checkout / order total incl. shipping & tax — use for instalment schedule. */
  totalCents?: number | null
  term?: RecurringTermMonths
  onTermChange?: (term: RecurringTermMonths) => void
  /** Checkout payment-plan step — place order first, pay later. */
  embeddedInCheckout?: boolean
}

export function RecurringPaymentCallout(props: Props) {
  const [internalTerm, setInternalTerm] = useState<RecurringTermMonths>(6)
  const currency = (props.currency ?? 'NAD').trim() || 'NAD'
  const basisCents = props.totalCents ?? props.subtotalCents ?? null
  const term = props.term ?? internalTerm
  const setTerm = (v: RecurringTermMonths) => {
    if (props.term === undefined) setInternalTerm(v)
    props.onTermChange?.(v)
  }

  const schedule = useMemo(() => {
    if (basisCents == null || basisCents <= 0 || !Number.isFinite(basisCents)) return null
    const amounts = splitTotalIntoInstalmentAmounts(basisCents, term)
    const allSame = amounts.every((a) => a === amounts[0])
    return { amounts, allSame, total: basisCents }
  }, [basisCents, term])

  return (
    <Alert
      severity="info"
      icon={<PaymentsOutlinedIcon fontSize="small" />}
      sx={{ borderRadius: SHOP_V2.radius, py: 1.25, alignItems: 'flex-start' }}
    >
      <Stack spacing={1.25} sx={{ width: 1 }}>
        <Typography variant="body2" sx={{ lineHeight: 1.45 }}>
          {props.embeddedInCheckout ? (
            <>
              <strong>{term}-month payment plan</strong> — place your order now with <strong>no charge today</strong>. Pay each
              instalment later from {APP_WALLET_DISPLAY_NAME} on your order page.
            </>
          ) : (
            <>
              <strong>Pay over time</strong> — choose 3, 6, or 12 monthly instalments on eligible items.
            </>
          )}
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={term}
          onChange={(_e, v: RecurringTermMonths | null) => {
            if (v != null) setTerm(v)
          }}
          aria-label="Payment plan term"
          sx={{ alignSelf: 'flex-start' }}
        >
          {TERMS.map((m) => (
            <ToggleButton key={m} value={m} sx={{ fontWeight: 700, px: 1.75 }}>
              {m} mo
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {schedule ? (
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45, fontWeight: 700 }}>
              Plan total {formatMoney(schedule.total, currency)} · {term} instalments
            </Typography>
            {schedule.allSame ? (
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45 }}>
                {term} × {formatMoney(schedule.amounts[0]!, currency)} per month
                {props.embeddedInCheckout ? ' (first payment after you place the order)' : ''}.
              </Typography>
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45 }}>
                Instalments:{' '}
                {schedule.amounts.map((a, i) => (
                  <span key={i}>
                    {i > 0 ? ', ' : ''}
                    #{i + 1} {formatMoney(a, currency)}
                  </span>
                ))}
              </Typography>
            )}
            {props.embeddedInCheckout ? (
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45 }}>
                Due today: {formatMoney(0, currency)}
              </Typography>
            ) : null}
          </Stack>
        ) : null}
        {!props.embeddedInCheckout ? (
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>
            Select <strong>Payment plan</strong> at checkout to place the order first, then pay instalments from your wallet.
          </Typography>
        ) : null}
      </Stack>
    </Alert>
  )
}
