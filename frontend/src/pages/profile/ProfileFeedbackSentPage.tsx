import { Link as RouterLink } from 'react-router-dom'
import { Button, Stack, Typography } from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import { useStorePathPrefix } from './profilePaths'

export function ProfileFeedbackSentPage() {
  const prefix = useStorePathPrefix()
  const profilePath = prefix ? `${prefix}/profile` : '/profile'

  return (
    <Stack spacing={3} alignItems="center" sx={{ py: 6, maxWidth: 400, mx: 'auto', textAlign: 'center' }}>
      <CheckCircleOutlineIcon sx={{ fontSize: 72, color: 'success.main' }} />
      <Typography variant="h5" fontWeight={800}>
        Feedback sent
      </Typography>
      <Typography color="text.secondary" variant="body2">
        Thanks — we read every message.
      </Typography>
      <Button component={RouterLink} to={profilePath} variant="outlined" sx={{ fontWeight: 700 }}>
        Close
      </Button>
    </Stack>
  )
}
