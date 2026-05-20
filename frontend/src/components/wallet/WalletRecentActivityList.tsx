import { Link as RouterLink } from 'react-router-dom'
import { Box, Card, Stack, Typography } from '@mui/material'
import { formatNad, type WalletTransaction } from '../../data/walletMock'
import { walletCardSx } from '../../theme/walletTheme'

function activityDateLine(tx: WalletTransaction): string {
  const d = tx.date.trim()
  const parts = d.split(/\s+/)
  if (parts.length >= 2) return `${parts[0]} ${parts[1].replace(/\.$/, '')}.`
  return d
}

function activityTimeLine(tx: WalletTransaction): string {
  const m = tx.datetime.match(/\d{1,2}:\d{2}/)
  if (m) {
    const [h, min] = m[0].split(':')
    const hour = Number.parseInt(h, 10)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const h12 = hour % 12 || 12
    return `${h12}:${min} ${ampm}`
  }
  return ''
}

export function WalletRecentActivityList(props: {
  items: WalletTransaction[]
  viewAllTo: string
  loading?: boolean
}) {
  const { items, loading } = props
  const preview = items.slice(0, 3)

  return (
    <Card elevation={0} sx={{ ...walletCardSx, height: 1, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 2.25, pt: 2, pb: 1.5 }}>
        <Typography variant="subtitle1" fontWeight={800}>
          Recent Activity
        </Typography>
      </Box>
      <Stack spacing={0} sx={{ flex: 1, px: 2, pb: 2 }}>
        {loading ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            Loading…
          </Typography>
        ) : preview.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            No recent activity.
          </Typography>
        ) : (
          preview.map((tx) => {
            const time = activityTimeLine(tx)
            const amountDisplay =
              tx.amountCents < 0
                ? `-${formatNad(Math.abs(tx.amountCents))}`
                : formatNad(tx.amountCents)
            return (
              <Box
                key={tx.id}
                component={RouterLink}
                to={`${props.viewAllTo}/${tx.id}`}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(72px, 88px) 1fr auto',
                  gap: 1,
                  alignItems: 'center',
                  py: 1.25,
                  borderBottom: 1,
                  borderColor: 'divider',
                  textDecoration: 'none',
                  color: 'inherit',
                  '&:last-child': { borderBottom: 0 },
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Box>
                  <Typography variant="body2" fontWeight={600} color="text.secondary">
                    {activityDateLine(tx)}
                  </Typography>
                  {time ? (
                    <Typography variant="caption" color="text.secondary">
                      {time}
                    </Typography>
                  ) : null}
                </Box>
                <Typography variant="body2" noWrap title={tx.business}>
                  {tx.business}
                </Typography>
                <Typography variant="body2" fontWeight={700} sx={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {amountDisplay}
                </Typography>
              </Box>
            )
          })
        )}
      </Stack>
    </Card>
  )
}
