import { useCallback, useEffect, useMemo, useState } from 'react'
import CloseIcon from '@mui/icons-material/Close'
import MailOutlineIcon from '@mui/icons-material/MailOutline'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined'
import SearchIcon from '@mui/icons-material/Search'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
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
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { apiFetch, fetchCsrfToken, readResponseJson } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { formatMoney } from '../../lib/money'
import { useAuthMe } from '../../hooks/useAuthMe'

type OrderRow = {
  orderId: string
  status: string
  total_cents: number
  currency: string
  created_at: string
  delivery_method: string
  guest_email: string | null
  user_id: string | null
  customer_email: string | null
  dispute_count: number
  dispute_active_count: number
}

type OrderDetailLine = {
  variantId: string
  variantName: string | null
  quantity: number
  unitPriceCents: number
  sku: string
  productName: string
}

type OrderDetailOrder = {
  orderId: string
  status: string
  subtotal_cents: number
  shipping_cents: number
  tax_cents: number
  total_cents: number
  currency: string
  delivery_method: string
  guest_email: string | null
  user_id: string | null
  created_at: string
  deposit_location_name: string | null
}

type OrderDetailFulfillment = {
  stage: string
  carrier_name: string | null
  tracking_reference: string | null
  yango_tracking_url: string | null
} | null

type OrderDetailDispute = {
  disputeId: string
  status: string
  reason: string
  description: string | null
  admin_resolution_note: string | null
  created_at: string
  updated_at: string
  variant_id: string | null
  variant_sku: string | null
  product_name: string | null
}

type OrderDetailResponse = {
  order: OrderDetailOrder
  lines: OrderDetailLine[]
  fulfillment: OrderDetailFulfillment
  disputes?: OrderDetailDispute[]
}

const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'paid', label: 'Paid' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'refunded', label: 'Refunded' },
]

function customerLabel(r: OrderRow): string {
  const e = (r.customer_email ?? '').trim() || (r.guest_email ?? '').trim()
  if (e) return e
  if (r.user_id) return `Account ${r.user_id.slice(0, 8)}…`
  return '—'
}

function customerInitial(r: OrderRow): string {
  const label = customerLabel(r)
  return label === '—' ? '?' : label.trim().slice(0, 1).toUpperCase()
}

function statusChipSx(status: string): Record<string, unknown> {
  const s = status.toLowerCase()
  if (s === 'paid') return { bgcolor: 'warning.light', color: 'warning.contrastText' }
  if (s === 'delivered') return { bgcolor: 'success.light', color: 'success.dark' }
  if (s === 'shipped') return { bgcolor: 'info.light', color: 'info.dark' }
  if (s === 'cancelled' || s === 'refunded') return { bgcolor: 'action.selected', color: 'text.primary' }
  if (s === 'processing') return { bgcolor: 'primary.light', color: 'primary.contrastText' }
  return { bgcolor: 'grey.300', color: 'text.primary' }
}

function lineAccent(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const hue = h % 360
  return `linear-gradient(160deg, hsl(${hue}, 55%, 48%) 0%, hsl(${(hue + 45) % 360}, 58%, 38%) 100%)`
}

function formatOrderDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function disputeLineLabel(lines: OrderDetailLine[], variantId: string | null): string {
  if (!variantId?.trim()) return 'Whole order'
  const line = lines.find((l) => l.variantId === variantId)
  if (!line) return 'Item not on order lines'
  const title = `${line.productName}${line.variantName ? ` — ${line.variantName}` : ''}`
  return `${title} · SKU ${line.sku}`
}

function disputeAlertSeverity(status: string): 'success' | 'info' | 'warning' {
  if (status === 'resolved') return 'success'
  if (status === 'dismissed') return 'info'
  return 'warning'
}

