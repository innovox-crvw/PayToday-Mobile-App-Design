import { Stack, TextField, Typography, Button } from '@mui/material'
import { WalletSubheader } from '../wallet/WalletSubheader'

export function ProfileConfirmEmailPage() {
  return (
    <Stack spacing={3} sx={{ maxWidth: 400, mx: 'auto', pb: 4 }}>
      <WalletSubheader title="Confirm New Email" />
      <Typography variant="h6" fontWeight={700}>
        Please confirm your new email
      </Typography>
      <Typography color="text.secondary" variant="body2">
        Enter the 4-digit code sent to your email address.
      </Typography>
      <Stack direction="row" spacing={1} justifyContent="center">
        {[0, 1, 2, 3].map((i) => (
          <TextField
            key={i}
            inputProps={{ maxLength: 1, style: { textAlign: 'center', fontSize: '1.25rem' } }}
            sx={{ width: 56 }}
            defaultValue={i === 0 ? '2' : ''}
          />
        ))}
      </Stack>
      <Button variant="contained" size="large" fullWidth sx={{ borderRadius: 2, fontWeight: 700 }}>
        Confirm
      </Button>
    </Stack>
  )
}
