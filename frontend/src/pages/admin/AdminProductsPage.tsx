import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import type { ProductDto } from '../../types/catalogue'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { formatMoney } from '../../lib/money'

type CategoryOpt = { id: string; slug: string; name: string }

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
  const [categoryId, setCategoryId] = useState('')
  const [editProduct, setEditProduct] = useState<
    Record<string, { name: string; slug: string; description: string; isActive: boolean; categoryId: string }>
  >({})
  const [editVariant, setEditVariant] = useState<Record<string, { sku: string; variantName: string; priceCents: string; currency: string }>>({})
  const [imageAdd, setImageAdd] = useState<Record<string, string>>({})

  async function load() {
    setError(null)
    try {
      const [res, catRes] = await Promise.all([
        fetch(apiUrl('/api/admin/products'), { credentials: 'include' }),
        fetch(apiUrl('/api/categories'), { credentials: 'include' }),
      ])
      if (res.status === 401 || res.status === 403) {
        setError('Sign in on /account as a user with admin or ops role (see your database).')
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

  async function createProduct() {
    setError(null)
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
      const res = await apiFetch(`/api/admin/products/${productId}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, sortOrder: 0 }),
      })
      if (!res.ok) throw new Error(await res.text())
      setImageAdd((m) => ({ ...m, [productId]: '' }))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image add failed')
    }
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

      <Box>
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
            <TextField label="Price (cents)" value={priceCents} onChange={(ev) => setPriceCents(ev.target.value)} fullWidth />
            <TextField label="Initial stock" value={initialStock} onChange={(ev) => setInitialStock(ev.target.value)} fullWidth />
          </Stack>
          <TextField
            label="Image URL (optional)"
            value={imageUrl}
            onChange={(ev) => setImageUrl(ev.target.value)}
            fullWidth
            placeholder="https://…"
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
      </Box>

      <Divider />

      <Typography variant="subtitle1" fontWeight={700}>
        Catalogue ({items.length} products)
      </Typography>

      <Stack spacing={4}>
        {items.map((p) => {
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
            <Stack key={p.id} spacing={1.5} component={Paper} variant="outlined" sx={{ p: 2 }}>
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

              <Divider flexItem />

              <Typography variant="subtitle2" fontWeight={700}>
                Images
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                <TextField
                  size="small"
                  fullWidth
                  label="Add image URL"
                  value={imageAdd[p.id] ?? ''}
                  onChange={(ev) => setImageAdd((m) => ({ ...m, [p.id]: ev.target.value }))}
                />
                <Button variant="contained" size="small" onClick={() => void addImage(p.id)}>
                  Add
                </Button>
              </Stack>

              <Typography variant="subtitle2" fontWeight={700}>
                Variants
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>SKU</TableCell>
                      <TableCell>Name</TableCell>
                      <TableCell>Price</TableCell>
                      <TableCell>Stock (sum)</TableCell>
                      <TableCell width={120} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {p.variants.map((v) => {
                      const ev = editVariant[v.id]
                      const vDraft =
                        ev ??
                        ({
                          sku: v.sku,
                          variantName: v.name,
                          priceCents: String(v.priceCents),
                          currency: v.currency,
                        } as const)
                      return (
                        <TableRow key={v.id}>
                          <TableCell sx={{ minWidth: 120 }}>
                            <TextField
                              size="small"
                              value={ev?.sku ?? v.sku}
                              onChange={(e) =>
                                setEditVariant((m) => ({
                                  ...m,
                                  [v.id]: { ...(m[v.id] ?? vDraft), sku: e.target.value },
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              size="small"
                              fullWidth
                              value={ev?.variantName ?? v.name}
                              onChange={(e) =>
                                setEditVariant((m) => ({
                                  ...m,
                                  [v.id]: { ...(m[v.id] ?? vDraft), variantName: e.target.value },
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell sx={{ minWidth: 200 }}>
                            <Stack direction="row" spacing={1}>
                              <TextField
                                size="small"
                                label="cents"
                                type="number"
                                value={ev?.priceCents ?? String(v.priceCents)}
                                onChange={(e) =>
                                  setEditVariant((m) => ({
                                    ...m,
                                    [v.id]: { ...(m[v.id] ?? vDraft), priceCents: e.target.value },
                                  }))
                                }
                                sx={{ width: 110 }}
                              />
                              <TextField
                                size="small"
                                label="ccy"
                                value={ev?.currency ?? v.currency}
                                onChange={(e) =>
                                  setEditVariant((m) => ({
                                    ...m,
                                    [v.id]: { ...(m[v.id] ?? vDraft), currency: e.target.value },
                                  }))
                                }
                                sx={{ width: 72 }}
                              />
                            </Stack>
                            <Typography variant="caption" color="text.secondary" display="block">
                              {formatMoney(v.priceCents, v.currency)} list
                            </Typography>
                          </TableCell>
                          <TableCell>{v.stockQuantity}</TableCell>
                          <TableCell>
                            <Button size="small" variant="outlined" onClick={() => void saveVariant(p.id, v.id)}>
                              Save
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              {!v0 && (
                <Typography variant="body2" color="text.secondary">
                  No variants on this product.
                </Typography>
              )}
            </Stack>
          )
        })}
      </Stack>
    </Stack>
  )
}
