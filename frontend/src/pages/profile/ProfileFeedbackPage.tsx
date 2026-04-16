import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Rating, Stack, TextField, Typography } from '@mui/material'
import { WalletSubheader } from '../wallet/WalletSubheader'
import { useStorePathPrefix } from './profilePaths'

export function ProfileFeedbackPage() {
  const navigate = useNavigate()
  const prefix = useStorePathPrefix()
  const sentPath = prefix ? `${prefix}/profile/feedback/sent` : '/profile/feedback/sent'
  const [rating, setRating] = useState<number | null>(4)
  const [text, setText] = useState('')

  return (
    <Stack spacing={2.5} sx={{ maxWidth: 480, mx: 'auto', pb: 4 }}>
      <WalletSubheader title="Feedback" />
      <Typography color="text.secondary" variant="body2">
        Tell us what you think.
      </Typography>
      <Rating
        value={rating}
        onChange={(_e, v) => setRating(v)}
        size="large"
        sx={{ '& .MuiRating-iconFilled': { color: 'secondary.main' } }}
      />
      <TextField
        label="Tell us what you think..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        multiline
        minRows={4}
        fullWidth
      />
      <Button
        variant="contained"
        size="large"
        fullWidth
        sx={{ borderRadius: 2, fontWeight: 700, bgcolor: 'secondary.main' }}
        onClick={() => navigate(sentPath)}
      >
        Send
      </Button>
    </Stack>
  )
}
