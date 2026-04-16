import { useEffect, useState } from 'react'
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom'
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material'
import { WalletSubheader } from '../wallet/WalletSubheader'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { NOTIFICATIONS_CHANGED_EVENT } from '../../lib/notificationEvents'

type Detail = {
  id: string
  templateKey: string
  title: string
  body: string
  payload: string | null
  read: boolean
  createdAt: string
}

export function NotificationDetailPage() {
  const { id } = useParams()
  const { pathname } = useLocation()
  const listPath = pathname.startsWith('/embed') ? '/embed/notifications' : '/notifications'

  const [row, setRow] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setLoading(false)
      setError('missing')
      return
    }
    const nid = id
    let cancelled = false
    async function run() {
      setLoading(true)
      setError(null)
      try {
        const res = await apiFetch(`/api/notifications/${encodeURIComponent(nid)}`)
        if (!res.ok) {
          if (!cancelled) {
            setError(res.status === 404 ? 'not_found' : 'load_failed')
            setRow(null)
          }
          return
        }
        const data = (await res.json()) as { notification?: Detail }
        const n = data.notification
        if (!cancelled && n) {
          setRow(n)
          if (!n.read) {
            try {
              await fetchCsrfToken()
              await apiFetch(`/api/notifications/${encodeURIComponent(nid)}/read`, { method: 'PATCH' })
              window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
            } catch {
              /* non-fatal */
            }
          }
        }
      } catch {
        if (!cancelled) {
          setError('load_failed')
          setRow(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [id])

  return (
    <Stack spacing={2} sx={{ maxWidth: 480, mx: 'auto', pb: 4 }}>
      <WalletSubheader title={row?.title ?? 'Notification'} />
      {loading ? (
        <Stack alignItems="center" py={4}>
          <CircularProgress size={36} />
        </Stack>
      ) : error === 'not_found' || error === 'missing' ? (
        <Typography color="text.secondary">This notification was not found.</Typography>
      ) : error === 'load_failed' ? (
        <Alert severity="warning">Could not load this notification.</Alert>
      ) : row ? (
        <>
          <Typography variant="body1" fontWeight={600}>
            {row.body}
          </Typography>
          <Typography color="text.secondary" variant="caption">
            {new Date(row.createdAt).toLocaleString()}
          </Typography>
        </>
      ) : null}
      <Button component={RouterLink} to={listPath} variant="text" sx={{ alignSelf: 'flex-start', mt: 1 }}>
        Back to list
      </Button>
    </Stack>
  )
}
