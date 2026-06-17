import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
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
import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined'
import SearchIcon from '@mui/icons-material/Search'
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined'
import { apiFetch, fetchCsrfToken, readResponseJson } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { useAuthMe } from '../../hooks/useAuthMe'

export type AdminCatalogStoreDto = {
  payTodayMerchantId: number
  name: string
  addressLine1: string | null
  addressLine2: string | null
  town: string | null
  zipcode: string | null
  country: string | null
  contactNumber: string | null
  businessEmailAddress: string | null
  description: string | null
  slug: string | null
  businessActive: boolean
  productTotal: number
  productActive: number
  categorySummary: string | null
  addressSummary: string
  hasBusinessRow: boolean
}

type StoreDetailDto = AdminCatalogStoreDto & {
  products: { slug: string; name: string; isActive: boolean; categorySlug: string | null }[]
}

type EditDraft = {
  name: string
  addressLine1: string
  addressLine2: string
  town: string
  zipcode: string
  contactNumber: string
  businessEmailAddress: string
  description: string
}

function parseCategoryList(summary: string | null): string[] {
  if (!summary?.trim()) return []
  return [...new Set(summary.split(',').map((s) => s.trim()).filter(Boolean))].sort()
}

function draftFromStore(s: AdminCatalogStoreDto): EditDraft {
  return {
    name: s.name,
    addressLine1: s.addressLine1 ?? '',
    addressLine2: s.addressLine2 ?? '',
    town: s.town ?? '',
    zipcode: s.zipcode ?? '',
    contactNumber: s.contactNumber ?? '',
    businessEmailAddress: s.businessEmailAddress ?? '',
    description: s.description ?? '',
  }
}

