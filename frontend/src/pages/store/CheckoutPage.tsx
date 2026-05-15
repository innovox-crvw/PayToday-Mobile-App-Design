import { useCallback, useEffect, useMemo, useState } from 'react'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined'
import useMediaQuery from '@mui/material/useMediaQuery'
import { alpha, useTheme } from '@mui/material/styles'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
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
import { CHECKOUT_DEMO_ADDRESS_PRESETS } from '../../lib/checkoutDemoAddressPresets'
import { buildLiquorSchedulePresets, buildLiquorSchedulePresetsFromAreaSlots } from '../../lib/checkoutLiquorTimePresets'
import { notifyCatalogInventoryMaybeChanged } from '../../lib/catalogEvents'
import { apiUrl } from '../../lib/apiOrigin'
import { formatMoney } from '../../lib/money'
import { APP_DISPLAY_NAME, APP_WALLET_DISPLAY_NAME } from '../../theme/branding'
import type { StorefrontConfig, CartTotalsPreview, LiquorCheckoutPreview, StoreCheckoutPreview } from '../../types/storefront'
import { buildStoreSchedulePresets, clearCheckoutSchedulePreset, readCheckoutSchedulePreset } from '../../lib/storeHours'
import { useStoreHours } from '../../hooks/useStoreHours'
import { parseEmailString } from '../../lib/inputValidators'
import { AddressMapPicker, type MapZoneMeta } from '../../components/checkout/AddressMapPicker'
import { DeliveryTimeSlotGrid } from '../../components/checkout/DeliveryTimeSlotGrid'
import type { YangoDemoSchedulePayload } from '../../components/checkout/checkoutScheduleTypes'
import {
  zoneCenter,
  approxDemoPinForAddressParts,
  defaultYangoDemoPin,
  findYangoDemoZoneForPin,
  YANGO_DEMO_ZONES,
  type YangoDemoZone,
} from '../../lib/yangoDeliveryDemo'
import { fetchHomeDeliveryZones } from '../../lib/yangoHomeDeliveryApi'

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

interface CheckoutCartLine {
  lineId: string
  variantId: string
  quantity: number
  sku: string
  name: string
  unitPriceCents: number
  currency: string
}

function splitGuestFullName(full: string): { first: string; last: string } {
  const t = full.trim()
  if (!t) return { first: '', last: '' }
  const i = t.indexOf(' ')
  if (i === -1) return { first: t, last: '' }
  return { first: t.slice(0, i), last: t.slice(i + 1).trim() }
}

const STEP_LABELS = ['Delivery method', 'Address or pickup', 'Time window', 'Contact & payment']

type CheckoutDeliveryMethod = 'home' | 'yango_delivery' | 'store_pickup' | 'deposit_box'

function isCheckoutHomeLike(d: CheckoutDeliveryMethod): boolean {
  return d === 'home' || d === 'yango_delivery'
}

function isCheckoutPickupLike(d: CheckoutDeliveryMethod): boolean {
  return d === 'store_pickup' || d === 'deposit_box'
}

function checkoutUsesYangoScheduleGrid(d: CheckoutDeliveryMethod, yangoEnabled: boolean | undefined): boolean {
  return Boolean(yangoEnabled) && d === 'yango_delivery'
}

const MINOR_LOCKER_ALCOHOL_MSG =
  'Lockers cannot be used for alcohol when your profile shows you are under 18. Remove alcoholic items from your cart, switch to home delivery if your account qualifies, or add a date of birth (18+) under My account.'

