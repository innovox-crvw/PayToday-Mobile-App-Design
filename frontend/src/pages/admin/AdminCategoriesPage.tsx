import { useEffect, useMemo, useState } from 'react'
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
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'

type CategoryRow = {
  id: string
  slug: string
  name: string
  parentId: string | null
  sortOrder: number
  isActive: boolean
}

function depthForCategory(c: CategoryRow, all: CategoryRow[]): number {
  let d = 0
  let cur: string | null | undefined = c.parentId
  const byId = new Map(all.map((x) => [x.id, x]))
  while (cur && d < 32) {
    d += 1
    cur = byId.get(cur)?.parentId ?? null
  }
  return d
}

export function AdminCategoriesPage() {
  const [items, setItems] = useState<CategoryRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [edit, setEdit] = useState<
    Record<string, { slug: string; name: string; parentId: string; sortOrder: string; isActive: boolean }>
  >({})

  async function load() {
    setError(null)
    try {
      const res = await fetch(apiUrl('/api/admin/categories'), { credentials: 'include' })
      if (res.status === 401 || res.status === 403) {
        setError('Sign in on /account as a user with admin or ops role.')
        return
      }
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as { items: CategoryRow[] }
      const list = data.items ?? []
      setItems(list)
      const next: typeof edit = {}
      for (const c of list) {
        next[c.id] = {
          slug: c.slug,
          name: c.name,
          parentId: c.parentId ?? '',
          sortOrder: String(c.sortOrder ?? 0),
          isActive: c.isActive !== false,
        }
      }
      setEdit(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function createCategory() {
    setError(null)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          name,
          parentId: parentId.trim() || null,
          sortOrder: Number(sortOrder) || 0,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      setSlug('')
      setName('')
      setParentId('')
      setSortOrder('0')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    }
  }

  async function saveRow(id: string) {
    setError(null)
    const e = edit[id]
    if (!e) return
    try {
      await fetchCsrfToken()
      const res = await apiFetch(`/api/admin/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: e.slug,
          name: e.name,
          parentId: e.parentId.trim() || null,
          sortOrder: Number(e.sortOrder) || 0,
          isActive: e.isActive,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    }
  }

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name))
  }, [items])

  return (
    <Stack spacing={3}>
      <Typography variant="h5" fontWeight={800}>
        Categories
      </Typography>
      <Typography variant="body2" color="text.secondary" maxWidth={800}>
        Create a flat or nested taxonomy. Child categories inherit browsing: filtering the shop by a parent category includes
        products in subcategories. Inactive categories are hidden from the public catalogue but remain editable here.
      </Typography>
      {error ? <Alert severity="warning">{error}</Alert> : null}

      <Box>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          New category
        </Typography>
        <Stack spacing={1.5} maxWidth={560}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField label="Slug" value={slug} onChange={(ev) => setSlug(ev.target.value)} fullWidth required />
            <TextField label="Name" value={name} onChange={(ev) => setName(ev.target.value)} fullWidth required />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              select
              label="Parent (optional)"
              value={parentId}
              onChange={(ev) => setParentId(ev.target.value)}
              fullWidth
            >
              <MenuItem value="">
                <em>None (root)</em>
              </MenuItem>
              {items.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name} ({c.slug})
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Sort order" value={sortOrder} onChange={(ev) => setSortOrder(ev.target.value)} fullWidth />
          </Stack>
          <Button variant="contained" onClick={() => void createCategory()} sx={{ alignSelf: 'flex-start' }}>
            Create
          </Button>
        </Stack>
      </Box>

      <Divider />

      <Typography variant="subtitle1" fontWeight={700}>
        All categories ({items.length})
      </Typography>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Slug</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Parent</TableCell>
              <TableCell>Sort</TableCell>
              <TableCell>Active</TableCell>
              <TableCell width={120} />
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((c) => {
              const e = edit[c.id]
              const d = depthForCategory(c, items)
              const draft =
                e ??
                ({
                  slug: c.slug,
                  name: c.name,
                  parentId: c.parentId ?? '',
                  sortOrder: String(c.sortOrder ?? 0),
                  isActive: c.isActive !== false,
                } as const)
              return (
                <TableRow key={c.id}>
                  <TableCell sx={{ pl: 1 + Math.min(d, 6) * 2 }}>
                    <TextField
                      size="small"
                      value={e?.slug ?? c.slug}
                      onChange={(ev) => setEdit((m) => ({ ...m, [c.id]: { ...(m[c.id] ?? draft), slug: ev.target.value } }))}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      fullWidth
                      value={e?.name ?? c.name}
                      onChange={(ev) => setEdit((m) => ({ ...m, [c.id]: { ...(m[c.id] ?? draft), name: ev.target.value } }))}
                    />
                  </TableCell>
                  <TableCell sx={{ minWidth: 160 }}>
                    <TextField
                      select
                      size="small"
                      fullWidth
                      value={e?.parentId ?? ''}
                      onChange={(ev) =>
                        setEdit((m) => ({
                          ...m,
                          [c.id]: { ...(m[c.id] ?? draft), parentId: ev.target.value },
                        }))
                      }
                    >
                      <MenuItem value="">
                        <em>None</em>
                      </MenuItem>
                      {items
                        .filter((x) => x.id !== c.id)
                        .map((x) => (
                          <MenuItem key={x.id} value={x.id}>
                            {x.name}
                          </MenuItem>
                        ))}
                    </TextField>
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      type="number"
                      value={e?.sortOrder ?? String(c.sortOrder ?? 0)}
                      onChange={(ev) =>
                        setEdit((m) => ({
                          ...m,
                          [c.id]: { ...(m[c.id] ?? draft), sortOrder: ev.target.value },
                        }))
                      }
                      sx={{ width: 88 }}
                    />
                  </TableCell>
                  <TableCell>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={e?.isActive ?? true}
                          onChange={(ev) =>
                            setEdit((m) => ({
                              ...m,
                              [c.id]: { ...(m[c.id] ?? draft), isActive: ev.target.checked },
                            }))
                          }
                        />
                      }
                      label=""
                    />
                  </TableCell>
                  <TableCell>
                    <Button size="small" variant="outlined" onClick={() => void saveRow(c.id)}>
                      Save
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  )
}
