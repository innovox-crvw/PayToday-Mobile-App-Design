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
} from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { WalletPageShell } from '../../components/wallet/WalletPageShell'
import { MOCK_CARDS } from '../../data/walletMock'
import { walletCardSx } from '../../theme/walletTheme'

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
    <WalletPageShell title="My Cards" showBack subtitle="Saved payment cards for checkout and top-ups.">
      <Card elevation={0} sx={walletCardSx}>
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
      <Button component={RouterLink} to={`${prefix}/cards/new`} variant="contained" size="large" fullWidth sx={{ borderRadius: 2, fontWeight: 800 }}>
        + Add Card
      </Button>
    </WalletPageShell>
  )
}
