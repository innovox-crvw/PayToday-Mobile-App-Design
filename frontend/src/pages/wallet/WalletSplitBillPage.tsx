import { useState } from 'react'
import {
  Alert,
  Button,
  IconButton,
  Stack,
  TextField,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { formatMoney } from '../../lib/money'
import { WalletPageShell } from '../../components/wallet/WalletPageShell'
import { WalletDetailCard } from '../../components/wallet/WalletDetailCard'

type Participant = { displayName: string; shareCents: number }

export function WalletSplitBillPage() {
  const [totalNad, setTotalNad] = useState('')
  const [others, setOthers] = useState<Participant[]>([{ displayName: '', shareCents: 0 }])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [splitBillId, setSplitBillId] = useState<string | null>(null)

  const totalCents = Math.round(parseFloat(totalNad || '0') * 100)

  async function submit() {
    setMsg(null)
    if (totalCents < 1) {
      setMsg('Enter a valid bill total.')
      return
    }
    const valid = others.filter((o) => o.displayName.trim() && o.shareCents > 0)
    const othersSum = valid.reduce((s, o) => s + o.shareCents, 0)
    const creatorShare = totalCents - othersSum
    if (creatorShare < 1) {
      setMsg('Your share must be at least 1 cent.')
      return
    }
    setBusy(true)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/wallet/split-bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalCents,
          creatorShareCents: creatorShare,
          participants: valid.map((o) => ({ displayName: o.displayName.trim(), shareCents: o.shareCents })),
        }),
      })
      const data = (await res.json()) as { splitBillId?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setSplitBillId(data.splitBillId ?? null)
      setMsg(`Split saved. Your share: ${formatMoney(creatorShare, 'NAD')}. Use this at checkout when paying with PayToday Wallet.`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save split')
    } finally {
      setBusy(false)
    }
  }

  return (
    <WalletPageShell
      title="Split your bill"
      showBack
      subtitle="Divide a bill between people. Your share can be paid at checkout with PayToday Wallet."
    >
      <WalletDetailCard>
      <TextField label="Bill total (NAD)" value={totalNad} onChange={(e) => setTotalNad(e.target.value)} type="number" fullWidth />
      {others.map((o, i) => (
        <Stack key={i} direction="row" spacing={1}>
          <TextField
            label="Name"
            size="small"
            value={o.displayName}
            onChange={(e) => {
              const n = [...others]
              n[i] = { ...n[i], displayName: e.target.value }
              setOthers(n)
            }}
            sx={{ flex: 1 }}
          />
          <TextField
            label="Their share (NAD)"
            size="small"
            type="number"
            value={o.shareCents ? (o.shareCents / 100).toFixed(2) : ''}
            onChange={(e) => {
              const v = Math.round(parseFloat(e.target.value || '0') * 100)
              const n = [...others]
              n[i] = { ...n[i], shareCents: Number.isFinite(v) ? v : 0 }
              setOthers(n)
            }}
            sx={{ width: 130 }}
          />
          <IconButton size="small" onClick={() => setOthers(others.filter((_, j) => j !== i))} disabled={others.length <= 1}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Stack>
      ))}
      <Button size="small" startIcon={<AddIcon />} onClick={() => setOthers([...others, { displayName: '', shareCents: 0 }])}>
        Add person
      </Button>
      {splitBillId ? (
        <Alert severity="info">Split ID (for checkout): {splitBillId}</Alert>
      ) : null}
      {msg ? <Alert severity={splitBillId ? 'success' : 'warning'}>{msg}</Alert> : null}
      <Button variant="contained" disabled={busy} onClick={() => void submit()} sx={{ alignSelf: 'flex-start', fontWeight: 800 }}>
        {busy ? 'Saving…' : 'Save split'}
      </Button>
      </WalletDetailCard>
    </WalletPageShell>
  )
}
