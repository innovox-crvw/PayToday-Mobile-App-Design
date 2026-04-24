import { useEffect, useMemo, useState, type SyntheticEvent } from 'react'
import { Link as RouterLink, useLocation, useSearchParams } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  CardActionArea,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fab,
  IconButton,
  InputBase,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import FilterListIcon from '@mui/icons-material/FilterList'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { APP_DISPLAY_NAME } from '../../theme/branding'
import { WalletSubheader } from '../wallet/WalletSubheader'
import {
  CLASSIFIEDS_MOCK,
  POST_CATEGORIES,
  type ClassifiedListing,
  acceptClassifiedsTerms,
  hasAcceptedClassifiedsTerms,
  deleteMyListing,
  loadMyListings,
} from './classifiedsModel'
import { formatClassifiedPrice } from './classifiedsFormat'

function listingThumb(listing: ClassifiedListing) {
  if (listing.imageUrl) {
    return (
      <Box
        sx={{
          width: 96,
          height: 96,
          flexShrink: 0,
          borderRadius: 2,
          overflow: 'hidden',
          backgroundImage: `url(${listing.imageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
    )
  }
  return (
    <Box
      sx={{
        width: 96,
        height: 96,
        flexShrink: 0,
        borderRadius: 2,
        background: listing.imageGradient,
      }}
    />
  )
}

export function ClassifiedsHomePage() {
  const { pathname } = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const prefix = pathname.startsWith('/embed') ? '/embed' : ''
  const base = prefix ? `${prefix}/classifieds` : '/classifieds'

  const tabParam = searchParams.get('tab') === 'my' ? 1 : 0
  const [tab, setTab] = useState(tabParam)
  const [search, setSearch] = useState('')
  const [categorySlug, setCategorySlug] = useState<string | 'all'>('all')
  const [termsOpen, setTermsOpen] = useState(false)
  const [filterAnchor, setFilterAnchor] = useState<null | HTMLElement>(null)
  const [myAds, setMyAds] = useState<ClassifiedListing[]>(() => loadMyListings())
  const [deleteTarget, setDeleteTarget] = useState<ClassifiedListing | null>(null)

  useEffect(() => {
    setTab(searchParams.get('tab') === 'my' ? 1 : 0)
  }, [searchParams])

  useEffect(() => {
    if (!hasAcceptedClassifiedsTerms()) setTermsOpen(true)
  }, [])

  useEffect(() => {
    const onUpd = () => setMyAds(loadMyListings())
    window.addEventListener('classifieds-my-ads-updated', onUpd)
    return () => window.removeEventListener('classifieds-my-ads-updated', onUpd)
  }, [])

  const allListings = useMemo(() => {
    const mockIds = new Set(myAds.map((m) => m.id))
    const rest = CLASSIFIEDS_MOCK.filter((m) => !mockIds.has(m.id))
    return [...myAds, ...rest]
  }, [myAds])

  const filtered = useMemo(() => {
    const source = tab === 1 ? myAds : allListings
    const q = search.trim().toLowerCase()
    return source.filter((ad) => {
      if (categorySlug !== 'all' && ad.categorySlug !== categorySlug) return false
      if (!q) return true
      return (
        (ad.title ?? '').toLowerCase().includes(q) ||
        (ad.description ?? '').toLowerCase().includes(q) ||
        (ad.location ?? '').toLowerCase().includes(q)
      )
    })
  }, [tab, search, categorySlug, allListings, myAds])

  function handleTab(_: SyntheticEvent, v: number) {
    setTab(v)
    const next = new URLSearchParams(searchParams)
    if (v === 1) next.set('tab', 'my')
    else next.delete('tab')
    setSearchParams(next, { replace: true })
  }

  function onProceedTerms() {
    acceptClassifiedsTerms()
    setTermsOpen(false)
  }

  return (
    <Stack spacing={2} sx={{ pb: 10 }}>
      <WalletSubheader
        title="Classifieds"
        rightSlot={
          <IconButton aria-label="Filter by category" onClick={(e) => setFilterAnchor(e.currentTarget)} size="small">
            <FilterListIcon />
          </IconButton>
        }
      />

      <Paper
        component="form"
        onSubmit={(e) => e.preventDefault()}
        variant="outlined"
        sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderRadius: 3 }}
      >
        <SearchIcon color="action" />
        <InputBase
          placeholder="Search ads…"
          fullWidth
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ fontSize: '0.95rem' }}
        />
      </Paper>

      <Tabs
        value={tab}
        onChange={handleTab}
        variant="fullWidth"
        sx={{
          minHeight: 44,
          '& .MuiTab-root': { fontWeight: 700, textTransform: 'none' },
          '& .Mui-selected': { color: 'primary.main' },
        }}
      >
        <Tab label="All Ads" />
        <Tab label="My Ads" />
      </Tabs>

      <Stack direction="row" gap={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip
          label="All categories"
          color={categorySlug === 'all' ? 'primary' : 'default'}
          onClick={() => setCategorySlug('all')}
          sx={{ fontWeight: 600 }}
        />
        {POST_CATEGORIES.slice(0, 6).map((c) => (
          <Chip
            key={c.slug}
            label={c.label}
            color={categorySlug === c.slug ? 'primary' : 'default'}
            variant={categorySlug === c.slug ? 'filled' : 'outlined'}
            onClick={() => setCategorySlug(c.slug)}
            sx={{ fontWeight: 600 }}
          />
        ))}
      </Stack>

      {tab === 1 && filtered.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, textAlign: 'center' }}>
          <Typography color="text.secondary" gutterBottom>
            You have not posted any ads yet.
          </Typography>
          <Button variant="contained" component={RouterLink} to={`${base}/post`} sx={{ mt: 2, fontWeight: 700 }}>
            Post your first ad
          </Button>
        </Paper>
      ) : (
        <Stack spacing={1.5}>
          {filtered.map((ad) => (
            <Card key={ad.id} variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
              <Stack direction="row" alignItems="stretch">
                <CardActionArea
                  component={RouterLink}
                  to={`${base}/${ad.id}`}
                  sx={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'stretch',
                    textAlign: 'left',
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {listingThumb(ad)}
                  <Stack spacing={0.5} sx={{ p: 1.5, flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" fontWeight={800} color="primary">
                      {formatClassifiedPrice(ad.priceCents, ad.listingType)}
                    </Typography>
                    <Typography variant="body1" fontWeight={700} sx={{ lineHeight: 1.3 }}>
                      {ad.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.35 }} noWrap>
                      {ad.description}
                    </Typography>
                    <Chip label={ad.location} size="small" sx={{ alignSelf: 'flex-start', mt: 0.5, fontWeight: 600 }} />
                  </Stack>
                </CardActionArea>
                {tab === 1 ? (
                  <IconButton
                    aria-label="Delete ad"
                    color="error"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setDeleteTarget(ad)
                    }}
                    sx={{ alignSelf: 'center', mr: 0.5 }}
                  >
                    <DeleteOutlineIcon />
                  </IconButton>
                ) : null}
              </Stack>
            </Card>
          ))}
        </Stack>
      )}

      {tab === 0 && filtered.length === 0 ? (
        <Typography variant="body2" color="text.secondary" textAlign="center">
          No listings match your search or filter.
        </Typography>
      ) : null}

      <Fab
        color="primary"
        aria-label="Post ad"
        component={RouterLink}
        to={`${base}/post`}
        sx={{
          position: 'fixed',
          right: 24,
          zIndex: 10,
          bottom: `calc(16px + var(--pt-store-bottom-nav-height, 120px))`,
        }}
      >
        <AddIcon />
      </Fab>

      <MenuFilterPopover
        anchorEl={filterAnchor}
        onClose={() => setFilterAnchor(null)}
        categorySlug={categorySlug}
        onPick={(slug) => {
          setCategorySlug(slug)
          setFilterAnchor(null)
        }}
      />

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Delete this ad?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {deleteTarget?.title ?? ''} will be removed from your ads. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setDeleteTarget(null)} sx={{ fontWeight: 700 }}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (deleteTarget) {
                deleteMyListing(deleteTarget.id)
                setMyAds(loadMyListings())
              }
              setDeleteTarget(null)
            }}
            sx={{ fontWeight: 700 }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={termsOpen} onClose={() => {}} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Terms and conditions</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" paragraph>
            By using {APP_DISPLAY_NAME} Classifieds you agree to post accurate information, comply with local law, and not use the
            service for fraud or prohibited goods. {APP_DISPLAY_NAME} does not guarantee transactions between buyers and sellers —
            you are responsible for verifying listings and safe meetups or payments.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Final terms for your organisation should be provided by your legal team.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="contained" fullWidth onClick={onProceedTerms} sx={{ fontWeight: 700, py: 1.25 }}>
            Proceed
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}

function MenuFilterPopover({
  anchorEl,
  onClose,
  categorySlug,
  onPick,
}: {
  anchorEl: null | HTMLElement
  onClose: () => void
  categorySlug: string | 'all'
  onPick: (slug: string | 'all') => void
}) {
  const open = Boolean(anchorEl)
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Category</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 0 }}>
        <Button fullWidth variant={categorySlug === 'all' ? 'contained' : 'outlined'} onClick={() => onPick('all')}>
          All categories
        </Button>
        {POST_CATEGORIES.map((c) => (
          <Button
            key={c.slug}
            fullWidth
            variant={categorySlug === c.slug ? 'contained' : 'outlined'}
            onClick={() => onPick(c.slug)}
          >
            {c.label}
          </Button>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
