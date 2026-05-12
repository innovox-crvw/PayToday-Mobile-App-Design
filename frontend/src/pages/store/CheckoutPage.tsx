import { useCallback, useEffect, useMemo, useState } from 'react'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Collapse,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Skeleton,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import { apiFetch, fetchCsrfToken, readResponseJson } from '../../api/client'
import { formatNad } from '../../data/walletMock'
import {
  CHECKOUT_IDEMPOTENCY_STORAGE_KEY,
  clearCheckoutIdempotencyKey,
} from '../../lib/checkoutIdempotency'
import { notifyCatalogInventoryMaybeChanged } from '../../lib/catalogEvents'
import { apiUrl } from '../../lib/apiOrigin'
import { formatMoney } from '../../lib/money'
import { APP_DISPLAY_NAME, APP_WALLET_DISPLAY_NAME } from '../../theme/branding'
import type { StorefrontConfig, CartTotalsPreview, LiquorCheckoutPreview } from '../../types/storefront'
import { parseEmailString } from '../../lib/inputValidators'
import { AddressMapPicker, type MapZoneMeta } from '../../components/checkout/AddressMapPicker'
import { DeliveryTimeSlotGrid } from '../../components/checkout/DeliveryTimeSlotGrid'
import type { YangoDemoSchedulePayload } from '../../components/checkout/checkoutScheduleTypes'
import { zoneCenter, approxDemoPinForAddressParts, YANGO_DEMO_ZONES, type YangoDemoZone } from '../../lib/yangoDeliveryDemo'

interface DepositLocation {
  id: string
  name: string
  addressSummary: string | null
}

interface AddressRow {
  id: string
  label: string | null
  line1: string
  city: string
  suburb?: string | null
  is_default?: boolean
  lat?: number | null
  lng?: number | null
}

function splitGuestFullName(full: string): { first: string; last: string } {
  const t = full.trim()
  if (!t) return { first: '', last: '' }
  const i = t.indexOf(' ')
  if (i === -1) return { first: t, last: '' }
  return { first: t.slice(0, i), last: t.slice(i + 1).trim() }
}

const STEP_LABELS = ['Delivery method', 'Address or pickup', 'Delivery time', 'Contact & payment']

const MINOR_LOCKER_ALCOHOL_MSG =
  'Lockers cannot be used for alcohol when your profile shows you are under 18. Remove alcoholic items from your cart, switch to home delivery if your account qualifies, or add a date of birth (18+) under My account.'

