import { useEffect, useMemo, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import SearchIcon from '@mui/icons-material/Search'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
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
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { CATEGORY_ICON_OPTIONS, renderCategoryIcon } from '../../lib/categoryIcons'

type CategoryRow = {
  id: string
  slug: string
  name: string
  parentId: string | null
  sortOrder: number
  isActive: boolean
  iconKey: string | null
  financeEligible: boolean
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

function parentName(parentId: string | null, items: CategoryRow[]): string {
  if (!parentId) return '—'
  return items.find((x) => x.id === parentId)?.name ?? parentId.slice(0, 8)
}

export function AdminCategoriesPage() {
  const [items, setItems] = useState<CategoryRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [newIconKey, setNewIconKey] = useState('')
  const [edit, setEdit] = useState<
    Record<
      string,
      { slug: string; name: string; parentId: string; sortOrder: string; isActive: boolean; iconKey: string; financeEligible: boolean }
    >
  >({})
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [tableSearch, setTableSearch] = useState('')

  async function load() {
    setError(null)
    try {
      const res = await fetch(apiUrl('/api/admin/categories'), { credentials: 'include' })
      if (res.status === 401 || res.status === 403) {
        setError('Sign in under My account (/profile) as a user with admin or ops role.')
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
          iconKey: c.iconKey ?? '',
          financeEligible: Boolean(c.financeEligible),
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

  function closeCreateDialog() {
    setCreateDialogOpen(false)
  }

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
          ...(newIconKey.trim() ? { iconKey: newIconKey.trim() } : {}),
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      setSlug('')
      setName('')
      setParentId('')
      setSortOrder('0')
      setNewIconKey('')
      setCreateDialogOpen(false)
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
          iconKey: e.iconKey.trim() ? e.iconKey.trim() : null,
          financeEligible: e.financeEligible,
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

  const filteredSorted = useMemo(() => {
    const q = tableSearch.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q))
  }, [sorted, tableSearch])

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', width: 1 }}>
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'flex-start' }} justifyContent="space-between">
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" fontWeight={800}>
              Categories
            </Typography>
            <Typography variant="body2" color="text.secondary" maxWidth={800} sx={{ mt: 0.5, lineHeight: 1.6 }}>
              Create a flat or nested taxonomy. Child categories inherit browsing: filtering the shop by a parent category includes
              products in subcategories. Inactive categories are hidden from the public catalogue but remain editable here. Use{' '}
              <strong>Finance</strong> so the NedAccess financing callout can appear on <strong>product pages</strong> for this
              category and descendants when an item&apos;s price is <strong>N$5,000</strong> or more (eligibility walks up to the
              root — tick a parent to cover all descendants).
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setError(null)
              setCreateDialogOpen(true)
            }}
            sx={{ flexShrink: 0, fontWeight: 700, alignSelf: { xs: 'stretch', sm: 'center' } }}
          >
            Add category
          </Button>
        </Stack>
        {error ? <Alert severity="warning">{error}</Alert> : null}

        <Dialog
          open={createDialogOpen}
          onClose={() => closeCreateDialog()}
          maxWidth="sm"
          fullWidth
          scroll="paper"
          aria-labelledby="admin-create-category-title"
        >
          <DialogTitle id="admin-create-category-title" sx={{ pr: 6 }}>
            New category
            <IconButton aria-label="Close" onClick={() => closeCreateDialog()} sx={{ position: 'absolute', right: 8, top: 8 }}>
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
                Slugs are used in URLs. Parent is optional — leave as root for a top-level category.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField label="Slug" value={slug} onChange={(ev) => setSlug(ev.target.value)} fullWidth required />
                <TextField label="Name" value={name} onChange={(ev) => setName(ev.target.value)} fullWidth required />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField select label="Parent (optional)" value={parentId} onChange={(ev) => setParentId(ev.target.value)} fullWidth>
                  <MenuItem value="">
                    <em>None (root)</em>
                  </MenuItem>
                  {items.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name} ({c.slug})
                    </MenuItem>
                  ))}
                </TextField>
                <TextField label="Sort order" value={sortOrder} onChange={(ev) => setSortOrder(ev.target.value)} fullWidth helperText="Lower sorts first." />
              </Stack>
              <TextField
                select
                label="Storefront icon (optional)"
                value={newIconKey}
                onChange={(ev) => setNewIconKey(ev.target.value)}
                fullWidth
                helperText="Shown on the home “Shop by category” strip. Leave blank for auto from slug."
              >
                <MenuItem value="">
                  <em>Default (from slug)</em>
                </MenuItem>
                {CATEGORY_ICON_OPTIONS.map((o) => (
                  <MenuItem key={o.key} value={o.key}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Box sx={{ width: 36, display: 'flex', justifyContent: 'center' }}>{renderCategoryIcon(o.key, null)}</Box>
                      <span>{o.label}</span>
                    </Stack>
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
            <Button onClick={() => closeCreateDialog()} color="inherit">
              Cancel
            </Button>
            <Button variant="contained" onClick={() => void createCategory()} sx={{ fontWeight: 700 }}>
              Create category
            </Button>
          </DialogActions>
        </Dialog>

        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mb: 2 }}>
            <Typography variant="h6" fontWeight={800} sx={{ lineHeight: 1.3 }}>
              All categories ({items.length}
              {tableSearch.trim() ? ` · ${filteredSorted.length} match${filteredSorted.length === 1 ? '' : 'es'}` : ''})
            </Typography>
            <TextField
              size="small"
              placeholder="Search name or slug…"
              value={tableSearch}
              onChange={(ev) => setTableSearch(ev.target.value)}
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
            <Table stickyHeader size="medium" sx={{ minWidth: 980, '& .MuiTableCell-root': { verticalAlign: 'middle' } }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 56, fontWeight: 800, bgcolor: 'grey.100', fontSize: '0.875rem' }} />
                  <TableCell sx={{ fontWeight: 800, bgcolor: 'grey.100', fontSize: '0.875rem', minWidth: 200 }}>Slug</TableCell>
                  <TableCell sx={{ fontWeight: 800, bgcolor: 'grey.100', fontSize: '0.875rem', minWidth: 180 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 800, bgcolor: 'grey.100', fontSize: '0.875rem', minWidth: 160 }}>Parent</TableCell>
                  <TableCell sx={{ fontWeight: 800, bgcolor: 'grey.100', fontSize: '0.875rem', width: 100 }}>Sort</TableCell>
                  <TableCell sx={{ fontWeight: 800, bgcolor: 'grey.100', fontSize: '0.875rem', width: 100 }}>Active</TableCell>
                  <TableCell sx={{ fontWeight: 800, bgcolor: 'grey.100', fontSize: '0.875rem', width: 120 }}>Finance</TableCell>
                  <TableCell sx={{ fontWeight: 800, bgcolor: 'grey.100', fontSize: '0.875rem', minWidth: 220 }}>Icon</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, bgcolor: 'grey.100', fontSize: '0.875rem', width: 100 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredSorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <Typography variant="body1" color="text.secondary" sx={{ py: 3, lineHeight: 1.6 }}>
                        {items.length === 0 ? 'No categories yet. Use Add category to create one.' : 'No categories match this search.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSorted.map((c, idx) => {
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
                        iconKey: c.iconKey ?? '',
                        financeEligible: Boolean(c.financeEligible),
                      } as const)
                    return (
                      <TableRow
                        key={c.id}
                        hover
                        sx={{
                          bgcolor: idx % 2 === 0 ? 'background.paper' : (th) => alpha(th.palette.common.black, 0.03),
                        }}
                      >
                        <TableCell sx={{ py: 2 }}>
                          <Box sx={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {renderCategoryIcon((e?.iconKey ?? c.iconKey)?.trim() || null, c.slug)}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ py: 2, pl: 1 + Math.min(d, 6) * 2 }}>
                          <TextField
                            size="small"
                            fullWidth
                            label="Slug"
                            value={e?.slug ?? c.slug}
                            onChange={(ev) => setEdit((m) => ({ ...m, [c.id]: { ...(m[c.id] ?? draft), slug: ev.target.value } }))}
                            sx={{ '& .MuiInputBase-input': { fontFamily: 'ui-monospace, monospace', fontSize: '0.875rem' } }}
                          />
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.5 }}>
                            {d === 0 ? 'Root category' : `Level ${d} · under ${parentName(c.parentId, items)}`}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 2 }}>
                          <TextField
                            size="small"
                            fullWidth
                            label="Name"
                            value={e?.name ?? c.name}
                            onChange={(ev) => setEdit((m) => ({ ...m, [c.id]: { ...(m[c.id] ?? draft), name: ev.target.value } }))}
                          />
                        </TableCell>
                        <TableCell sx={{ py: 2, minWidth: 160 }}>
                          <TextField
                            select
                            size="small"
                            fullWidth
                            label="Parent"
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
                        <TableCell sx={{ py: 2 }}>
                          <TextField
                            size="small"
                            type="number"
                            label="Order"
                            value={e?.sortOrder ?? String(c.sortOrder ?? 0)}
                            onChange={(ev) =>
                              setEdit((m) => ({
                                ...m,
                                [c.id]: { ...(m[c.id] ?? draft), sortOrder: ev.target.value },
                              }))
                            }
                            sx={{ width: 96 }}
                          />
                        </TableCell>
                        <TableCell sx={{ py: 2 }}>
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
                            label={<Typography variant="body2">Visible</Typography>}
                          />
                        </TableCell>
                        <TableCell sx={{ py: 2 }}>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={e?.financeEligible ?? Boolean(c.financeEligible)}
                                onChange={(ev) =>
                                  setEdit((m) => ({
                                    ...m,
                                    [c.id]: { ...(m[c.id] ?? draft), financeEligible: ev.target.checked },
                                  }))
                                }
                              />
                            }
                            label={<Typography variant="body2">Eligible</Typography>}
                          />
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', maxWidth: 110, lineHeight: 1.35 }}>
                            Financing
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 2 }}>
                          <TextField
                            select
                            size="small"
                            fullWidth
                            label="Icon preset"
                            value={e?.iconKey ?? ''}
                            onChange={(ev) =>
                              setEdit((m) => ({
                                ...m,
                                [c.id]: { ...(m[c.id] ?? draft), iconKey: ev.target.value },
                              }))
                            }
                          >
                            <MenuItem value="">
                              <em>Default</em>
                            </MenuItem>
                            {CATEGORY_ICON_OPTIONS.map((o) => (
                              <MenuItem key={o.key} value={o.key}>
                                {o.label}
                              </MenuItem>
                            ))}
                          </TextField>
                        </TableCell>
                        <TableCell align="right" sx={{ py: 2 }}>
                          <Button size="medium" variant="contained" onClick={() => void saveRow(c.id)} sx={{ fontWeight: 700, minWidth: 88 }}>
                            Save
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Stack>
    </Box>
  )
}
