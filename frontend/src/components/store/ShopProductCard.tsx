import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Card, CardActionArea, CardContent, Chip, IconButton, Stack, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import type { ProductDto } from '../../types/catalogue'
import { totalListedStock, variantDiscountPercent, variantIsPurchasable } from '../../lib/productStock'
import { ProductImage } from './ProductImage'
import { SHOP_V2 } from '../../theme/storeV2'

const stockChipSx = {
  position: 'absolute' as const,
  top: 8,
  right: 8,
  height: 22,
  fontSize: '0.62rem',
  fontWeight: 800,
  '& .MuiChip-label': { px: 0.75 },
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/u).filter(Boolean)
  if (p.length >= 2) return `${p[0]!.charAt(0)}${p[1]!.charAt(0)}`.toUpperCase()
  return (p[0] ?? '?').slice(0, 2).toUpperCase()
}

export function ShopProductCard(props: {
  product: ProductDto
  pathPrefix: string
  priceLabel: string
  demoStore: { name: string; slug: string } | null
  onQuickAdd: (variantId: string) => Promise<void>
}) {
  const { product: p, pathPrefix, priceLabel, demoStore, onQuickAdd } = props
  const [adding, setAdding] = useState(false)
  const stockTotal = totalListedStock(p)
  const anyBuy = p.variants.some((v) => variantIsPurchasable(v))
  const lowStock = anyBuy && stockTotal > 0 && stockTotal <= 5
  const firstVariant = p.variants.find((v) => variantIsPurchasable(v))
  const discountPct = firstVariant ? variantDiscountPercent(firstVariant) : null
  const merchantName = demoStore?.name ?? p.brandName ?? null
  const merchantInitials = initials(merchantName ?? p.name)

  const stockChip =
    !anyBuy ? (
      <Chip size="small" label="Out of stock" color="error" variant="filled" sx={stockChipSx} />
    ) : lowStock ? (
      <Chip size="small" label={`${stockTotal} left`} color="warning" variant="filled" sx={stockChipSx} />
    ) : (
      <Chip
        size="small"
        label={stockTotal > 0 ? `${stockTotal} in stock` : 'In stock'}
        variant="filled"
        sx={{ ...stockChipSx, bgcolor: SHOP_V2.success, color: '#fff' }}
      />
    )

  async function handleAdd(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!firstVariant || adding) return
    setAdding(true)
    try {
      await onQuickAdd(firstVariant.id)
    } finally {
      setAdding(false)
    }
  }

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        overflow: 'hidden',
        borderRadius: SHOP_V2.radius,
        borderColor: 'divider',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: '0 12px 32px rgba(15, 23, 42, 0.1)',
        },
      }}
    >
      <CardActionArea
        component={RouterLink}
        to={`${pathPrefix}/shop/${p.slug}`}
        sx={{ height: '100%', alignItems: 'stretch', display: 'block' }}
      >
        <Box sx={{ position: 'relative', width: 1, display: 'block' }}>
          <ProductImage imageUrl={p.imageUrl} alt={p.name} ratio="1" imageLayout="hero" frame="default" />
          {discountPct != null ? (
            <Chip
              size="small"
              label={`${discountPct}% off`}
              sx={{
                position: 'absolute',
                left: 8,
                top: 8,
                height: 22,
                fontSize: '0.62rem',
                fontWeight: 800,
                bgcolor: SHOP_V2.success,
                color: '#fff',
                '& .MuiChip-label': { px: 0.75 },
              }}
            />
          ) : null}
          {merchantName ? (
            <Box
              sx={{
                position: 'absolute',
                left: 8,
                bottom: 8,
                width: 28,
                height: 28,
                borderRadius: '50%',
                bgcolor: 'background.paper',
                border: `1px solid ${SHOP_V2.accent}`,
                color: SHOP_V2.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.62rem',
                fontWeight: 800,
                boxShadow: 1,
              }}
              title={merchantName}
            >
              {merchantInitials.slice(0, 2)}
            </Box>
          ) : null}
          {stockChip}
        </Box>
        <CardContent sx={{ pt: 1.25, pb: 1.25, px: 1.25, '&:last-child': { pb: 1.25 } }}>
          <Typography
            fontWeight={800}
            sx={{
              fontSize: '0.78rem',
              lineHeight: 1.25,
              minHeight: 32,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              mb: 0.75,
            }}
          >
            {p.name}
          </Typography>
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ minHeight: 40 }}>
            <Typography
              variant="body2"
              component="span"
              title={priceLabel}
              sx={{
                fontSize: '0.84rem',
                fontWeight: 800,
                color: SHOP_V2.accent,
                flex: 1,
                minWidth: 0,
                lineHeight: 1.2,
                pr: 0.5,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {priceLabel}
            </Typography>
            {firstVariant ? (
              <IconButton
                aria-label="Add to cart"
                size="small"
                onClick={(e) => void handleAdd(e)}
                disabled={adding}
                sx={{
                  flexShrink: 0,
                  alignSelf: 'flex-end',
                  bgcolor: SHOP_V2.accent,
                  color: '#fff',
                  width: 38,
                  height: 38,
                  boxShadow: '0 4px 14px rgba(93, 45, 145, 0.32)',
                  '&:hover': { bgcolor: SHOP_V2.accent, opacity: 0.92 },
                }}
              >
                <AddIcon sx={{ fontSize: 22 }} />
              </IconButton>
            ) : null}
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}
