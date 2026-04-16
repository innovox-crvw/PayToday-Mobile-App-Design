import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  Alert,
  Box,
  CircularProgress,
  IconButton,
  List,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Typography,
} from '@mui/material'
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew'
import { getPaymentHubTileBySlug } from '../../data/hubNavigationStatic'
import { useHubNavigationTiles } from '../../hooks/useHubNavigationTiles'
import {
  groupedContactItems,
  initialsFromDisplayName,
  letterBucket,
  lettersForBusinesses,
  symKey,
  tileToPaymentCategory,
  type PaymentBusinessRow,
  type PaymentContactRow,
} from '../../data/paymentsCatalog'
import { apiUrl, readApiError } from '../../lib/apiOrigin'
import type { HubPaymentCategoryItemsResponse } from '../../types/paymentCategoryItems'
import { AzIndexRail } from '../../components/payments/AzIndexRail'

function scrollToLetter(letter: string) {
  const id = letter === '#' ? `az-${symKey}` : `az-${letter}`
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function logoHue(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const hue = h % 360
  return `hsl(${hue}, 55%, 42%)`
}

function BusinessList({ rows, payBasePath }: { rows: PaymentBusinessRow[]; payBasePath: string }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => a.name.localeCompare(b.name)), [rows])
  return (
    <List disablePadding sx={{ pr: 0.5 }}>
      {sorted.map((row, idx) => {
        const L = letterBucket(row.name)
        const prevL = idx > 0 ? letterBucket(sorted[idx - 1]!.name) : ''
        const showAnchor = idx === 0 || L !== prevL
        const glyph = row.name.trim().charAt(0).toUpperCase() || '?'
        return (
          <Box key={row.id}>
            {showAnchor && <Box id={`az-${L}`} sx={{ scrollMarginTop: 72 }} />}
            <ListItemButton
              component={RouterLink}
              to={`${payBasePath}/${encodeURIComponent(row.id)}`}
              sx={{ borderRadius: 2, py: 1.25, px: 1.5 }}
            >
              <ListItemAvatar>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 2,
                    bgcolor: logoHue(row.name),
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '1rem',
                  }}
                >
                  {glyph}
                </Box>
              </ListItemAvatar>
              <ListItemText
                primary={row.name}
                secondary={row.paymentMethod?.trim() || undefined}
                primaryTypographyProps={{ fontWeight: 600, fontSize: '0.95rem' }}
                secondaryTypographyProps={{ variant: 'caption', color: 'text.secondary', sx: { mt: 0.25, lineHeight: 1.35 } }}
              />
            </ListItemButton>
          </Box>
        )
      })}
    </List>
  )
}

function ContactsList({ contacts, payBasePath }: { contacts: PaymentContactRow[]; payBasePath: string }) {
  const groups = useMemo(() => groupedContactItems(contacts), [contacts])
  return (
    <List disablePadding sx={{ pr: 0.5 }}>
      {groups.map((g) => (
        <Box key={g.letter} id={`az-${g.letter}`} sx={{ scrollMarginTop: 72 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', color: 'text.secondary', py: 1, pl: 1.5 }}>
            {g.letter}
          </Typography>
          {g.items.map((c) => (
            <ListItemButton
              key={c.id}
              component={RouterLink}
              to={`${payBasePath}/${encodeURIComponent(c.id)}`}
              sx={{ borderRadius: 2, py: 1.25, px: 1.5 }}
            >
              <ListItemAvatar>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 2,
                    bgcolor: '#2563EB',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '0.8rem',
                  }}
                >
                  {c.initials}
                </Box>
              </ListItemAvatar>
              <ListItemText
                primary={c.name}
                secondary={c.paymentMethod?.trim() || undefined}
                primaryTypographyProps={{ fontWeight: 600, fontSize: '0.95rem' }}
                secondaryTypographyProps={{ variant: 'caption', color: 'text.secondary', sx: { mt: 0.25, lineHeight: 1.35 } }}
              />
            </ListItemButton>
          ))}
        </Box>
      ))}
    </List>
  )
}

