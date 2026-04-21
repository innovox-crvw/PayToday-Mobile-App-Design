import { Box, MenuItem, Stack, TextField, Typography } from '@mui/material'
import Grid from '@mui/material/Grid2'
import { DEMO_STORES } from '../../data/demoStores'
import { SHOP_V2 } from '../../theme/storeV2'

export type ShopSortKey = 'name' | 'price_asc' | 'price_desc'

const selectDisplaySx = {
  '& .MuiSelect-select': {
    py: 1.125,
    minHeight: 40,
    display: 'flex',
    alignItems: 'center',
    boxSizing: 'border-box',
  },
} as const

function storeDisplayLabel(slug: string): string {
  if (!slug) return 'All stores'
  return DEMO_STORES.find((s) => s.slug === slug)?.name ?? slug
}

function categoryDisplayLabel(slug: string, chips: { slug: string; label: string }[]): string {
  if (!slug) return 'All categories'
  return chips.find((c) => c.slug === slug)?.label ?? slug
}

export function ShopCatalogStickyBar(props: {
  sort: ShopSortKey
  onSortChange: (next: ShopSortKey) => void
  storeSlug: string
  onStoreFilter: (slug: string) => void
  categorySlug: string
  onCategory: (slug: string) => void
  categoryChips: { slug: string; label: string }[]
}) {
  const { sort, onSortChange, storeSlug, onStoreFilter, categorySlug, onCategory, categoryChips } = props

  const storeText = storeDisplayLabel(storeSlug)
  const categoryText = categoryDisplayLabel(categorySlug, categoryChips)

  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 3,
        py: 2,
        px: { xs: 1.5, sm: 2 },
        mx: { xs: -1, sm: -1.5 },
        mb: 1.5,
        borderRadius: SHOP_V2.radius,
        bgcolor: 'background.paper',
        border: `1px solid rgba(93, 45, 145, 0.12)`,
        boxShadow: '0 4px 18px rgba(15, 23, 42, 0.06)',
      }}
    >
      <Typography variant="subtitle2" fontWeight={800} sx={{ color: SHOP_V2.accent, mb: 2, letterSpacing: 0.01 }}>
        Filter catalogue
      </Typography>

      <Grid container spacing={2} columns={{ xs: 1, sm: 12 }}>
        <Grid size={{ xs: 1, sm: 4 }}>
          <Stack spacing={0.75}>
            <Typography
              component="label"
              htmlFor="shop-filter-store"
              variant="body2"
              fontWeight={700}
              color="text.secondary"
              sx={{ lineHeight: 1.2 }}
            >
              Store
            </Typography>
            <TextField
              id="shop-filter-store"
              select
              value={storeSlug || ''}
              onChange={(e) => onStoreFilter(e.target.value)}
              size="small"
              fullWidth
              hiddenLabel
              inputProps={{ 'aria-label': 'Store filter' }}
              SelectProps={{
                displayEmpty: true,
                renderValue: () => (
                  <Typography variant="body2" component="span" noWrap title={storeText} sx={{ width: 1, pr: 0.5 }}>
                    {storeText}
                  </Typography>
                ),
              }}
              sx={{
                ...selectDisplaySx,
                '& .MuiOutlinedInput-root': { borderRadius: SHOP_V2.radius, bgcolor: 'action.hover' },
              }}
            >
              <MenuItem value="">All stores</MenuItem>
              {DEMO_STORES.map((s) => (
                <MenuItem key={s.slug} value={s.slug}>
                  {s.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </Grid>

        <Grid size={{ xs: 1, sm: 5 }}>
          <Stack spacing={0.75}>
            <Typography
              component="label"
              htmlFor="shop-filter-category"
              variant="body2"
              fontWeight={700}
              color="text.secondary"
              sx={{ lineHeight: 1.2 }}
            >
              Category
            </Typography>
            <TextField
              id="shop-filter-category"
              select
              value={categorySlug || ''}
              onChange={(e) => onCategory(e.target.value)}
              size="small"
              fullWidth
              hiddenLabel
              inputProps={{ 'aria-label': 'Category filter' }}
              SelectProps={{
                displayEmpty: true,
                renderValue: () => (
                  <Typography variant="body2" component="span" noWrap title={categoryText} sx={{ width: 1, pr: 0.5 }}>
                    {categoryText}
                  </Typography>
                ),
              }}
              sx={{
                ...selectDisplaySx,
                '& .MuiOutlinedInput-root': { borderRadius: SHOP_V2.radius, bgcolor: 'action.hover' },
              }}
            >
              <MenuItem value="">All categories</MenuItem>
              {categoryChips.map((c) => (
                <MenuItem key={c.slug} value={c.slug} title={c.label}>
                  {c.label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </Grid>

        <Grid size={{ xs: 1, sm: 3 }}>
          <Stack spacing={0.75}>
            <Typography
              component="label"
              htmlFor="shop-filter-sort"
              variant="body2"
              fontWeight={700}
              color="text.secondary"
              sx={{ lineHeight: 1.2 }}
            >
              Sort
            </Typography>
            <TextField
              id="shop-filter-sort"
              select
              value={sort}
              onChange={(e) => onSortChange(e.target.value as ShopSortKey)}
              size="small"
              fullWidth
              hiddenLabel
              inputProps={{ 'aria-label': 'Sort order' }}
              SelectProps={{
                renderValue: (value: unknown) => (
                  <Typography variant="body2" component="span" noWrap sx={{ width: 1, pr: 0.5 }}>
                    {value === 'name'
                      ? 'Name'
                      : value === 'price_asc'
                        ? 'Price: low to high'
                        : 'Price: high to low'}
                  </Typography>
                ),
              }}
              sx={{
                ...selectDisplaySx,
                '& .MuiOutlinedInput-root': { borderRadius: SHOP_V2.radius, bgcolor: 'action.hover' },
              }}
            >
              <MenuItem value="name">Name</MenuItem>
              <MenuItem value="price_asc">Price: low to high</MenuItem>
              <MenuItem value="price_desc">Price: high to low</MenuItem>
            </TextField>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  )
}
