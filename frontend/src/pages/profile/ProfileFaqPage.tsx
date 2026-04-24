import { useState } from 'react'
import { Collapse, IconButton, List, ListItemButton, ListItemText, Stack, Typography } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import { ProfilePageShell } from '../../components/profile/ProfilePageShell'
import { APP_DISPLAY_NAME } from '../../theme/branding'
import { WalletSubheader } from '../wallet/WalletSubheader'

const items = [
  { q: `What is ${APP_DISPLAY_NAME}?`, a: 'Digital wallet and payments for Namibia.' },
  { q: 'How long do payments take?', a: 'Most clear in seconds; bank transfers can take longer.' },
  { q: 'Is card data stored?', a: 'Cards are tokenized when a live processor is connected.' },
] as const

export function ProfileFaqPage() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <ProfilePageShell>
      <WalletSubheader title="FAQ" />
      <List disablePadding>
        {items.map((item, i) => (
          <Stack key={item.q} sx={{ borderBottom: 1, borderColor: 'divider', py: 0.5 }}>
            <ListItemButton onClick={() => setOpen(open === i ? null : i)} sx={{ py: 1.5 }}>
              <ListItemText primary={item.q} primaryTypographyProps={{ fontWeight: 700 }} />
              <IconButton edge="end" size="small" aria-label={open === i ? 'Collapse' : 'Expand'}>
                {open === i ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </ListItemButton>
            <Collapse in={open === i}>
              <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 2 }}>
                {item.a}
              </Typography>
            </Collapse>
          </Stack>
        ))}
      </List>
    </ProfilePageShell>
  )
}
