import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Rating, TextField, Typography } from '@mui/material'
import { ProfilePageShell } from '../../components/profile/ProfilePageShell'
import { WalletSubheader } from '../wallet/WalletSubheader'
import { useStorePathPrefix } from './profilePaths'

export function ProfileFeedbackPage() {
  const navigate = useNavigate()
  const prefix = useStorePathPrefix()
  const sentPath = prefix ? `${prefix}/profile/feedback/sent` : '/profile/feedback/sent'
  const [rating, setRating] = useState<number | null>(4)
  const [text, setText] = useState('')

  return (
    <ProfilePageShell>
      <WalletSubheader title="Feedback" />
      <Typography color="text.secondary" variant="body2">
        Rate your experience (optional note below).
      </Typography>
      <Rating
        value={rating}
        onChange={(_e, v) => setRating(v)}
        size="large"
        sx={{ '& .MuiRating-iconFilled': { color: 'secondary.main' } }}
      />
      <TextField
        label="Message"
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
    </ProfilePageShell>
  )
}
