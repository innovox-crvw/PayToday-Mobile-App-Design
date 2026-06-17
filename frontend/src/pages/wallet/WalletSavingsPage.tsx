import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  Typography,
} from '@mui/material'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { formatMoney } from '../../lib/money'
import { ROUND_UP_INCREMENT_OPTIONS } from '../../lib/walletRoundUp'
import { WalletPageShell } from '../../components/wallet/WalletPageShell'
import { WalletDetailCard } from '../../components/wallet/WalletDetailCard'

type Settings = {
  roundUpEnabled: boolean
  roundUpIncrementCents: number
  savingsBalanceCents: number
  walletExtrasAvailable: boolean
}

export function WalletSavingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/wallet/settings')
      if (!res.ok) throw new Error('Could not load settings')
      setSettings((await res.json()) as Settings)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save(patch: Partial<Settings>) {
    setMsg(null)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/wallet/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = (await res.json()) as Settings & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setSettings(data)
      setMsg('Settings saved.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed')
    }
  }

  return (
    <WalletPageShell
      title="Savings pocket"
      showBack
      subtitle="Round up wallet purchases — spare change goes into your savings pocket."
    >
      {loading ? (
        <Typography color="text.secondary">Loading…</Typography>
      ) : settings?.walletExtrasAvailable ? (
        <WalletDetailCard>
          <Typography variant="h5" fontWeight={900}>
            {formatMoney(settings.savingsBalanceCents, 'NAD')}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Savings pocket balance
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={settings.roundUpEnabled}
                onChange={(e) => void save({ roundUpEnabled: e.target.checked })}
              />
            }
            label="Round up purchases at checkout"
          />
          <FormControl fullWidth size="small">
            <InputLabel id="round-up-inc">Round up to</InputLabel>
            <Select
              labelId="round-up-inc"
              label="Round up to"
              value={settings.roundUpIncrementCents}
              onChange={(e) => void save({ roundUpIncrementCents: Number(e.target.value) })}
            >
              {ROUND_UP_INCREMENT_OPTIONS.map((o) => (
                <MenuItem key={o.cents} value={o.cents}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </WalletDetailCard>
      ) : (
        <Alert severity="info">Savings pocket requires database migration 068_wallet_savings_split.</Alert>
      )}
      {msg ? <Alert severity="success">{msg}</Alert> : null}
    </WalletPageShell>
  )
}
