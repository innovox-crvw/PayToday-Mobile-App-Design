import { Card, CardContent, Typography } from '@mui/material'
import { AccountSectionHeader } from '../../components/profile/AccountSectionHeader'

export function ProfileLegalPage() {
  return (
    <>
      <AccountSectionHeader
        title="Legal"
        description="Terms, privacy policy, and regulatory notices for using AvoToday."
      />
      <Card variant="outlined" sx={{ borderRadius: 2.5, borderColor: 'divider' }}>
        <CardContent>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            Terms, privacy, and notices will be linked here.
          </Typography>
        </CardContent>
      </Card>
    </>
  )
}
