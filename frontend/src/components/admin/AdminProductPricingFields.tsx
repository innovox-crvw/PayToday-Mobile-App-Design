import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import type { AdminDiscountMode, AdminPricingFields } from '../../lib/adminProductPricing'
import { previewAdminPricing, resolveAdminPricingToCents } from '../../lib/adminProductPricing'
import { formatMoney } from '../../lib/money'

type Props = {
  value: AdminPricingFields
  onChange: (next: AdminPricingFields) => void
  currency?: string
  /** Tighter layout inside variant cards. */
  compact?: boolean
}

const DISCOUNT_MODE_LABELS: Record<AdminDiscountMode, string> = {
  none: 'No discount',
  amount: 'Fixed amount (N$ off)',
  percent: 'Percentage (%)',
}

export function AdminProductPricingFields({ value, onChange, currency = 'NAD', compact }: Props) {
  const preview = previewAdminPricing(value, currency)
  const resolved = resolveAdminPricingToCents(value)
  const saleLabel =
    resolved.ok && value.listPriceNad.trim()
      ? formatMoney(resolved.priceCents, currency)
      : '—'

  return (
    <Stack spacing={compact ? 1.25 : 1.5}>
      <TextField
        size={compact ? 'small' : 'medium'}
        label="Regular price (N$)"
        value={value.listPriceNad}
        onChange={(e) => onChange({ ...value, listPriceNad: e.target.value })}
        fullWidth
        required
        helperText="Full price shown as “was” when a discount is applied."
        placeholder="e.g. 249.00"
        inputProps={{ inputMode: 'decimal' }}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <FormControl size={compact ? 'small' : 'medium'} fullWidth>
          <InputLabel id="admin-discount-mode-label">Discount</InputLabel>
          <Select
            labelId="admin-discount-mode-label"
            label="Discount"
            value={value.discountMode}
            onChange={(e) =>
              onChange({
                ...value,
                discountMode: e.target.value as AdminDiscountMode,
                discountValue: e.target.value === 'none' ? '' : value.discountValue,
              })
            }
          >
            {(Object.keys(DISCOUNT_MODE_LABELS) as AdminDiscountMode[]).map((m) => (
              <MenuItem key={m} value={m}>
                {DISCOUNT_MODE_LABELS[m]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          size={compact ? 'small' : 'medium'}
          label={value.discountMode === 'percent' ? 'Discount (%)' : 'Discount (N$)'}
          value={value.discountValue}
          onChange={(e) => onChange({ ...value, discountValue: e.target.value })}
          disabled={value.discountMode === 'none'}
          fullWidth
          placeholder={value.discountMode === 'percent' ? 'e.g. 15' : 'e.g. 50.00'}
          inputProps={{ inputMode: 'decimal' }}
          helperText={
            value.discountMode === 'none'
              ? 'Sale price equals regular price.'
              : value.discountMode === 'percent'
                ? '1–99% off the regular price.'
                : 'Amount taken off the regular price.'
          }
        />
      </Stack>
      <Stack spacing={0.5}>
        <Typography variant="caption" color="text.secondary" fontWeight={700}>
          Storefront / checkout price
        </Typography>
        <Typography variant="body2" fontWeight={800}>
          {saleLabel}
        </Typography>
        {preview ? (
          <Typography variant="caption" color="success.main" fontWeight={700} sx={{ lineHeight: 1.5 }}>
            {preview.pct}% off — was {formatMoney(preview.compareAtPriceCents, preview.currency)} →{' '}
            {formatMoney(preview.priceCents, preview.currency)}
          </Typography>
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45 }}>
            Customers see the sale price at checkout. Add a discount to show the regular price crossed out on the shop.
          </Typography>
        )}
      </Stack>
    </Stack>
  )
}