export function PaymentsCategoryPage() {
  const { categoryId } = useParams<{ categoryId: string }>()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const backTo = `${pathPrefix}/payments`
  const hubTiles = useHubNavigationTiles('payments')

  const [listItems, setListItems] = useState<PaymentBusinessRow[] | null>(null)
  const [contactItems, setContactItems] = useState<PaymentContactRow[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [listLoading, setListLoading] = useState(false)

  useEffect(() => {
    if (!categoryId) return
    let cancelled = false
    setListLoading(true)
    setListError(null)
    setListItems(null)
    setContactItems(null)
    ;(async () => {
      try {
        const res = await fetch(apiUrl(`/api/hub/payment-category-items?category=${encodeURIComponent(categoryId)}`))
        if (!res.ok) throw new Error(await readApiError(res))
        const data = (await res.json()) as HubPaymentCategoryItemsResponse
        if (cancelled) return
        const rows = data.items ?? []
        const contacts: PaymentContactRow[] = []
        const businesses: PaymentBusinessRow[] = []
        for (const it of rows) {
          if (it.itemKind === 'contact') {
            contacts.push({
              id: it.id,
              name: it.displayName,
              initials: (it.initials?.trim() || initialsFromDisplayName(it.displayName)).slice(0, 4),
              paymentMethod: it.paymentMethod ?? null,
            })
          } else {
            businesses.push({ id: it.id, name: it.displayName, paymentMethod: it.paymentMethod ?? null })
          }
        }
        setContactItems(contacts)
        setListItems(businesses)
      } catch (e) {
        if (!cancelled) {
          setListError(e instanceof Error ? e.message : 'Could not load list')
          setListItems([])
          setContactItems([])
        }
      } finally {
        if (!cancelled) setListLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [categoryId])

  const cat = useMemo(() => {
    if (!categoryId || hubTiles.loading) return undefined
    const tile = hubTiles.fromDatabase
      ? hubTiles.items.find((t) => t.slug === categoryId)
      : getPaymentHubTileBySlug(categoryId)
    return tile ? tileToPaymentCategory(tile) : undefined
  }, [categoryId, hubTiles.loading, hubTiles.fromDatabase, hubTiles.items])

  useEffect(() => {
    if (!categoryId || hubTiles.loading) return
    if (!cat) navigate(backTo, { replace: true })
  }, [categoryId, cat, hubTiles.loading, navigate, backTo])

  const businessRows = useMemo((): PaymentBusinessRow[] => {
    if (!cat || cat.listStyle === 'contacts') return []
    return listItems ?? []
  }, [cat, listItems])

  const contactsForList = useMemo((): PaymentContactRow[] => {
    if (!cat || cat.listStyle !== 'contacts') return []
    return contactItems ?? []
  }, [cat, contactItems])

  const azLetters = useMemo(() => {
    if (!cat) return []
    if (cat.listStyle === 'contacts') return groupedContactItems(contactsForList).map((g) => g.letter)
    return lettersForBusinesses(businessRows)
  }, [cat, businessRows, contactsForList])

  if (hubTiles.loading || !cat) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!categoryId) {
    return null
  }

  const title = cat.id === 'businesses' ? 'Business' : cat.label
  const payBasePath = `${pathPrefix}/payments/${encodeURIComponent(categoryId)}/pay`

  return (
    <Box sx={{ pb: 2 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          py: 1.5,
          px: { xs: 0, sm: 0 },
          mb: 1,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <IconButton onClick={() => navigate(backTo)} aria-label="Back" size="small" sx={{ ml: -0.5 }}>
          <ArrowBackIosNewIcon sx={{ fontSize: 18 }} />
        </IconButton>
        <Typography variant="h6" component="h1" fontWeight={800} sx={{ flex: 1, textAlign: 'center', pr: 4 }}>
          {title}
        </Typography>
      </Box>

      {listError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {listError}
        </Alert>
      ) : null}

      {listLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 0 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {cat.listStyle === 'contacts' ? (
              <ContactsList contacts={contactsForList} payBasePath={payBasePath} />
            ) : (
              <BusinessList rows={businessRows} payBasePath={payBasePath} />
            )}
          </Box>
          {azLetters.length > 0 && <AzIndexRail letters={azLetters} onPick={scrollToLetter} />}
        </Box>
      )}
    </Box>
  )
}
