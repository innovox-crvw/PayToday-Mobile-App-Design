import { useState } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { Alert, Button, Stack, TextField, Typography } from '@mui/material'
import { apiUrl } from '../../lib/apiOrigin'

export function TrackOrderPage() {
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const [orderId, setOrderId] = useState('')
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [detailUrl, setDetailUrl] = useState<string | null>(null)

  async function track() {
    setMsg(null)
    setDetailUrl(null)
    try {
      const res = await fetch(
        apiUrl(
          `/api/orders/track?orderId=${encodeURIComponent(orderId)}&email=${encodeURIComponent(email)}`,
        ),
        { credentials: 'include' },
      )
      if (!res.ok) {
        setMsg('Order not found for this email.')
        return
      }
      setDetailUrl(`${pathPrefix}/orders/${orderId}?email=${encodeURIComponent(email)}`)
    } catch {
      setMsg('Request failed')
    }
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 440, mx: 'auto', py: 2 }}>
      <Typography variant="h5" fontWeight={800}>
        Track order
      </Typography>
      <TextField label="Order ID" value={orderId} onChange={(e) => setOrderId(e.target.value)} fullWidth />
      <TextField label="Email used at checkout" type="email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth />
      <Button variant="contained" onClick={() => void track()}>
        Look up
      </Button>
      {msg && <Alert severity="warning">{msg}</Alert>}
      {detailUrl && (
        <Button component={RouterLink} to={detailUrl} variant="outlined">
          Open order details
        </Button>
      )}
    </Stack>
  )
}
