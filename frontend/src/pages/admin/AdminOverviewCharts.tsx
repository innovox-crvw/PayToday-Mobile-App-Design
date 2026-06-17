import {
  Alert,
  Box,
  CircularProgress,
  Paper,
  Skeleton,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoney } from '../../lib/money'

const NAD = 'NAD'

export type AdminOverviewDto = {
  ordersByStatus: { status: string; count: number }[]
  salesByDay: { day: string; orderCount: number; revenueCents: number }[]
  inventory: {
    variantCount: number
    activeProductCount: number
    totalUnitsOnHand: number
    totalReservedUnits: number
    lowStockVariantCount: number
  }
  unitsByCategory: { categoryName: string; units: number }[]
  topProductsByRevenue: { productName: string; revenueCents: number }[]
  returnCasesByStatus: { status: string; count: number }[]
  disputesByStatus?: { status: string; count: number }[]
  disputesOpenedByDay?: { day: string; count: number }[]
}

function pastDaysIso(n: number): string[] {
  const out: string[] = []
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(base)
    d.setDate(d.getDate() - i)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    out.push(`${y}-${m}-${day}`)
  }
  return out
}

function mergeSalesSeries(salesByDay: AdminOverviewDto['salesByDay']) {
  const keys = pastDaysIso(14)
  const map = new Map(salesByDay.map((r) => [r.day.slice(0, 10), r]))
  return keys.map((day) => {
    const row = map.get(day)
    const short = day.slice(5)
    return {
      day,
      label: short,
      orderCount: row?.orderCount ?? 0,
      revenueCents: row?.revenueCents ?? 0,
      revenueNad: (row?.revenueCents ?? 0) / 100,
    }
  })
}

const PIE_COLORS = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626', '#0891B2', '#DB2777', '#4F46E5', '#65A30D', '#EA580C']

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: '100%' }}>
      <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {label}
      </Typography>
      <Typography variant="h5" fontWeight={800} sx={{ mt: 0.75, letterSpacing: -0.5 }}>
        {value}
      </Typography>
      {sub ? (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          {sub}
        </Typography>
      ) : null}
    </Paper>
  )
}

type Props = {
  data: AdminOverviewDto | null
  loading: boolean
  error: string | null
}

