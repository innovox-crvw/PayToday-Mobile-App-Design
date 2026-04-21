import { useEffect, useMemo, useState } from 'react'
import type { InventoryPolicy } from '../../types/catalogue'
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import type { ProductDto } from '../../types/catalogue'
import { AdminProductGalleryEditor } from '../../components/admin/AdminProductGalleryEditor'
import { ProductImageUploadBox } from '../../components/admin/ProductImageUploadBox'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { formatMoney } from '../../lib/money'
import SearchIcon from '@mui/icons-material/Search'

type CategoryOpt = { id: string; slug: string; name: string }

function optionsToLines(opts: { name: string; value: string }[] | undefined): string {
  return (opts ?? []).map((o) => `${o.name}: ${o.value}`).join('\n')
}

function adminDiscountPreview(priceCentsStr: string, compareCentsStr: string, currency: string) {
  const p = Number(priceCentsStr)
  const c = compareCentsStr.trim() ? Number(compareCentsStr.trim()) : NaN
  if (!Number.isFinite(p) || !Number.isFinite(c) || !Number.isInteger(c) || c < 0 || c <= p) return null
  const pct = Math.round(((c - p) / c) * 100)
  if (!(pct > 0)) return null
  return { pct, list: c, sale: p, currency }
}

function parseOptionsLines(s: string): { name: string; value: string }[] {
  return s
    .split('\n')
    .map((line) => {
      const m = line.trim().match(/^([^:=]+)[:=]\s*(.+)$/)
      return m ? { name: m[1].trim(), value: m[2].trim() } : null
    })
    .filter((x): x is { name: string; value: string } => Boolean(x))
}

