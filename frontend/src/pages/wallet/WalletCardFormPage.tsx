import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, IconButton, Stack, TextField, Typography } from '@mui/material'
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined'
import { WalletSubheader } from './WalletSubheader'
import { MOCK_CARDS } from '../../data/walletMock'

export function WalletCardFormPage() {
  const { cardId } = useParams<{ cardId: string }>()
  const navigate = useNavigate()
  const isNew = cardId === 'new'

  const existing = useMemo(() => (cardId && !isNew ? MOCK_CARDS.find((c) => c.id === cardId) : undefined), [cardId, isNew])

  const [nickname, setNickname] = useState(existing?.nickname ?? '')
  const [number, setNumber] = useState(isNew ? '' : `**** **** **** ${existing?.last4 ?? ''}`)
  const [expiry, setExpiry] = useState(isNew ? '' : '••/••')
  const [cvv, setCvv] = useState(isNew ? '' : '•••')

  if (!isNew && !existing) {
    return (
      <Typography color="error" role="alert">
        Card not found
      </Typography>
    )
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 480, mx: 'auto' }}>
      <WalletSubheader
        title={isNew ? 'Add a Card' : 'Edit Card'}
        rightSlot={
          isNew ? (
            <IconButton color="primary" aria-label="Scan card" size="small">
              <PhotoCameraOutlinedIcon />
            </IconButton>
          ) : undefined
        }
      />
      <TextField label="Card Nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} fullWidth />
      <TextField
        label="Card Number"
        value={number}
        onChange={(e) => isNew && setNumber(e.target.value)}
        fullWidth
        disabled={!isNew}
        placeholder={isNew ? '0000 0000 0000 0000' : undefined}
      />
      <Stack direction="row" spacing={2}>
        <TextField
          label="Expiry Date"
          value={expiry}
          onChange={(e) => isNew && setExpiry(e.target.value)}
          fullWidth
          placeholder={isNew ? 'MM/YY' : undefined}
        />
        <TextField
          label="CVV"
          type="password"
          value={cvv}
          onChange={(e) => isNew && setCvv(e.target.value)}
          fullWidth
          placeholder={isNew ? '•••' : undefined}
        />
      </Stack>
      <Button variant="contained" size="large" onClick={() => navigate(-1)} sx={{ mt: 1 }}>
        Save
      </Button>
      {!isNew && (
        <Button color="error" variant="text" onClick={() => navigate(-1)} sx={{ fontWeight: 700, alignSelf: 'flex-start', p: 0 }}>
          Delete Card
        </Button>
      )}
    </Stack>
  )
}
