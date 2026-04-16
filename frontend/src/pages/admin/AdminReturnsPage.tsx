import { useEffect, useState } from 'react'
import { Alert, Button, Stack, Typography } from '@mui/material'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'

type Row = { id: string; order_id: string; reason: string; status: string; created_at: string }

export function AdminReturnsPage() {
  const [items, setItems] = useState<Row[]>([])
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    setErr(null)
    try {
      const res = await fetch(apiUrl('/api/admin/returns'), { credentials: 'include' })
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as { items: Row[] }
      setItems(data.items ?? [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function approve(id: string) {
    try {
      await fetchCsrfToken()
      const res = await apiFetch(`/api/admin/returns/${id}/approve`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        Return requests
      </Typography>
      {err && <Alert severity="warning">{err}</Alert>}
      {items.map((r) => (
        <Stack key={r.id} direction="row" alignItems="center" spacing={2} flexWrap="wrap">
          <Typography variant="body2">
            Order {r.order_id.slice(0, 8)}… · {r.status}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {r.reason.slice(0, 120)}
          </Typography>
          {r.status === 'pending' && (
            <Button size="small" variant="contained" onClick={() => void approve(r.id)}>
              Approve &amp; restock
            </Button>
          )}
        </Stack>
      ))}
    </Stack>
  )
}