export function CheckoutPage() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const [activeStep, setActiveStep] = useState(0)
  const [selectedDeliveryZone, setSelectedDeliveryZone] = useState<YangoDemoZone | null>(null)
  const [delivery, setDelivery] = useState<'home' | 'deposit_box'>('home')
  const [locations, setLocations] = useState<DepositLocation[]>([])
  const [locationId, setLocationId] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestEmailErr, setGuestEmailErr] = useState<string | null>(null)
  const [guestFullName, setGuestFullName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [authResolved, setAuthResolved] = useState(false)
  const [user, setUser] = useState<{ sub?: string; email?: string; isAdult?: boolean } | null>(null)
  const [addresses, setAddresses] = useState<AddressRow[]>([])
  const [shippingAddressId, setShippingAddressId] = useState('')
  const [addressMode, setAddressMode] = useState<'saved' | 'new'>('saved')
  const [newLabel, setNewLabel] = useState('')
  const [newLine1, setNewLine1] = useState('')
  const [newLine2, setNewLine2] = useState('')
  const [newSuburb, setNewSuburb] = useState('')
  const [newCity, setNewCity] = useState('')
  const [newRegion, setNewRegion] = useState('')
  const [newPostalCode, setNewPostalCode] = useState('')
  const [newCountry, setNewCountry] = useState('NA')
  const [addressDetailsExpanded, setAddressDetailsExpanded] = useState(false)
  const [storefront, setStorefront] = useState<StorefrontConfig | null>(null)
  const [storefrontConfigReady, setStorefrontConfigReady] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'paytoday' | 'demo_wallet'>('paytoday')
  const [walletBalanceCents, setWalletBalanceCents] = useState<number | null>(null)
  const [walletDemoAvailable, setWalletDemoAvailable] = useState(true)
  const [deliveryScheduledFor, setDeliveryScheduledFor] = useState('')
  const [homeWinStart, setHomeWinStart] = useState('')
  const [homeWinEnd, setHomeWinEnd] = useState('')
  const [homeWinLabel, setHomeWinLabel] = useState('')
  const [totalsPreview, setTotalsPreview] = useState<CartTotalsPreview | null>(null)
  const [totalsError, setTotalsError] = useState<string | null>(null)
  const [yangoDemoCourierCents, setYangoDemoCourierCents] = useState<number | null>(null)
  const [promoCode, setPromoCode] = useState('')
  const [promoApplied, setPromoApplied] = useState<{ code: string; discountCents: number } | null>(null)
  const [promoErr, setPromoErr] = useState<string | null>(null)
  const [promoLoading, setPromoLoading] = useState(false)
  const [cartContainsAlcohol, setCartContainsAlcohol] = useState(false)
  const [liquorCheckout, setLiquorCheckout] = useState<LiquorCheckoutPreview | null>(null)
  const [deliveryPreferences, setDeliveryPreferences] = useState('')

  const mapsApiKey =
    typeof import.meta.env.VITE_GOOGLE_MAPS_API_KEY === 'string' ? import.meta.env.VITE_GOOGLE_MAPS_API_KEY : undefined

  const applyYangoDemoSchedule = useCallback((payload: YangoDemoSchedulePayload | null) => {
    if (!payload) {
      setDeliveryScheduledFor('')
      setHomeWinStart('')
      setHomeWinEnd('')
      setHomeWinLabel('')
      setYangoDemoCourierCents(null)
      return
    }
    const { demoCourierCents, ...rest } = payload
    setDeliveryScheduledFor(rest.deliveryScheduledFor)
    setHomeWinStart(rest.homeWinStart)
    setHomeWinEnd(rest.homeWinEnd)
    setHomeWinLabel(rest.homeWinLabel)
    setYangoDemoCourierCents(demoCourierCents)
  }, [])

  const handleZoneMeta = useCallback((m: MapZoneMeta) => {
    setSelectedDeliveryZone(m.zone)
    if (m.zone) setYangoDemoCourierCents(m.zone.courierEstimateCents)
    else setYangoDemoCourierCents(null)
  }, [])

  const idempotencyKey = useMemo(() => {
    try {
      let k = sessionStorage.getItem(CHECKOUT_IDEMPOTENCY_STORAGE_KEY)
      if (!k) {
        k = crypto.randomUUID()
        sessionStorage.setItem(CHECKOUT_IDEMPOTENCY_STORAGE_KEY, k)
      }
      return k
    } catch {
      return crypto.randomUUID()
    }
  }, [])

  const homeDeliveryAreaId = useMemo(() => {
    if (delivery !== 'home') return undefined
    const id = selectedDeliveryZone?.homeDeliveryAreaId?.trim()
    return id || undefined
  }, [delivery, selectedDeliveryZone])

  const fieldRadiusSx = { '& .MuiOutlinedInput-root': { borderRadius: 3 } }
  const cardSx = { borderRadius: 3, py: 0.5, px: 0.5 }

  useEffect(() => {
    void (async () => {
      try {
        const cfg = await fetch(apiUrl('/api/storefront-config'))
        if (cfg.ok) setStorefront((await cfg.json()) as StorefrontConfig)
      } catch {
        /* optional */
      } finally {
        setStorefrontConfigReady(true)
      }
    })()
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const me = await fetch(apiUrl('/api/auth/me'), { credentials: 'include' })
        if (me.ok) {
          const data = (await me.json()) as { user?: { sub: string; email?: string; isAdult?: boolean } }
          setUser(data.user ?? null)
        } else {
          setUser(null)
        }
      } catch {
        setUser(null)
      } finally {
        setAuthResolved(true)
      }
    })()
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(apiUrl('/api/deposit/locations'), { credentials: 'include' })
        if (!res.ok) return
        const data = (await res.json()) as { items: DepositLocation[] }
        setLocations(data.items ?? [])
        if (data.items?.[0]) setLocationId(data.items[0].id)
      } catch {
        /* ignore */
      }
    })()
  }, [])

  useEffect(() => {
    if (!user?.sub) return
    void (async () => {
      try {
        const res = await fetch(apiUrl('/api/addresses'), { credentials: 'include' })
        if (!res.ok) return
        const data = (await res.json()) as { items: AddressRow[] }
        setAddresses(data.items ?? [])
        const def = data.items?.find((a) => a.is_default) ?? data.items?.[0]
        if (def) setShippingAddressId(def.id)
      } catch {
        /* ignore */
      }
    })()
  }, [user])

  useEffect(() => {
    if (addresses.length === 0) queueMicrotask(() => setAddressMode('new'))
  }, [addresses.length])

  useEffect(() => {
    if (!user?.sub) {
      queueMicrotask(() => {
        setPaymentMethod('paytoday')
        setWalletBalanceCents(null)
      })
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await apiFetch('/api/wallet/balance')
        if (!res.ok || cancelled) return
        const data = (await res.json()) as { balanceCents?: number; walletDemoAvailable?: boolean }
        if (!cancelled) {
          setWalletBalanceCents(typeof data.balanceCents === 'number' ? data.balanceCents : 0)
          setWalletDemoAvailable(data.walletDemoAvailable !== false)
        }
      } catch {
        if (!cancelled) {
          setWalletBalanceCents(null)
          setWalletDemoAvailable(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.sub])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setTotalsError(null)
      try {
        const params = new URLSearchParams({ preview: '1' })
        if (delivery === 'home' && homeDeliveryAreaId) params.set('homeDeliveryAreaId', homeDeliveryAreaId)
        const res = await fetch(apiUrl(`/api/cart?${params.toString()}`), { credentials: 'include' })
        const data = await readResponseJson<{
          totalsPreview?: CartTotalsPreview
          lines?: Array<{ flags?: { alcohol?: boolean } }>
          liquorCheckout?: LiquorCheckoutPreview
        }>(res)
        if (cancelled) return
        if (!res.ok) {
          setTotalsPreview(null)
          setLiquorCheckout(null)
          setTotalsError('Could not load cart totals.')
          return
        }
        setTotalsPreview(data.totalsPreview ?? null)
        const lines = data.lines ?? []
        setCartContainsAlcohol(lines.some((l) => Boolean(l.flags?.alcohol)) || Boolean(data.liquorCheckout?.hasAlcohol))
        setLiquorCheckout(data.liquorCheckout ?? null)
      } catch {
        if (!cancelled) {
          setTotalsPreview(null)
          setLiquorCheckout(null)
          setTotalsError('Could not load cart totals.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [delivery, homeDeliveryAreaId])

  useEffect(() => {
    if (delivery !== 'home') setYangoDemoCourierCents(null)
  }, [delivery])

  useEffect(() => {
    setActiveStep(0)
  }, [delivery])

  const signedIn = Boolean(user?.sub)
  const homeBlocked = delivery === 'home' && !signedIn
  const checkoutAccountRequired = Boolean(storefront?.checkoutRequireSignIn)

  const addressStepComplete = useMemo(() => {
    if (delivery === 'deposit_box') return true
    if (!signedIn) return true
    if (delivery !== 'home') return true
    if (addressMode === 'saved') return Boolean(shippingAddressId)
    return Boolean(newLine1.trim() && newSuburb.trim() && newCity.trim())
  }, [delivery, signedIn, addressMode, shippingAddressId, newLine1, newSuburb, newCity])

  const pickupStepComplete = useMemo(() => Boolean(locationId), [locationId])

  const focusSavedAddressLatLng = useMemo(() => {
    if (addressMode !== 'saved' || !shippingAddressId) return null
    const a = addresses.find((x) => x.id === shippingAddressId)
    if (a && typeof a.lat === 'number' && typeof a.lng === 'number' && Number.isFinite(a.lat) && Number.isFinite(a.lng)) {
      return { lat: a.lat, lng: a.lng }
    }
    return null
  }, [addressMode, shippingAddressId, addresses])

  const savedAddressZoneCenter = useMemo(() => {
    if (addressMode !== 'saved' || !shippingAddressId) return null
    const a = addresses.find((x) => x.id === shippingAddressId)
    if (!a) return null
    if (focusSavedAddressLatLng) return null
    const fromText = approxDemoPinForAddressParts({ suburb: a.suburb, line1: a.line1, city: a.city })
    if (fromText) return fromText
    const match = a.city?.toLowerCase().includes('windhoek') || a.line1?.toLowerCase().includes('windhoek')
    if (!match) return null
    return zoneCenter(YANGO_DEMO_ZONES[0])
  }, [addressMode, shippingAddressId, addresses, focusSavedAddressLatLng])

  const mapFocusLatLng = focusSavedAddressLatLng ?? savedAddressZoneCenter

  const liquorTimeRequired = useMemo(
    () => delivery === 'home' && signedIn && Boolean(liquorCheckout?.requiresDeliveryTime),
    [delivery, signedIn, liquorCheckout],
  )

  const minorDepositLockerAlcoholBlocked = useMemo(
    () =>
      delivery === 'deposit_box' &&
      Boolean(storefront?.liquorGatingEnabled) &&
      signedIn &&
      user?.isAdult === false &&
      cartContainsAlcohol,
    [delivery, storefront?.liquorGatingEnabled, signedIn, user?.isAdult, cartContainsAlcohol],
  )

  const payDisabled =
    !storefrontConfigReady ||
    homeBlocked ||
    submitting ||
    (checkoutAccountRequired && !signedIn) ||
    (signedIn && delivery === 'home' && !addressStepComplete) ||
    (signedIn && delivery === 'home' && liquorTimeRequired && (!homeWinStart.trim() || !homeWinEnd.trim())) ||
    minorDepositLockerAlcoholBlocked

  const onboardingSignIn = `${pathPrefix}/onboarding/login?returnTo=${encodeURIComponent(`${pathPrefix}/checkout`)}`
  const onboardingRegister = `${pathPrefix}/onboarding/login?mode=register&returnTo=${encodeURIComponent(`${pathPrefix}/checkout`)}`

  const validateStepForContinue = useCallback(
    (step: number): string | null => {
      if (step === 0) {
        if (minorDepositLockerAlcoholBlocked) return MINOR_LOCKER_ALCOHOL_MSG
        return null
      }
      if (step === 1) {
        if (minorDepositLockerAlcoholBlocked) return MINOR_LOCKER_ALCOHOL_MSG
        if (delivery === 'deposit_box' && !pickupStepComplete) return 'Choose a pickup location.'
        if (delivery === 'home' && signedIn && !addressStepComplete) {
          return 'Choose a saved address or enter street, suburb, and city.'
        }
        if (delivery === 'home' && signedIn && storefrontConfigReady && storefront?.yangoEnabled && !selectedDeliveryZone) {
          return 'Place the delivery pin inside a zone or tap an area button on the map.'
        }
        return null
      }
      if (step === 2) {
        if (delivery === 'home' && signedIn && liquorTimeRequired) {
          if (!homeWinStart.trim() || !homeWinEnd.trim()) {
            return 'Your cart includes alcohol outside current liquor selling hours. Pick a delivery time window you can be available for, then continue.'
          }
        }
        return null
      }
      return null
    },
    [
      delivery,
      signedIn,
      addressStepComplete,
      pickupStepComplete,
      storefrontConfigReady,
      storefront?.yangoEnabled,
      selectedDeliveryZone,
      liquorTimeRequired,
      homeWinStart,
      homeWinEnd,
      minorDepositLockerAlcoholBlocked,
    ],
  )

  const handleStepNext = () => {
    setMsg(null)
    const err = validateStepForContinue(activeStep)
    if (err) {
      setMsg(err)
      return
    }
    setActiveStep((s) => Math.min(s + 1, STEP_LABELS.length - 1))
  }

  const handleStepBack = () => {
    setMsg(null)
    setActiveStep((s) => Math.max(s - 1, 0))
  }

  async function submit() {
    setMsg(null)
    setGuestEmailErr(null)
    if (minorDepositLockerAlcoholBlocked) {
      setMsg(MINOR_LOCKER_ALCOHOL_MSG)
      return
    }
    if (storefront?.checkoutRequireSignIn && !user?.sub) {
      setMsg('This store requires a signed-in account to check out. Open My account and sign in, then return here.')
      return
    }
    if (delivery === 'home' && !user?.sub) {
      setMsg('Sign in to use home delivery, or switch to pickup.')
      return
    }
    if (!user?.sub) {
      const ge = parseEmailString(guestEmail, 'guestEmail')
      if (!ge.ok) {
        setGuestEmailErr(ge.message)
        setMsg(ge.message)
        return
      }
    }
    let resolvedShippingId = shippingAddressId
    if (delivery === 'home' && user?.sub) {
      if (addressMode === 'saved') {
        if (!shippingAddressId) {
          setMsg('Choose a saved address or enter a new delivery address below.')
          return
        }
      } else {
        const line1 = newLine1.trim()
        const city = newCity.trim()
        const suburb = newSuburb.trim()
        if (!line1 || !suburb || !city) {
          setMsg('Enter street address, suburb, and city for home delivery.')
          return
        }
        try {
          await fetchCsrfToken()
          const addrRes = await apiFetch('/api/addresses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              label: newLabel.trim() || null,
              line1,
              line2: newLine2.trim() || null,
              suburb: suburb || null,
              city,
              region: newRegion.trim() || null,
              postalCode: newPostalCode.trim() || null,
              country: newCountry.trim() || 'NA',
              isDefault: false,
            }),
          })
          const addrData = (await addrRes.json()) as { id?: string; error?: string }
          if (!addrRes.ok) {
            setMsg(addrData.error ?? 'Could not save delivery address')
            return
          }
          if (!addrData.id) {
            setMsg('Could not save delivery address')
            return
          }
          resolvedShippingId = addrData.id
        } catch (e) {
          setMsg(e instanceof Error ? e.message : 'Could not save delivery address')
          return
        }
      }
    }
    if (delivery === 'home' && user?.sub && liquorTimeRequired) {
      if (!homeWinStart.trim() || !homeWinEnd.trim()) {
        setMsg(
          'Your cart includes alcohol outside current liquor selling hours. Go back to the delivery time step and pick a window when you can take delivery.',
        )
        return
      }
    }
    setSubmitting(true)
    try {
      await fetchCsrfToken()
      const guestParts = splitGuestFullName(guestFullName)
      const res = await apiFetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          deliveryMethod: delivery,
          depositLocationId: delivery === 'deposit_box' ? locationId : null,
          shippingAddressId: delivery === 'home' && user?.sub ? resolvedShippingId || null : null,
          guestEmail: !user?.sub ? guestEmail.trim() || null : null,
          guestFirstName: guestParts.first || null,
          guestLastName: guestParts.last || null,
          guestPhone: guestPhone.trim() || null,
          paymentMethod: user?.sub ? paymentMethod : 'paytoday',
          ...(deliveryPreferences.trim() ? { deliveryPreferences: deliveryPreferences.trim() } : {}),
          ...(promoApplied ? { discountCode: promoApplied.code } : {}),
          ...(delivery === 'home'
            ? {
                ...(deliveryScheduledFor.trim()
                  ? { deliveryScheduledFor: new Date(deliveryScheduledFor).toISOString() }
                  : {}),
                ...(homeWinStart.trim() && homeWinEnd.trim()
                  ? {
                      homeDeliveryWindow: {
                        start: new Date(homeWinStart).toISOString(),
                        end: new Date(homeWinEnd).toISOString(),
                        label: homeWinLabel.trim() || null,
                      },
                    }
                  : {}),
                ...(homeDeliveryAreaId && storefront?.yangoEnabled ? { homeDeliveryAreaId } : {}),
              }
            : {}),
        }),
      })
      const data = (await res.json()) as {
        redirectUrl?: string
        error?: string
        hint?: string
        orderId?: string
        subtotalCents?: number
        shippingCents?: number
        taxCents?: number
        paidWithDemoWallet?: boolean
        alreadyPaid?: boolean
        code?: string
      }
      if (!res.ok) {
        const hint = data.hint ? `\n\n${data.hint}` : ''
        const errText = typeof data.error === 'string' && data.error.trim() ? data.error : 'Checkout failed'
        setMsg(errText + hint)
        return
      }
      clearCheckoutIdempotencyKey()
      window.dispatchEvent(new Event('pt-cart-updated'))
      notifyCatalogInventoryMaybeChanged()
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl
        return
      }
      if (data.orderId && (data.paidWithDemoWallet || data.alreadyPaid)) {
        navigate(`${pathPrefix}/checkout/success?orderId=${encodeURIComponent(data.orderId)}`)
        return
      }
      setMsg(`Order ${data.orderId ?? ''} created.`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Checkout failed')
    } finally {
      setSubmitting(false)
    }
  }

  const totalCents =
    totalsPreview == null
      ? null
      : delivery === 'home'
        ? totalsPreview.totalHomeCents
        : totalsPreview.totalPickupCents

  const showFreeShippingProgress =
    delivery === 'home' &&
    totalsPreview &&
    totalsPreview.freeShippingThresholdCents > 0 &&
    totalsPreview.qualifiesFreeShippingHome === false

  const freeProgress =
    totalsPreview && totalsPreview.freeShippingThresholdCents > 0
      ? Math.min(100, Math.round((totalsPreview.subtotalCents / totalsPreview.freeShippingThresholdCents) * 100))
      : 0

  const renderStep0 = () => (
    <Card variant="outlined" sx={cardSx}>
      <CardContent sx={{ py: 1.5, px: 2 }}>
        <Stack spacing={2}>
          <Typography variant="subtitle1" fontWeight={900}>
            How do you want to receive your order?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Totals in the summary update when you switch method.
          </Typography>
          <ToggleButtonGroup
            exclusive
            fullWidth
            value={delivery}
            onChange={(_, v) => {
              if (v != null) setDelivery(v)
            }}
            aria-label="Delivery method"
            sx={{ '& .MuiToggleButton-root': { borderRadius: 2, py: 1, fontWeight: 700 } }}
          >
            <ToggleButton value="home">Home delivery</ToggleButton>
            <ToggleButton value="deposit_box">Pickup</ToggleButton>
          </ToggleButtonGroup>
          {delivery === 'deposit_box' ? (
            <>
              {minorDepositLockerAlcoholBlocked ? (
                <Alert severity="warning" sx={{ borderRadius: 2 }}>
                  {MINOR_LOCKER_ALCOHOL_MSG}{' '}
                  <RouterLink to={`${pathPrefix}/cart`}>Edit cart</RouterLink> or{' '}
                  <RouterLink to={`${pathPrefix}/profile`}>My account</RouterLink>.
                </Alert>
              ) : null}
              <TextField
                select
                label="Pickup location"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                fullWidth
                sx={fieldRadiusSx}
                error={!pickupStepComplete}
                helperText={!pickupStepComplete ? 'Select a location to continue.' : ' '}
              >
                {locations.map((l) => (
                  <MenuItem key={l.id} value={l.id}>
                    {l.name}
                    {l.addressSummary ? ` — ${l.addressSummary}` : ''}
                  </MenuItem>
                ))}
              </TextField>
            </>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  )

  const renderAddressFields = () => (
    <>
      <FormControl>
        <FormLabel id="addr-mode-label">Delivery address</FormLabel>
        <RadioGroup
          aria-labelledby="addr-mode-label"
          value={addressMode}
          onChange={(e) => setAddressMode(e.target.value as 'saved' | 'new')}
        >
          <FormControlLabel value="saved" control={<Radio />} label="Use a saved address" disabled={addresses.length === 0} />
          <FormControlLabel value="new" control={<Radio />} label="Enter a new address" />
        </RadioGroup>
      </FormControl>
      {addressMode === 'saved' && addresses.length > 0 && (
        <TextField
          select
          label="Saved address"
          value={shippingAddressId}
          onChange={(e) => setShippingAddressId(e.target.value)}
          fullWidth
          sx={fieldRadiusSx}
          helperText={
            <span>
              Manage addresses from <RouterLink to={`${pathPrefix}/profile`}>My account</RouterLink>.
            </span>
          }
        >
          {addresses.map((a) => (
            <MenuItem key={a.id} value={a.id}>
              {a.label ?? 'Address'} — {a.line1}
              {a.suburb?.trim() ? `, ${a.suburb.trim()}` : ''}, {a.city}
            </MenuItem>
          ))}
        </TextField>
      )}
      {addressMode === 'new' && (
        <Stack spacing={2}>
          <TextField
            label="Label (optional)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            fullWidth
            placeholder="e.g. Home, Work"
            sx={fieldRadiusSx}
          />
          <TextField
            label="Street address"
            value={newLine1}
            onChange={(e) => setNewLine1(e.target.value)}
            onBlur={() => setMsg(null)}
            fullWidth
            required
            error={!newLine1.trim()}
            helperText={!newLine1.trim() ? 'Street address is required for delivery.' : ' '}
            autoComplete="street-address"
            sx={fieldRadiusSx}
          />
          <TextField
            label="Apartment, suite, etc. (optional)"
            value={newLine2}
            onChange={(e) => setNewLine2(e.target.value)}
            fullWidth
            autoComplete="address-line2"
            sx={fieldRadiusSx}
          />
          <TextField
            label="Suburb"
            value={newSuburb}
            onChange={(e) => setNewSuburb(e.target.value)}
            fullWidth
            required
            error={!newSuburb.trim()}
            helperText={
              !newSuburb.trim()
                ? 'Suburb is required — it sets the delivery band (e.g. Olympia, Katutura, Klein Windhoek).'
                : 'Used with the delivery map for pricing.'
            }
            autoComplete="address-level3"
            sx={fieldRadiusSx}
          />
          <TextField
            label="City"
            value={newCity}
            onChange={(e) => setNewCity(e.target.value)}
            fullWidth
            required
            error={!newCity.trim()}
            helperText={!newCity.trim() ? 'City is required.' : ' '}
            autoComplete="address-level2"
            sx={fieldRadiusSx}
          />
          <Button size="small" onClick={() => setAddressDetailsExpanded((x) => !x)} sx={{ alignSelf: 'flex-start', fontWeight: 700 }}>
            {addressDetailsExpanded ? 'Hide' : 'Add'} region, postal & country
          </Button>
          <Collapse in={addressDetailsExpanded}>
            <Stack spacing={2}>
              <TextField
                label="Region / state (optional)"
                value={newRegion}
                onChange={(e) => setNewRegion(e.target.value)}
                fullWidth
                autoComplete="address-level1"
                sx={fieldRadiusSx}
              />
              <TextField
                label="Postal code (optional)"
                value={newPostalCode}
                onChange={(e) => setNewPostalCode(e.target.value)}
                fullWidth
                autoComplete="postal-code"
                sx={fieldRadiusSx}
              />
              <TextField
                label="Country code"
                value={newCountry}
                onChange={(e) => setNewCountry(e.target.value)}
                fullWidth
                helperText="Defaults to NA when omitted."
                sx={fieldRadiusSx}
              />
            </Stack>
          </Collapse>
        </Stack>
      )}
    </>
  )

  const renderStep1 = () => {
    if (delivery === 'deposit_box') {
      return (
        <Card variant="outlined" sx={cardSx}>
          <CardContent sx={{ py: 1.5, px: 2 }}>
            <Stack spacing={2}>
              <Typography variant="subtitle1" fontWeight={900}>
                Pickup
              </Typography>
              <Typography variant="body2" color="text.secondary">
                You chose pickup. Confirm the location you selected in step 1, or change it here.
              </Typography>
              {minorDepositLockerAlcoholBlocked ? (
                <Alert severity="warning" sx={{ borderRadius: 2 }}>
                  {MINOR_LOCKER_ALCOHOL_MSG}{' '}
                  <RouterLink to={`${pathPrefix}/cart`}>Edit cart</RouterLink> or{' '}
                  <RouterLink to={`${pathPrefix}/profile`}>My account</RouterLink>.
                </Alert>
              ) : null}
              <TextField
                select
                label="Pickup location"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                fullWidth
                sx={fieldRadiusSx}
                error={!pickupStepComplete}
                helperText={!pickupStepComplete ? 'Select a pickup location.' : ' '}
              >
                {locations.map((l) => (
                  <MenuItem key={l.id} value={l.id}>
                    {l.name}
                    {l.addressSummary ? ` — ${l.addressSummary}` : ''}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          </CardContent>
        </Card>
      )
    }
    if (!signedIn) {
      return (
        <Card variant="outlined" sx={cardSx}>
          <CardContent sx={{ py: 1.5, px: 2 }}>
            <Alert severity="warning" sx={{ borderRadius: 2 }}>
              Sign in to add a delivery address, or switch to pickup in step 1.
            </Alert>
          </CardContent>
        </Card>
      )
    }
    return (
      <Stack spacing={2}>
        <Card variant="outlined" sx={cardSx}>
          <CardContent sx={{ py: 1.5, px: 2 }}>
            <Stack spacing={2}>{renderAddressFields()}</Stack>
          </CardContent>
        </Card>
        {storefrontConfigReady && storefront?.yangoEnabled ? (
          <AddressMapPicker mapsApiKey={mapsApiKey} focusLatLng={mapFocusLatLng} onZoneMetaChange={handleZoneMeta} />
        ) : null}
      </Stack>
    )
  }

  const renderStep2 = () => {
    if (delivery === 'deposit_box') {
      return (
        <Card variant="outlined" sx={cardSx}>
          <CardContent sx={{ py: 1.5, px: 2 }}>
            <Typography variant="body1" fontWeight={700}>
              No delivery slot needed for pickup
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Continue to enter contact details and pay. You&apos;ll collect your order at the chosen location.
            </Typography>
          </CardContent>
        </Card>
      )
    }
    if (!signedIn) {
      return (
        <Card variant="outlined" sx={cardSx}>
          <CardContent sx={{ py: 1.5, px: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Delivery scheduling applies after you sign in and choose home delivery.
            </Typography>
          </CardContent>
        </Card>
      )
    }
    if (storefrontConfigReady && storefront?.yangoEnabled) {
      return (
        <Stack spacing={2}>
          {liquorTimeRequired ? (
            <Alert severity="warning" sx={{ borderRadius: 3 }}>
              Your cart includes alcohol and the store is outside liquor selling hours right now. Pick a delivery slot that
              falls inside the permitted window so we can avoid failed deliveries.
            </Alert>
          ) : null}
          <DeliveryTimeSlotGrid
            zone={selectedDeliveryZone}
            onScheduleChange={applyYangoDemoSchedule}
            cartContainsAlcohol={cartContainsAlcohol && Boolean(storefront?.liquorGatingEnabled)}
            outsideLiquorSellingWindow={Boolean(liquorCheckout?.outsideLiquorSellingWindow)}
          />
        </Stack>
      )
    }
    return (
      <Card variant="outlined" sx={cardSx}>
        <CardContent sx={{ py: 1.5, px: 2 }}>
          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={900}>
              {liquorTimeRequired ? 'Delivery time (required)' : 'Delivery scheduling (optional)'}
            </Typography>
            {liquorTimeRequired ? (
              <Alert severity="warning" sx={{ borderRadius: 2 }}>
                Alcohol is in your cart outside current selling hours — set a window when you can receive the delivery (local
                time).
              </Alert>
            ) : null}
            <Typography variant="caption" color="text.secondary">
              For scheduled home delivery, set a preferred time. Values are sent in your local timezone.
            </Typography>
            <TextField
              label="Prefer delivery on / after"
              type="datetime-local"
              value={deliveryScheduledFor}
              onChange={(e) => setDeliveryScheduledFor(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
              sx={fieldRadiusSx}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                label="Window start"
                type="datetime-local"
                value={homeWinStart}
                onChange={(e) => setHomeWinStart(e.target.value)}
                fullWidth
                required={liquorTimeRequired}
                error={liquorTimeRequired && !homeWinStart.trim()}
                helperText={liquorTimeRequired && !homeWinStart.trim() ? 'Required for alcohol delivery outside selling hours.' : ' '}
                InputLabelProps={{ shrink: true }}
                sx={fieldRadiusSx}
              />
              <TextField
                label="Window end"
                type="datetime-local"
                value={homeWinEnd}
                onChange={(e) => setHomeWinEnd(e.target.value)}
                fullWidth
                required={liquorTimeRequired}
                error={liquorTimeRequired && !homeWinEnd.trim()}
                helperText={liquorTimeRequired && !homeWinEnd.trim() ? 'Required for alcohol delivery outside selling hours.' : ' '}
                InputLabelProps={{ shrink: true }}
                sx={fieldRadiusSx}
              />
            </Stack>
            <TextField
              label="Window label (optional)"
              value={homeWinLabel}
              onChange={(e) => setHomeWinLabel(e.target.value)}
              fullWidth
              placeholder="e.g. After 5pm"
              sx={fieldRadiusSx}
            />
          </Stack>
        </CardContent>
      </Card>
    )
  }

  const renderStep3 = () => (
    <Stack spacing={2}>
      {!signedIn && (
        <TextField
          label="Contact email (required)"
          type="email"
          value={guestEmail}
          onChange={(e) => {
            setGuestEmail(e.target.value)
            setGuestEmailErr(null)
          }}
          fullWidth
          required
          autoComplete="email"
          helperText={guestEmailErr ?? `Receipts and ${APP_DISPLAY_NAME} checkout.`}
          error={Boolean(guestEmailErr)}
          disabled={submitting}
          sx={fieldRadiusSx}
        />
      )}
      {delivery === 'home' ? (
        <Card variant="outlined" sx={cardSx}>
          <CardContent sx={{ py: 1.5, px: 2 }}>
            <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 0.5 }}>
              Delivery preferences
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
              At work or hard to reach? Add gate codes, reception, or when to call — we attach this to your delivery window so
              couriers can avoid failed attempts.
            </Typography>
            <TextField
              label="Notes for the courier (optional)"
              value={deliveryPreferences}
              onChange={(e) => setDeliveryPreferences(e.target.value)}
              fullWidth
              multiline
              minRows={2}
              disabled={submitting}
              inputProps={{ maxLength: 280 }}
              sx={fieldRadiusSx}
            />
          </CardContent>
        </Card>
      ) : null}
      <Card variant="outlined" sx={cardSx}>
        <CardContent sx={{ py: 1.5, px: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Optional contact for the hosted {APP_DISPLAY_NAME} step.
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Full name (optional)"
              value={guestFullName}
              onChange={(e) => setGuestFullName(e.target.value)}
              fullWidth
              autoComplete="name"
              disabled={submitting}
              sx={fieldRadiusSx}
              helperText="Single word is sent as first name only."
            />
            <TextField
              label="Phone (optional)"
              type="tel"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              fullWidth
              autoComplete="tel"
              disabled={submitting}
              sx={fieldRadiusSx}
            />
          </Stack>
        </CardContent>
      </Card>
      {signedIn ? (
        <Card variant="outlined" sx={cardSx}>
          <CardContent sx={{ py: 1.5, px: 2 }}>
            <FormControl>
              <FormLabel id="pay-method-label">Payment</FormLabel>
              <RadioGroup
                aria-labelledby="pay-method-label"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as 'paytoday' | 'demo_wallet')}
              >
                <FormControlLabel value="paytoday" control={<Radio />} label={`${APP_DISPLAY_NAME} (hosted checkout)`} disabled={submitting} />
                <FormControlLabel
                  value="demo_wallet"
                  control={<Radio />}
                  disabled={submitting || !walletDemoAvailable}
                  label={
                    <Stack spacing={0.25}>
                      <Typography fontWeight={700}>{APP_WALLET_DISPLAY_NAME}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {walletDemoAvailable
                          ? walletBalanceCents != null
                            ? `Available: ${formatNad(walletBalanceCents)} — debited when the order is placed.`
                            : 'Loading wallet balance…'
                          : 'Wallet checkout is not available on this database.'}
                      </Typography>
                    </Stack>
                  }
                />
              </RadioGroup>
            </FormControl>
          </CardContent>
        </Card>
      ) : null}
    </Stack>
  )

  const stepBody = (index: number) => {
    switch (index) {
      case 0:
        return renderStep0()
      case 1:
        return renderStep1()
      case 2:
        return renderStep2()
      case 3:
        return renderStep3()
      default:
        return null
    }
  }

  return (
    <Box sx={{ maxWidth: 1160, mx: 'auto', px: { xs: 2, sm: 3 }, py: 2 }}>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 7 }} sx={{ order: { xs: 1 } }}>
          <Stack spacing={3}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
              <Typography variant="h5" component="h1" fontWeight={800}>
                Checkout
              </Typography>
              <Button component={RouterLink} to={`${pathPrefix}/cart`} variant="text" size="small" sx={{ fontWeight: 700 }}>
                Back to cart
              </Button>
            </Stack>

            {storefrontConfigReady && checkoutAccountRequired && (
              <Alert severity="info">
                Guest checkout is turned off for this deployment. <RouterLink to={onboardingSignIn}>Sign in</RouterLink> (or{' '}
                <RouterLink to={onboardingRegister}>register</RouterLink>) before paying.
              </Alert>
            )}
            {authResolved && (
              <Alert severity={signedIn ? 'success' : 'warning'}>
                {signedIn ? (
                  <>
                    Signed in{user?.email ? ` as ${user.email}` : ''}. Home delivery uses your account address (saved or entered
                    below).
                  </>
                ) : (
                  <>
                    You are not signed in. Home delivery requires an account — <RouterLink to={onboardingSignIn}>sign in</RouterLink>{' '}
                    or <RouterLink to={onboardingRegister}>register</RouterLink>, or choose pickup.
                  </>
                )}
              </Alert>
            )}

            <Alert severity="info" sx={{ borderRadius: 3 }}>
              Home delivery is for signed-in customers.{' '}
              {storefront?.shippingFreeSubtotalCents ? (
                <>
                  Free home delivery from {formatMoney(storefront.shippingFreeSubtotalCents, 'NAD')} subtotal
                  {storefront.shippingFlatCents > 0 ? `; otherwise ${formatMoney(storefront.shippingFlatCents, 'NAD')}.` : '.'}{' '}
                </>
              ) : storefront && storefront.shippingFlatCents > 0 ? (
                <>Home delivery: {formatMoney(storefront.shippingFlatCents, 'NAD')}. </>
              ) : null}
              {storefront && storefront.vatRateBps > 0 ? <>VAT included ({(storefront.vatRateBps / 100).toFixed(2)}%). </> : null}
              Pickup has no delivery fee.
            </Alert>

            <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 2, '& .MuiStepLabel-label': { fontWeight: 800, fontSize: '0.75rem' } }}>
              {STEP_LABELS.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>
            <Box sx={{ minHeight: 120 }}>{stepBody(activeStep)}</Box>
            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              <Button disabled={activeStep === 0} onClick={handleStepBack} size="medium" sx={{ fontWeight: 700 }}>
                Back
              </Button>
              {activeStep < STEP_LABELS.length - 1 ? (
                <Button variant="contained" onClick={handleStepNext} size="medium" sx={{ fontWeight: 800 }}>
                  Continue
                </Button>
              ) : null}
            </Stack>

            {msg && (
              <Alert severity={msg.includes('Order') ? 'success' : 'error'} sx={msg.includes('Order') ? undefined : { whiteSpace: 'pre-wrap' }}>
                {msg}
              </Alert>
            )}

            <Button component={RouterLink} to={`${pathPrefix}/orders/track`} variant="text" size="small" sx={{ alignSelf: 'flex-start' }}>
              Track an order
            </Button>
          </Stack>
        </Grid>

        <Grid
          size={{ xs: 12, md: 5 }}
          sx={{
            order: { xs: 2 },
            position: { md: 'sticky' },
            top: { md: 16 },
            alignSelf: { md: 'flex-start' },
          }}
        >
          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
            <Typography variant="subtitle1" fontWeight={900} sx={{ mb: 2 }}>
              Order summary
            </Typography>

            {totalsError ? <Alert severity="warning">{totalsError}</Alert> : null}

            {minorDepositLockerAlcoholBlocked ? (
              <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
                {MINOR_LOCKER_ALCOHOL_MSG}{' '}
                <RouterLink to={`${pathPrefix}/cart`}>Edit cart</RouterLink> or{' '}
                <RouterLink to={`${pathPrefix}/profile`}>My account</RouterLink>.
              </Alert>
            ) : null}

            {totalsPreview == null && !totalsError ? (
              <Stack spacing={1} sx={{ mb: 2 }}>
                <Skeleton variant="text" width="60%" height={28} />
                <Skeleton variant="text" width="100%" />
                <Skeleton variant="text" width="100%" />
                <Skeleton variant="text" width="80%" />
              </Stack>
            ) : totalsPreview ? (
              <Stack spacing={1} sx={{ mb: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                  <Typography variant="body2" fontWeight={800}>
                    Subtotal
                  </Typography>
                  <Typography variant="body2" fontWeight={800} textAlign="right">
                    {formatMoney(totalsPreview.subtotalCents, totalsPreview.currency)}
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                  <Typography variant="body2" fontWeight={800}>
                    Shipping
                  </Typography>
                  <Typography variant="body2" fontWeight={800} textAlign="right">
                    {formatMoney(delivery === 'home' ? totalsPreview.shippingCentsHome : totalsPreview.shippingCentsPickup, totalsPreview.currency)}
                  </Typography>
                </Stack>
                {delivery === 'home' && homeDeliveryAreaId && selectedDeliveryZone?.name ? (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: -0.5 }}>
                    {selectedDeliveryZone.name} — area rate
                  </Typography>
                ) : null}
                {yangoDemoCourierCents != null && delivery === 'home' && storefront?.yangoEnabled ? (
                  <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                    <Typography variant="body2" fontWeight={800}>
                      Yango courier (demo)
                    </Typography>
                    <Typography variant="body2" fontWeight={800} textAlign="right">
                      {formatMoney(yangoDemoCourierCents, totalsPreview.currency)}
                    </Typography>
                  </Stack>
                ) : null}
                <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                  <Typography variant="body2" fontWeight={800}>
                    Tax
                  </Typography>
                  <Typography variant="body2" fontWeight={800} textAlign="right">
                    {formatMoney(totalsPreview.taxCents, totalsPreview.currency)}
                  </Typography>
                </Stack>
                {promoApplied && promoApplied.discountCents > 0 ? (
                  <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                    <Typography variant="body2" color="success.main" fontWeight={800}>
                      Promo ({promoApplied.code})
                    </Typography>
                    <Typography variant="body2" color="success.main" fontWeight={800} textAlign="right">
                      -{formatMoney(promoApplied.discountCents, totalsPreview.currency)}
                    </Typography>
                  </Stack>
                ) : null}
                <Divider sx={{ my: 0.5 }} />
                <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                  <Typography variant="body1" fontWeight={900}>
                    Total
                  </Typography>
                  <Typography variant="body1" fontWeight={900} textAlign="right">
                    {totalCents != null ? formatMoney(totalCents, totalsPreview.currency) : '—'}
                  </Typography>
                </Stack>
              </Stack>
            ) : null}

            {showFreeShippingProgress ? (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={700} display="block" sx={{ mb: 0.5 }}>
                  Free home delivery progress
                </Typography>
                <LinearProgress variant="determinate" value={freeProgress} sx={{ height: 8, borderRadius: 1 }} aria-label="Progress toward free home delivery" />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  Add {formatMoney(Math.max(0, totalsPreview!.freeShippingThresholdCents - totalsPreview!.subtotalCents), totalsPreview!.currency)} more for
                  free delivery.
                </Typography>
              </Box>
            ) : null}

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
              Promo code
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
              <TextField
                size="small"
                label="Code"
                value={promoCode}
                onChange={(e) => {
                  setPromoCode(e.target.value.toUpperCase())
                  setPromoErr(null)
                }}
                disabled={!!promoApplied}
                sx={{ flex: 1 }}
                error={!!promoErr}
                helperText={promoErr ?? (promoApplied ? `Applied — ${formatMoney(promoApplied.discountCents, totalsPreview?.currency ?? 'NAD')} off` : ' ')}
              />
              {promoApplied ? (
                <Button size="small" variant="outlined" color="error" onClick={() => { setPromoApplied(null); setPromoCode('') }} sx={{ fontWeight: 700 }}>
                  Remove
                </Button>
              ) : (
                <Button
                  size="small"
                  variant="outlined"
                  disabled={!promoCode.trim() || promoLoading}
                  sx={{ fontWeight: 700, minWidth: 96 }}
                  onClick={async () => {
                    if (!promoCode.trim()) return
                    setPromoLoading(true)
                    setPromoErr(null)
                    try {
                      const params = new URLSearchParams({ preview: '1', discountCode: promoCode.trim() })
                      if (delivery === 'home' && homeDeliveryAreaId) params.set('homeDeliveryAreaId', homeDeliveryAreaId)
                      const res = await fetch(apiUrl(`/api/cart?${params.toString()}`), { credentials: 'include' })
                      const body = (await res.json()) as { discountCents?: number; error?: string }
                      if (!res.ok) throw new Error(body.error ?? 'Invalid code')
                      setPromoApplied({ code: promoCode.trim(), discountCents: body.discountCents ?? 0 })
                    } catch (e) {
                      setPromoErr(e instanceof Error ? e.message : 'Invalid code')
                    } finally {
                      setPromoLoading(false)
                    }
                  }}
                >
                  {promoLoading ? <CircularProgress size={18} /> : 'Apply'}
                </Button>
              )}
            </Stack>

            <Button
              variant="contained"
              size="large"
              fullWidth
              onClick={() => void submit()}
              disabled={payDisabled}
              startIcon={submitting ? <CircularProgress color="inherit" size={22} aria-hidden /> : <LockOutlinedIcon aria-hidden />}
              sx={{ py: 1.25, fontWeight: 900, borderRadius: 2 }}
            >
              {submitting
                ? 'Processing…'
                : paymentMethod === 'demo_wallet' && signedIn
                  ? 'Place order & pay with wallet'
                  : `Pay with ${APP_DISPLAY_NAME}`}
            </Button>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}
