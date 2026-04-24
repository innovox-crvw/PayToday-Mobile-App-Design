import { Link as RouterLink } from 'react-router-dom'
import { Card, List, ListItemButton, ListItemText, Typography } from '@mui/material'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { ProfilePageShell } from '../../components/profile/ProfilePageShell'
import { WalletSubheader } from '../wallet/WalletSubheader'
import { useStorePathPrefix } from './profilePaths'

const topics = ['FAQ', 'Sending money', 'Requesting money', 'Troubleshooting', 'General', 'Sign-up'] as const

export function ProfileSupportPage() {
  const prefix = useStorePathPrefix()
  const faqPath = prefix ? `${prefix}/profile/faq` : '/profile/faq'

  return (
    <ProfilePageShell>
      <WalletSubheader title="Support" />
      <Typography variant="body2" color="text.secondary">
        +264 61 000 0000 · support@paytoday.na · Mon–Fri 08:00–17:00
      </Typography>
      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <List disablePadding>
          {topics.map((t, i) => (
            <ListItemButton
              key={t}
              component={RouterLink}
              to={faqPath}
              sx={{ borderBottom: i < topics.length - 1 ? 1 : 0, borderColor: 'divider', py: 1.5 }}
            >
              <ListItemText primary={t} primaryTypographyProps={{ fontWeight: 600 }} />
              <ChevronRightIcon color="action" />
            </ListItemButton>
          ))}
        </List>
      </Card>
    </ProfilePageShell>
  )
}
