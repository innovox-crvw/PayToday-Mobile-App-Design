import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Checkbox,
  Collapse,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { formatMoney } from '../../lib/money'
import { computeRoundUpCents } from '../../lib/walletRoundUp'

export type SplitParticipantDraft = { displayName: string; shareCents: number }

type WalletSettings = {
  roundUpEnabled: boolean
  roundUpIncrementCents: number
  savingsBalanceCents: number
  walletExtrasAvailable: boolean
}

type Props = {
  orderTotalCents: number | null
  currency: string
  settings: WalletSettings | null
  applyRoundUp: boolean
  onApplyRoundUpChange: (v: boolean) => void
  splitBillId: string | null
  onSplitBillIdChange: (id: string | null) => void
  payerShareCents: number | null
  onPayerShareCentsChange: (cents: number | null) => void
}

export function CheckoutWalletExtras(props: Props) {
  const {
    orderTotalCents,
    currency,
    settings,
    applyRoundUp,
    onApplyRoundUpChange,
    splitBillId,
    onSplitBillIdChange,
    payerShareCents,
    onPayerShareCentsChange,
  } = props

  const [splitOpen, setSplitOpen] = useState(false)
  const [splitBusy, setSplitBusy] = useState(false)
  const [splitErr, setSplitErr] = useState<string | null>(null)
  const [others, setOthers] = useState<SplitParticipantDraft[]>([{ displayName: '', shareCents: 0 }])

  const basePayCents = payerShareCents ?? orderTotalCents ?? 0
  const roundUp = useMemo(() => {
    if (!applyRoundUp || !settings?.roundUpEnabled || basePayCents <= 0) {
      return { chargeCents: basePayCents, spareCents: 0 }
    }
    return computeRoundUpCents(basePayCents, settings.roundUpIncrementCents)
  }, [applyRoundUp, settings, basePayCents])

  async function createSplit() {
    if (orderTotalCents == null || orderTotalCents < 1) return
    setSplitErr(null)
    const validOthers = others.filter((o) => o.displayName.trim() && o.shareCents > 0)
    const othersSum = validOthers.reduce((s, o) => s + o.shareCents, 0)
    const creatorShare = orderTotalCents - othersSum
    if (creatorShare < 1) {
      setSplitErr('Your share must be at least 1 cent. Reduce participant amounts.')
      return
    }
    setSplitBusy(true)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/wallet/split-bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalCents: orderTotalCents,
          currency,
          creatorShareCents: creatorShare,
          participants: validOthers.map((o) => ({
            displayName: o.displayName.trim(),
            shareCents: o.shareCents,
          })),
        }),
      })
      const data = (await res.json()) as { splitBillId?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Could not create split')
      if (!data.splitBillId) throw new Error('Split bill id missing')
      onSplitBillIdChange(data.splitBillId)
      onPayerShareCentsChange(creatorShare)
      setSplitOpen(true)
    } catch (e) {
      setSplitErr(e instanceof Error ? e.message : 'Could not create split')
    } finally {
      setSplitBusy(false)
    }
  }

  function clearSplit() {
    onSplitBillIdChange(null)
    onPayerShareCentsChange(null)
    setSplitErr(null)
  }

  return (
    <Stack spacing={1.5} sx={{ mt: 1 }}>
      {settings?.walletExtrasAvailable && settings.roundUpEnabled ? (
        <FormControlLabel
          control={<Checkbox checked={applyRoundUp} onChange={(e) => onApplyRoundUpChange(e.target.checked)} />}
          label={
            <Typography variant="body2">
              Round up to savings pocket
              {roundUp.spareCents > 0 && orderTotalCents != null ? (
                <>
                  {' '}
                  — pay {formatMoney(roundUp.chargeCents, currency)},{' '}
                  <strong>{formatMoney(roundUp.spareCents, currency)}</strong> to savings
                </>
              ) : null}
            </Typography>
          }
        />
      ) : settings?.walletExtrasAvailable ? (
        <Typography variant="caption" color="text.secondary">
          Enable round-up in PayToday Wallet → Savings pocket to round checkout to the nearest amount.
        </Typography>
      ) : null}

      <Button size="small" variant="text" onClick={() => setSplitOpen((o) => !o)} sx={{ alignSelf: 'flex-start', fontWeight: 700 }}>
        {splitOpen ? 'Hide split bill' : 'Split this bill'}
      </Button>
      <Collapse in={splitOpen}>
        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
          {splitBillId ? (
            <Alert severity="success" sx={{ mb: 1 }}>
              Split active — you pay {formatMoney(payerShareCents ?? 0, currency)} now. Others owe the rest.
              <Button size="small" onClick={clearSplit} sx={{ ml: 1 }}>
                Clear
              </Button>
            </Alert>
          ) : (
            <>
              <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" sx={{ mb: 1 }}>
                ADD PARTICIPANTS (CUSTOM SHARES)
              </Typography>
              {others.map((o, i) => (
                <Stack key={i} direction="row" spacing={1} sx={{ mb: 1 }} alignItems="center">
                  <TextField
                    size="small"
                    label="Name"
                    value={o.displayName}
                    onChange={(e) => {
                      const next = [...others]
                      next[i] = { ...next[i], displayName: e.target.value }
                      setOthers(next)
                    }}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    size="small"
                    label="NAD"
                    type="number"
                    value={o.shareCents ? (o.shareCents / 100).toFixed(2) : ''}
                    onChange={(e) => {
                      const v = Math.round(parseFloat(e.target.value || '0') * 100)
                      const next = [...others]
                      next[i] = { ...next[i], shareCents: Number.isFinite(v) ? v : 0 }
                      setOthers(next)
                    }}
                    sx={{ width: 100 }}
                  />
                  <IconButton
                    size="small"
                    aria-label="Remove participant"
                    onClick={() => setOthers(others.filter((_, j) => j !== i))}
                    disabled={others.length <= 1}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() => setOthers([...others, { displayName: '', shareCents: 0 }])}
                sx={{ mb: 1 }}
              >
                Add person
              </Button>
              {splitErr ? (
                <Alert severity="error" sx={{ mb: 1 }}>
                  {splitErr}
                </Alert>
              ) : null}
              <Button variant="contained" size="small" disabled={splitBusy || orderTotalCents == null} onClick={() => void createSplit()}>
                {splitBusy ? 'Saving…' : 'Apply split'}
              </Button>
            </>
          )}
        </Paper>
      </Collapse>
    </Stack>
  )
}