function parseNadToCents(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t.replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

export function AdminOrdersPage() {
  const theme = useTheme()
  const isMdUp = useMediaQuery(theme.breakpoints.up('md'))
  const { user: authUser } = useAuthMe()
  const [searchParams, setSearchParams] = useSearchParams()

  const [rawItems, setRawItems] = useState<OrderRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [priceMinNad, setPriceMinNad] = useState('')
  const [priceMaxNad, setPriceMaxNad] = useState('')
  const [sortNewestFirst, setSortNewestFirst] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [detailNonce, setDetailNonce] = useState(0)
  const [detail, setDetail] = useState<OrderDetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailErr, setDetailErr] = useState<string | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null)
  const [menuOrderId, setMenuOrderId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setErr(null)
    setLoading(true)
    try {
      const q = statusFilter.trim() ? `?status=${encodeURIComponent(statusFilter.trim())}` : ''
      const res = await fetch(apiUrl(`/api/admin/orders${q}`), { credentials: 'include' })
      if (res.status === 401 || res.status === 403) {
        setErr('Admin or ops sign-in required.')
        setRawItems([])
        return
      }
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as { items: (OrderRow & { dispute_count?: unknown; dispute_active_count?: unknown })[] }
      const items = (data.items ?? []).map((r) => ({
        ...r,
        created_at: typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at as unknown as Date).toISOString(),
        dispute_count: Number(r.dispute_count ?? 0),
        dispute_active_count: Number(r.dispute_active_count ?? 0),
      }))
      setRawItems(items)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
      setRawItems([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const raw = searchParams.get('orderId')?.trim()
    if (!raw) return
    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
    if (!uuidLike) return
    setSelectedOrderId(raw)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('orderId')
        return next
      },
      { replace: true },
    )
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (!selectedOrderId) {
      setDetail(null)
      setDetailErr(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    setDetailErr(null)
    void (async () => {
      try {
        const res = await fetch(apiUrl(`/api/orders/${encodeURIComponent(selectedOrderId)}`), { credentials: 'include' })
        const data = await readResponseJson<OrderDetailResponse>(res)
        if (cancelled) return
        if (!res.ok) {
          const msg = (data as { error?: string }).error ?? `Failed (${res.status})`
          setDetail(null)
          setDetailErr(msg)
          return
        }
        setDetail(data)
      } catch (e) {
        if (!cancelled) {
          setDetail(null)
          setDetailErr(e instanceof Error ? e.message : 'Failed to load order')
        }
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedOrderId, detailNonce])

  const filteredSorted = useMemo(() => {
    const minC = parseNadToCents(priceMinNad)
    const maxC = parseNadToCents(priceMaxNad)
    let rows = [...rawItems]
    if (minC != null) rows = rows.filter((r) => r.total_cents >= minC)
    if (maxC != null) rows = rows.filter((r) => r.total_cents <= maxC)
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter((r) => {
        if (r.orderId.toLowerCase().includes(q)) return true
        if (customerLabel(r).toLowerCase().includes(q)) return true
        return false
      })
    }
    rows.sort((a, b) => {
      const ta = new Date(a.created_at).getTime()
      const tb = new Date(b.created_at).getTime()
      return sortNewestFirst ? tb - ta : ta - tb
    })
    return rows
  }, [rawItems, priceMinNad, priceMaxNad, search, sortNewestFirst])

  async function cancelOrder(id: string) {
    try {
      await fetchCsrfToken()
      const res = await apiFetch(`/api/admin/orders/${id}/cancel`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      await load()
      if (selectedOrderId === id) setDetailNonce((n) => n + 1)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Cancel failed')
    }
  }

  async function refundOrder(id: string) {
    try {
      await fetchCsrfToken()
      const res = await apiFetch(`/api/admin/orders/${id}/refund`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      await load()
      if (selectedOrderId === id) setDetailNonce((n) => n + 1)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Refund failed')
    }
  }

  const menuRow = menuOrderId ? rawItems.find((r) => r.orderId === menuOrderId) : null
  const canCancel = menuRow && !['shipped', 'delivered', 'cancelled', 'refunded'].includes(menuRow.status)

  const detailCustomerEmail =
    detail?.order?.guest_email?.trim() ||
    (rawItems.find((r) => r.orderId === selectedOrderId)?.customer_email ?? '').trim() ||
    ''

  const detailPanelInner = (
    <>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={700}>
            Order
          </Typography>
          <Typography variant="h6" fontWeight={800}>
            #{selectedOrderId?.slice(0, 8).toUpperCase()}
          </Typography>
          {detail?.order ? (
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
              <Chip size="small" label={detail.order.status} sx={{ fontWeight: 700, borderRadius: 2, ...statusChipSx(detail.order.status) }} />
              <Typography variant="caption" color="text.secondary">
                {formatOrderDate(detail.order.created_at)}
              </Typography>
            </Stack>
          ) : null}
        </Box>
        <IconButton aria-label="Close details" onClick={() => setSelectedOrderId(null)} sx={{ display: { md: 'none' } }}>
          <CloseIcon />
        </IconButton>
      </Stack>

      {detailLoading ? (
        <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={32} />
        </Box>
      ) : detailErr ? (
        <Typography color="error">{detailErr}</Typography>
      ) : detail?.order ? (
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar sx={{ width: 56, height: 56, fontSize: '1.25rem', fontWeight: 800 }}>
              {detailCustomerEmail ? detailCustomerEmail.slice(0, 1).toUpperCase() : '?'}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography fontWeight={800} noWrap>
                {detailCustomerEmail || 'Customer'}
              </Typography>
              {detail.order.deposit_location_name ? (
                <Typography variant="caption" color="text.secondary" display="block">
                  {detail.order.deposit_location_name}
                </Typography>
              ) : null}
            </Box>
            {detailCustomerEmail ? (
              <IconButton component="a" href={`mailto:${encodeURIComponent(detailCustomerEmail)}`} aria-label="Email customer" size="small">
                <MailOutlineIcon fontSize="small" />
              </IconButton>
            ) : null}
            <IconButton aria-label="Phone" size="small" disabled>
              <PhoneOutlinedIcon fontSize="small" />
            </IconButton>
          </Stack>

          <Typography variant="subtitle2" fontWeight={800}>
            Items
          </Typography>
          <Stack spacing={1.5}>
            {detail.lines.map((line) => {
              const title = `${line.productName}${line.variantName ? ` — ${line.variantName}` : ''}`
              const lineTotal = line.unitPriceCents * line.quantity
              return (
                <Stack key={line.variantId} direction="row" spacing={1.5} alignItems="center">
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 2,
                      flexShrink: 0,
                      background: lineAccent(line.productName),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'common.white',
                      fontWeight: 800,
                      fontSize: 18,
                    }}
                  >
                    {line.productName.trim().slice(0, 1).toUpperCase()}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.3 }}>
                      {title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      ×{line.quantity} · {formatMoney(line.unitPriceCents, detail.order.currency)}
                    </Typography>
                  </Box>
                  <Typography variant="body2" fontWeight={800}>
                    {formatMoney(lineTotal, detail.order.currency)}
                  </Typography>
                </Stack>
              )
            })}
          </Stack>

          {detail.disputes && detail.disputes.length > 0 ? (
            <>
              <Typography variant="subtitle2" fontWeight={800}>
                Disputes
              </Typography>
              <Stack spacing={1.5}>
                {detail.disputes.map((d) => (
                  <Alert key={d.disputeId} severity={disputeAlertSeverity(d.status)} sx={{ alignItems: 'flex-start' }}>
                    <Typography variant="caption" display="block" color="text.secondary" fontWeight={700}>
                      {d.status} · {formatOrderDate(typeof d.created_at === 'string' ? d.created_at : String(d.created_at))}
                    </Typography>
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.25 }}>
                      {disputeLineLabel(detail.lines, d.variant_id)}
                    </Typography>
                    <Typography variant="body2" fontWeight={700} sx={{ mt: 0.5 }}>
                      {d.reason}
                    </Typography>
                    {d.description ? (
                      <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                        {d.description}
                      </Typography>
                    ) : null}
                    {d.admin_resolution_note ? (
                      <Typography variant="body2" sx={{ mt: 1 }}>
                        <strong>Customer message:</strong> {d.admin_resolution_note}
                      </Typography>
                    ) : null}
                    <Button
                      component={RouterLink}
                      to={`/admin/disputes?disputeId=${encodeURIComponent(d.disputeId)}`}
                      size="small"
                      variant="outlined"
                      sx={{ mt: 1.5, fontWeight: 700 }}
                    >
                      Open in disputes queue
                    </Button>
                  </Alert>
                ))}
              </Stack>
            </>
          ) : null}

          {detail.fulfillment?.yango_tracking_url ? (
            <Button href={detail.fulfillment.yango_tracking_url} target="_blank" rel="noopener noreferrer" size="small" variant="outlined">
              Tracking link
            </Button>
          ) : null}

          <Divider />

          <Stack direction="row" justifyContent="space-between" alignItems="baseline">
            <Typography variant="h6" fontWeight={900}>
              Total
            </Typography>
            <Typography variant="h6" fontWeight={900}>
              {formatMoney(detail.order.total_cents, detail.order.currency)}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1.5}>
            <Button
              component={RouterLink}
              to={`/orders/${detail.order.orderId}`}
              variant="contained"
              color="inherit"
              startIcon={<VisibilityOutlinedIcon />}
              fullWidth
              sx={{ fontWeight: 800, borderRadius: 2, py: 1.25 }}
            >
              Track
            </Button>
            <Button
              variant="contained"
              color="warning"
              fullWidth
              sx={{ fontWeight: 800, borderRadius: 2, py: 1.25 }}
              onClick={() => void refundOrder(detail.order.orderId)}
            >
              Refund
            </Button>
          </Stack>
          {['shipped', 'delivered', 'cancelled', 'refunded'].includes(detail.order.status) ? null : (
            <Button variant="outlined" color="error" fullWidth onClick={() => void cancelOrder(detail.order.orderId)} sx={{ fontWeight: 700 }}>
              Cancel order
            </Button>
          )}
        </Stack>
      ) : (
        <Typography color="text.secondary">Select an order from the list.</Typography>
      )}
    </>
  )

  return (
    <Box sx={{ bgcolor: '#f6f4ef', minHeight: 'calc(100dvh - 96px)', mx: { xs: -2, sm: -3 }, mt: { xs: -2, sm: -3 }, p: { xs: 2, sm: 3 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="stretch" sx={{ maxWidth: 1400, mx: 'auto' }}>
        <Paper
          elevation={0}
          sx={{
            flex: 1,
            minWidth: 0,
            borderRadius: 3,
            border: 1,
            borderColor: 'divider',
            boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
            p: { xs: 2, sm: 2.5 },
          }}
        >
          <Stack spacing={2.5}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
              <Typography variant="h4" fontWeight={800} letterSpacing={-0.5}>
                Orders
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <IconButton size="small" aria-label="Search" color="inherit">
                  <SearchIcon fontSize="small" />
                </IconButton>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ pl: 1 }}>
                  <Avatar sx={{ width: 36, height: 36, fontSize: 14 }}>{(authUser?.email ?? '?').slice(0, 1).toUpperCase()}</Avatar>
                  <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                    <Typography variant="body2" fontWeight={700} lineHeight={1.2}>
                      {authUser?.email?.split('@')[0] ?? 'Admin'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 180, display: 'block' }}>
                      {authUser?.email ?? ''}
                    </Typography>
                  </Box>
                </Stack>
              </Stack>
            </Stack>

            {err && (
              <Typography color="error" variant="body2">
                {err}
              </Typography>
            )}

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} flexWrap="wrap" alignItems={{ md: 'center' }}>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel id="status-filter">Status</InputLabel>
                <Select
                  labelId="status-filter"
                  label="Status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(String(e.target.value))}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <MenuItem key={o.value || 'any'} value={o.value}>
                      {o.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="Min total (NAD)"
                value={priceMinNad}
                onChange={(e) => setPriceMinNad(e.target.value)}
                sx={{ width: { xs: 1, md: 130 } }}
              />
              <TextField
                size="small"
                label="Max total (NAD)"
                value={priceMaxNad}
                onChange={(e) => setPriceMaxNad(e.target.value)}
                sx={{ width: { xs: 1, md: 130 } }}
              />
              <FormControl size="small" sx={{ minWidth: 160, ml: { md: 'auto' } }}>
                <InputLabel id="sort-date">Sort</InputLabel>
                <Select
                  labelId="sort-date"
                  label="Sort"
                  value={sortNewestFirst ? 'new' : 'old'}
                  onChange={(e) => setSortNewestFirst(e.target.value === 'new')}
                >
                  <MenuItem value="new">Newest first</MenuItem>
                  <MenuItem value="old">Oldest first</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            <TextField
              size="small"
              placeholder="Search order ID or customer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              }}
              fullWidth
            />

            <TableContainer sx={{ borderRadius: 2, border: 1, borderColor: 'divider' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 800, bgcolor: 'grey.100' } }}>
                    <TableCell>Order</TableCell>
                    <TableCell>Customer</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="center">Disputes</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell align="right" width={48}>
                      {' '}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                        <CircularProgress size={28} />
                      </TableCell>
                    </TableRow>
                  ) : filteredSorted.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        No orders match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSorted.map((o) => {
                      const selected = selectedOrderId === o.orderId
                      return (
                        <TableRow
                          key={o.orderId}
                          hover
                          selected={selected}
                          onClick={() => setSelectedOrderId(o.orderId)}
                          sx={{
                            cursor: 'pointer',
                            ...(selected
                              ? {
                                  bgcolor: 'common.white',
                                  boxShadow: 2,
                                  '& td': { borderColor: 'transparent' },
                                }
                              : {}),
                          }}
                        >
                          <TableCell>
                            <Typography variant="body2" fontWeight={700} fontFamily="monospace">
                              #{o.orderId.slice(0, 8).toUpperCase()}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Avatar sx={{ width: 32, height: 32, fontSize: 14 }}>{customerInitial(o)}</Avatar>
                              <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                                {customerLabel(o)}
                              </Typography>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <Chip size="small" label={o.status} sx={{ fontWeight: 700, borderRadius: 2, ...statusChipSx(o.status) }} />
                          </TableCell>
                          <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                            {o.dispute_count === 0 ? (
                              <Typography variant="caption" color="text.secondary">
                                —
                              </Typography>
                            ) : o.dispute_active_count > 0 ? (
                              <Chip
                                size="small"
                                color="warning"
                                label={`Active (${o.dispute_active_count})`}
                                sx={{ fontWeight: 700, borderRadius: 2 }}
                              />
                            ) : (
                              <Chip size="small" variant="outlined" label={`${o.dispute_count} closed`} sx={{ fontWeight: 700, borderRadius: 2 }} />
                            )}
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight={800}>
                              {formatMoney(o.total_cents, o.currency)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary">
                              {formatOrderDate(o.created_at)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                            <IconButton
                              size="small"
                              aria-label="Order actions"
                              onClick={(e) => {
                                setMenuAnchor(e.currentTarget)
                                setMenuOrderId(o.orderId)
                              }}
                            >
                              <MoreHorizIcon />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        </Paper>

        {isMdUp ? (
          <Paper
            elevation={0}
            sx={{
              width: 400,
              flexShrink: 0,
              borderRadius: 3,
              border: 1,
              borderColor: 'divider',
              boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
              p: 2.5,
              position: 'sticky',
              top: 88,
              alignSelf: 'flex-start',
              maxHeight: 'calc(100dvh - 120px)',
              overflow: 'auto',
            }}
          >
            {detailPanelInner}
          </Paper>
        ) : null}
      </Stack>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        {menuOrderId ? (
          <MenuItem component={RouterLink} to={`/orders/${menuOrderId}`} onClick={() => setMenuAnchor(null)}>
            Open in storefront
          </MenuItem>
        ) : null}
        {canCancel ? (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null)
              if (menuOrderId) void cancelOrder(menuOrderId)
            }}
          >
            Cancel order
          </MenuItem>
        ) : null}
        <MenuItem
          onClick={() => {
            setMenuAnchor(null)
            if (menuOrderId) void refundOrder(menuOrderId)
          }}
        >
          Mark refunded
        </MenuItem>
      </Menu>

      <Drawer anchor="right" open={Boolean(!isMdUp && selectedOrderId)} onClose={() => setSelectedOrderId(null)} PaperProps={{ sx: { width: 'min(100%, 400px)', p: 2.5 } }}>
        {selectedOrderId ? detailPanelInner : null}
      </Drawer>
    </Box>
  )
}
