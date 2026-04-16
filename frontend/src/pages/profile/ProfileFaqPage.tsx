import { useState } from 'react'
import { Collapse, IconButton, List, ListItemButton, ListItemText, Stack, Typography } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import { WalletSubheader } from '../wallet/WalletSubheader'

const items = [
  { q: 'What is PayToday?', a: 'PayToday is a digital wallet and payments platform for Namibia.' },
  { q: 'How long does it take to process?', a: 'Most payments clear within seconds; bank transfers may take longer.' },
  { q: 'Is my card data stored?', a: 'Card details are tokenized per PCI practices when you connect a live processor.' },
] as const

export function ProfileFaqPage() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <Stack spacing={2} sx={{ maxWidth: 520, mx: 'auto', pb: 2 }}>
      <WalletSubheader title="Frequently Asked Questions" />
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
    </Stack>
  )
}
