import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom'
import {
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import PhoneIcon from '@mui/icons-material/Phone'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import { WalletSubheader } from '../wallet/WalletSubheader'
import { CLASSIFIEDS_MOCK, loadMyListings, type ClassifiedListing } from './classifiedsModel'
import { formatClassifiedPrice } from './classifiedsFormat'

function findListing(id: string | undefined): ClassifiedListing | undefined {
  if (!id) return undefined
  const mine = loadMyListings()
  return mine.find((a) => a.id === id) ?? CLASSIFIEDS_MOCK.find((a) => a.id === id)
}

export function ClassifiedsAdDetailPage() {
  const { id } = useParams()
  const { pathname } = useLocation()
  const listPath = pathname.startsWith('/embed') ? '/embed/classifieds' : '/classifieds'
  const [refresh, setRefresh] = useState(0)
  const [imageOpen, setImageOpen] = useState(false)
  const [messageOpen, setMessageOpen] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [sentOpen, setSentOpen] = useState(false)

  useEffect(() => {
    const onUpd = () => setRefresh((n) => n + 1)
    window.addEventListener('classifieds-my-ads-updated', onUpd)
    return () => window.removeEventListener('classifieds-my-ads-updated', onUpd)
  }, [])

  const ad = useMemo(() => findListing(id), [id, refresh])

  function openCall() {
    if (!ad?.contactPhone) return
    window.location.href = `tel:${ad.contactPhone.replace(/\s/g, '')}`
  }

  function sendMessage() {
    if (!messageText.trim()) return
    setMessageOpen(false)
    setMessageText('')
    setSentOpen(true)
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 560, mx: 'auto', pb: 10 }}>
      <WalletSubheader title="Listing" />
      {ad ? (
        <>
          <Box
            onClick={() => ad.imageUrl && setImageOpen(true)}
            sx={{
              height: 240,
              borderRadius: 3,
              overflow: 'hidden',
              cursor: ad.imageUrl ? 'pointer' : 'default',
              background: ad.imageUrl ? undefined : ad.imageGradient,
              backgroundImage: ad.imageUrl ? `url(${ad.imageUrl})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          <Typography variant="h5" fontWeight={800} color="primary">
            {formatClassifiedPrice(ad.priceCents, ad.listingType)}
          </Typography>
          <Typography variant="h6" fontWeight={800}>
            {ad.title}
          </Typography>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Avatar sx={{ bgcolor: 'primary.main', width: 40, height: 40 }}>
              {ad.sellerName.slice(0, 1).toUpperCase()}
            </Avatar>
            <Box>
              <Typography variant="subtitle2" fontWeight={700}>
                {ad.sellerName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {ad.listingType === 'rent' ? 'For rent' : 'For sale'} · {ad.category}
              </Typography>
            </Box>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {ad.location}
          </Typography>
          <Typography variant="body1" sx={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {ad.description}
          </Typography>
          <Stack direction="row" spacing={1.5} sx={{ pt: 2 }}>
            <Button
              variant="contained"
              fullWidth
              startIcon={<PhoneIcon />}
              onClick={openCall}
              sx={{ fontWeight: 800, py: 1.25 }}
            >
              Call
            </Button>
            <Button
              variant="outlined"
              fullWidth
              startIcon={<ChatBubbleOutlineIcon />}
              onClick={() => setMessageOpen(true)}
              sx={{ fontWeight: 800, py: 1.25 }}
            >
              Message
            </Button>
          </Stack>
        </>
      ) : (
        <Typography color="text.secondary">Listing not found.</Typography>
      )}
      <Button component={RouterLink} to={listPath} variant="text" sx={{ fontWeight: 700 }}>
        Back to classifieds
      </Button>

      <Dialog open={imageOpen} onClose={() => setImageOpen(false)} maxWidth="md" fullWidth>
        <DialogContent sx={{ p: 0, bgcolor: 'black' }}>
          {ad?.imageUrl ? (
            <Box component="img" src={ad.imageUrl} alt="" sx={{ width: '100%', display: 'block' }} />
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImageOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={messageOpen} onClose={() => setMessageOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 800 }}>Contact seller</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Your message is simulated here. Production would use PayToday messaging or SMS APIs.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={3}
            label="Message"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder={`Hi ${ad?.sellerName ?? 'there'}, I'm interested in "${ad?.title ?? 'this listing'}".`}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setMessageOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={sendMessage} sx={{ fontWeight: 700 }}>
            Send
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={sentOpen} onClose={() => setSentOpen(false)}>
        <DialogTitle sx={{ fontWeight: 800 }}>Message sent</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            The seller would normally be notified. Here we only confirm your action in this session.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setSentOpen(false)} sx={{ fontWeight: 700 }}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
