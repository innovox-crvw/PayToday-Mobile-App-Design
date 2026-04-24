import { useMemo } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Card, CardActionArea, CardContent, Chip, Stack, Typography } from '@mui/material'
import type { ProductDto } from '../../types/catalogue'
import { totalListedStock, variantDiscountPercent, variantIsPurchasable } from '../../lib/productStock'
import { ProductImage } from './ProductImage'
import { SHOP_V2 } from '../../theme/storeV2'

const listingDiscountChipSx = {
  height: 22,
  fontSize: '0.62rem',
  fontWeight: 800,
  bgcolor: SHOP_V2.listingDiscountChip.bg,
  color: SHOP_V2.listingDiscountChip.color,
  '& .MuiChip-label': { px: 0.75 },
} as const

export function ShopProductCard(props: {
  product: ProductDto
  pathPrefix: string
  priceLabel: string
  demoStore: { name: string; slug: string } | null
}) {
  const { product: p, pathPrefix, priceLabel, demoStore } = props
  const stockTotal = totalListedStock(p)
  const anyBuy = p.variants.some((v) => variantIsPurchasable(v))
  const lowStock = anyBuy && stockTotal > 0 && stockTotal <= 5
  const firstVariant = p.variants.find((v) => variantIsPurchasable(v))
  const discountPct = firstVariant ? variantDiscountPercent(firstVariant) : null
  const merchantLine = (demoStore?.name ?? p.brandName ?? p.categoryName ?? '').trim() || null

  const heroUrl = useMemo(() => {
    const imgs = [...(p.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.url.localeCompare(b.url))
    const first = imgs.map((i) => i.url.trim()).find(Boolean)
    if (first) return first
    const fallback = p.imageUrl?.trim()
    return fallback || null
  }, [p.images, p.imageUrl, p.id])

  const badgeRow = discountPct != null || !anyBuy || lowStock

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        overflow: 'hidden',
        borderRadius: '14px',
        bgcolor: 'background.paper',
        border: '1px solid rgba(15, 23, 42, 0.1)',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
        },
      }}
    >
      <CardActionArea
        component={RouterLink}
        to={`${pathPrefix}/shop/${p.slug}`}
        sx={{ height: '100%', alignItems: 'stretch', display: 'block' }}
      >
        <Box sx={{ position: 'relative', width: 1, display: 'block' }}>
          <ProductImage imageUrl={heroUrl} alt={p.name} ratio="1" imageLayout="hero" frame="default" />
        </Box>
        <CardContent
          sx={{
            pt: 1.5,
            pb: 1.5,
            px: 1.5,
            '&:last-child': { pb: 1.5 },
          }}
        >
          {badgeRow ? (
            <Stack direction="row" flexWrap="wrap" gap={0.75} useFlexGap sx={{ mb: 1, alignItems: 'center' }}>
              {discountPct != null ? (
                <Chip size="small" label={`${discountPct}% off`} sx={listingDiscountChipSx} />
              ) : null}
              {!anyBuy ? (
                <Chip size="small" label="Out of stock" color="error" variant="outlined" sx={{ height: 22, fontSize: '0.62rem', fontWeight: 700 }} />
              ) : lowStock ? (
                <Chip size="small" label={`${stockTotal} left`} color="warning" variant="outlined" sx={{ height: 22, fontSize: '0.62rem', fontWeight: 700 }} />
              ) : null}
            </Stack>
          ) : null}
          <Typography
            fontWeight={800}
            sx={{
              fontSize: { xs: '0.875rem', sm: '0.82rem' },
              lineHeight: 1.35,
              minHeight: { xs: 38, sm: 34 },
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              color: 'text.primary',
              mb: merchantLine ? 0.35 : 0.5,
            }}
          >
            {p.name}
          </Typography>
          {merchantLine ? (
            <Typography
              variant="body2"
              noWrap
              title={merchantLine}
              sx={{
                fontSize: '0.8125rem',
                color: 'text.secondary',
                lineHeight: 1.35,
                mb: 0.75,
              }}
            >
              {merchantLine}
            </Typography>
          ) : null}
          <Typography
            variant="body2"
            component="div"
            title={priceLabel}
            sx={{
              fontSize: { xs: '0.95rem', sm: '0.9rem' },
              fontWeight: 800,
              color: 'text.primary',
              lineHeight: 1.3,
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
            }}
          >
            {priceLabel}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}