function StoreCategoriesDropdown({ merchantId, summary }: { merchantId: number; summary: string | null }) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null)
  const categories = parseCategoryList(summary)
  if (categories.length === 0) {
    return (
      <Typography variant="caption" color="text.disabled">
        —
      </Typography>
    )
  }
  const label = categories.length === 1 ? '1 category' : `${categories.length} categories`
  return (
    <>
      <Button
        size="small"
        variant="outlined"
        onClick={(e) => setAnchor(e.currentTarget)}
        endIcon={<ExpandMoreIcon sx={{ fontSize: '1rem !important' }} />}
        sx={{
          width: '100%',
          maxWidth: 168,
          justifyContent: 'space-between',
          textTransform: 'none',
          fontSize: '0.75rem',
          py: 0.35,
          px: 1,
        }}
      >
        {label}
      </Button>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { maxHeight: 280, minWidth: 160 } } }}
      >
        {categories.map((slug) => (
          <MenuItem key={`${merchantId}-${slug}`} dense disabled sx={{ opacity: '1 !important', fontSize: '0.8rem' }}>
            {slug}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

export function AdminStoresPage() {
  const { user: authUser } = useAuthMe()
  const [items, setItems] = useState<AdminCatalogStoreDto[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tableSearch, setTableSearch] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [detail, setDetail] = useState<StoreDetailDto | null>(null)
  const [saving, setSaving] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(apiUrl('/api/admin/stores'), { credentials: 'include' })
      const data = await readResponseJson<{ items?: AdminCatalogStoreDto[]; error?: string }>(res)
      if (!res.ok) throw new Error(data.error ?? 'Failed to load stores')
      setItems(data.items ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stores')
      setItems([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = tableSearch.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        String(s.payTodayMerchantId).includes(q) ||
        (s.addressSummary ?? '').toLowerCase().includes(q) ||
        (s.categorySummary ?? '').toLowerCase().includes(q),
    )
  }, [items, tableSearch])

  const editingStore = editingId != null ? items.find((s) => s.payTodayMerchantId === editingId) : null
  const editCategories = parseCategoryList(editingStore?.categorySummary ?? detail?.categorySummary ?? null)

  async function openEdit(store: AdminCatalogStoreDto) {
    setEditingId(store.payTodayMerchantId)
    setEditDraft(draftFromStore(store))
    setDetail(null)
    setDetailLoading(true)
    try {
      const res = await fetch(apiUrl(`/api/admin/stores/${store.payTodayMerchantId}`), { credentials: 'include' })
      const data = await readResponseJson<{ store?: StoreDetailDto; error?: string }>(res)
      if (!res.ok) throw new Error(data.error ?? 'Failed to load store detail')
      setDetail(data.store ?? null)
      if (data.store) setEditDraft(draftFromStore(data.store))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load store detail')
    } finally {
      setDetailLoading(false)
    }
  }

  function closeEdit() {
    setEditingId(null)
    setEditDraft(null)
    setDetail(null)
  }

  async function saveEdit() {
    if (editingId == null || !editDraft) return
    setSaving(true)
    setError(null)
    try {
      await fetchCsrfToken()
      const res = await apiFetch(`/api/admin/stores/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editDraft.name,
          addressLine1: editDraft.addressLine1.trim() || null,
          addressLine2: editDraft.addressLine2.trim() || null,
          town: editDraft.town.trim() || null,
          zipcode: editDraft.zipcode.trim() || null,
          contactNumber: editDraft.contactNumber.trim() || null,
          businessEmailAddress: editDraft.businessEmailAddress.trim() || null,
          description: editDraft.description.trim() || null,
        }),
      })
      const data = await readResponseJson<{ ok?: boolean; store?: AdminCatalogStoreDto; error?: string }>(res)
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      closeEdit()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: { xs: 'auto', md: 'calc(100vh - 64px)' },
        minHeight: 0,
        p: { xs: 1.5, sm: 2 },
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexShrink: 0 }}>
        <StorefrontOutlinedIcon color="primary" sx={{ fontSize: 26 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" fontWeight={800} noWrap>
            Pickup stores
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" noWrap title="Merchants with catalogue products — checkout store pickup">
            Catalogue merchants · names & addresses for checkout pickup
          </Typography>
        </Box>
      </Stack>

      {(authUser?.role === 'admin' || authUser?.role === 'fulfillment') && (authUser.merchants?.length ?? 0) > 0 ? (
        <Alert severity="info" sx={{ mb: 1, py: 0.25, borderRadius: 1.5, flexShrink: 0 }} icon={false}>
          <Typography variant="caption">
            Scoped to: <strong>{authUser.merchants!.map((m) => m.name).join(', ')}</strong>
          </Typography>
        </Alert>
      ) : null}

      {error ? (
        <Alert severity="error" sx={{ mb: 1, borderRadius: 1.5, flexShrink: 0 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      <Dialog open={Boolean(editingId && editDraft)} onClose={closeEdit} maxWidth="sm" fullWidth scroll="paper">
        <DialogTitle sx={{ pr: 6, py: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={800} noWrap>
            {editingStore ? editingStore.name : 'Edit store'}
          </Typography>
          <IconButton aria-label="Close" onClick={closeEdit} size="small" sx={{ position: 'absolute', right: 8, top: 8 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ py: 1.5 }}>
          {editDraft ? (
            <Stack spacing={1.25}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField label="Merchant ID" value={editingId ?? ''} disabled size="small" sx={{ width: { sm: 120 } }} />
                <TextField
                  label="Store name"
                  value={editDraft.name}
                  onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                  fullWidth
                  size="small"
                  required
                />
              </Stack>
              <TextField
                label="Address line 1"
                value={editDraft.addressLine1}
                onChange={(e) => setEditDraft({ ...editDraft, addressLine1: e.target.value })}
                fullWidth
                size="small"
              />
              <TextField
                label="Address line 2"
                value={editDraft.addressLine2}
                onChange={(e) => setEditDraft({ ...editDraft, addressLine2: e.target.value })}
                fullWidth
                size="small"
              />
              <Stack direction="row" spacing={1}>
                <TextField
                  label="Town"
                  value={editDraft.town}
                  onChange={(e) => setEditDraft({ ...editDraft, town: e.target.value })}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="Postal"
                  value={editDraft.zipcode}
                  onChange={(e) => setEditDraft({ ...editDraft, zipcode: e.target.value })}
                  sx={{ width: 120 }}
                  size="small"
                />
              </Stack>
              <Stack direction="row" spacing={1}>
                <TextField
                  label="Phone"
                  value={editDraft.contactNumber}
                  onChange={(e) => setEditDraft({ ...editDraft, contactNumber: e.target.value })}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="Email"
                  value={editDraft.businessEmailAddress}
                  onChange={(e) => setEditDraft({ ...editDraft, businessEmailAddress: e.target.value })}
                  fullWidth
                  size="small"
                />
              </Stack>
              <TextField
                label="Pickup notes"
                value={editDraft.description}
                onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                fullWidth
                size="small"
                multiline
                minRows={2}
              />
              {editCategories.length > 0 ? (
                <FormControl size="small" fullWidth>
                  <InputLabel shrink>Categories on site</InputLabel>
                  <Select label="Categories on site" value="" displayEmpty renderValue={() => `${editCategories.length} categories`}>
                    {editCategories.map((slug) => (
                      <MenuItem key={slug} value={slug} dense>
                        {slug}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : null}
              {editingStore && !editingStore.hasBusinessRow ? (
                <Alert severity="warning" sx={{ py: 0, borderRadius: 1.5 }}>
                  <Typography variant="caption">No business row — seed merchant before saving.</Typography>
                </Alert>
              ) : null}
              {detailLoading ? (
                <Typography variant="caption" color="text.secondary">
                  Loading products…
                </Typography>
              ) : detail?.products.length ? (
                <Accordion disableGutters elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, '&:before': { display: 'none' } }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
                    <Typography variant="body2" fontWeight={600}>
                      Products ({detail.products.length})
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0, maxHeight: 140, overflow: 'auto' }}>
                    <Box component="ul" sx={{ m: 0, pl: 2, fontSize: '0.8rem' }}>
                      {detail.products.map((p) => (
                        <Typography component="li" variant="caption" key={p.slug} display="block" sx={{ mb: 0.25 }}>
                          {p.name}
                          {!p.isActive ? ' · inactive' : ''}
                          {p.categorySlug ? ` · ${p.categorySlug}` : ''}
                        </Typography>
                      ))}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              ) : null}
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1, gap: 0.5 }}>
          {editingId != null ? (
            <Button
              component={RouterLink}
              to={`/admin/store-hours?merchant=${editingId}`}
              variant="outlined"
              size="small"
              onClick={closeEdit}
            >
              Hours
            </Button>
          ) : null}
          <Box sx={{ flex: 1 }} />
          <Button onClick={closeEdit} color="inherit" size="small" disabled={saving}>
            Cancel
          </Button>
          <Button variant="contained" size="small" onClick={() => void saveEdit()} disabled={saving || !editDraft}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Paper
        variant="outlined"
        sx={{
          borderRadius: 1.5,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
        >
          <Typography variant="body2" fontWeight={700} sx={{ whiteSpace: 'nowrap' }}>
            {items.length} store{items.length === 1 ? '' : 's'}
            {tableSearch.trim() ? ` · ${filtered.length} shown` : ''}
          </Typography>
          <TextField
            size="small"
            placeholder="Search…"
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            sx={{ flex: 1, minWidth: 0, maxWidth: 320 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18 }} color="action" />
                </InputAdornment>
              ),
            }}
          />
        </Stack>

        <TableContainer sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, bgcolor: 'grey.100', width: '7%' }}>ID</TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: 'grey.100', width: '38%' }}>Store & pickup address</TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: 'grey.100', width: '9%' }} align="center">
                  Products
                </TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: 'grey.100', width: '18%' }}>Categories</TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: 'grey.100', width: '14%' }} align="right">
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                      {items.length === 0
                        ? 'No stores with products yet.'
                        : 'No stores match this search.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((s) => (
                  <TableRow key={s.payTodayMerchantId} hover sx={{ '& td': { py: 0.75, verticalAlign: 'top' } }}>
                    <TableCell sx={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem' }}>
                      {s.payTodayMerchantId}
                    </TableCell>
                    <TableCell sx={{ overflow: 'hidden' }}>
                      <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.3 }} noWrap title={s.name}>
                        {s.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          lineHeight: 1.35,
                        }}
                        title={s.addressSummary}
                      >
                        {s.addressSummary}
                      </Typography>
                      {!s.hasBusinessRow ? (
                        <Chip label="No business row" size="small" color="warning" variant="outlined" sx={{ mt: 0.35, height: 18, fontSize: '0.65rem' }} />
                      ) : null}
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.8rem' }}>
                        {s.productActive}/{s.productTotal}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <StoreCategoriesDropdown merchantId={s.payTodayMerchantId} summary={s.categorySummary} />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.25} justifyContent="flex-end" alignItems="center">
                        <Button size="small" variant="outlined" onClick={() => void openEdit(s)} sx={{ minWidth: 0, px: 1, fontSize: '0.75rem' }}>
                          Edit
                        </Button>
                        <Tooltip title="Store hours">
                          <IconButton
                            size="small"
                            component={RouterLink}
                            to={`/admin/store-hours?merchant=${s.payTodayMerchantId}`}
                            aria-label="Store hours"
                          >
                            <ScheduleOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  )
}
