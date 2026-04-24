import { Link as RouterLink } from 'react-router-dom'
import { Button, Stack, Typography } from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import { ProfilePageShell } from '../../components/profile/ProfilePageShell'
import { useStorePathPrefix } from './profilePaths'

export function ProfileFeedbackSentPage() {
  const prefix = useStorePathPrefix()
  const profilePath = prefix ? `${prefix}/profile` : '/profile'

  return (
    <ProfilePageShell>
      <Stack spacing={3} alignItems="center" sx={{ py: 4, textAlign: 'center', width: 1 }}>
        <CheckCircleOutlineIcon sx={{ fontSize: 72, color: 'success.main' }} />
        <Typography variant="h5" fontWeight={800}>
          Sent
        </Typography>
        <Typography color="text.secondary" variant="body2">
          Thanks for the feedback.
        </Typography>
        <Button component={RouterLink} to={profilePath} variant="outlined" sx={{ fontWeight: 700 }}>
          Done
        </Button>
      </Stack>
    </ProfilePageShell>
  )
}
