import { useEffect, useMemo, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import SearchIcon from '@mui/icons-material/Search'
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
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
  Tooltip,
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
  paymentPlanEligible: boolean
}

type CategoryDraft = {
  slug: string
  name: string
  parentId: string
  sortOrder: string
  isActive: boolean
  iconKey: string
  financeEligible: boolean
  paymentPlanEligible: boolean
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

function rowToDraft(c: CategoryRow): CategoryDraft {
  return {
    slug: c.slug,
    name: c.name,
    parentId: c.parentId ?? '',
    sortOrder: String(c.sortOrder ?? 0),
    isActive: c.isActive !== false,
    iconKey: c.iconKey ?? '',
    financeEligible: Boolean(c.financeEligible),
    paymentPlanEligible: Boolean(c.paymentPlanEligible),
  }
}

export function AdminCategoriesPage() {
  const [items, setItems] = useState<CategoryRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [newIconKey, setNewIconKey] = useState('')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [tableSearch, setTableSearch] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<CategoryDraft | null>(null)
  const [saving, setSaving] = useState(false)

  const editingCategory = useMemo(
    () => (editingId ? items.find((c) => c.id === editingId) ?? null : null),
    [editingId, items],
  )

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
      setItems(data.items ?? [])
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

  function openEdit(c: CategoryRow) {
    setError(null)
    setEditingId(c.id)
    setEditDraft(rowToDraft(c))
  }

  function closeEdit() {
    setEditingId(null)
    setEditDraft(null)
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

  async function saveEdit() {
    if (!editingId || !editDraft) return
    setError(null)
    setSaving(true)
    const e = editDraft
    try {
      await fetchCsrfToken()
      const res = await apiFetch(`/api/admin/categories/${editingId}`, {
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
          paymentPlanEligible: e.paymentPlanEligible,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      closeEdit()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setSaving(false)
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

  const categoryFormFields = (
    draft: CategoryDraft,
    onChange: (next: CategoryDraft) => void,
    options?: { excludeId?: string; showStatus?: boolean },
  ) => (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField
          label="Slug"
          value={draft.slug}
          onChange={(ev) => onChange({ ...draft, slug: ev.target.value })}
          fullWidth
          required
          helperText="Used in URLs"
        />
        <TextField
          label="Name"
          value={draft.name}
          onChange={(ev) => onChange({ ...draft, name: ev.target.value })}
          fullWidth
          required
        />
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField
          select
          label="Parent (optional)"
          value={draft.parentId}
          onChange={(ev) => onChange({ ...draft, parentId: ev.target.value })}
          fullWidth
        >
          <MenuItem value="">
            <em>None (root)</em>
          </MenuItem>
          {items
            .filter((c) => c.id !== options?.excludeId)
            .map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name} ({c.slug})
              </MenuItem>
            ))}
        </TextField>
        <TextField
          label="Sort order"
          type="number"
          value={draft.sortOrder}
          onChange={(ev) => onChange({ ...draft, sortOrder: ev.target.value })}
          fullWidth
          helperText="Lower numbers appear first"
        />
      </Stack>
      <TextField
        select
        label="Storefront icon (optional)"
        value={draft.iconKey}
        onChange={(ev) => onChange({ ...draft, iconKey: ev.target.value })}
        fullWidth
        helperText="Home “Shop by category” strip. Blank uses auto from slug."
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
      {options?.showStatus !== false ? (
        <Stack spacing={1.5}>
          <FormControlLabel
            control={<Switch checked={draft.isActive} onChange={(ev) => onChange({ ...draft, isActive: ev.target.checked })} />}
            label="Visible in shop"
          />
          <FormControlLabel
            control={
              <Switch
                checked={draft.financeEligible}
                onChange={(ev) => onChange({ ...draft, financeEligible: ev.target.checked })}
              />
            }
            label="NedAccess finance (N$5,000+ on product page)"
          />
          <FormControlLabel
            control={
              <Switch
                checked={draft.paymentPlanEligible}
                onChange={(ev) => onChange({ ...draft, paymentPlanEligible: ev.target.checked })}
              />
            }
            label="Payment plan / recurring (N$5,000+ at checkout)"
          />
        </Stack>
      ) : null}
    </Stack>
  )

  return (
    <Box sx={{ width: 1, minWidth: 0 }}>
      <Stack spacing={2}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          alignItems={{ sm: 'center' }}
          justifyContent="space-between"
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5" fontWeight={800}>
              Categories
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.5 }}>
              Manage shop taxonomy, visibility, finance, and payment-plan eligibility.
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setError(null)
              setCreateDialogOpen(true)
            }}
            sx={{ flexShrink: 0, fontWeight: 700, alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
          >
            Add category
          </Button>
        </Stack>

        <Alert
          severity="info"
          variant="outlined"
          sx={{ py: 0.75, '& .MuiAlert-message': { width: 1 } }}
          action={
            <Button size="small" color="inherit" onClick={() => setHelpOpen((o) => !o)} sx={{ whiteSpace: 'nowrap' }}>
              {helpOpen ? 'Less' : 'More'}
            </Button>
          }
        >
          <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
            Child categories roll up under parents in the shop. Inactive categories stay hidden from customers.
          </Typography>
          <Collapse in={helpOpen}>
            <Typography variant="body2" sx={{ mt: 1, lineHeight: 1.6 }}>
              <strong>Finance</strong> lets the NedAccess callout appear on product pages for this category and descendants when
              price is <strong>N$5,000</strong> or more. Tick a parent to cover all subcategories.
            </Typography>
          </Collapse>
        </Alert>

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
            {categoryFormFields(
              {
                slug,
                name,
                parentId,
                sortOrder,
                isActive: true,
                iconKey: newIconKey,
                financeEligible: false,
                paymentPlanEligible: false,
              },
              (next) => {
                setSlug(next.slug)
                setName(next.name)
                setParentId(next.parentId)
                setSortOrder(next.sortOrder)
                setNewIconKey(next.iconKey)
              },
              { showStatus: false },
            )}
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

        <Dialog
          open={Boolean(editingId && editDraft)}
          onClose={() => closeEdit()}
          maxWidth="sm"
          fullWidth
          scroll="paper"
          aria-labelledby="admin-edit-category-title"
        >
          <DialogTitle id="admin-edit-category-title" sx={{ pr: 6 }}>
            {editingCategory ? `Edit — ${editingCategory.name}` : 'Edit category'}
            <IconButton aria-label="Close" onClick={() => closeEdit()} sx={{ position: 'absolute', right: 8, top: 8 }}>
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers>
            {editDraft && editingId ? (
              <Stack spacing={2}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 1,
                      bgcolor: 'grey.100',
                    }}
                  >
                    {renderCategoryIcon(editDraft.iconKey.trim() || null, editingCategory?.slug ?? null)}
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                    {editingCategory
                      ? depthForCategory(editingCategory, items) === 0
                        ? 'Root category'
                        : `Level ${depthForCategory(editingCategory, items)} · under ${parentName(editingCategory.parentId, items)}`
                      : null}
                  </Typography>
                </Stack>
                {categoryFormFields(editDraft, setEditDraft, { excludeId: editingId, showStatus: true })}
              </Stack>
            ) : null}
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
            <Button onClick={() => closeEdit()} color="inherit" disabled={saving}>
              Cancel
            </Button>
            <Button variant="contained" onClick={() => void saveEdit()} disabled={saving || !editDraft} sx={{ fontWeight: 700 }}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogActions>
        </Dialog>

        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            alignItems={{ sm: 'center' }}
            justifyContent="space-between"
            sx={{ px: { xs: 2, sm: 2.5 }, py: 2, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
          >
            <Typography variant="subtitle1" fontWeight={800}>
              All categories ({items.length}
              {tableSearch.trim() ? ` · ${filteredSorted.length} shown` : ''})
            </Typography>
            <TextField
              size="small"
              placeholder="Search name or slug…"
              value={tableSearch}
              onChange={(ev) => setTableSearch(ev.target.value)}
              sx={{ width: 1, maxWidth: { sm: 320 } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              }}
            />
          </Stack>

          <TableContainer sx={{ maxHeight: 'calc(100vh - 280px)', overflow: 'auto' }}>
            <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', width: 1 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 52, fontWeight: 700, bgcolor: 'grey.100' }} />
                  <TableCell sx={{ fontWeight: 700, bgcolor: 'grey.100' }}>Category</TableCell>
                  <TableCell sx={{ width: 120, fontWeight: 700, bgcolor: 'grey.100', display: { xs: 'none', md: 'table-cell' } }}>
                    Parent
                  </TableCell>
                  <TableCell sx={{ width: 64, fontWeight: 700, bgcolor: 'grey.100' }} align="center">
                    Sort
                  </TableCell>
                  <TableCell sx={{ width: 140, fontWeight: 700, bgcolor: 'grey.100' }}>Status</TableCell>
                  <TableCell sx={{ width: 56, fontWeight: 700, bgcolor: 'grey.100' }} align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredSorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                        {items.length === 0 ? 'No categories yet. Use Add category to create one.' : 'No categories match this search.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSorted.map((c, idx) => {
                    const d = depthForCategory(c, items)
                    const active = c.isActive !== false
                    return (
                      <TableRow
                        key={c.id}
                        hover
                        sx={{
                          cursor: 'pointer',
                          bgcolor: idx % 2 === 0 ? 'background.paper' : (th) => alpha(th.palette.common.black, 0.03),
                        }}
                        onClick={() => openEdit(c)}
                      >
                        <TableCell sx={{ py: 1.25, pl: 1.5 }}>
                          <Box sx={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {renderCategoryIcon(c.iconKey?.trim() || null, c.slug)}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ py: 1.25, pl: 1 + Math.min(d, 4) }}>
                          <Typography variant="body2" fontWeight={600} noWrap title={c.name}>
                            {c.name}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            noWrap
                            title={c.slug}
                            sx={{ fontFamily: 'ui-monospace, monospace', display: 'block' }}
                          >
                            {c.slug}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: { md: 'none' }, lineHeight: 1.4 }}>
                            {d === 0 ? 'Root' : `Under ${parentName(c.parentId, items)}`}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 1.25, display: { xs: 'none', md: 'table-cell' } }}>
                          <Typography variant="body2" color="text.secondary" noWrap title={parentName(c.parentId, items)}>
                            {parentName(c.parentId, items)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center" sx={{ py: 1.25 }}>
                          <Typography variant="body2" color="text.secondary">
                            {c.sortOrder ?? 0}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ py: 1.25 }} onClick={(ev) => ev.stopPropagation()}>
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                            <Chip
                              size="small"
                              label={active ? 'Visible' : 'Hidden'}
                              color={active ? 'success' : 'default'}
                              variant={active ? 'filled' : 'outlined'}
                              sx={{ height: 22, fontSize: '0.7rem' }}
                            />
                            {c.financeEligible ? (
                              <Chip size="small" label="Finance" color="primary" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
                            ) : null}
                            {c.paymentPlanEligible ? (
                              <Chip
                                size="small"
                                label="Payment plan"
                                color="secondary"
                                variant="outlined"
                                sx={{ height: 22, fontSize: '0.7rem' }}
                              />
                            ) : null}
                          </Stack>
                        </TableCell>
                        <TableCell align="right" sx={{ py: 1.25 }} onClick={(ev) => ev.stopPropagation()}>
                          <Tooltip title="Edit category">
                            <IconButton size="small" aria-label={`Edit ${c.name}`} onClick={() => openEdit(c)}>
                              <EditOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
          Click a row or <EditOutlinedIcon sx={{ fontSize: 14, verticalAlign: 'text-bottom' }} /> to edit slug, parent, icon, and switches.
        </Typography>
      </Stack>
    </Box>
  )
}
