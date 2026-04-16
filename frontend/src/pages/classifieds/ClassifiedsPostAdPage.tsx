import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import { WalletSubheader } from '../wallet/WalletSubheader'
import {
  POST_CATEGORIES,
  LOCATIONS,
  addMyListing,
  type ClassifiedListing,
  type ListingType,
} from './classifiedsModel'

const STEPS = ['Category', 'Photos', 'Details'] as const

export function ClassifiedsPostAdPage() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const prefix = pathname.startsWith('/embed') ? '/embed' : ''
  const listPath = prefix ? `${prefix}/classifieds` : '/classifieds'

  const [step, setStep] = useState(0)
  const [listingType, setListingType] = useState<ListingType>('sale')
  const [categorySlug, setCategorySlug] = useState<string>('')
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [priceText, setPriceText] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState<string>(LOCATIONS[0]!)
  const [contactPhone, setContactPhone] = useState('')
  const [sellerName, setSellerName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const categoryLabel = POST_CATEGORIES.find((c) => c.slug === categorySlug)?.label ?? ''

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => reject(new Error('read failed'))
      r.readAsDataURL(file)
    })
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    try {
      const url = await readFileAsDataUrl(file)
      if (url.length > 2_000_000) {
        setError('Image is too large for browser storage — try a smaller photo or skip for now.')
        setImageDataUrl(null)
        return
      }
      setError(null)
      setImageDataUrl(url)
    } catch {
      setError('Could not read image.')
    }
  }

  function nextFromCategory() {
    if (!categorySlug) {
      setError('Choose a category.')
      return
    }
    setError(null)
    setStep(1)
  }

  function nextFromPhotos() {
    setError(null)
    setStep(2)
  }

  function submit() {
    setError(null)
    const priceNum = Number(priceText.replace(/,/g, '').trim())
    if (!title.trim()) {
      setError('Enter an ad title.')
      return
    }
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setError('Enter a valid price.')
      return
    }
    if (!description.trim()) {
      setError('Enter a description.')
      return
    }
    if (!contactPhone.trim()) {
      setError('Enter a contact phone number.')
      return
    }
    const priceCents = Math.round(priceNum * 100)
    const cat = POST_CATEGORIES.find((c) => c.slug === categorySlug)
    const listing: ClassifiedListing = {
      id: crypto.randomUUID(),
      title: title.trim(),
      priceCents,
      location,
      category: cat?.label ?? categoryLabel,
      categorySlug,
      listingType,
      description: description.trim(),
      sellerName: sellerName.trim() || 'Seller',
      contactPhone: contactPhone.trim(),
      imageUrl: imageDataUrl,
      imageGradient: 'linear-gradient(135deg,#334155,#64748b)',
      isUserPosted: true,
    }
    addMyListing(listing)
    navigate(`${listPath}?tab=my`)
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 560, mx: 'auto', pb: 6 }}>
      <WalletSubheader title="Post Ad" />
      <Typography variant="body2" color="text.secondary" textAlign="center">
        Step {step + 1} of {STEPS.length} — {STEPS[step]}
      </Typography>

      {error ? (
        <Typography color="error" variant="body2">
          {error}
        </Typography>
      ) : null}

      {step === 0 ? (
        <Stack spacing={2}>
          <Typography variant="subtitle2" fontWeight={700} color="text.secondary">
            Listing type
          </Typography>
          <ToggleButtonGroup
            exclusive
            fullWidth
            value={listingType}
            onChange={(_, v) => v && setListingType(v)}
            sx={{ '& .MuiToggleButton-root': { fontWeight: 700, textTransform: 'none' } }}
          >
            <ToggleButton value="sale">For sale</ToggleButton>
            <ToggleButton value="rent">To rent</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="subtitle2" fontWeight={700} color="text.secondary">
            Category
          </Typography>
          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <List disablePadding>
              {POST_CATEGORIES.map((c, i) => {
                const Icon = c.icon
                return (
                  <ListItemButton
                    key={c.slug}
                    selected={categorySlug === c.slug}
                    onClick={() => setCategorySlug(c.slug)}
                    sx={{ borderBottom: i < POST_CATEGORIES.length - 1 ? 1 : 0, borderColor: 'divider' }}
                  >
                    <ListItemIcon sx={{ minWidth: 44 }}>
                      <Icon color={categorySlug === c.slug ? 'primary' : 'action'} />
                    </ListItemIcon>
                    <ListItemText primary={c.label} primaryTypographyProps={{ fontWeight: 600 }} />
                  </ListItemButton>
                )
              })}
            </List>
          </Paper>
          <Button variant="contained" size="large" onClick={nextFromCategory} sx={{ fontWeight: 800, py: 1.5 }}>
            Next
          </Button>
        </Stack>
      ) : null}

      {step === 1 ? (
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Add a photo (optional). Large files may fail to save in the browser — use a smaller image if needed.
          </Typography>
          <Paper
            variant="outlined"
            sx={{
              borderRadius: 3,
              minHeight: 220,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              p: 3,
              borderStyle: 'dashed',
              bgcolor: 'action.hover',
            }}
          >
            {imageDataUrl ? (
              <Box
                component="img"
                src={imageDataUrl}
                alt="Preview"
                sx={{ maxWidth: '100%', maxHeight: 200, borderRadius: 2 }}
              />
            ) : (
              <CloudUploadIcon sx={{ fontSize: 56, color: 'text.secondary' }} />
            )}
            <Button variant="outlined" component="label" sx={{ fontWeight: 700 }}>
              Upload photo
              <input type="file" accept="image/*" hidden onChange={onPickImage} />
            </Button>
            {imageDataUrl ? (
              <Button size="small" onClick={() => setImageDataUrl(null)}>
                Remove photo
              </Button>
            ) : null}
          </Paper>
          <Stack direction="row" gap={1}>
            <Button fullWidth variant="outlined" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button fullWidth variant="contained" onClick={nextFromPhotos} sx={{ fontWeight: 700 }}>
              Next
            </Button>
          </Stack>
        </Stack>
      ) : null}

      {step === 2 ? (
        <Stack spacing={2} component="form" onSubmit={(e) => e.preventDefault()}>
          <TextField label="Ad title" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth required />
          <TextField
            label={listingType === 'rent' ? 'Price per month (NAD)' : 'Price (NAD)'}
            value={priceText}
            onChange={(e) => setPriceText(e.target.value)}
            fullWidth
            required
            placeholder="e.g. 3900"
            helperText="Numbers only — cents added automatically (e.g. 3900 = N$3,900.00)"
          />
          <TextField label="Category" value={categoryLabel} fullWidth disabled />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            required
            multiline
            minRows={4}
          />
          <TextField select label="Location" value={location} onChange={(e) => setLocation(e.target.value)} fullWidth>
            {LOCATIONS.map((loc) => (
              <MenuItem key={loc} value={loc}>
                {loc}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Contact phone"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            fullWidth
            required
            placeholder="+264 …"
          />
          <TextField
            label="Your display name (optional)"
            value={sellerName}
            onChange={(e) => setSellerName(e.target.value)}
            fullWidth
            placeholder="Shown to buyers"
          />
          <Stack direction="row" gap={1} sx={{ pt: 1 }}>
            <Button fullWidth variant="outlined" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button fullWidth variant="contained" onClick={submit} sx={{ fontWeight: 800, py: 1.25 }}>
              Submit my ad
            </Button>
          </Stack>
        </Stack>
      ) : null}
    </Stack>
  )
}
