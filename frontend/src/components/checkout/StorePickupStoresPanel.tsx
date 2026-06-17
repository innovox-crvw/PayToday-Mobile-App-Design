import { useState } from 'react'
import { Box, Collapse, IconButton, Stack, Typography } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined'
import type { StorePickupStoreDto } from '../../types/storefront'

type PanelVariant = 'default' | 'minimal'

function itemCount(lines: StorePickupStoreDto['lines']): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0)
}

/** Short one-line summary of cart lines at this store (no SKUs). */
function itemsSummaryLine(lines: StorePickupStoreDto['lines']): string {
  const count = itemCount(lines)
  const names = lines.map((l) => l.productName)
  if (count === 0) return ''
  if (names.length === 1) return `${count}× ${names[0]}`
  if (names.length === 2) return `${count} items · ${names[0]}, ${names[1]}`
  return `${count} items · ${names[0]}, ${names[1]} +${names.length - 2} more`
}

function StorePickupLinesList({ store }: { store: StorePickupStoreDto }) {
  if (!store.lines.length) return null
  return (
    <Stack component="ul" sx={{ m: 0, mt: 0.75, pl: 2.25 }} spacing={0.35}>
      {store.lines.map((line) => (
        <Typography component="li" variant="body2" key={`${store.merchantId}-${line.sku}`} sx={{ fontSize: '0.8125rem' }}>
          {line.quantity}× {line.productName}
          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
            ({line.sku})
          </Typography>
        </Typography>
      ))}
    </Stack>
  )
}

function MinimalStorePickupRow({ store }: { store: StorePickupStoreDto }) {
  const [open, setOpen] = useState(false)
  const hasDetails = store.lines.length > 0

  return (
    <Box
      sx={{
        borderRadius: 1.5,
        border: 1,
        borderColor: open ? 'primary.main' : 'divider',
        bgcolor: 'action.hover',
        overflow: 'hidden',
      }}
    >
      <Stack
        direction="row"
        spacing={0.5}
        alignItems="flex-start"
        onClick={() => hasDetails && setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (!hasDetails) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((v) => !v)
          }
        }}
        role={hasDetails ? 'button' : undefined}
        tabIndex={hasDetails ? 0 : undefined}
        aria-expanded={hasDetails ? open : undefined}
        sx={{
          py: 0.75,
          px: 1,
          cursor: hasDetails ? 'pointer' : 'default',
          '&:hover': hasDetails ? { bgcolor: 'action.selected' } : undefined,
        }}
      >
        <StorefrontOutlinedIcon color="primary" sx={{ fontSize: 18, flexShrink: 0, mt: 0.1 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={700} noWrap title={store.storeName}>
            {store.storeName}
          </Typography>
          {!open ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', lineHeight: 1.35 }}
              noWrap
              title={store.addressSummary}
            >
              {store.addressSummary}
            </Typography>
          ) : null}
          {hasDetails && !open ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 0.15, lineHeight: 1.35 }}
              noWrap
            >
              {itemsSummaryLine(store.lines)}
            </Typography>
          ) : null}
        </Box>
        {hasDetails ? (
          <IconButton
            size="small"
            aria-label={open ? 'Hide items' : 'Show items'}
            onClick={(e) => {
              e.stopPropagation()
              setOpen((v) => !v)
            }}
            sx={{
              mt: -0.25,
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s ease',
            }}
          >
            <ExpandMoreIcon fontSize="small" />
          </IconButton>
        ) : null}
      </Stack>
      <Collapse in={open} timeout="auto">
        <Box sx={{ px: 1, pb: 1, pt: 0, pl: 3.75 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
            {store.addressSummary}
          </Typography>
          <StorePickupLinesList store={store} />
        </Box>
      </Collapse>
    </Box>
  )
}

export function StorePickupStoresPanel(props: {
  stores: StorePickupStoreDto[]
  /** @deprecated Use variant="minimal" */
  compact?: boolean
  variant?: PanelVariant
}) {
  const { stores } = props
  const variant: PanelVariant = props.variant ?? (props.compact ? 'minimal' : 'default')

  if (!stores.length) {
    return (
      <Typography variant={variant === 'minimal' ? 'caption' : 'body2'} color="text.secondary">
        Add items to your cart to see pickup stores.
      </Typography>
    )
  }

  if (variant === 'minimal') {
    return (
      <Stack spacing={0.75} sx={{ width: 1, minWidth: 0 }}>
        {stores.length > 1 ? (
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
            Collect from {stores.length} stores · tap a store for details
          </Typography>
        ) : stores[0]?.lines.length ? (
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
            Tap for pickup address and items
          </Typography>
        ) : null}
        {stores.map((store) => (
          <MinimalStorePickupRow key={store.merchantId} store={store} />
        ))}
      </Stack>
    )
  }

  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        Collect each group of items from the store listed below. If your order spans multiple merchants, you will need to
        visit more than one location.
      </Typography>
      {stores.map((store) => (
        <Box
          key={store.merchantId}
          sx={{
            p: 2,
            borderRadius: 2,
            border: 1,
            borderColor: 'divider',
            bgcolor: 'action.hover',
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <StorefrontOutlinedIcon color="primary" sx={{ mt: 0.25, flexShrink: 0 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" fontWeight={800}>
                {store.storeName}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
                {store.addressSummary}
              </Typography>
              <StorePickupLinesList store={store} />
            </Box>
          </Stack>
        </Box>
      ))}
    </Stack>
  )
}
