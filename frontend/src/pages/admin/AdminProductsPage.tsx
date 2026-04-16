import { useEffect, useState } from 'react'
import { Alert, Button, Stack, TextField, Typography } from '@mui/material'
import type { ProductDto } from '../../types/catalogue'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { formatMoney } from '../../lib/money'

export function AdminProductsPage() {
  const [items, setItems] = useState<ProductDto[]>([])
  const [error, setError] = useState<string | null>(null)
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sku, setSku] = useState('')
  const [priceCents, setPriceCents] = useState('19900')
  const [initialStock, setInitialStock] = useState('10')

  async function load() {
    setError(null)
    try {
      const res = await fetch(apiUrl('/api/admin/products'), { credentials: 'include' })
      if (res.status === 401 || res.status === 403) {
        setError('Sign in on /account as a user with admin or ops role (see your database).')
        return
      }
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as { items: ProductDto[] }
      setItems(data.items ?? [])
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
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        Products and catalogue
      </Typography>
      {error && <Alert severity="warning">{error}</Alert>}
      <Typography variant="subtitle1" fontWeight={700}>
        Create product
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField label="Slug" value={slug} onChange={(e) => setSlug(e.target.value)} fullWidth />
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
      </Stack>
      <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline minRows={2} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField label="SKU" value={sku} onChange={(e) => setSku(e.target.value)} fullWidth />
        <TextField label="Price (cents)" value={priceCents} onChange={(e) => setPriceCents(e.target.value)} fullWidth />
        <TextField label="Initial stock" value={initialStock} onChange={(e) => setInitialStock(e.target.value)} fullWidth />
      </Stack>
      <Button variant="contained" onClick={() => void createProduct()}>
        Save product
      </Button>
      <Typography variant="subtitle1" fontWeight={700}>
        Catalogue
      </Typography>
      <Stack spacing={1}>
        {items.map((p) => {
          const v0 = p.variants[0]
          return (
            <Typography key={p.id} variant="body2">
              {p.name} ({p.slug}) — {v0 ? formatMoney(v0.priceCents, v0.currency) : '—'}
            </Typography>
          )
        })}
      </Stack>
    </Stack>
  )
}
