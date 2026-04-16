import { Link as RouterLink, useLocation } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { WalletSubheader } from './WalletSubheader'
import { MOCK_CARDS } from '../../data/walletMock'

function CardBrand({ brand }: { brand: 'visa' | 'mastercard' }) {
  return (
    <Box
      sx={{
        width: 48,
        height: 32,
        borderRadius: 1,
        bgcolor: brand === 'visa' ? '#1A1F71' : '#EB001B',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.65rem',
        fontWeight: 800,
      }}
    >
      {brand === 'visa' ? 'VISA' : 'MC'}
    </Box>
  )
}

export function WalletCardsPage() {
  const { pathname } = useLocation()
  const prefix = pathname.startsWith('/embed') ? '/embed/wallet' : '/wallet'

  return (
    <Stack spacing={2} sx={{ maxWidth: 560, mx: 'auto' }}>
      <WalletSubheader title="My Cards" />
      <Typography variant="body2" color="text.secondary">
        Saved Cards
      </Typography>
      <Card variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider' }}>
        <List disablePadding>
          {MOCK_CARDS.map((c, i) => (
            <ListItem
              key={c.id}
              secondaryAction={
                <IconButton component={RouterLink} to={`${prefix}/cards/${c.id}`} edge="end" aria-label="Edit card">
                  <InfoOutlinedIcon />
                </IconButton>
              }
              sx={{
                py: 2,
                borderBottom: i < MOCK_CARDS.length - 1 ? 1 : 0,
                borderColor: 'divider',
              }}
            >
              <ListItemAvatar sx={{ minWidth: 56 }}>
                <CardBrand brand={c.brand} />
              </ListItemAvatar>
              <ListItemText
                primary={c.nickname}
                secondary={`**** ${c.last4}`}
                primaryTypographyProps={{ fontWeight: 700 }}
              />
            </ListItem>
          ))}
        </List>
      </Card>
      <Button component={RouterLink} to={`${prefix}/cards/new`} variant="contained" size="large" fullWidth sx={{ borderRadius: 2 }}>
        + Add Card
      </Button>
    </Stack>
  )
}
