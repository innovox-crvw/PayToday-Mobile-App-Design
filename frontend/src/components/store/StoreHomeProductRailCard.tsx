import { useMemo } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Card, CardActionArea, Chip, Stack, Typography } from '@mui/material'
import type { ProductDto } from '../../types/catalogue'
import { totalListedStock, variantDiscountPercent, variantIsPurchasable } from '../../lib/productStock'
import { ProductImage } from './ProductImage'
import { SHOP_V2 } from '../../theme/storeV2'

const listingDiscountChipSx = {
  height: 20,
  fontSize: '0.58rem',
  fontWeight: 800,
  bgcolor: SHOP_V2.listingDiscountChip.bg,
  color: SHOP_V2.listingDiscountChip.color,
  '& .MuiChip-label': { px: 0.65 },
} as const

function primaryHeroUrl(p: ProductDto): string | null {
  const imgs = [...(p.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.url.localeCompare(b.url))
  const first = imgs.map((i) => i.url.trim()).find(Boolean)
  if (first) return first
  return p.imageUrl?.trim() || null
}

export function StoreHomeProductRailCard(props: { product: ProductDto; pathPrefix: string; priceLabel: string }) {
  const { product: p, pathPrefix, priceLabel } = props
  const heroUrl = useMemo(() => primaryHeroUrl(p), [p])
  const firstVariant = p.variants.find((v) => variantIsPurchasable(v)) ?? p.variants[0]
  const discountPct = firstVariant ? variantDiscountPercent(firstVariant) : null
  const stockTotal = totalListedStock(p)
  const anyBuy = p.variants.some((v) => variantIsPurchasable(v))
  const lowStock = anyBuy && stockTotal > 0 && stockTotal <= 5
  const merchantLine = (p.brandName ?? p.categoryName ?? '').trim() || null
  const badgeRow = discountPct != null || !anyBuy || lowStock

  return (
    <Card
      variant="outlined"
      sx={{
        width: 152,
        flexShrink: 0,
        borderRadius: '14px',
        border: '1px solid rgba(15, 23, 42, 0.1)',
        bgcolor: 'background.paper',
        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.06)',
        overflow: 'hidden',
      }}
    >
      <CardActionArea
        component={RouterLink}
        to={`${pathPrefix}/shop/${p.slug}`}
        sx={{
          display: 'block',
          textAlign: 'left',
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <Box sx={{ position: 'relative', width: 1 }}>
          <ProductImage imageUrl={heroUrl} alt={p.name} ratio="1" imageLayout="hero" frame="default" />
        </Box>
        <Box sx={{ px: 1.25, pt: 1.25, pb: 1.25 }}>
          {badgeRow ? (
            <Stack direction="row" flexWrap="wrap" gap={0.5} useFlexGap sx={{ mb: 0.75, alignItems: 'center' }}>
              {discountPct != null ? (
                <Chip size="small" label={`${discountPct}% off`} sx={listingDiscountChipSx} />
              ) : null}
              {!anyBuy ? (
                <Chip
                  size="small"
                  label="Out of stock"
                  color="error"
                  variant="outlined"
                  sx={{ height: 20, fontSize: '0.55rem', fontWeight: 700 }}
                />
              ) : lowStock ? (
                <Chip
                  size="small"
                  label={`${stockTotal} left`}
                  color="warning"
                  variant="outlined"
                  sx={{ height: 20, fontSize: '0.55rem', fontWeight: 700 }}
                />
              ) : null}
            </Stack>
          ) : null}
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: '0.72rem',
              lineHeight: 1.35,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              minHeight: '2.7em',
              color: 'text.primary',
              mb: merchantLine ? 0.25 : 0.4,
            }}
          >
            {p.name}
          </Typography>
          {merchantLine ? (
            <Typography
              noWrap
              title={merchantLine}
              sx={{
                fontSize: '0.65rem',
                color: 'text.secondary',
                lineHeight: 1.3,
                mb: 0.4,
              }}
            >
              {merchantLine}
            </Typography>
          ) : null}
          <Typography
            component="div"
            sx={{
              fontWeight: 800,
              fontSize: '0.8rem',
              color: 'text.primary',
              lineHeight: 1.25,
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
            }}
          >
            {priceLabel}
          </Typography>
        </Box>
      </CardActionArea>
    </Card>
  )
}