export function AdminProductsPage() {
  const [items, setItems] = useState<ProductDto[]>([])
  const [categories, setCategories] = useState<CategoryOpt[]>([])
  const [error, setError] = useState<string | null>(null)
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sku, setSku] = useState('')
  const [priceCents, setPriceCents] = useState('19900')
  const [initialStock, setInitialStock] = useState('10')
  const [imageUrl, setImageUrl] = useState('')
  const [compareAtCreate, setCompareAtCreate] = useState('')
  const [inventoryPolicyCreate, setInventoryPolicyCreate] = useState<InventoryPolicy>('track')
  const [variantOptionsCreate, setVariantOptionsCreate] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [editProduct, setEditProduct] = useState<
    Record<string, { name: string; slug: string; description: string; isActive: boolean; categoryId: string }>
  >({})
  const [editVariant, setEditVariant] = useState<
    Record<
      string,
      {
        sku: string
        variantName: string
        priceCents: string
        currency: string
        compareAtPriceCents: string
        inventoryPolicy: InventoryPolicy
        optionsText: string
      }
    >
  >({})
  const [imageAdd, setImageAdd] = useState<Record<string, string>>({})
  const [imageVariantId, setImageVariantId] = useState<Record<string, string>>({})
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [tableSearch, setTableSearch] = useState('')
  const [tablePage, setTablePage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(25)

  const createDiscountPreview = useMemo(
    () => adminDiscountPreview(priceCents, compareAtCreate, 'NAD'),
    [priceCents, compareAtCreate],
  )

  async function load() {
    setError(null)
    try {
      const [res, catRes] = await Promise.all([
        fetch(apiUrl('/api/admin/products'), { credentials: 'include' }),
        fetch(apiUrl('/api/categories'), { credentials: 'include' }),
      ])
      if (res.status === 401 || res.status === 403) {
        setError('Sign in under My account (/profile) as a user with admin or ops role (see your database).')
        return
      }
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as { items: ProductDto[] }
      const list = data.items ?? []
      setItems(list)
      const nextEp: typeof editProduct = {}
      const nextEv: typeof editVariant = {}
      for (const p of list) {
        nextEp[p.id] = {
          name: p.name,
          slug: p.slug,
          description: p.description,
          isActive: p.isActive !== false,
          categoryId: p.categoryId || '',
        }
        for (const v of p.variants) {
          nextEv[v.id] = {
            sku: v.sku,
            variantName: v.name,
            priceCents: String(v.priceCents),
            currency: v.currency,
            compareAtPriceCents: v.compareAtPriceCents != null ? String(v.compareAtPriceCents) : '',
            inventoryPolicy: v.inventoryPolicy ?? 'track',
            optionsText: optionsToLines(v.options),
          }
        }
      }
      setEditProduct(nextEp)
      setEditVariant(nextEv)
      if (catRes.ok) {
        const cj = (await catRes.json()) as { items?: CategoryOpt[] }
        setCategories(cj.items ?? [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    if (editingProductId && !items.some((x) => x.id === editingProductId)) {
      setEditingProductId(null)
    }
  }, [items, editingProductId])

  const filteredCatalogue = useMemo(() => {
    const q = tableSearch.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        p.variants.some((v) => (v.sku ?? '').toLowerCase().includes(q)),
    )
  }, [items, tableSearch])

  const paginatedCatalogue = useMemo(() => {
    const start = tablePage * rowsPerPage
    return filteredCatalogue.slice(start, start + rowsPerPage)
  }, [filteredCatalogue, tablePage, rowsPerPage])

  useEffect(() => {
    setTablePage((p) => {
      const maxPage = Math.max(0, Math.ceil(filteredCatalogue.length / rowsPerPage) - 1)
      return Math.min(p, maxPage)
    })
  }, [filteredCatalogue.length, rowsPerPage])

  const editingProduct = editingProductId ? (items.find((x) => x.id === editingProductId) ?? null) : null

  async function createProduct() {
    setError(null)
    const p = Number(priceCents)
    const cRaw = compareAtCreate.trim()
    const c = cRaw ? Number(cRaw) : null
    if (c != null) {
      if (!Number.isFinite(c) || !Number.isInteger(c) || c < 0) {
        setError('List price before discount must be a whole number of cents (or leave blank).')
        return
      }
      if (!Number.isFinite(p) || c <= p) {
        setError('List price before discount must be greater than list price after discount (cart price).')
        return
      }
    }
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          name,
          description,
          sku,
          variantName: 'Default',
          priceCents: Number(priceCents),
          initialStock: Number(initialStock),
          currency: 'NAD',
          categoryId: categoryId.trim() || null,
          imageUrl: imageUrl.trim() || null,
          compareAtPriceCents: compareAtCreate.trim() ? Number(compareAtCreate) : null,
          inventoryPolicy: inventoryPolicyCreate,
          variantOptions: parseOptionsLines(variantOptionsCreate),
        }),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || 'Create failed')
      }
      setSlug('')
      setName('')
      setDescription('')
      setSku('')
      setImageUrl('')
      setCompareAtCreate('')
      setInventoryPolicyCreate('track')
      setVariantOptionsCreate('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    }
  }

  async function saveProduct(productId: string) {
    setError(null)
    const e = editProduct[productId]
    if (!e) return
    try {
      await fetchCsrfToken()
      const res = await apiFetch(`/api/admin/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: e.name,
          slug: e.slug,
          description: e.description,
          isActive: e.isActive,
          categoryId: e.categoryId.trim() ? e.categoryId.trim() : null,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    }
  }

  async function saveVariant(productId: string, variantId: string) {
    setError(null)
    const e = editVariant[variantId]
    if (!e) return
    const p = Number(e.priceCents)
    const cRaw = e.compareAtPriceCents.trim()
    const c = cRaw ? Number(cRaw) : null
    if (c != null) {
      if (!Number.isFinite(c) || !Number.isInteger(c) || c < 0) {
        setError('List price before discount must be a whole number of cents (or leave blank).')
        return
      }
      if (!Number.isFinite(p) || c <= p) {
        setError('List price before discount must be greater than list price after discount for this variant.')
        return
      }
    }
    try {
      await fetchCsrfToken()
      const res = await apiFetch(`/api/admin/products/${productId}/variants/${variantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: e.sku,
          variantName: e.variantName,
          priceCents: Number(e.priceCents),
          currency: e.currency,
          compareAtPriceCents: e.compareAtPriceCents.trim() ? Number(e.compareAtPriceCents) : null,
          inventoryPolicy: e.inventoryPolicy,
          variantOptions: parseOptionsLines(e.optionsText),
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    }
  }

  async function addImage(productId: string) {
    setError(null)
    const url = (imageAdd[productId] ?? '').trim()
    if (!url) {
      setError('Enter an image URL.')
      return
    }
    try {
      await fetchCsrfToken()
      const vid = (imageVariantId[productId] ?? '').trim()
      const res = await apiFetch(`/api/admin/products/${productId}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, sortOrder: 0, ...(vid ? { variantId: vid } : {}) }),
      })
      if (!res.ok) throw new Error(await res.text())
      setImageAdd((m) => ({ ...m, [productId]: '' }))
      setImageVariantId((m) => ({ ...m, [productId]: '' }))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image add failed')
    }
  }

  const catalogueProductEditor = (p: ProductDto) => {
    const ep = editProduct[p.id]
    const draft =
      ep ??
      ({
        name: p.name,
        slug: p.slug,
        description: p.description,
        isActive: p.isActive !== false,
        categoryId: p.categoryId || '',
      } as const)
    const v0 = p.variants[0]
    return (
      <Stack
        key={p.id}
        spacing={2}
        component={Paper}
        variant="outlined"
        sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 2, overflow: 'hidden' }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <Box
            sx={{
              width: { xs: '100%', md: 140 },
              height: 140,
              flexShrink: 0,
              borderRadius: 1,
              bgcolor: 'action.hover',
              backgroundImage: p.imageUrl ? `url(${p.imageUrl})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          <Stack spacing={1} flex={1}>
            <Typography variant="overline" color="text.secondary">
              Product · {p.isActive === false ? 'inactive (hidden from shop)' : 'active'}
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                label="Name"
                fullWidth
                size="small"
                value={ep?.name ?? p.name}
                onChange={(ev) =>
                  setEditProduct((m) => ({ ...m, [p.id]: { ...(m[p.id] ?? draft), name: ev.target.value } }))
                }
              />
              <TextField
                label="Slug"
                fullWidth
                size="small"
                value={ep?.slug ?? p.slug}
                onChange={(ev) =>
                  setEditProduct((m) => ({ ...m, [p.id]: { ...(m[p.id] ?? draft), slug: ev.target.value } }))
                }
              />
            </Stack>
            <TextField
              label="Description"
              fullWidth
              size="small"
              multiline
              minRows={2}
              value={ep?.description ?? p.description}
              onChange={(ev) =>
                setEditProduct((m) => ({ ...m, [p.id]: { ...(m[p.id] ?? draft), description: ev.target.value } }))
              }
            />
            <TextField
              select
              label="Category"
              size="small"
              fullWidth
              value={ep?.categoryId ?? ''}
              onChange={(ev) =>
                setEditProduct((m) => ({
                  ...m,
                  [p.id]: { ...(m[p.id] ?? draft), categoryId: ev.target.value },
                }))
              }
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {categories.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
            <FormControlLabel
              control={
                <Switch
                  checked={ep?.isActive ?? true}
                  onChange={(ev) =>
                    setEditProduct((m) => ({
                      ...m,
                      [p.id]: { ...(m[p.id] ?? draft), isActive: ev.target.checked },
                    }))
                  }
                />
              }
              label="Visible in storefront"
            />
            <Button size="small" variant="outlined" onClick={() => void saveProduct(p.id)} sx={{ alignSelf: 'flex-start' }}>
              Save product details
            </Button>
          </Stack>
        </Stack>

        <Divider sx={{ borderColor: 'divider' }} />

        <Typography variant="subtitle2" fontWeight={700} sx={{ letterSpacing: 0.02 }}>
          Images
        </Typography>
        <AdminProductGalleryEditor product={p} onReload={() => void load()} />
        {!p.images || p.images.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No gallery images yet. Add one with the form below (paste a URL or upload a file).
          </Typography>
        ) : null}
        <Stack spacing={1.5}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems={{ lg: 'flex-start' }}>
            <Stack spacing={1} sx={{ flex: 1, minWidth: 0, width: 1 }}>
              <TextField
                size="small"
                fullWidth
                label="Add image URL"
                value={imageAdd[p.id] ?? ''}
                onChange={(ev) => setImageAdd((m) => ({ ...m, [p.id]: ev.target.value }))}
                placeholder="https://… or use upload"
              />
              <ProductImageUploadBox
                value={imageAdd[p.id] ?? ''}
                onChange={(url) => setImageAdd((m) => ({ ...m, [p.id]: url }))}
                persistToProductId={p.id}
                persistVariantId={imageVariantId[p.id] ?? ''}
                onPersisted={() => {
                  setImageVariantId((m) => ({ ...m, [p.id]: '' }))
                  void load()
                }}
                helperText="Upload saves the file, inserts its URL into product_images, then refreshes the list. Optional variant ID above applies to that row."
              />
            </Stack>
            <Stack spacing={1} sx={{ width: { xs: 1, lg: 280 }, flexShrink: 0 }}>
              <TextField
                size="small"
                fullWidth
                label="Variant ID (optional)"
                placeholder="For variant-specific image"
                value={imageVariantId[p.id] ?? ''}
                onChange={(ev) => setImageVariantId((m) => ({ ...m, [p.id]: ev.target.value }))}
              />
              <Button variant="contained" size="small" onClick={() => void addImage(p.id)} sx={{ alignSelf: 'stretch' }}>
                Add image to product
              </Button>
            </Stack>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Copy a variant UUID from the list below to attach the image to that SKU in the storefront gallery.
          </Typography>
        </Stack>

        <Typography variant="subtitle2" fontWeight={700} sx={{ letterSpacing: 0.02 }}>
          Variants
        </Typography>
        <Stack spacing={2}>
          {p.variants.map((v) => {
            const ev = editVariant[v.id]
            const vDraft =
              ev ??
              ({
                sku: v.sku,
                variantName: v.name,
                priceCents: String(v.priceCents),
                currency: v.currency,
                compareAtPriceCents: v.compareAtPriceCents != null ? String(v.compareAtPriceCents) : '',
                inventoryPolicy: v.inventoryPolicy ?? 'track',
                optionsText: optionsToLines(v.options),
              } as const)
            const pv = adminDiscountPreview(
              ev?.priceCents ?? String(v.priceCents),
              ev?.compareAtPriceCents ?? (v.compareAtPriceCents != null ? String(v.compareAtPriceCents) : ''),
              ev?.currency ?? v.currency,
            )
            return (
              <Paper
                key={v.id}
                elevation={0}
                variant="outlined"
                sx={{
                  p: { xs: 1.5, sm: 2 },
                  borderRadius: 2,
                  bgcolor: 'action.hover',
                  borderColor: 'divider',
                }}
              >
                <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
                  Variant ID
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                    display: 'block',
                    mb: 2,
                    color: 'text.secondary',
                    lineHeight: 1.5,
                  }}
                >
                  {v.id}
                </Typography>

                <Stack spacing={2}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'flex-start' }}>
                    <TextField
                      size="small"
                      label="SKU"
                      fullWidth
                      value={ev?.sku ?? v.sku}
                      onChange={(e) =>
                        setEditVariant((m) => ({
                          ...m,
                          [v.id]: { ...(m[v.id] ?? vDraft), sku: e.target.value },
                        }))
                      }
                      sx={{ flex: { sm: '1 1 140px' }, minWidth: 0 }}
                    />
                    <TextField
                      size="small"
                      label="Variant name"
                      fullWidth
                      value={ev?.variantName ?? v.name}
                      onChange={(e) =>
                        setEditVariant((m) => ({
                          ...m,
                          [v.id]: { ...(m[v.id] ?? vDraft), variantName: e.target.value },
                        }))
                      }
                      sx={{ flex: { sm: '2 1 200px' }, minWidth: 0 }}
                    />
                  </Stack>

                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1.5}
                    alignItems={{ sm: 'flex-end' }}
                    flexWrap="wrap"
                  >
                    <TextField
                      size="small"
                      label="List price after discount (cents)"
                      type="number"
                      value={ev?.priceCents ?? String(v.priceCents)}
                      onChange={(e) =>
                        setEditVariant((m) => ({
                          ...m,
                          [v.id]: { ...(m[v.id] ?? vDraft), priceCents: e.target.value },
                        }))
                      }
                      sx={{ width: { xs: '100%', sm: 200 } }}
                      helperText="Cart / checkout"
                    />
                    <TextField
                      size="small"
                      label="Currency"
                      value={ev?.currency ?? v.currency}
                      onChange={(e) =>
                        setEditVariant((m) => ({
                          ...m,
                          [v.id]: { ...(m[v.id] ?? vDraft), currency: e.target.value },
                        }))
                      }
                      sx={{ width: { xs: '100%', sm: 88 } }}
                    />
                    <Box sx={{ flex: { sm: 1 }, minWidth: 0 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">
                        Stock (warehouse sum)
                      </Typography>
                      <Typography variant="body2" fontWeight={700}>
                        {v.stockQuantity}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
                        Live after discount: {formatMoney(v.priceCents, v.currency)}
                      </Typography>
                    </Box>
                  </Stack>

                  <Divider sx={{ borderColor: 'divider' }} />

                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'flex-start' }}>
                    <Stack spacing={1} sx={{ flex: { md: '1 1 50%' }, minWidth: 0, width: 1 }}>
                      <TextField
                        size="small"
                        label="List price before discount (cents)"
                        value={ev?.compareAtPriceCents ?? (v.compareAtPriceCents != null ? String(v.compareAtPriceCents) : '')}
                        onChange={(e) =>
                          setEditVariant((m) => ({
                            ...m,
                            [v.id]: { ...(m[v.id] ?? vDraft), compareAtPriceCents: e.target.value },
                          }))
                        }
                        fullWidth
                        helperText="Optional. Must be higher than list price after discount when set."
                      />
                      {pv ? (
                        <Typography variant="caption" color="success.main" fontWeight={700} sx={{ display: 'block' }}>
                          Preview: {pv.pct}% off — was {formatMoney(pv.list, pv.currency)} → {formatMoney(pv.sale, pv.currency)}
                        </Typography>
                      ) : null}
                      {(ev?.compareAtPriceCents ?? (v.compareAtPriceCents != null ? String(v.compareAtPriceCents) : '')).trim() ? (
                        <Button
                          size="small"
                          variant="text"
                          onClick={() =>
                            setEditVariant((m) => ({
                              ...m,
                              [v.id]: { ...(m[v.id] ?? vDraft), compareAtPriceCents: '' },
                            }))
                          }
                          sx={{ alignSelf: 'flex-start' }}
                        >
                          Clear list price
                        </Button>
                      ) : null}
                    </Stack>
                    <TextField
                      size="small"
                      select
                      label="Inventory policy"
                      value={ev?.inventoryPolicy ?? v.inventoryPolicy ?? 'track'}
                      onChange={(e) =>
                        setEditVariant((m) => ({
                          ...m,
                          [v.id]: { ...(m[v.id] ?? vDraft), inventoryPolicy: e.target.value as InventoryPolicy },
                        }))
                      }
                      fullWidth
                      sx={{ flex: { md: '0 0 240px' }, maxWidth: { md: 280 } }}
                    >
                      <MenuItem value="track">Track (block when out of stock)</MenuItem>
                      <MenuItem value="continue">Continue (oversell / backorder)</MenuItem>
                      <MenuItem value="not_tracked">Not tracked</MenuItem>
                    </TextField>
                  </Stack>

                  <TextField
                    size="small"
                    label="Variant options (one per line, e.g. Size: M)"
                    value={ev?.optionsText ?? optionsToLines(v.options)}
                    onChange={(e) =>
                      setEditVariant((m) => ({
                        ...m,
                        [v.id]: { ...(m[v.id] ?? vDraft), optionsText: e.target.value },
                      }))
                    }
                    fullWidth
                    multiline
                    minRows={2}
                  />

                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 0.5 }}>
                    <Button variant="contained" size="medium" onClick={() => void saveVariant(p.id, v.id)} sx={{ fontWeight: 700 }}>
                      Save variant
                    </Button>
                  </Box>
                </Stack>
              </Paper>
            )
          })}
        </Stack>
        {!v0 && (
          <Typography variant="body2" color="text.secondary">
            No variants on this product.
          </Typography>
        )}
      </Stack>
    )
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h5" fontWeight={800}>
        Products and catalogue
      </Typography>
      <Typography variant="body2" color="text.secondary" maxWidth={800}>
        Create merchandising records with optional hero image URLs, then tune copy and pricing per variant. Stock levels and
        low-stock alerts are managed on the Inventory page (linked from the sidebar). Approving a return or cancelling an unpaid
        order updates counts automatically; this list refreshes after each save.
      </Typography>
      {error && <Alert severity="warning">{error}</Alert>}

      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Create product
        </Typography>
        <Stack spacing={1.5}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField label="Slug" value={slug} onChange={(ev) => setSlug(ev.target.value)} fullWidth required />
            <TextField label="Name" value={name} onChange={(ev) => setName(ev.target.value)} fullWidth required />
          </Stack>
          <TextField
            label="Description"
            value={description}
            onChange={(ev) => setDescription(ev.target.value)}
            fullWidth
            multiline
            minRows={3}
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField label="SKU" value={sku} onChange={(ev) => setSku(ev.target.value)} fullWidth required />
            <TextField label="Initial stock" value={initialStock} onChange={(ev) => setInitialStock(ev.target.value)} fullWidth />
          </Stack>
          <Typography variant="body2" fontWeight={700}>
            Product image (optional)
          </Typography>
          <TextField
            label="Image URL"
            value={imageUrl}
            onChange={(ev) => setImageUrl(ev.target.value)}
            fullWidth
            placeholder="https://… or upload a file below"
            helperText="Paste a public image link, or upload from your computer. Saving the product writes the URL to the database (product_images)."
          />
          <ProductImageUploadBox
            value={imageUrl}
            onChange={setImageUrl}
            helperText="Upload stores the file on the API server; Save product stores its URL in SQL for the storefront."
          />
          <Stack spacing={1}>
            <Typography variant="body2" fontWeight={700}>
              Pricing
            </Typography>
            <TextField
              label="List price after discount (cents)"
              value={priceCents}
              onChange={(ev) => setPriceCents(ev.target.value)}
              fullWidth
              required
              helperText="Updated price used in the cart and at checkout (stored as price_cents)."
            />
            <TextField
              label="List price before discount (cents, optional)"
              value={compareAtCreate}
              onChange={(ev) => setCompareAtCreate(ev.target.value)}
              fullWidth
              helperText="Optional higher “was” price; must be above list price after discount when set. Shown struck through on the storefront."
            />
            {createDiscountPreview ? (
              <Typography variant="caption" color="success.main" fontWeight={700}>
                Preview: {createDiscountPreview.pct}% off — was {formatMoney(createDiscountPreview.list, createDiscountPreview.currency)} →{' '}
                {formatMoney(createDiscountPreview.sale, createDiscountPreview.currency)}
              </Typography>
            ) : null}
            {compareAtCreate.trim() ? (
              <Button size="small" variant="text" onClick={() => setCompareAtCreate('')} sx={{ alignSelf: 'flex-start' }}>
                Clear before-discount list price
              </Button>
            ) : null}
            <TextField
              select
              size="small"
              label="Stock policy"
              value={inventoryPolicyCreate}
              onChange={(ev) => setInventoryPolicyCreate(ev.target.value as InventoryPolicy)}
              sx={{ width: { xs: 1, sm: 260 }, maxWidth: '100%' }}
              helperText="Track = block at 0 stock · Continue = oversell · Not tracked = ignore stock"
            >
              <MenuItem value="track">Track</MenuItem>
              <MenuItem value="continue">Continue</MenuItem>
              <MenuItem value="not_tracked">Not tracked</MenuItem>
            </TextField>
          </Stack>
          <TextField
            label="Variant options (optional, one per line: Size: Large)"
            value={variantOptionsCreate}
            onChange={(ev) => setVariantOptionsCreate(ev.target.value)}
            fullWidth
            multiline
            minRows={2}
          />
          <TextField
            select
            label="Category (optional)"
            value={categoryId}
            onChange={(ev) => setCategoryId(ev.target.value)}
            fullWidth
            helperText="Pulled from public /api/categories when SQL is available."
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {categories.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name} ({c.slug})
              </MenuItem>
            ))}
          </TextField>
          <Button variant="contained" onClick={() => void createProduct()} sx={{ alignSelf: 'flex-start' }}>
            Save product
          </Button>
        </Stack>
      </Paper>

      <Divider sx={{ borderColor: 'divider' }} />

      <Typography variant="subtitle1" fontWeight={700}>
        Catalogue ({items.length} products
        {tableSearch.trim() ? ` · ${filteredCatalogue.length} match${filteredCatalogue.length === 1 ? '' : 'es'}` : ''})
      </Typography>

      <Stack spacing={1.5}>
        <TextField
          size="small"
          placeholder="Search name, slug, or SKU…"
          value={tableSearch}
          onChange={(ev) => {
            setTableSearch(ev.target.value)
            setTablePage(0)
          }}
          fullWidth
          sx={{ maxWidth: { sm: 420 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          }}
        />
        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: { xs: '55vh', md: '70vh' }, borderRadius: 2 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 56 }} />
                <TableCell>Name</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Slug</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Category</TableCell>
                <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>SKU</TableCell>
                <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                  Price
                </TableCell>
                <TableCell align="right">Variants</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedCatalogue.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9}>
                    <Typography variant="body2" color="text.secondary">
                      {items.length === 0 ? 'No products yet. Create one above.' : 'No products match this search.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedCatalogue.map((p) => {
                  const v0 = p.variants[0]
                  return (
                    <TableRow key={p.id} hover selected={editingProductId === p.id}>
                      <TableCell>
                        <Box
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: 1,
                            bgcolor: 'action.hover',
                            backgroundImage: p.imageUrl ? `url(${p.imageUrl})` : undefined,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography fontWeight={700} noWrap sx={{ maxWidth: { xs: 160, sm: 220, md: 280 } }}>
                          {p.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', md: 'none' } }} noWrap>
                          {p.slug}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                        <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 160 }}>
                          {p.slug}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 140 }}>
                          {p.categoryName ?? '—'}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 120 }}>
                          {v0?.sku ?? '—'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                        {v0 ? formatMoney(v0.priceCents, v0.currency) : '—'}
                      </TableCell>
                      <TableCell align="right">{p.variants.length}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={p.isActive === false ? 'Hidden' : 'Live'}
                          color={p.isActive === false ? 'default' : 'success'}
                          variant={p.isActive === false ? 'outlined' : 'filled'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          variant={editingProductId === p.id ? 'contained' : 'outlined'}
                          onClick={() => setEditingProductId(p.id)}
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={filteredCatalogue.length}
          page={tablePage}
          onPageChange={(_, next) => setTablePage(next)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(ev) => {
            setRowsPerPage(parseInt(ev.target.value, 10))
            setTablePage(0)
          }}
          rowsPerPageOptions={[25, 50, 100, 250]}
          labelRowsPerPage="Rows"
        />
      </Stack>

      <Drawer
        anchor="right"
        open={Boolean(editingProduct)}
        onClose={() => setEditingProductId(null)}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 'min(100%, 640px)' },
            maxWidth: '100vw',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            flexShrink: 0,
          }}
        >
          <Typography variant="h6" fontWeight={800} noWrap sx={{ minWidth: 0 }}>
            {editingProduct?.name ?? 'Edit product'}
          </Typography>
          <Button variant="outlined" size="small" onClick={() => setEditingProductId(null)}>
            Close
          </Button>
        </Box>
        <Box sx={{ overflow: 'auto', flex: 1, p: 2 }}>{editingProduct ? catalogueProductEditor(editingProduct) : null}</Box>
      </Drawer>
    </Stack>
  )
}
