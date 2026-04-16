import { useEffect, useState } from 'react'
import { Alert, Button, Stack, TextField, Typography } from '@mui/material'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'

interface Loc {
  id: string
  name: string
  addressSummary: string | null
}

export function AdminDepositPage() {
  const [locations, setLocations] = useState<Loc[]>([])
  const [orderId, setOrderId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(apiUrl('/api/deposit/locations'), { credentials: 'include' })
        if (!res.ok) return
        const data = (await res.json()) as { items: Loc[] }
        setLocations(data.items ?? [])
        if (data.items?.[0]) setLocationId(data.items[0].id)
      } catch {
        /* ignore */
      }
    })()
  }, [])

  async function allocate() {
    setError(null)
    setCode(null)
    try {
      await fetchCsrfToken()
      const res = await apiFetch(`/api/fulfillment/orders/${encodeURIComponent(orderId)}/pickup-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId }),
      })
      const data = (await res.json()) as { pickupCode?: string; error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Failed')
        return
      }
      setCode(data.pickupCode ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        Deposit boxes
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Locations and box capacity live in SQL. Generate a pickup code for a paid order (fulfillment role).
      </Typography>
      {locations.map((l) => (
        <Typography key={l.id} variant="body2">
          {l.name}
          {l.addressSummary ? ` — ${l.addressSummary}` : ''}
        </Typography>
      ))}
      <TextField label="Order ID (GUID)" value={orderId} onChange={(e) => setOrderId(e.target.value)} fullWidth />
      <TextField label="Location ID" value={locationId} onChange={(e) => setLocationId(e.target.value)} fullWidth />
      <Button variant="contained" onClick={() => void allocate()}>
        Generate pickup code
      </Button>
      {code && <Alert severity="success">Pickup code: {code}</Alert>}
      {error && <Alert severity="warning">{error}</Alert>}
    </Stack>
  )
}