export function CheckoutPage() {
  const theme = useTheme()
  const narrowForToggles = useMediaQuery(theme.breakpoints.down('sm'))
  const compactStepper = useMediaQuery(theme.breakpoints.down('md'))
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const [activeStep, setActiveStep] = useState(0)
  const [selectedDeliveryZone, setSelectedDeliveryZone] = useState<YangoDemoZone | null>(null)
  const [delivery, setDelivery] = useState<CheckoutDeliveryMethod>('home')
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
  const [checkoutDemoPresetId, setCheckoutDemoPresetId] = useState<string | null>(null)
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
  const [checkoutCartLines, setCheckoutCartLines] = useState<CheckoutCartLine[]>([])
  const [liquorCheckout, setLiquorCheckout] = useState<LiquorCheckoutPreview | null>(null)
  const [storeCheckout, setStoreCheckout] = useState<StoreCheckoutPreview | null>(null)
  const { status: storeHoursStatus } = useStoreHours()
  const [deliveryPreferences, setDeliveryPreferences] = useState('')
  const [homeDeliveryZones, setHomeDeliveryZones] = useState<YangoDemoZone[]>(YANGO_DEMO_ZONES)
  const [cartMutateNonce, setCartMutateNonce] = useState(0)

  const mapsApiKey =
    typeof import.meta.env.VITE_GOOGLE_MAPS_API_KEY === 'string' ? import.meta.env.VITE_GOOGLE_MAPS_API_KEY : undefined

  const showCheckoutDemoAddressPresets = import.meta.env.VITE_SHOW_CHECKOUT_DEMO_PRESETS !== 'false'

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

  const handleZoneMeta = useCallback(
    (m: MapZoneMeta) => {
      const z = m.zone
      if (!z) {
        setSelectedDeliveryZone(null)
        setYangoDemoCourierCents(null)
        return
      }
      const full = homeDeliveryZones.find((d) => d.id === z.id) ?? z
      setSelectedDeliveryZone(full)
      if (full) setYangoDemoCourierCents(full.courierEstimateCents)
      else setYangoDemoCourierCents(null)
    },
    [homeDeliveryZones],
  )

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
    if (!isCheckoutHomeLike(delivery) || !selectedDeliveryZone) return undefined
    const uuid = selectedDeliveryZone.homeDeliveryAreaId?.trim()
    if (uuid) return uuid
    const code = selectedDeliveryZone.id?.trim()
    return code || undefined
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
    if (!storefrontConfigReady) return
    if (delivery === 'yango_delivery' && !storefront?.yangoEnabled) {
      setDelivery('home')
    }
  }, [storefrontConfigReady, storefront?.yangoEnabled, delivery])

  useEffect(() => {
    void fetchHomeDeliveryZones().then(setHomeDeliveryZones)
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
        if (isCheckoutHomeLike(delivery) && homeDeliveryAreaId) params.set('homeDeliveryAreaId', homeDeliveryAreaId)
        const res = await fetch(apiUrl(`/api/cart?${params.toString()}`), { credentials: 'include' })
        const data = await readResponseJson<{
          totalsPreview?: CartTotalsPreview
          items?: CheckoutCartLine[]
          lines?: Array<{ flags?: { alcohol?: boolean } }>
          liquorCheckout?: LiquorCheckoutPreview
          storeCheckout?: StoreCheckoutPreview
        }>(res)
        if (cancelled) return
        if (!res.ok) {
          setTotalsPreview(null)
          setLiquorCheckout(null)
          setStoreCheckout(null)
          setCheckoutCartLines([])
          setTotalsError('Could not load cart totals.')
          return
        }
        setTotalsPreview(data.totalsPreview ?? null)
        const items = data.items ?? []
        setCheckoutCartLines(items)
        const legacyLines = data.lines ?? []
        setCartContainsAlcohol(
          legacyLines.some((l) => Boolean(l.flags?.alcohol)) ||
            Boolean(data.liquorCheckout?.hasAlcohol),
        )
        setLiquorCheckout(data.liquorCheckout ?? null)
        setStoreCheckout(data.storeCheckout ?? null)
      } catch {
        if (!cancelled) {
          setTotalsPreview(null)
          setLiquorCheckout(null)
          setStoreCheckout(null)
          setCheckoutCartLines([])
          setTotalsError('Could not load cart totals.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [delivery, homeDeliveryAreaId, selectedDeliveryZone?.id, cartMutateNonce])

  useEffect(() => {
    const preset = readCheckoutSchedulePreset()
    if (!preset) return
    setHomeWinStart(preset.startLocal)
    setHomeWinEnd(preset.endLocal)
    setHomeWinLabel(preset.label || 'Scheduled order')
    setDeliveryScheduledFor(preset.startLocal)
    clearCheckoutSchedulePreset()
  }, [])

  useEffect(() => {
    if (!isCheckoutHomeLike(delivery)) setYangoDemoCourierCents(null)
  }, [delivery])

  useEffect(() => {
    setActiveStep(0)
  }, [delivery])

  const signedIn = Boolean(user?.sub)
  const homeBlocked = isCheckoutHomeLike(delivery) && !signedIn
  const checkoutAccountRequired = Boolean(storefront?.checkoutRequireSignIn)

  const addressStepComplete = useMemo(() => {
    if (isCheckoutPickupLike(delivery)) return true
    if (!signedIn) return true
    if (!isCheckoutHomeLike(delivery)) return true
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

  /** Centres the checkout map pin from typed street / suburb / city (e.g. “Olympia” → north-east band). */
  const newAddressTextFocus = useMemo(() => {
    if (addressMode !== 'new') return null
    return approxDemoPinForAddressParts({ suburb: newSuburb, line1: newLine1, city: newCity })
  }, [addressMode, newSuburb, newLine1, newCity])

  const mapFocusLatLng = focusSavedAddressLatLng ?? savedAddressZoneCenter ?? newAddressTextFocus

  /**
   * Cart `/api/cart?preview=1` uses `homeDeliveryAreaId` (DB UUID when available, otherwise zone `id` / area `code`
   * for Windhoek demos). Keep `selectedDeliveryZone` aligned with the address-implied map pin and with DB-backed zones
   * when they load after mount — otherwise shipping stays on defaults.
   * Map drags still update via `handleZoneMeta` when `mapFocusLatLng` is unchanged.
   */
  useEffect(() => {
    if (!isCheckoutHomeLike(delivery) || !storefrontConfigReady) return
    const pin = mapFocusLatLng ?? defaultYangoDemoPin()
    const z = findYangoDemoZoneForPin(pin.lat, pin.lng, homeDeliveryZones)
    setSelectedDeliveryZone(z)
    if (z) setYangoDemoCourierCents(z.courierEstimateCents)
    else setYangoDemoCourierCents(null)
  }, [delivery, storefrontConfigReady, mapFocusLatLng, homeDeliveryZones])

  useEffect(() => {
    if (addressMode !== 'new') setCheckoutDemoPresetId(null)
  }, [addressMode])

  useEffect(() => {
    if (!checkoutDemoPresetId || addressMode !== 'new') return
    const preset = CHECKOUT_DEMO_ADDRESS_PRESETS.find((x) => x.id === checkoutDemoPresetId)
    if (!preset) {
      setCheckoutDemoPresetId(null)
      return
    }
    if (
      newLine1.trim() !== preset.line1.trim() ||
      newLine2.trim() !== preset.line2.trim() ||
      newSuburb.trim() !== preset.suburb.trim() ||
      newCity.trim() !== preset.city.trim() ||
      newRegion.trim() !== preset.region.trim() ||
      newPostalCode.trim() !== preset.postalCode.trim() ||
      newCountry.trim() !== preset.country.trim()
    ) {
      setCheckoutDemoPresetId(null)
    }
  }, [
    addressMode,
    checkoutDemoPresetId,
    newLine1,
    newLine2,
    newSuburb,
    newCity,
    newRegion,
    newPostalCode,
    newCountry,
  ])

  const storeScheduleRequired = useMemo(
    () => Boolean(storeCheckout?.requiresScheduledTime),
    [storeCheckout],
  )

  const liquorScheduleRequired = useMemo(
    () => Boolean(liquorCheckout?.requiresDeliveryTime),
    [liquorCheckout],
  )

  const scheduleRequired = liquorScheduleRequired || storeScheduleRequired

  const liquorPresets = useMemo(() => {
    if (storeScheduleRequired && storeHoursStatus.items.length > 0) {
      return buildStoreSchedulePresets(storeHoursStatus.items).map((p) => ({
        id: `${p.startLocal}|${p.endLocal}`,
        label: p.label,
        startLocal: p.startLocal,
        endLocal: p.endLocal,
      }))
    }
    if (isCheckoutHomeLike(delivery)) {
      const slots = selectedDeliveryZone?.slots
      if (slots?.length) return buildLiquorSchedulePresetsFromAreaSlots(slots)
      return []
    }
    return buildLiquorSchedulePresets()
  }, [delivery, selectedDeliveryZone, storeScheduleRequired, storeHoursStatus.items])

  const selectedLiquorPresetId = useMemo(() => {
    const a = homeWinStart.trim()
    const b = homeWinEnd.trim()
    if (!a || !b) return ''
    return liquorPresets.find((p) => p.startLocal === a && p.endLocal === b)?.id ?? ''
  }, [homeWinStart, homeWinEnd, liquorPresets])

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
    (signedIn && isCheckoutHomeLike(delivery) && storefrontConfigReady && !selectedDeliveryZone) ||
    (signedIn && isCheckoutHomeLike(delivery) && !addressStepComplete) ||
    (scheduleRequired && (!homeWinStart.trim() || !homeWinEnd.trim())) ||
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
        if (isCheckoutPickupLike(delivery) && !pickupStepComplete)
          return 'Choose a store or locker location in step 1 (How we deliver), then continue.'
        if (isCheckoutHomeLike(delivery) && signedIn && !addressStepComplete) {
          return 'Choose a saved address or enter street, suburb, and city.'
        }
        if (isCheckoutHomeLike(delivery) && signedIn && storefrontConfigReady && !selectedDeliveryZone) {
          return 'Place the delivery pin inside a zone or tap an area button on the map.'
        }
        return null
      }
      if (step === 2) {
        if (scheduleRequired) {
          if (!homeWinStart.trim() || !homeWinEnd.trim()) {
            return isCheckoutPickupLike(delivery)
              ? 'Your cart includes alcohol and this order is placed outside store hours. Please choose a preferred pickup time window, then continue.'
              : 'Your cart includes alcohol and this order is placed outside store hours. Please choose a preferred delivery time window you can be available for, then continue.'
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
      selectedDeliveryZone,
      scheduleRequired,
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

  async function removeCheckoutLine(variantId: string) {
    try {
      await fetchCsrfToken()
      const res = await apiFetch(`/api/cart/items/${encodeURIComponent(variantId)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      setCartMutateNonce((n) => n + 1)
      window.dispatchEvent(new Event('pt-cart-updated'))
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not remove item')
    }
  }

  async function submit() {
    setGuestEmailErr(null)
    if (minorDepositLockerAlcoholBlocked) {
      setMsg(MINOR_LOCKER_ALCOHOL_MSG)
      return
    }
    if (storefront?.checkoutRequireSignIn && !user?.sub) {
      setMsg('This store requires a signed-in account to check out. Open My account and sign in, then return here.')
      return
    }
    if (isCheckoutHomeLike(delivery) && !user?.sub) {
      setMsg('Sign in for home or Yango delivery, or choose store pickup / deposit box.')
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
    if (isCheckoutHomeLike(delivery) && user?.sub) {
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
    if (scheduleRequired) {
      if (!homeWinStart.trim() || !homeWinEnd.trim()) {
        setMsg(
          isCheckoutPickupLike(delivery)
            ? 'Your cart includes alcohol and this order is outside store hours. Go back to the time step and choose a preferred pickup window.'
            : 'Your cart includes alcohol and this order is outside store hours. Go back to the delivery time step and choose a preferred delivery window.',
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
          depositLocationId: isCheckoutPickupLike(delivery) ? locationId : null,
          shippingAddressId: isCheckoutHomeLike(delivery) && user?.sub ? resolvedShippingId || null : null,
          guestEmail: !user?.sub ? guestEmail.trim() || null : null,
          guestFirstName: guestParts.first || null,
          guestLastName: guestParts.last || null,
          guestPhone: guestPhone.trim() || null,
          paymentMethod: user?.sub ? paymentMethod : 'paytoday',
          ...(deliveryPreferences.trim() ? { deliveryPreferences: deliveryPreferences.trim() } : {}),
          ...(promoApplied ? { discountCode: promoApplied.code } : {}),
          ...(deliveryScheduledFor.trim() || (homeWinStart.trim() && homeWinEnd.trim())
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
              }
            : {}),
          ...(isCheckoutHomeLike(delivery) && homeDeliveryAreaId ? { homeDeliveryAreaId } : {}),
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
      : isCheckoutHomeLike(delivery)
        ? totalsPreview.totalHomeCents
        : totalsPreview.totalPickupCents

  const showFreeShippingProgress =
    isCheckoutHomeLike(delivery) &&
    totalsPreview &&
    totalsPreview.freeShippingThresholdCents > 0 &&
    totalsPreview.qualifiesFreeShippingHome === false

  const freeProgress =
    totalsPreview && totalsPreview.freeShippingThresholdCents > 0
      ? Math.min(100, Math.round((totalsPreview.subtotalCents / totalsPreview.freeShippingThresholdCents) * 100))
      : 0

  const deliverToMeSelected = isCheckoutHomeLike(delivery)
  const collectSelected = isCheckoutPickupLike(delivery)

  const deliveryToggleGroupSx = {
    width: 1,
    flexWrap: { xs: 'wrap', sm: 'nowrap' },
    '& .MuiToggleButton-root': {
      textTransform: 'none' as const,
      fontWeight: 700,
      borderRadius: 2,
      flex: { xs: '1 1 100%', sm: '1 1 0' },
      minWidth: 0,
      py: 1.1,
      whiteSpace: 'normal' as const,
      lineHeight: 1.25,
    },
  }

  const renderStep0 = () => (
    <Stack spacing={2.5} sx={{ width: 1, minWidth: 0 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h6" fontWeight={800} gutterBottom>
          How should we get your order to you?
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Delivery to your door, or collect from a store or locker. Your order summary updates when you change this.
        </Typography>
      </Box>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="stretch" sx={{ width: 1, minWidth: 0 }}>
        <Paper
          variant="outlined"
          elevation={0}
          onClick={() => {
            if (!deliverToMeSelected) setDelivery('home')
          }}
          sx={{
            flex: { md: 1 },
            minWidth: 0,
            width: { xs: 1, md: 'auto' },
            p: { xs: 2, sm: 2.5 },
            cursor: 'pointer',
            borderRadius: 3,
            borderWidth: 2,
            borderStyle: 'solid',
            borderColor: deliverToMeSelected ? 'primary.main' : 'divider',
            bgcolor: (t) => (deliverToMeSelected ? alpha(t.palette.primary.main, 0.08) : t.palette.background.paper),
            transition: 'border-color 0.2s ease, background-color 0.2s ease',
            overflow: 'hidden',
          }}
        >
          <Stack direction="row" spacing={{ xs: 1.5, sm: 2 }} alignItems="flex-start" sx={{ width: 1, minWidth: 0 }}>
            <LocalShippingOutlinedIcon
              color={deliverToMeSelected ? 'primary' : 'action'}
              sx={{ fontSize: { xs: 32, sm: 36 }, flexShrink: 0, mt: 0.25 }}
            />
            <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              <Stack
                direction="row"
                alignItems="flex-start"
                justifyContent="space-between"
                gap={1}
                flexWrap="wrap"
                sx={{ width: 1 }}
              >
                <Typography fontWeight={800} sx={{ flex: '1 1 120px', minWidth: 0, pr: 0.5, lineHeight: 1.35 }}>
                  Deliver to me
                </Typography>
                <Radio
                  checked={deliverToMeSelected}
                  value="deliver"
                  sx={{ p: 0.5, flexShrink: 0, mt: -0.25 }}
                  tabIndex={-1}
                  disableRipple
                  color="primary"
                />
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
                Standard home delivery or Yango courier where enabled.
              </Typography>
              <Collapse in={deliverToMeSelected} timeout="auto" unmountOnExit={false}>
                <Box sx={{ mt: 2, width: 1, minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
                  {storefront?.yangoEnabled ? (
                    <ToggleButtonGroup
                      exclusive
                      fullWidth
                      orientation={narrowForToggles ? 'vertical' : 'horizontal'}
                      size="small"
                      value={delivery}
                      onChange={(_, v) => {
                        if (v != null) setDelivery(v as CheckoutDeliveryMethod)
                      }}
                      aria-label="Delivery type"
                      sx={deliveryToggleGroupSx}
                    >
                      <ToggleButton value="home">Home delivery</ToggleButton>
                      <ToggleButton value="yango_delivery">Yango courier</ToggleButton>
                    </ToggleButtonGroup>
                  ) : null}
                </Box>
              </Collapse>
            </Box>
          </Stack>
        </Paper>
        <Paper
          variant="outlined"
          elevation={0}
          onClick={() => {
            if (!collectSelected) setDelivery('store_pickup')
          }}
          sx={{
            flex: { md: 1 },
            minWidth: 0,
            width: { xs: 1, md: 'auto' },
            p: { xs: 2, sm: 2.5 },
            cursor: 'pointer',
            borderRadius: 3,
            borderWidth: 2,
            borderStyle: 'solid',
            borderColor: collectSelected ? 'primary.main' : 'divider',
            bgcolor: (t) => (collectSelected ? alpha(t.palette.primary.main, 0.08) : t.palette.background.paper),
            transition: 'border-color 0.2s ease, background-color 0.2s ease',
            overflow: 'hidden',
          }}
        >
          <Stack direction="row" spacing={{ xs: 1.5, sm: 2 }} alignItems="flex-start" sx={{ width: 1, minWidth: 0 }}>
            <ShoppingBagOutlinedIcon
              color={collectSelected ? 'primary' : 'action'}
              sx={{ fontSize: { xs: 32, sm: 36 }, flexShrink: 0, mt: 0.25 }}
            />
            <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              <Stack
                direction="row"
                alignItems="flex-start"
                justifyContent="space-between"
                gap={1}
                flexWrap="wrap"
                sx={{ width: 1 }}
              >
                <Typography fontWeight={800} sx={{ flex: '1 1 120px', minWidth: 0, pr: 0.5, lineHeight: 1.35 }}>
                  I&apos;ll collect it
                </Typography>
                <Radio
                  checked={collectSelected}
                  value="collect"
                  sx={{ p: 0.5, flexShrink: 0, mt: -0.25 }}
                  tabIndex={-1}
                  disableRipple
                  color="primary"
                />
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
                Store pickup or a deposit locker near you.
              </Typography>
              <Collapse in={collectSelected} timeout="auto">
                <Stack spacing={2} sx={{ mt: 2, width: 1, minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
                  <ToggleButtonGroup
                    exclusive
                    fullWidth
                    orientation={narrowForToggles ? 'vertical' : 'horizontal'}
                    size="small"
                    value={delivery}
                    onChange={(_, v) => {
                      if (v != null) setDelivery(v as CheckoutDeliveryMethod)
                    }}
                    aria-label="Pickup type"
                    sx={deliveryToggleGroupSx}
                  >
                    <ToggleButton value="store_pickup">Store pickup</ToggleButton>
                    <ToggleButton value="deposit_box">Deposit locker</ToggleButton>
                  </ToggleButtonGroup>
                  {minorDepositLockerAlcoholBlocked ? (
                    <Alert severity="warning" sx={{ borderRadius: 2 }}>
                      {MINOR_LOCKER_ALCOHOL_MSG}{' '}
                      <RouterLink to={`${pathPrefix}/cart`}>Edit cart</RouterLink> or{' '}
                      <RouterLink to={`${pathPrefix}/profile`}>My account</RouterLink>.
                    </Alert>
                  ) : null}
                  <TextField
                    select
                    label={delivery === 'deposit_box' ? 'Locker location' : 'Store location'}
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    fullWidth
                    sx={fieldRadiusSx}
                    error={!pickupStepComplete}
                    helperText={
                      !pickupStepComplete
                        ? delivery === 'deposit_box'
                          ? 'Select a deposit location to continue.'
                          : 'Select a store to continue.'
                        : ' '
                    }
                  >
                    {locations.map((l) => (
                      <MenuItem key={l.id} value={l.id}>
                        {l.name}
                        {l.addressSummary ? ` — ${l.addressSummary}` : ''}
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>
              </Collapse>
            </Box>
          </Stack>
        </Paper>
      </Stack>
    </Stack>
  )

  const renderAddressFields = () => (
    <>
      <FormControl>
        <FormLabel id="addr-mode-label">Shipping address</FormLabel>
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
          {showCheckoutDemoAddressPresets && isCheckoutHomeLike(delivery) && signedIn ? (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              <Typography variant="subtitle2" fontWeight={800} gutterBottom>
                Demo addresses (examples)
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Tap a preset to fill the form — the map and order summary shipping update for each delivery band. Not saved
                to your account.
              </Typography>
              <ToggleButtonGroup
                exclusive
                value={checkoutDemoPresetId}
                onChange={(_, v: string | null) => {
                  if (v == null) return
                  const preset = CHECKOUT_DEMO_ADDRESS_PRESETS.find((x) => x.id === v)
                  if (!preset) return
                  setNewLabel(preset.title)
                  setNewLine1(preset.line1)
                  setNewLine2(preset.line2)
                  setNewSuburb(preset.suburb)
                  setNewCity(preset.city)
                  setNewRegion(preset.region)
                  setNewPostalCode(preset.postalCode)
                  setNewCountry(preset.country)
                  setAddressDetailsExpanded(Boolean(preset.region.trim() || preset.postalCode.trim()))
                  setCheckoutDemoPresetId(v)
                }}
                aria-label="Demo example addresses"
                sx={{
                  flexWrap: 'wrap',
                  gap: 0.5,
                  '& .MuiToggleButton-root': { borderRadius: 2, fontWeight: 700, textTransform: 'none' },
                }}
              >
                {CHECKOUT_DEMO_ADDRESS_PRESETS.map((p) => (
                  <ToggleButton key={p.id} value={p.id} size="small">
                    {p.title}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              {checkoutDemoPresetId ? (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                  {CHECKOUT_DEMO_ADDRESS_PRESETS.find((x) => x.id === checkoutDemoPresetId)?.blurb}
                </Typography>
              ) : null}
            </Alert>
          ) : null}
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
                : 'The map below moves the pin when suburb / street / city match a known band (e.g. Olympia → north-east zone).'
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
    if (isCheckoutPickupLike(delivery)) {
      const picked = locations.find((l) => l.id === locationId)
      return (
        <Card variant="outlined" sx={cardSx}>
          <CardContent sx={{ py: 2.5, px: 2.5 }}>
            <Stack spacing={2}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="overline" color="text.secondary" fontWeight={700} sx={{ letterSpacing: 0.08 }}>
                    {delivery === 'deposit_box' ? 'Collection locker' : 'Pickup store'}
                  </Typography>
                  <Typography variant="h6" fontWeight={800} sx={{ mt: 0.5 }}>
                    {picked?.name ?? 'Choose a location'}
                  </Typography>
                  {picked?.addressSummary ? (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {picked.addressSummary}
                    </Typography>
                  ) : null}
                  {!pickupStepComplete ? (
                    <Alert severity="info" sx={{ mt: 1.5, borderRadius: 2 }}>
                      Go back to delivery and select a {delivery === 'deposit_box' ? 'locker' : 'store'} location.
                    </Alert>
                  ) : null}
                </Box>
                <Button variant="outlined" size="medium" onClick={() => setActiveStep(0)} sx={{ flexShrink: 0, fontWeight: 700 }}>
                  Change
                </Button>
              </Stack>
              {minorDepositLockerAlcoholBlocked ? (
                <Alert severity="warning" sx={{ borderRadius: 2 }}>
                  {MINOR_LOCKER_ALCOHOL_MSG}{' '}
                  <RouterLink to={`${pathPrefix}/cart`}>Edit cart</RouterLink> or{' '}
                  <RouterLink to={`${pathPrefix}/profile`}>My account</RouterLink>.
                </Alert>
              ) : null}
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
              Sign in to add a delivery address, or choose store pickup / deposit box in step 1.
            </Alert>
          </CardContent>
        </Card>
      )
    }
    return (
      <Stack spacing={2}>
        <Card variant="outlined" sx={cardSx}>
          <CardContent sx={{ py: 2, px: 2.5 }}>
            <Stack spacing={2}>{renderAddressFields()}</Stack>
          </CardContent>
        </Card>
        {storefrontConfigReady ? (
          <AddressMapPicker
            mapsApiKey={mapsApiKey}
            focusLatLng={mapFocusLatLng}
            deliveryZones={homeDeliveryZones}
            onZoneMetaChange={handleZoneMeta}
          />
        ) : null}
      </Stack>
    )
  }

  const renderStep2 = () => {
    if (isCheckoutPickupLike(delivery)) {
      if (!scheduleRequired) {
        return (
          <Card variant="outlined" sx={cardSx}>
            <CardContent sx={{ py: 1.5, px: 2 }}>
              <Typography variant="body1" fontWeight={700}>
                No time slot needed for pickup
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Continue to enter contact details and pay. You&apos;ll collect your order at the chosen location.
              </Typography>
            </CardContent>
          </Card>
        )
      }
      return (
        <Card variant="outlined" sx={cardSx}>
          <CardContent sx={{ py: 1.5, px: 2 }}>
            <Stack spacing={2}>
              <Typography variant="subtitle1" fontWeight={900}>
                Preferred pickup time
              </Typography>
              <Alert severity="warning" sx={{ borderRadius: 2 }}>
                Your cart includes alcohol. This order is being placed outside store hours, so please choose a preferred pickup
                time below. The store will use this window to prepare your order; it must fall within permitted alcohol sale times.
              </Alert>
              <FormControl fullWidth size="small" sx={fieldRadiusSx}>
                <InputLabel id="pickup-liquor-preset">Suggested times</InputLabel>
                <Select
                  labelId="pickup-liquor-preset"
                  label="Suggested times"
                  value={selectedLiquorPresetId}
                  onChange={(e) => {
                    const v = String(e.target.value)
                    const p = liquorPresets.find((x) => x.id === v)
                    if (p) {
                      setHomeWinStart(p.startLocal)
                      setHomeWinEnd(p.endLocal)
                      if (!homeWinLabel.trim()) setHomeWinLabel('Preferred pickup window')
                    }
                  }}
                >
                  <MenuItem value="">
                    <em>Choose a suggested window…</em>
                  </MenuItem>
                  {liquorPresets.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Typography variant="caption" color="text.secondary">
                Or set the start and end yourself (your device&apos;s local time). The server checks that the window falls within
                permitted alcohol sale times for the store.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  label="Pickup window start"
                  type="datetime-local"
                  value={homeWinStart}
                  onChange={(e) => setHomeWinStart(e.target.value)}
                  fullWidth
                  required
                  error={!homeWinStart.trim()}
                  helperText={!homeWinStart.trim() ? 'Required when ordering outside store hours.' : ' '}
                  InputLabelProps={{ shrink: true }}
                  sx={fieldRadiusSx}
                />
                <TextField
                  label="Pickup window end"
                  type="datetime-local"
                  value={homeWinEnd}
                  onChange={(e) => setHomeWinEnd(e.target.value)}
                  fullWidth
                  required
                  error={!homeWinEnd.trim()}
                  helperText={!homeWinEnd.trim() ? 'Required when ordering outside store hours.' : ' '}
                  InputLabelProps={{ shrink: true }}
                  sx={fieldRadiusSx}
                />
              </Stack>
              <TextField
                label="Note for the store (optional)"
                value={homeWinLabel}
                onChange={(e) => setHomeWinLabel(e.target.value)}
                fullWidth
                placeholder="e.g. After work"
                sx={fieldRadiusSx}
              />
            </Stack>
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
    if (storefrontConfigReady && checkoutUsesYangoScheduleGrid(delivery, storefront?.yangoEnabled)) {
      return (
        <Stack spacing={2}>
          {scheduleRequired ? (
            <Alert severity="warning" sx={{ borderRadius: 3 }}>
              Your cart includes alcohol. This order is being placed outside store hours, so please choose a delivery slot that
              falls within permitted hours so we can fulfil your order.
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
              {scheduleRequired ? 'Delivery time (required)' : 'Delivery scheduling (optional)'}
            </Typography>
            {scheduleRequired ? (
              <Alert severity="warning" sx={{ borderRadius: 2 }}>
                Your cart includes alcohol. This order is being placed outside store hours, so please choose a preferred delivery
                window below (local time). It must fall within the store&apos;s permitted hours.
              </Alert>
            ) : null}
            {!scheduleRequired ? (
              <Typography variant="caption" color="text.secondary">
                For scheduled home delivery, set a preferred time. Values use your device&apos;s local timezone.
              </Typography>
            ) : null}
            {scheduleRequired && !selectedDeliveryZone ? (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                Place your delivery address and map pin inside a shaded delivery area (step 1) so we can show suggested times
                that match that zone&apos;s hours.
              </Alert>
            ) : null}
            {scheduleRequired && selectedDeliveryZone && liquorPresets.length === 0 ? (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                No quick-pick windows are available for this address yet. Enter your preferred window using the fields below, or
                move the pin into a delivery area that has scheduled slots.
              </Alert>
            ) : null}
            {scheduleRequired && selectedDeliveryZone && liquorPresets.length > 0 ? (
              <Typography variant="caption" color="text.secondary">
                Suggested times use {selectedDeliveryZone.name}&apos;s delivery windows for your address ({selectedDeliveryZone.serviceDaysLabel || 'see area on map'}).
              </Typography>
            ) : null}
            {scheduleRequired ? (
              <FormControl fullWidth size="small" sx={fieldRadiusSx} disabled={liquorPresets.length === 0}>
                <InputLabel id="home-liquor-preset">
                  {selectedDeliveryZone ? 'Suggested times for your area' : 'Suggested times'}
                </InputLabel>
                <Select
                  labelId="home-liquor-preset"
                  label={selectedDeliveryZone ? 'Suggested times for your area' : 'Suggested times'}
                  value={liquorPresets.length === 0 ? '' : selectedLiquorPresetId}
                  onChange={(e) => {
                    const v = String(e.target.value)
                    const p = liquorPresets.find((x) => x.id === v)
                    if (p) {
                      setHomeWinStart(p.startLocal)
                      setHomeWinEnd(p.endLocal)
                      if (!homeWinLabel.trim()) setHomeWinLabel('Preferred delivery window')
                    }
                  }}
                >
                  <MenuItem value="">
                    <em>{liquorPresets.length === 0 ? 'No area presets — use fields below' : 'Choose a suggested window…'}</em>
                  </MenuItem>
                  {liquorPresets.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : null}
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
                required={scheduleRequired}
                error={scheduleRequired && !homeWinStart.trim()}
                helperText={
                  scheduleRequired && !homeWinStart.trim()
                    ? 'Required when ordering outside store hours.'
                    : ' '
                }
                InputLabelProps={{ shrink: true }}
                sx={fieldRadiusSx}
              />
              <TextField
                label="Window end"
                type="datetime-local"
                value={homeWinEnd}
                onChange={(e) => setHomeWinEnd(e.target.value)}
                fullWidth
                required={scheduleRequired}
                error={scheduleRequired && !homeWinEnd.trim()}
                helperText={
                  scheduleRequired && !homeWinEnd.trim()
                    ? 'Required when ordering outside store hours.'
                    : ' '
                }
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
      {isCheckoutHomeLike(delivery) ? (
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
    <Box sx={{ bgcolor: (t) => t.palette.grey[50], minHeight: '100%', pb: { xs: 3, md: 4 } }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, sm: 3 }, py: { xs: 2, sm: 3 } }}>
        <Grid container spacing={{ xs: 2, md: 3 }}>
          <Grid size={{ xs: 12, lg: 7 }} sx={{ order: { xs: 1 } }}>
            <Paper
              elevation={0}
              sx={{
                borderRadius: 3,
                p: { xs: 2, sm: 3 },
                border: 1,
                borderColor: 'divider',
                bgcolor: 'background.paper',
              }}
            >
              <Stack spacing={3}>
                <Stack spacing={0.5}>
                  <Typography variant="h5" component="h1" fontWeight={800}>
                    Checkout
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Step {activeStep + 1} of {STEP_LABELS.length} — {STEP_LABELS[activeStep]}
                  </Typography>
                </Stack>

                {storefrontConfigReady && checkoutAccountRequired && (
                  <Alert severity="info" sx={{ borderRadius: 2 }}>
                    Guest checkout is turned off. <RouterLink to={onboardingSignIn}>Sign in</RouterLink> or{' '}
                    <RouterLink to={onboardingRegister}>register</RouterLink> before paying.
                  </Alert>
                )}
                {authResolved && !signedIn ? (
                  <Alert severity="warning" sx={{ borderRadius: 2 }}>
                    Home or Yango delivery needs an account — <RouterLink to={onboardingSignIn}>Sign in</RouterLink> or{' '}
                    <RouterLink to={onboardingRegister}>register</RouterLink>, or choose collection in step 1.
                  </Alert>
                ) : null}
                {authResolved && signedIn && user?.email ? (
                  <Typography variant="caption" color="text.secondary">
                    Signed in as {user.email}
                  </Typography>
                ) : null}

                <Accordion
                  disableGutters
                  elevation={0}
                  sx={{
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 2,
                    '&:before': { display: 'none' },
                    overflow: 'hidden',
                  }}
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography fontWeight={800}>Delivery fees &amp; VAT</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography variant="body2" color="text.secondary">
                      Home and Yango delivery are for signed-in customers.{' '}
                      {storefront?.shippingFreeSubtotalCents ? (
                        <>
                          Free home delivery from {formatMoney(storefront.shippingFreeSubtotalCents, 'NAD')} subtotal
                          {storefront.shippingFlatCents > 0 ? `; otherwise ${formatMoney(storefront.shippingFlatCents, 'NAD')}.` : '.'}{' '}
                        </>
                      ) : storefront && storefront.shippingFlatCents > 0 ? (
                        <>Home delivery: {formatMoney(storefront.shippingFlatCents, 'NAD')}. </>
                      ) : null}
                      {storefront && storefront.vatRateBps > 0 ? <>VAT ({(storefront.vatRateBps / 100).toFixed(2)}%). </> : null}
                      Store pickup and deposit locker have no delivery fee.
                    </Typography>
                  </AccordionDetails>
                </Accordion>

                <Box
                  sx={{
                    overflowX: compactStepper ? 'auto' : 'visible',
                    width: 1,
                    mx: compactStepper ? -0.5 : 0,
                    px: compactStepper ? 0.5 : 0,
                    pb: 0.5,
                    WebkitOverflowScrolling: 'touch',
                  }}
                >
                  <Stepper
                    activeStep={activeStep}
                    alternativeLabel
                    sx={{
                      mb: 0.5,
                      minWidth: compactStepper ? { xs: 520, sm: 560 } : '100%',
                      '& .MuiStepLabel-label': {
                        fontWeight: 700,
                        fontSize: { xs: '0.65rem', sm: '0.7rem' },
                        whiteSpace: 'normal',
                        lineHeight: 1.25,
                        textAlign: 'center',
                        mt: 0.5,
                      },
                      '& .MuiStepLabel-labelContainer': { maxWidth: { xs: 88, sm: 'none' } },
                      '& .MuiStepIcon-root': { fontSize: { xs: '1.35rem', sm: '1.5rem' } },
                    }}
                  >
                    {STEP_LABELS.map((label) => (
                      <Step key={label}>
                        <StepLabel>{label}</StepLabel>
                      </Step>
                    ))}
                  </Stepper>
                </Box>

                <Box sx={{ width: 1, minWidth: 0, minHeight: 'min-content' }}>{stepBody(activeStep)}</Box>

                <Divider />

                <Stack
                  direction={{ xs: 'column-reverse', sm: 'row' }}
                  spacing={2}
                  alignItems={{ sm: 'center' }}
                  justifyContent="space-between"
                >
                  {activeStep === 0 ? (
                    <Button
                      component={RouterLink}
                      to={`${pathPrefix}/cart`}
                      variant="outlined"
                      color="inherit"
                      startIcon={<ArrowBackIcon />}
                      sx={{ fontWeight: 700, borderRadius: 2 }}
                    >
                      Back
                    </Button>
                  ) : (
                    <Button
                      variant="outlined"
                      color="inherit"
                      onClick={handleStepBack}
                      startIcon={<ArrowBackIcon />}
                      sx={{ fontWeight: 700, borderRadius: 2 }}
                    >
                      Back
                    </Button>
                  )}
                  <Box sx={{ flex: 1, maxWidth: { sm: 380 }, width: { xs: 1, sm: 'auto' }, alignSelf: { sm: 'flex-end' } }}>
                    {activeStep < STEP_LABELS.length - 1 ? (
                      <Button
                        variant="contained"
                        onClick={handleStepNext}
                        size="large"
                        fullWidth
                        sx={{ fontWeight: 800, py: 1.5, borderRadius: 2 }}
                      >
                        Continue
                      </Button>
                    ) : (
                      <Button
                        variant="contained"
                        size="large"
                        fullWidth
                        onClick={() => void submit()}
                        disabled={payDisabled}
                        startIcon={
                          submitting ? <CircularProgress color="inherit" size={22} aria-hidden /> : <LockOutlinedIcon aria-hidden />
                        }
                        sx={{ py: 1.5, fontWeight: 900, borderRadius: 2 }}
                      >
                        {submitting
                          ? 'Processing…'
                          : totalCents != null && totalsPreview
                            ? `Confirm payment ${formatMoney(totalCents, totalsPreview.currency)}`
                            : paymentMethod === 'demo_wallet' && signedIn
                              ? 'Place order & pay with wallet'
                              : `Pay with ${APP_DISPLAY_NAME}`}
                      </Button>
                    )}
                  </Box>
                </Stack>

                {msg && (
                  <Alert
                    severity={msg.includes('Order') ? 'success' : 'error'}
                    sx={msg.includes('Order') ? undefined : { whiteSpace: 'pre-wrap' }}
                  >
                    {msg}
                  </Alert>
                )}

                <Button component={RouterLink} to={`${pathPrefix}/orders/track`} variant="text" size="small" sx={{ alignSelf: 'flex-start' }}>
                  Track an order
                </Button>
              </Stack>
            </Paper>
          </Grid>

        <Grid
          size={{ xs: 12, lg: 5 }}
          sx={{
            order: { xs: 2 },
            position: { lg: 'sticky' },
            top: { lg: 16 },
            alignSelf: { lg: 'flex-start' },
          }}
        >
          <Paper
            variant="outlined"
            sx={{
              p: 2.5,
              borderRadius: 3,
              bgcolor: 'background.paper',
              borderColor: 'divider',
            }}
          >
            <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>
              Order summary
            </Typography>

            {checkoutCartLines.length > 0 ? (
              <Stack spacing={1.5} sx={{ mb: 2 }}>
                {checkoutCartLines.map((line) => (
                  <Stack key={line.lineId} direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.35 }}>
                        {line.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        ×{line.quantity} @ {formatMoney(line.unitPriceCents, line.currency)}
                      </Typography>
                    </Box>
                    <Stack direction="row" alignItems="center" spacing={0.25}>
                      <Typography variant="body2" fontWeight={800} sx={{ whiteSpace: 'nowrap' }}>
                        {formatMoney(line.unitPriceCents * line.quantity, line.currency)}
                      </Typography>
                      <IconButton
                        size="small"
                        aria-label={`Remove ${line.name}`}
                        onClick={() => void removeCheckoutLine(line.variantId)}
                        edge="end"
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Stack>
                ))}
                <Divider sx={{ pt: 0.5 }} />
              </Stack>
            ) : null}

            {totalsError ? <Alert severity="warning">{totalsError}</Alert> : null}

            {minorDepositLockerAlcoholBlocked ? (
              <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
                {MINOR_LOCKER_ALCOHOL_MSG}{' '}
                <RouterLink to={`${pathPrefix}/cart`}>Edit cart</RouterLink> or{' '}
                <RouterLink to={`${pathPrefix}/profile`}>My account</RouterLink>.
              </Alert>
            ) : null}

            {promoApplied && promoApplied.discountCents > 0 && totalsPreview ? (
              <Alert severity="success" variant="outlined" sx={{ mb: 2, borderRadius: 2 }}>
                <Typography fontWeight={800}>Your total saving on this order</Typography>
                <Typography variant="body1" fontWeight={900} color="success.dark" sx={{ mt: 0.5 }}>
                  {formatMoney(promoApplied.discountCents, totalsPreview.currency)}
                </Typography>
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
                    {isCheckoutHomeLike(delivery) && totalsPreview.shippingCentsHome === 0
                      ? 'Free'
                      : formatMoney(
                          isCheckoutHomeLike(delivery) ? totalsPreview.shippingCentsHome : totalsPreview.shippingCentsPickup,
                          totalsPreview.currency,
                        )}
                  </Typography>
                </Stack>
                {isCheckoutHomeLike(delivery) && totalsPreview.shippingCentsHome === 0 ? (
                  <Typography variant="caption" color="success.main" fontWeight={700} display="block" sx={{ mt: -0.5 }}>
                    {totalsPreview.qualifiesFreeShippingHome && totalsPreview.freeShippingThresholdCents > 0
                      ? `Free home delivery applied — your subtotal meets the ${formatMoney(totalsPreview.freeShippingThresholdCents, totalsPreview.currency)} threshold for this delivery area.`
                      : 'No delivery fee for this delivery area.'}
                  </Typography>
                ) : null}
                {isCheckoutHomeLike(delivery) && homeDeliveryAreaId && selectedDeliveryZone?.name ? (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: totalsPreview.shippingCentsHome === 0 ? 0 : -0.5 }}>
                    {selectedDeliveryZone.name} — area rate
                  </Typography>
                ) : null}
                {yangoDemoCourierCents != null && delivery === 'yango_delivery' && storefront?.yangoEnabled ? (
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
                  Free home delivery progress{selectedDeliveryZone?.name ? ` (${selectedDeliveryZone.name})` : ''}
                </Typography>
                <LinearProgress variant="determinate" value={freeProgress} sx={{ height: 8, borderRadius: 1 }} aria-label="Progress toward free home delivery" />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  Add {formatMoney(Math.max(0, totalsPreview!.freeShippingThresholdCents - totalsPreview!.subtotalCents), totalsPreview!.currency)} more to reach
                  the {formatMoney(totalsPreview!.freeShippingThresholdCents, totalsPreview!.currency)} subtotal threshold for free delivery
                  {selectedDeliveryZone?.name ? ` (${selectedDeliveryZone.name})` : ''}.
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
                      if (isCheckoutHomeLike(delivery) && homeDeliveryAreaId) params.set('homeDeliveryAreaId', homeDeliveryAreaId)
                      const res = await fetch(apiUrl(`/api/cart?${params.toString()}`), { credentials: 'include' })
                      const body = (await readResponseJson<{
                        discountCents?: number
                        error?: string
                        totalsPreview?: CartTotalsPreview
                      }>(res))
                      if (!res.ok) throw new Error(body.error ?? 'Invalid code')
                      if (body.totalsPreview) setTotalsPreview(body.totalsPreview)
                      setPromoApplied({ code: promoCode.trim(), discountCents: body.discountCents ?? body.totalsPreview?.discountCents ?? 0 })
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
    </Box>
  )
}
