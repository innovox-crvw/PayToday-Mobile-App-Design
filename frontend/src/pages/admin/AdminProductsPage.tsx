import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { InventoryPolicy } from '../../types/catalogue'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Tab,
  Tabs,
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
import { alpha } from '@mui/material/styles'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import Grid from '@mui/material/Grid2'
import type { ProductDto } from '../../types/catalogue'
import { AdminProductGalleryEditor } from '../../components/admin/AdminProductGalleryEditor'
import { ProductImageUploadBox } from '../../components/admin/ProductImageUploadBox'
import { apiFetch, fetchCsrfToken, readResponseJson } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { PRODUCT_VARIANTS_SQL_COLUMN_LIST, PRODUCT_VARIANTS_TABLE } from '../../lib/productVariantDbColumns'
import { formatMoney } from '../../lib/money'
import SearchIcon from '@mui/icons-material/Search'
import { useAuthMe } from '../../hooks/useAuthMe'
import {
  parseNonNegativeInt,
  parseNonNegativeIntCents,
  parseOptionalCatalogImageUrl,
  parseProductName,
  parseProductSlug,
  parseSku,
} from '../../lib/inputValidators'

type CategoryOpt = { id: string; slug: string; name: string }

type CsvParseErr = { line: number; message: string }
type CsvRowErr = { line: number; sku: string; message: string }

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
  const { user: authUser } = useAuthMe()
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
  const [packageLenCreate, setPackageLenCreate] = useState('200')
  const [packageWidCreate, setPackageWidCreate] = useState('150')
  const [packageHgtCreate, setPackageHgtCreate] = useState('100')
  const [grossWeightCreate, setGrossWeightCreate] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [editProduct, setEditProduct] = useState<
    Record<string, { name: string; slug: string; description: string; isActive: boolean; categoryId: string; containsAlcohol: boolean }>
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
        packageLengthMm: string
        packageWidthMm: string
        packageHeightMm: string
        grossWeightG: string
      }
    >
  >({})
  const [imageAdd, setImageAdd] = useState<Record<string, string>>({})
  const [imageVariantId, setImageVariantId] = useState<Record<string, string>>({})
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [tableSearch, setTableSearch] = useState('')
  const [tablePage, setTablePage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(25)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importTab, setImportTab] = useState(0)

  const bulkCsvFileRef = useRef<HTMLInputElement | null>(null)
  const [bulkCsvText, setBulkCsvText] = useState('')
  const [bulkCsvFileName, setBulkCsvFileName] = useState<string | null>(null)
  const [bulkCsvBusy, setBulkCsvBusy] = useState(false)
  const [bulkCsvOk, setBulkCsvOk] = useState<string | null>(null)
  const [bulkCsvParseErrors, setBulkCsvParseErrors] = useState<CsvParseErr[]>([])
  const [bulkCsvRowErrors, setBulkCsvRowErrors] = useState<CsvRowErr[]>([])
  const bulkZipFileRef = useRef<HTMLInputElement | null>(null)
  const [bulkZipBusy, setBulkZipBusy] = useState(false)
  const [bulkZipOk, setBulkZipOk] = useState<string | null>(null)

  const createDiscountPreview = useMemo(
    () => adminDiscountPreview(priceCents, compareAtCreate, 'NAD'),
    [priceCents, compareAtCreate],
  )

  const load = useCallback(async () => {
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
          containsAlcohol: p.containsAlcohol === true,
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
            packageLengthMm: v.packageLengthMm != null ? String(v.packageLengthMm) : '',
            packageWidthMm: v.packageWidthMm != null ? String(v.packageWidthMm) : '',
            packageHeightMm: v.packageHeightMm != null ? String(v.packageHeightMm) : '',
            grossWeightG: v.grossWeightG != null ? String(v.grossWeightG) : '',
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
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load()
    }, 0)
    return () => clearTimeout(t)
  }, [load])

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (editingProductId && !items.some((x) => x.id === editingProductId)) {
        setEditingProductId(null)
      }
    }, 0)
    return () => clearTimeout(t)
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
    const t = window.setTimeout(() => {
      setTablePage((p) => {
        const maxPage = Math.max(0, Math.ceil(filteredCatalogue.length / rowsPerPage) - 1)
        return Math.min(p, maxPage)
      })
    }, 0)
    return () => clearTimeout(t)
  }, [filteredCatalogue.length, rowsPerPage])

  const editingProduct = editingProductId ? (items.find((x) => x.id === editingProductId) ?? null) : null

  function resetCreateProductForm() {
    setSlug('')
    setName('')
    setDescription('')
    setSku('')
    setPriceCents('19900')
    setInitialStock('10')
    setImageUrl('')
    setCompareAtCreate('')
    setInventoryPolicyCreate('track')
    setVariantOptionsCreate('')
    setPackageLenCreate('200')
    setPackageWidCreate('150')
    setPackageHgtCreate('100')
    setGrossWeightCreate('')
    setCategoryId('')
  }

  function closeCreateDialog() {
    setCreateDialogOpen(false)
    resetCreateProductForm()
  }

  async function createProduct() {
    setError(null)
    const slugR = parseProductSlug(slug, 'slug')
    if (slugR.ok === false) {
      setError(slugR.message)
      return
    }
    const nameR = parseProductName(name, 'name')
    if (nameR.ok === false) {
      setError(nameR.message)
      return
    }
    const skuR = parseSku(sku, 'sku')
    if (skuR.ok === false) {
      setError(skuR.message)
      return
    }
    const imgR = parseOptionalCatalogImageUrl(imageUrl.trim() || null, 'imageUrl')
    if (imgR.ok === false) {
      setError(imgR.message)
      return
    }
    const priceR = parseNonNegativeIntCents(priceCents, 'priceCents')
    if (priceR.ok === false) {
      setError(priceR.message)
      return
    }
    const stockR = parseNonNegativeInt(initialStock, 'initialStock')
    if (stockR.ok === false) {
      setError(stockR.message)
      return
    }
    const p = priceR.value
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
    const lStr = packageLenCreate.trim()
    const wStr = packageWidCreate.trim()
    const hStr = packageHgtCreate.trim()
    const gStr = grossWeightCreate.trim()
    if (!lStr || !wStr || !hStr) {
      setError('Package length, width, and height (mm) are all required.')
      return
    }
    const packageLengthMm = Number(lStr)
    const packageWidthMm = Number(wStr)
    const packageHeightMm = Number(hStr)
    if (
      !Number.isInteger(packageLengthMm) ||
      !Number.isInteger(packageWidthMm) ||
      !Number.isInteger(packageHeightMm) ||
      packageLengthMm < 0 ||
      packageWidthMm < 0 ||
      packageHeightMm < 0
    ) {
      setError('Package dimensions must be whole numbers of millimetres (0 or greater).')
      return
    }
    let grossWeightG: number | null = null
    if (gStr) {
      const g = Number(gStr)
      if (!Number.isInteger(g) || g < 0) {
        setError('Gross weight must be a whole number of grams (0 or greater), or leave blank.')
        return
      }
      grossWeightG = g
    }
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: slugR.value,
          name: nameR.value,
          description,
          sku: skuR.value,
          variantName: 'Default',
          priceCents: p,
          initialStock: stockR.value,
          currency: 'NAD',
          categoryId: categoryId.trim() || null,
          imageUrl: imgR.value,
          compareAtPriceCents: compareAtCreate.trim() ? Number(compareAtCreate) : null,
          inventoryPolicy: inventoryPolicyCreate,
          variantOptions: parseOptionsLines(variantOptionsCreate),
          packageLengthMm,
          packageWidthMm,
          packageHeightMm,
          grossWeightG: gStr ? grossWeightG : null,
        }),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || 'Create failed')
      }
      setCreateDialogOpen(false)
      resetCreateProductForm()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    }
  }

  const BULK_CSV_TEMPLATE_URL = '/templates/store-catalog-bulk-import-template.csv'

  function onBulkCsvFilePicked(file: File | null) {
    setBulkCsvOk(null)
    setBulkCsvParseErrors([])
    setBulkCsvRowErrors([])
    if (!file) {
      setBulkCsvFileName(null)
      setBulkCsvText('')
      return
    }
    setBulkCsvFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      setBulkCsvText(typeof reader.result === 'string' ? reader.result : '')
    }
    reader.onerror = () => {
      setError("Couldn't read that file.")
      setBulkCsvFileName(null)
      setBulkCsvText('')
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function submitBulkCsvImport() {
    setError(null)
    setBulkCsvOk(null)
    setBulkCsvParseErrors([])
    setBulkCsvRowErrors([])
    if (!bulkCsvText.trim()) {
      setError('Pick a CSV file first.')
      return
    }
    setBulkCsvBusy(true)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/admin/products/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: bulkCsvText }),
      })
      if (res.ok) {
        const data = await readResponseJson<{ ok?: boolean; applied?: number }>(res)
        const n = Number(data.applied ?? 0)
        setBulkCsvOk(`Done — ${n} product(s) added.`)
        await load()
        return
      }
      try {
        const data = await readResponseJson<{
          parseErrors?: CsvParseErr[]
          rowErrors?: CsvRowErr[]
          error?: string
        }>(res)
        if (data.parseErrors?.length) setBulkCsvParseErrors(data.parseErrors)
        if (data.rowErrors?.length) setBulkCsvRowErrors(data.rowErrors)
        if (typeof data.error === 'string' && data.error.trim()) {
          setError(data.error.trim())
        } else if (!data.parseErrors?.length && !data.rowErrors?.length) {
          setError(`Import failed (${res.status}).`)
        }
      } catch {
        setError(await res.text().then((t) => t.trim().slice(0, 400) || `Import failed (${res.status}).`))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setBulkCsvBusy(false)
    }
  }

  async function submitBulkZipImport(dryRun: boolean) {
    setError(null)
    setBulkZipOk(null)
    const file = bulkZipFileRef.current?.files?.[0]
    if (!file) {
      setError('Choose a ZIP first.')
      return
    }
    setBulkZipBusy(true)
    try {
      await fetchCsrfToken()
      const fd = new FormData()
      fd.append('file', file)
      const res = await apiFetch(`/api/admin/products/import-images-zip${dryRun ? '?dryRun=1' : ''}`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        setError((await res.text()).trim().slice(0, 400) || `ZIP import failed (${res.status})`)
        return
      }
      const data = (await res.json()) as {
        dryRun?: boolean
        skus?: { sku: string; placeholderUrl: string; wouldLink?: boolean }[]
        warnings?: string[]
        linked?: number
        missingSkus?: string[]
        skippedScope?: string[]
        wouldLinkCount?: number
      }
      if (data.dryRun) {
        const n = data.skus?.length ?? 0
        const link = Number(data.wouldLinkCount ?? 0)
        const miss = (data.missingSkus ?? []).length
        const skip = (data.skippedScope ?? []).length
        const w = (data.warnings ?? []).slice(0, 8).join(' · ')
        setBulkZipOk(
          `Checked ${n} file(s): ${link} OK, ${miss} unknown SKU, ${skip} wrong store.${w ? ` · ${w}` : ''}`,
        )
        return
      }
      setBulkZipOk(
        `Imported ${data.linked ?? 0} image(s). Not found: ${(data.missingSkus ?? []).length}. Skipped (store): ${(data.skippedScope ?? []).length}.`,
      )
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ZIP import failed')
    } finally {
      setBulkZipBusy(false)
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
          containsAlcohol: e.containsAlcohol,
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
    const lStr = (e.packageLengthMm ?? '').trim()
    const wStr = (e.packageWidthMm ?? '').trim()
    const hStr = (e.packageHeightMm ?? '').trim()
    const gStr = (e.grossWeightG ?? '').trim()
    if (!lStr || !wStr || !hStr) {
      setError('Package length, width, and height (mm) are all required.')
      return
    }
    const packageLengthMm = Number(lStr)
    const packageWidthMm = Number(wStr)
    const packageHeightMm = Number(hStr)
    if (
      !Number.isInteger(packageLengthMm) ||
      !Number.isInteger(packageWidthMm) ||
      !Number.isInteger(packageHeightMm) ||
      packageLengthMm < 0 ||
      packageWidthMm < 0 ||
      packageHeightMm < 0
    ) {
      setError('Package dimensions must be whole numbers of millimetres (0 or greater).')
      return
    }
    let grossWeightG: number | null = null
    if (gStr) {
      const g = Number(gStr)
      if (!Number.isInteger(g) || g < 0) {
        setError('Gross weight must be a whole number of grams (0 or greater), or leave blank.')
        return
      }
      grossWeightG = g
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
          packageLengthMm,
          packageWidthMm,
          packageHeightMm,
          grossWeightG: gStr ? grossWeightG : null,
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
        containsAlcohol: p.containsAlcohol === true,
      } as const)
    const v0 = p.variants[0]
    return (
      <Stack key={p.id} spacing={2.5}>
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 2 }}>
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
            <FormControlLabel
              control={
                <Switch
                  checked={ep?.containsAlcohol ?? false}
                  onChange={(ev) =>
                    setEditProduct((m) => ({
                      ...m,
                      [p.id]: { ...(m[p.id] ?? draft), containsAlcohol: ev.target.checked },
                    }))
                  }
                />
              }
              label="Age-restricted (alcohol)"
            />
            <Button size="small" variant="outlined" onClick={() => void saveProduct(p.id)} sx={{ alignSelf: 'flex-start' }}>
              Save product details
            </Button>
          </Stack>
        </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 2 }}>
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
        </Paper>

        <Stack spacing={1.5}>
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
                packageLengthMm: v.packageLengthMm != null ? String(v.packageLengthMm) : '',
                packageWidthMm: v.packageWidthMm != null ? String(v.packageWidthMm) : '',
                packageHeightMm: v.packageHeightMm != null ? String(v.packageHeightMm) : '',
                grossWeightG: v.grossWeightG != null ? String(v.grossWeightG) : '',
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

                  <Stack spacing={1}>
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>
                      Package size & weight (L × W × H required per SKU)
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.45 }}>
                      Length, width, and height in millimetres (integers, 0 or greater). All three are required for each variant.
                      Gross weight is optional (grams). Fields map to{' '}
                      <Box component="span" sx={{ fontFamily: 'monospace' }}>package_*_mm</Box> /{' '}
                      <Box component="span" sx={{ fontFamily: 'monospace' }}>gross_weight_g</Box> on{' '}
                      <Box component="span" sx={{ fontFamily: 'monospace' }}>{PRODUCT_VARIANTS_TABLE}</Box>.
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', fontFamily: 'monospace', fontSize: '0.68rem', lineHeight: 1.5, wordBreak: 'break-word' }}
                    >
                      {PRODUCT_VARIANTS_SQL_COLUMN_LIST}
                    </Typography>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap">
                      <TextField
                        size="small"
                        label="Length (mm)"
                        type="number"
                        helperText="package_length_mm"
                        value={ev?.packageLengthMm ?? vDraft.packageLengthMm}
                        onChange={(e2) =>
                          setEditVariant((m) => ({
                            ...m,
                            [v.id]: { ...(m[v.id] ?? vDraft), packageLengthMm: e2.target.value },
                          }))
                        }
                        sx={{ width: { xs: '100%', sm: 120 } }}
                      />
                      <TextField
                        size="small"
                        label="Width (mm)"
                        type="number"
                        helperText="package_width_mm"
                        value={ev?.packageWidthMm ?? vDraft.packageWidthMm}
                        onChange={(e2) =>
                          setEditVariant((m) => ({
                            ...m,
                            [v.id]: { ...(m[v.id] ?? vDraft), packageWidthMm: e2.target.value },
                          }))
                        }
                        sx={{ width: { xs: '100%', sm: 120 } }}
                      />
                      <TextField
                        size="small"
                        label="Height (mm)"
                        type="number"
                        helperText="package_height_mm"
                        value={ev?.packageHeightMm ?? vDraft.packageHeightMm}
                        onChange={(e2) =>
                          setEditVariant((m) => ({
                            ...m,
                            [v.id]: { ...(m[v.id] ?? vDraft), packageHeightMm: e2.target.value },
                          }))
                        }
                        sx={{ width: { xs: '100%', sm: 120 } }}
                      />
                      <TextField
                        size="small"
                        label="Gross weight (g)"
                        type="number"
                        helperText="gross_weight_g"
                        value={ev?.grossWeightG ?? vDraft.grossWeightG}
                        onChange={(e2) =>
                          setEditVariant((m) => ({
                            ...m,
                            [v.id]: { ...(m[v.id] ?? vDraft), grossWeightG: e2.target.value },
                          }))
                        }
                        sx={{ width: { xs: '100%', sm: 140 } }}
                      />
                    </Stack>
                  </Stack>

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
      </Stack>
    )
  }

  return (
    <Box sx={{ maxWidth: 1320, mx: 'auto', width: 1 }}>
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'flex-start' }} justifyContent="space-between">
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" fontWeight={800}>
              Products and catalogue
            </Typography>
            <Typography variant="body2" color="text.secondary" maxWidth={800} sx={{ mt: 0.5, lineHeight: 1.6 }}>
              Tune copy and pricing per variant after you add a product. Stock levels and low-stock alerts are on the Inventory page.
              This list refreshes after each save.
            </Typography>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ flexShrink: 0, alignSelf: { xs: 'stretch', sm: 'center' }, width: { xs: 1, sm: 'auto' } }}>
            <Button
              variant="outlined"
              startIcon={<CloudUploadIcon />}
              onClick={() => {
                setError(null)
                setImportTab(0)
                setImportDialogOpen(true)
              }}
              sx={{ fontWeight: 700 }}
            >
              Import catalogue
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setError(null)
                setCreateDialogOpen(true)
              }}
              sx={{ fontWeight: 700 }}
            >
              Add product
            </Button>
          </Stack>
        </Stack>
        {error && <Alert severity="warning">{error}</Alert>}
        {(authUser?.role === 'admin' || authUser?.role === 'fulfillment') && (authUser.merchants?.length ?? 0) > 0 ? (
          <Alert severity="info">
            You only manage products for: <strong>{authUser.merchants!.map((m) => m.name).join(', ')}</strong>. The public shop still lists
            all merchants.
          </Alert>
        ) : null}

        <Dialog
          open={importDialogOpen}
          onClose={() => setImportDialogOpen(false)}
          maxWidth="md"
          fullWidth
          scroll="paper"
          aria-labelledby="admin-import-catalogue-title"
        >
          <DialogTitle id="admin-import-catalogue-title" sx={{ pr: 6 }}>
            Import catalogue
            <IconButton
              aria-label="Close"
              onClick={() => setImportDialogOpen(false)}
              sx={{ position: 'absolute', right: 8, top: 8 }}
            >
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers sx={{ pt: 1 }}>
            <Tabs
              value={importTab}
              onChange={(_, v) => setImportTab(v)}
              sx={{ borderBottom: 1, borderColor: 'divider', mb: 2, '& .MuiTab-root': { fontWeight: 700, textTransform: 'none' } }}
            >
              <Tab label="CSV bulk import" />
              <Tab label="ZIP images" />
            </Tabs>

            {importTab === 0 ? (
              <Stack spacing={2}>
                <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.65 }}>
                  Add many products at once. Use the template so columns match. File must be <strong>UTF-8</strong>.
                </Typography>
                <Box
                  component="ul"
                  sx={{
                    m: 0,
                    pl: 2.5,
                    color: 'text.primary',
                    '& li': { mb: 1 },
                    typography: 'body2',
                    lineHeight: 1.65,
                  }}
                >
                  <Typography component="li" variant="body2">
                    <strong>One row</strong> = one product and its default variant.
                  </Typography>
                  <Typography component="li" variant="body2">
                    <Box component="span" sx={{ fontWeight: 700 }}>
                      image_url
                    </Box>{' '}
                    must be <strong>https</strong> — products need this to go live on the store.
                  </Typography>
                  <Typography component="li" variant="body2">
                    <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.9rem', bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5 }}>
                      category_slug
                    </Box>{' '}
                    is optional; if set, it must already exist under Admin → Categories.
                  </Typography>
                  <Typography component="li" variant="body2">
                    <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.9rem', bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5 }}>
                      pay_today_merchant_id
                    </Box>{' '}
                    is optional (defaults to your primary merchant). If your login is limited to certain stores, each row must use one of
                    those IDs.
                  </Typography>
                  <Typography component="li" variant="body2">
                    Max <strong>500</strong> data rows; whole file about <strong>512 KB</strong>.
                  </Typography>
                </Box>
                <Button component="a" href={BULK_CSV_TEMPLATE_URL} download variant="outlined" size="small" sx={{ fontWeight: 700, alignSelf: 'flex-start' }}>
                  Download CSV template
                </Button>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} flexWrap="wrap" useFlexGap>
                  <input
                    ref={bulkCsvFileRef}
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    hidden
                    onChange={(e) => onBulkCsvFilePicked(e.target.files?.[0] ?? null)}
                  />
                  <Button variant="outlined" onClick={() => bulkCsvFileRef.current?.click()} sx={{ fontWeight: 700 }}>
                    Choose CSV file
                  </Button>
                  <Box sx={{ flex: 1, minWidth: 0 }} />
                  <Button variant="contained" disabled={bulkCsvBusy || !bulkCsvText.trim()} onClick={() => void submitBulkCsvImport()} sx={{ fontWeight: 700 }}>
                    {bulkCsvBusy ? 'Importing…' : 'Run import'}
                  </Button>
                </Stack>
                {bulkCsvFileName ? (
                  <Typography variant="body2" color="text.secondary">
                    Selected: <strong>{bulkCsvFileName}</strong>
                  </Typography>
                ) : null}
                {bulkCsvText.trim() ? (
                  <TextField
                    label="CSV preview (read-only excerpt)"
                    value={bulkCsvText.slice(0, 8000)}
                    fullWidth
                    multiline
                    minRows={6}
                    maxRows={14}
                    InputProps={{ readOnly: true }}
                    size="small"
                    sx={{ '& .MuiInputBase-input': { fontFamily: 'ui-monospace, monospace', fontSize: '0.8125rem', lineHeight: 1.5 } }}
                    helperText={bulkCsvText.length > 8000 ? `Showing first 8000 characters of ${bulkCsvText.length.toLocaleString()} total.` : undefined}
                  />
                ) : (
                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50', borderStyle: 'dashed' }}>
                    <Typography variant="body2" color="text.secondary">
                      Choose a CSV file to preview its contents here before running the import.
                    </Typography>
                  </Paper>
                )}
                {bulkCsvOk ? (
                  <Alert severity="success" variant="outlined" sx={{ borderRadius: 2 }}>
                    {bulkCsvOk}
                  </Alert>
                ) : null}
                {bulkCsvParseErrors.length > 0 ? (
                  <Alert severity="error" sx={{ borderRadius: 2 }}>
                    <Typography fontWeight={800} gutterBottom variant="subtitle2">
                      CSV format issues
                    </Typography>
                    <Stack component="ul" sx={{ m: 0, pl: 2.5 }}>
                      {bulkCsvParseErrors.map((e) => (
                        <Typography key={`bp-${e.line}-${e.message}`} component="li" variant="body2" sx={{ mb: 0.5 }}>
                          Line {e.line}: {e.message}
                        </Typography>
                      ))}
                    </Stack>
                  </Alert>
                ) : null}
                {bulkCsvRowErrors.length > 0 ? (
                  <Alert severity="error" sx={{ borderRadius: 2 }}>
                    <Typography fontWeight={800} gutterBottom variant="subtitle2">
                      Row fixes
                    </Typography>
                    <Stack component="ul" sx={{ m: 0, pl: 2.5 }}>
                      {bulkCsvRowErrors.map((e) => (
                        <Typography key={`br-${e.line}-${e.sku}-${e.message}`} component="li" variant="body2" sx={{ mb: 0.5 }}>
                          Line {e.line} ({e.sku}): {e.message}
                        </Typography>
                      ))}
                    </Stack>
                  </Alert>
                ) : null}
              </Stack>
            ) : (
              <Stack spacing={2}>
                <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.65 }}>
                  Name each file{' '}
                  <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.95rem', bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5 }}>
                    SKU.jpg
                  </Box>{' '}
                  (png / webp / gif also work). Files are matched to variants by SKU.
                </Typography>
                <Typography variant="body2" sx={{ lineHeight: 1.65 }}>
                  <strong>Validate</strong> checks the ZIP against your catalogue without uploading. <strong>Import images</strong> uploads
                  and attaches gallery images to matching variants.
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} flexWrap="wrap" useFlexGap>
                  <input ref={bulkZipFileRef} type="file" accept=".zip,application/zip" hidden onChange={() => setBulkZipOk(null)} />
                  <Button variant="outlined" onClick={() => bulkZipFileRef.current?.click()} sx={{ fontWeight: 700 }}>
                    Choose ZIP file
                  </Button>
                  <Button variant="outlined" disabled={bulkZipBusy} onClick={() => void submitBulkZipImport(true)} sx={{ fontWeight: 700 }}>
                    Validate only
                  </Button>
                  <Button variant="contained" disabled={bulkZipBusy} onClick={() => void submitBulkZipImport(false)} sx={{ fontWeight: 700 }}>
                    {bulkZipBusy ? 'Working…' : 'Import images'}
                  </Button>
                </Stack>
                {bulkZipOk ? (
                  <Alert severity="success" variant="outlined" sx={{ borderRadius: 2 }}>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {bulkZipOk}
                    </Typography>
                  </Alert>
                ) : null}
              </Stack>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={() => setImportDialogOpen(false)} color="inherit" sx={{ fontWeight: 700 }}>
              Close
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={createDialogOpen}
          onClose={() => closeCreateDialog()}
          maxWidth="md"
          fullWidth
          scroll="paper"
          aria-labelledby="admin-create-product-title"
        >
          <DialogTitle id="admin-create-product-title" sx={{ pr: 6 }}>
            Add product
            <IconButton
              aria-label="Close"
              onClick={() => closeCreateDialog()}
              sx={{ position: 'absolute', right: 8, top: 8 }}
            >
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, lg: 7 }}>
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
                  <TextField
                    select
                    size="small"
                    label="Stock policy"
                    value={inventoryPolicyCreate}
                    onChange={(ev) => setInventoryPolicyCreate(ev.target.value as InventoryPolicy)}
                    fullWidth
                    sx={{ maxWidth: { sm: 360 } }}
                    helperText="Track · Continue · Not tracked"
                  >
                    <MenuItem value="track">Track</MenuItem>
                    <MenuItem value="continue">Continue</MenuItem>
                    <MenuItem value="not_tracked">Not tracked</MenuItem>
                  </TextField>
                  <Typography variant="body2" fontWeight={700}>
                    Package size & weight (L × W × H required)
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.45 }}>
                    Length, width, height in millimetres (integers, 0 or greater). Defaults shown (200×150×100 mm) — adjust to the
                    real outer carton. Gross weight in grams is optional. Stored on{' '}
                    <Box component="span" sx={{ fontFamily: 'monospace' }}>{PRODUCT_VARIANTS_TABLE}</Box>.
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', fontFamily: 'monospace', fontSize: '0.68rem', lineHeight: 1.5, wordBreak: 'break-word' }}
                  >
                    {PRODUCT_VARIANTS_SQL_COLUMN_LIST}
                  </Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap">
                    <TextField
                      size="small"
                      label="Length (mm)"
                      type="number"
                      helperText="package_length_mm"
                      value={packageLenCreate}
                      onChange={(ev) => setPackageLenCreate(ev.target.value)}
                      sx={{ width: { xs: 1, sm: 112 } }}
                    />
                    <TextField
                      size="small"
                      label="Width (mm)"
                      type="number"
                      helperText="package_width_mm"
                      value={packageWidCreate}
                      onChange={(ev) => setPackageWidCreate(ev.target.value)}
                      sx={{ width: { xs: 1, sm: 112 } }}
                    />
                    <TextField
                      size="small"
                      label="Height (mm)"
                      type="number"
                      helperText="package_height_mm"
                      value={packageHgtCreate}
                      onChange={(ev) => setPackageHgtCreate(ev.target.value)}
                      sx={{ width: { xs: 1, sm: 112 } }}
                    />
                    <TextField
                      size="small"
                      label="Gross weight (g)"
                      type="number"
                      helperText="gross_weight_g"
                      value={grossWeightCreate}
                      onChange={(ev) => setGrossWeightCreate(ev.target.value)}
                      sx={{ width: { xs: 1, sm: 130 } }}
                    />
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
                </Stack>
              </Grid>
              <Grid size={{ xs: 12, lg: 5 }}>
                <Stack spacing={1.5}>
                  <Typography variant="body2" fontWeight={700}>
                    Product image (optional)
                  </Typography>
                  <TextField
                    label="Image URL"
                    value={imageUrl}
                    onChange={(ev) => setImageUrl(ev.target.value)}
                    fullWidth
                    placeholder="https://… or upload a file below"
                    helperText="Saving the product writes the URL to the database (product_images)."
                  />
                  <ProductImageUploadBox
                    value={imageUrl}
                    onChange={setImageUrl}
                    helperText="Upload stores the file on the API server; Save product stores its URL in SQL for the storefront."
                  />
                  <Typography variant="body2" fontWeight={700}>
                    Pricing
                  </Typography>
                  <TextField
                    label="List price after discount (cents)"
                    value={priceCents}
                    onChange={(ev) => setPriceCents(ev.target.value)}
                    fullWidth
                    required
                    helperText="Cart / checkout (price_cents)."
                  />
                  <TextField
                    label="List price before discount (cents, optional)"
                    value={compareAtCreate}
                    onChange={(ev) => setCompareAtCreate(ev.target.value)}
                    fullWidth
                    helperText="Optional “was” price; must be above sale price when set."
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
                </Stack>
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
            <Button onClick={() => closeCreateDialog()} color="inherit">
              Cancel
            </Button>
            <Button variant="contained" onClick={() => void createProduct()} sx={{ fontWeight: 700 }}>
              Save product
            </Button>
          </DialogActions>
        </Dialog>

        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mb: 2 }}>
            <Typography variant="h6" fontWeight={800} sx={{ lineHeight: 1.3 }}>
              Catalogue ({items.length} products
              {tableSearch.trim() ? ` · ${filteredCatalogue.length} match${filteredCatalogue.length === 1 ? '' : 'es'}` : ''})
            </Typography>
            <TextField
              size="small"
              placeholder="Search name, slug, or SKU…"
              value={tableSearch}
              onChange={(ev) => {
                setTableSearch(ev.target.value)
                setTablePage(0)
              }}
              sx={{ width: 1, maxWidth: { sm: 400 } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              }}
            />
          </Stack>
        <TableContainer
          sx={{
            maxHeight: { xs: '58vh', md: '72vh' },
            borderRadius: 2,
            border: 1,
            borderColor: 'divider',
            overflow: 'auto',
            bgcolor: 'grey.50',
          }}
        >
          <Table stickyHeader size="medium" sx={{ minWidth: 720, '& .MuiTableCell-root': { verticalAlign: 'middle' } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 72, fontWeight: 800, bgcolor: 'grey.100', color: 'text.primary', fontSize: '0.875rem' }}>
                  Image
                </TableCell>
                <TableCell sx={{ fontWeight: 800, bgcolor: 'grey.100', color: 'text.primary', fontSize: '0.875rem', minWidth: 200 }}>
                  Product
                </TableCell>
                <TableCell sx={{ fontWeight: 800, bgcolor: 'grey.100', color: 'text.primary', fontSize: '0.875rem', minWidth: 120 }}>
                  SKU
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, bgcolor: 'grey.100', color: 'text.primary', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
                  Price
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, bgcolor: 'grey.100', color: 'text.primary', fontSize: '0.875rem' }}>
                  Variants
                </TableCell>
                <TableCell sx={{ fontWeight: 800, bgcolor: 'grey.100', color: 'text.primary', fontSize: '0.875rem' }}>Status</TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, bgcolor: 'grey.100', color: 'text.primary', fontSize: '0.875rem', width: 100 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedCatalogue.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography variant="body1" color="text.secondary" sx={{ py: 3, lineHeight: 1.6 }}>
                      {items.length === 0 ? 'No products yet. Use Add product to create one, or open Import catalogue for a CSV.' : 'No products match this search.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedCatalogue.map((p, idx) => {
                  const v0 = p.variants[0]
                  return (
                    <TableRow
                      key={p.id}
                      hover
                      selected={editingProductId === p.id}
                      sx={{
                        bgcolor: idx % 2 === 0 ? 'background.paper' : (th) => alpha(th.palette.common.black, 0.03),
                      }}
                    >
                      <TableCell sx={{ py: 2 }}>
                        <Box
                          sx={{
                            width: 52,
                            height: 52,
                            borderRadius: 1.5,
                            border: 1,
                            borderColor: 'divider',
                            bgcolor: 'action.hover',
                            backgroundImage: p.imageUrl ? `url(${p.imageUrl})` : undefined,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            flexShrink: 0,
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ py: 2, maxWidth: 360 }}>
                        <Typography fontWeight={800} sx={{ lineHeight: 1.35, wordBreak: 'break-word' }}>
                          {p.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.5, wordBreak: 'break-all' }}>
                          {p.slug}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, lineHeight: 1.5 }}>
                          {p.categoryName ?? 'No category'}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 2 }}>
                        <Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, lineHeight: 1.5 }}>
                          {v0?.sku ?? '—'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ py: 2 }}>
                        <Typography variant="body2" fontWeight={700}>
                          {v0 ? formatMoney(v0.priceCents, v0.currency) : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ py: 2 }}>
                        <Typography variant="body2" fontWeight={700}>
                          {p.variants.length}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 2 }}>
                        <Chip
                          size="medium"
                          label={p.isActive === false ? 'Hidden' : 'Live'}
                          color={p.isActive === false ? 'default' : 'success'}
                          variant={p.isActive === false ? 'outlined' : 'filled'}
                          sx={{ fontWeight: 700 }}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ py: 2 }}>
                        <Button
                          size="medium"
                          variant={editingProductId === p.id ? 'contained' : 'outlined'}
                          onClick={() => setEditingProductId(p.id)}
                          sx={{ fontWeight: 700, minWidth: 88 }}
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
        </Paper>
      </Stack>

      <Drawer
        anchor="right"
        open={Boolean(editingProduct)}
        onClose={() => setEditingProductId(null)}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 'min(100%, 720px)' },
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
    </Box>
  )
}
