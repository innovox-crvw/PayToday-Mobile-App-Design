import { useState } from 'react'
import { Button, IconButton, MenuItem, TextField } from '@mui/material'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import { WalletPageShell } from '../../components/wallet/WalletPageShell'
import { WalletDetailCard } from '../../components/wallet/WalletDetailCard'
import { MOCK_BANK, NAMIBIAN_BANKS } from '../../data/walletMock'

export function WalletBankPage() {
  const [accountName, setAccountName] = useState(MOCK_BANK.accountName)
  const [bankName, setBankName] = useState(MOCK_BANK.bankName)
  const [accountNumber, setAccountNumber] = useState(MOCK_BANK.accountNumber)

  return (
    <WalletPageShell title="My Bank Details" showBack subtitle="Link a bank account for withdrawals and payouts.">
      <WalletDetailCard>
      <TextField
        label="Account Name"
        value={accountName}
        onChange={(e) => setAccountName(e.target.value)}
        fullWidth
        InputProps={{
          endAdornment: (
            <IconButton size="small" edge="end" aria-label="Edit">
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          ),
        }}
      />
      <TextField select label="Bank" value={bankName} onChange={(e) => setBankName(e.target.value)} fullWidth SelectProps={{ displayEmpty: true }}>
        <MenuItem value="" disabled>
          Choose your Bank
        </MenuItem>
        {NAMIBIAN_BANKS.map((b) => (
          <MenuItem key={b} value={b}>
            {b}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Account Number"
        value={accountNumber}
        onChange={(e) => setAccountNumber(e.target.value)}
        fullWidth
        InputProps={{
          endAdornment: (
            <IconButton size="small" edge="end" aria-label="Edit">
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          ),
        }}
      />
      <Button variant="contained" size="large" sx={{ alignSelf: 'flex-start', fontWeight: 800 }}>
        Save
      </Button>
      </WalletDetailCard>
    </WalletPageShell>
  )
}
