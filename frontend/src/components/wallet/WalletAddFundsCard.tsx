import {
  Alert,
  Button,
  Card,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { walletCardSx } from '../../theme/walletTheme'
import { formatNad } from '../../data/walletMock'

type Props = {
  quickAmountsCents: readonly number[]
  fundNad: string
  fundBusy: boolean
  fundMsg: string | null
  authLoading: boolean
  onFundNadChange: (v: string) => void
  onQuickFund: (cents: number) => void
  onSubmitCustom: () => void
}

export function WalletAddFundsCard(props: Props) {
  const {
    quickAmountsCents,
    fundNad,
    fundBusy,
    fundMsg,
    authLoading,
    onFundNadChange,
    onQuickFund,
    onSubmitCustom,
  } = props

  return (
    <Card elevation={0} sx={{ ...walletCardSx, p: 2 }}>
      <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 0.5 }}>
        Add Funds
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, lineHeight: 1.45 }}>
        Credits your wallet balance so store checkout and bill-pay flows can debit it.
      </Typography>
      <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 1.5 }}>
        {quickAmountsCents.map((c) => (
          <Button
            key={c}
            size="small"
            variant="outlined"
            disabled={fundBusy}
            onClick={() => onQuickFund(c)}
            sx={{
              fontWeight: 700,
              borderRadius: 999,
              borderColor: 'primary.main',
              color: 'primary.main',
              bgcolor: (t) => `${t.palette.primary.main}14`,
            }}
          >
            +{formatNad(c)}
          </Button>
        ))}
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ sm: 'flex-start' }}>
        <TextField
          label="Amount (N$)"
          value={fundNad}
          onChange={(e) => onFundNadChange(e.target.value)}
          placeholder="e.g. 250"
          size="small"
          disabled={fundBusy}
          inputProps={{ inputMode: 'decimal' }}
          sx={{ flex: 1, minWidth: 0 }}
        />
        <Button
          variant="contained"
          disabled={fundBusy || authLoading}
          onClick={onSubmitCustom}
          sx={{ fontWeight: 800, minWidth: { sm: 140 } }}
        >
          {fundBusy ? 'Adding…' : 'Add funds'}
        </Button>
      </Stack>
      {fundMsg ? (
        <Alert severity={fundMsg.startsWith('Added') ? 'success' : 'warning'} sx={{ mt: 1.5, borderRadius: 2 }}>
          {fundMsg}
        </Alert>
      ) : null}
    </Card>
  )
}
