import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { Alert, Card, CircularProgress, List, ListItemButton, ListItemText, Stack, Typography } from '@mui/material'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { WalletSubheader } from '../wallet/WalletSubheader'
import { apiFetch } from '../../api/client'
import { NOTIFICATIONS_CHANGED_EVENT } from '../../lib/notificationEvents'

type ApiNotification = {
  id: string
  templateKey: string
  title: string
  body: string
  read: boolean
  createdAt: string
}

export function NotificationsPage() {
  const { pathname } = useLocation()
  const prefix = pathname.startsWith('/embed') ? '/embed' : ''
  const base = prefix ? `${prefix}/notifications` : '/notifications'

  const [items, setItems] = useState<ApiNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [schemaMissing, setSchemaMissing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSchemaMissing(false)
    try {
      const res = await apiFetch('/api/notifications')
      if (res.status === 401) {
        setItems([])
        setError('sign_in')
        window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
        return
      }
      if (res.status === 503) {
        setItems([])
        setError('db_off')
        return
      }
      if (!res.ok) {
        setError('load_failed')
        setItems([])
        return
      }
      const data = (await res.json()) as {
        notifications?: ApiNotification[]
        meta?: { notificationsTableMissing?: boolean }
      }
      setItems(data.notifications ?? [])
      setSchemaMissing(Boolean(data.meta?.notificationsTableMissing))
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
    } catch {
      setError('load_failed')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [load])

  return (
    <Stack spacing={2} sx={{ maxWidth: 520, mx: 'auto', pb: 2 }}>
      <WalletSubheader title="Notifications" />
      {error === 'sign_in' ? (
        <Alert severity="info">Sign in to see order and checkout alerts from your account.</Alert>
      ) : null}
      {error === 'db_off' ? (
        <Alert severity="warning">The store database is not connected, so notifications cannot load.</Alert>
      ) : null}
      {error === 'load_failed' ? <Alert severity="warning">Could not load notifications. Try again in a moment.</Alert> : null}
      {schemaMissing ? (
        <Alert severity="info">
          In-app notifications need the latest database migration. From the project folder run{' '}
          <Typography component="span" variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
            npm run db:migrate
          </Typography>{' '}
          (applies <Typography component="span" variant="body2" sx={{ fontFamily: 'monospace' }}>002_user_notifications</Typography>
          ), then refresh this page.
        </Alert>
      ) : null}
      {loading ? (
        <Stack alignItems="center" py={4}>
          <CircularProgress size={36} />
        </Stack>
      ) : (
        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          {items.length === 0 && !error ? (
            <Typography color="text.secondary" sx={{ p: 3 }}>
              No notifications yet. When you place orders or receive pickup codes, they will appear here (order and payment
              updates are also emailed).
            </Typography>
          ) : (
            <List disablePadding>
              {items.map((n, i) => (
                <ListItemButton
                  key={n.id}
                  component={RouterLink}
                  to={`${base}/${n.id}`}
                  sx={{
                    alignItems: 'flex-start',
                    py: 1.75,
                    borderBottom: i < items.length - 1 ? 1 : 0,
                    borderColor: 'divider',
                    bgcolor: n.read ? 'transparent' : 'action.hover',
                  }}
                >
                  <ListItemText
                    primary={n.title}
                    secondary={n.body}
                    primaryTypographyProps={{ fontWeight: n.read ? 600 : 800 }}
                    secondaryTypographyProps={{ variant: 'body2' }}
                  />
                  <ChevronRightIcon color="action" sx={{ mt: 0.5 }} />
                </ListItemButton>
              ))}
            </List>
          )}
        </Card>
      )}
    </Stack>
  )
}