export function AdminOverviewCharts({ data, loading, error }: Props) {
  const theme = useTheme()
  const primary = theme.palette.primary.main
  const gridStroke = theme.palette.divider

  if (error) {
    return (
      <Alert severity="warning" sx={{ maxWidth: 960 }}>
        {error}
      </Alert>
    )
  }

  if (loading || !data) {
    return (
      <Stack spacing={2} sx={{ maxWidth: 1200 }}>
        <Skeleton variant="rounded" height={120} />
        <Grid container spacing={2}>
          {[1, 2, 3, 4].map((k) => (
            <Grid key={k} size={{ xs: 12, sm: 6, md: 3 }}>
              <Skeleton variant="rounded" height={100} />
            </Grid>
          ))}
          <Grid size={{ xs: 12, md: 8 }}>
            <Skeleton variant="rounded" height={320} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Skeleton variant="rounded" height={320} />
          </Grid>
        </Grid>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={32} />
        </Box>
      </Stack>
    )
  }

  const salesSeries = mergeSalesSeries(data.salesByDay)
  const revenue14d = salesSeries.reduce((s, r) => s + r.revenueCents, 0)
  const orders14d = salesSeries.reduce((s, r) => s + r.orderCount, 0)

  const ordersPie = data.ordersByStatus.map((r) => ({
    name: r.status.replace(/_/g, ' '),
    value: r.count,
  }))

  const categoryBars = data.unitsByCategory.map((r) => ({
    name: r.categoryName.length > 18 ? `${r.categoryName.slice(0, 16)}…` : r.categoryName,
    fullName: r.categoryName,
    units: r.units,
  }))

  const productBars = data.topProductsByRevenue.map((r) => ({
    name: r.productName.length > 22 ? `${r.productName.slice(0, 20)}…` : r.productName,
    fullName: r.productName,
    revenue: r.revenueCents / 100,
    revenueCents: r.revenueCents,
  }))

  const returnsBars = data.returnCasesByStatus.map((r) => ({
    name: r.status.replace(/_/g, ' '),
    count: r.count,
  }))

  const disputesPie = (data.disputesByStatus ?? []).map((r) => ({
    name: r.status.replace(/_/g, ' '),
    value: r.count,
  }))
  const disputesDayMap = new Map((data.disputesOpenedByDay ?? []).map((r) => [r.day.slice(0, 10), r.count]))
  const disputesSeries = pastDaysIso(14).map((day) => ({
    day,
    label: day.slice(5),
    count: disputesDayMap.get(day) ?? 0,
  }))
  const openDisputeCount = (data.disputesByStatus ?? [])
    .filter((r) => r.status === 'open' || r.status === 'in_review')
    .reduce((s, r) => s + r.count, 0)
  const disputes14d = disputesSeries.reduce((s, r) => s + r.count, 0)

  return (
    <Stack spacing={3} sx={{ maxWidth: 1200 }}>
      <Typography variant="subtitle1" fontWeight={800}>
        Performance & inventory
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: -1.5 }}>
        Figures are read directly from Microsoft SQL Server. Sales charts exclude cancelled and unpaid checkouts.
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))' },
        }}
      >
        <KpiCard label="14-day revenue" value={formatMoney(revenue14d, NAD)} sub={`${orders14d} orders`} />
        <KpiCard
          label="Units on hand"
          value={data.inventory.totalUnitsOnHand.toLocaleString()}
          sub={`${data.inventory.variantCount} variants`}
        />
        <KpiCard
          label="Reserved (unpaid)"
          value={data.inventory.totalReservedUnits.toLocaleString()}
          sub="Pending payment holds"
        />
        <KpiCard label="Low-stock variants" value={String(data.inventory.lowStockVariantCount)} sub="At or below threshold" />
        <KpiCard label="Active products" value={String(data.inventory.activeProductCount)} sub="Listed in catalogue" />
      </Box>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: 360 }}>
            <Typography variant="subtitle2" fontWeight={800} gutterBottom>
              Sales (14 days)
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              Order count and revenue (NAD) by calendar day.
            </Typography>
            <ResponsiveContainer width="100%" height="85%">
              <ComposedChart data={salesSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} width={36} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `N$${v}`}
                  width={52}
                />
                <Tooltip
                  formatter={(value: number, name: string) =>
                    name === 'revenueNad' || name === 'Revenue (NAD)'
                      ? [formatMoney(Math.round(value * 100), NAD), 'Revenue']
                      : [value, 'Orders']
                  }
                  labelFormatter={(_, p) => (p?.[0]?.payload?.day as string) ?? ''}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="orderCount" name="Orders" fill="#059669" barSize={14} radius={[3, 3, 0, 0]} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="revenueNad"
                  name="Revenue (NAD)"
                  stroke={primary}
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: 360 }}>
            <Typography variant="subtitle2" fontWeight={800} gutterBottom>
              Orders by status
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
              All time, full lifecycle.
            </Typography>
            <ResponsiveContainer width="100%" height="88%">
              <PieChart>
                <Pie
                  data={ordersPie}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={88}
                  paddingAngle={1}
                >
                  {ordersPie.map((_, i) => (
                    <Cell key={`c-${String(i)}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [v, 'Orders']} />
                <Legend layout="horizontal" verticalAlign="bottom" />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: 340 }}>
            <Typography variant="subtitle2" fontWeight={800} gutterBottom>
              On-hand units by category
            </Typography>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={categoryBars} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => [v, 'Units']} labelFormatter={(_, p) => (p?.[0]?.payload?.fullName as string) ?? ''} />
                <Bar dataKey="units" name="Units" fill={primary} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: 340 }}>
            <Typography variant="subtitle2" fontWeight={800} gutterBottom>
              Top products by revenue (30 days)
            </Typography>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={productBars} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `N$${v}`} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(v: number) => [formatMoney(Math.round(v * 100), NAD), 'Revenue']}
                  labelFormatter={(_, p) => (p?.[0]?.payload?.fullName as string) ?? ''}
                />
                <Bar dataKey="revenue" name="Revenue" fill="#7C3AED" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {returnsBars.length > 0 ? (
          <Grid size={{ xs: 12 }}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: 280 }}>
              <Typography variant="subtitle2" fontWeight={800} gutterBottom>
                Return cases by status
              </Typography>
              <ResponsiveContainer width="100%" height="82%">
                <BarChart data={returnsBars} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={36} />
                  <Tooltip formatter={(v: number) => [v, 'Cases']} />
                  <Bar dataKey="count" name="Cases" fill="#DC2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
        ) : null}
      </Grid>

      {(data.disputesByStatus?.length ?? 0) > 0 ? (
        <>
          <Typography variant="subtitle1" fontWeight={800} sx={{ pt: 1 }}>
            Order disputes
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' },
            }}
          >
            <KpiCard label="Open + in review" value={String(openDisputeCount)} sub="Needs staff attention" />
            <KpiCard label="Opened (14 days)" value={String(disputes14d)} sub="New dispute cases" />
            <KpiCard
              label="Total tracked"
              value={String(disputesPie.reduce((s, r) => s + r.value, 0))}
              sub="All statuses in database"
            />
          </Box>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 5 }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: 320 }}>
                <Typography variant="subtitle2" fontWeight={800} gutterBottom>
                  Disputes by status
                </Typography>
                <ResponsiveContainer width="100%" height="85%">
                  <PieChart>
                    <Pie data={disputesPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                      {disputesPie.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 7 }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: 320 }}>
                <Typography variant="subtitle2" fontWeight={800} gutterBottom>
                  Disputes opened (14 days)
                </Typography>
                <ResponsiveContainer width="100%" height="85%">
                  <BarChart data={disputesSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={36} />
                    <Tooltip formatter={(v: number) => [v, 'Opened']} labelFormatter={(_, p) => (p?.[0]?.payload?.day as string) ?? ''} />
                    <Bar dataKey="count" name="Opened" fill="#D97706" barSize={14} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
          </Grid>
        </>
      ) : null}
    </Stack>
  )
}
