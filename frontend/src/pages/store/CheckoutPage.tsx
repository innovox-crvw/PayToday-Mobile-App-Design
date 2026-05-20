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
import { CHECKOUT_DEMO_ADDRESS_PRESETS } from '../../lib/checkoutDemoAddressPresets'
import {
  buildLiquorSchedulePresetsFromAreaSlots,
  buildLiquorSchedulePresetsFromLiquorHours,
} from '../../lib/checkoutLiquorTimePresets'
import { isWindowInsideLiquorHours, windhoekLocalInputToIso } from '../../lib/windhoekTime'
import { notifyCatalogInventoryMaybeChanged } from '../../lib/catalogEvents'
import { apiUrl } from '../../lib/apiOrigin'
import { formatMoney } from '../../lib/money'
import { CheckoutWalletExtras } from '../../components/wallet/CheckoutWalletExtras'
import { RecurringPaymentCallout, type RecurringTermMonths } from '../../components/store/RecurringPaymentCallout'
import { splitTotalIntoInstalmentAmounts } from '../../lib/paymentPlanPreview'
import { APP_DISPLAY_NAME, APP_WALLET_DISPLAY_NAME } from '../../theme/branding'
import type {
  StorefrontConfig,
  CartTotalsPreview,
  CartPaymentPlanPreview,
  LiquorCheckoutPreview,
  StoreCheckoutPreview,
  StorePickupStoreDto,
} from '../../types/storefront'
import { StorePickupStoresPanel } from '../../components/checkout/StorePickupStoresPanel'
import { resolveCheckoutSellingHoursMerchantId } from '../../lib/checkoutSellingHoursMerchant'
import {
  buildStoreSchedulePresets,
  clearCheckoutSchedulePreset,
  readCheckoutSchedulePreset,
} from '../../lib/storeHours'
import { useStoreHours } from '../../hooks/useStoreHours'
import { parseEmailString } from '../../lib/inputValidators'
import { AddressMapPicker, type MapZoneMeta } from '../../components/checkout/AddressMapPicker'
import { AvailableTimeWindowPicker } from '../../components/checkout/AvailableTimeWindowPicker'
import { CheckoutSellingTimesSection } from '../../components/checkout/CheckoutSellingTimesSection'
import { DeliveryTimeSlotGrid } from '../../components/checkout/DeliveryTimeSlotGrid'
import type { LiquorTimePreset } from '../../lib/checkoutLiquorTimePresets'
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

const instantPayLogoSrc = `${import.meta.env.BASE_URL}instant-pay-logo.svg`
const avoTodayBrandLogoSrc = `${import.meta.env.BASE_URL}brand-logo.png`

const checkoutPaymentMarkSx = {
  width: 40,
  height: 40,
  flexShrink: 0,
  objectFit: 'contain' as const,
  display: 'block',
}

type CheckoutPaymentMethod = 'paytoday' | 'instant_pay' | 'demo_wallet' | 'payment_plan'

type CheckoutDeliveryMethod = 'home' | 'yango_delivery' | 'store_pickup' | 'deposit_box'

function isCheckoutHomeLike(d: CheckoutDeliveryMethod): boolean {
  return d === 'home' || d === 'yango_delivery'
}

function isCheckoutPickupLike(d: CheckoutDeliveryMethod): boolean {
  return d === 'store_pickup' || d === 'deposit_box'
}

function isCheckoutStorePickup(d: CheckoutDeliveryMethod): boolean {
  return d === 'store_pickup'
}

function isCheckoutDepositBox(d: CheckoutDeliveryMethod): boolean {
  return d === 'deposit_box'
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
  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>('paytoday')
  const [recurringTermMonths, setRecurringTermMonths] = useState<RecurringTermMonths>(6)
  const [walletBalanceCents, setWalletBalanceCents] = useState<number | null>(null)
  const [walletDemoAvailable, setWalletDemoAvailable] = useState(true)
  const [walletSettings, setWalletSettings] = useState<{
    roundUpEnabled: boolean
    roundUpIncrementCents: number
    savingsBalanceCents: number
    walletExtrasAvailable: boolean
  } | null>(null)
  const [applyRoundUp, setApplyRoundUp] = useState(true)
  const [splitBillId, setSplitBillId] = useState<string | null>(null)
  const [payerShareCents, setPayerShareCents] = useState<number | null>(null)
  const [deliveryScheduledFor, setDeliveryScheduledFor] = useState('')
  const [homeWinStart, setHomeWinStart] = useState('')
  const [homeWinEnd, setHomeWinEnd] = useState('')
  const [homeWinLabel, setHomeWinLabel] = useState('')
  const [totalsPreview, setTotalsPreview] = useState<CartTotalsPreview | null>(null)
  const [paymentPlanPreview, setPaymentPlanPreview] = useState<CartPaymentPlanPreview | null>(null)
  const [totalsError, setTotalsError] = useState<string | null>(null)
  const [yangoDemoCourierCents, setYangoDemoCourierCents] = useState<number | null>(null)
  const [cartContainsAlcohol, setCartContainsAlcohol] = useState(false)
  const [checkoutCartLines, setCheckoutCartLines] = useState<CheckoutCartLine[]>([])
  const [liquorCheckout, setLiquorCheckout] = useState<LiquorCheckoutPreview | null>(null)
  const [storeCheckout, setStoreCheckout] = useState<StoreCheckoutPreview | null>(null)
  const [storePickupStores, setStorePickupStores] = useState<StorePickupStoreDto[]>([])
  const sellingHoursMerchantId = useMemo(
    () => resolveCheckoutSellingHoursMerchantId(storePickupStores, cartContainsAlcohol),
    [storePickupStores, cartContainsAlcohol],
  )
  const { status: storeHoursStatus } = useStoreHours(sellingHoursMerchantId)
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
    if (!user?.sub) {
      setWalletSettings(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await apiFetch('/api/wallet/settings')
        if (cancelled || !res.ok) return
        setWalletSettings((await res.json()) as NonNullable<typeof walletSettings>)
      } catch {
        /* optional */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.sub])

  useEffect(() => {
    if (paymentMethod !== 'demo_wallet') {
      setSplitBillId(null)
      setPayerShareCents(null)
    }
  }, [paymentMethod])

  useEffect(() => {
    const onWalletUpdated = () => {
      if (!user?.sub) return
      void (async () => {
        try {
          const res = await apiFetch('/api/wallet/balance')
          if (!res.ok) return
          const data = (await res.json()) as { balanceCents?: number }
          if (typeof data.balanceCents === 'number') setWalletBalanceCents(data.balanceCents)
        } catch {
          /* ignore */
        }
      })()
    }
    window.addEventListener('pt-wallet-updated', onWalletUpdated)
    return () => window.removeEventListener('pt-wallet-updated', onWalletUpdated)
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
          paymentPlanPreview?: CartPaymentPlanPreview
          items?: CheckoutCartLine[]
          lines?: Array<{ flags?: { alcohol?: boolean } }>
          liquorCheckout?: LiquorCheckoutPreview
          storeCheckout?: StoreCheckoutPreview
          storePickupStores?: StorePickupStoreDto[]
        }>(res)
        if (cancelled) return
        if (!res.ok) {
          setTotalsPreview(null)
          setPaymentPlanPreview(null)
          setLiquorCheckout(null)
          setStoreCheckout(null)
          setStorePickupStores([])
          setCheckoutCartLines([])
          setTotalsError('Could not load cart totals.')
          return
        }
        setTotalsPreview(data.totalsPreview ?? null)
        setPaymentPlanPreview(data.paymentPlanPreview ?? null)
        const items = data.items ?? []
        setCheckoutCartLines(items)
        const legacyLines = data.lines ?? []
        setCartContainsAlcohol(
          legacyLines.some((l) => Boolean(l.flags?.alcohol)) ||
            Boolean(data.liquorCheckout?.hasAlcohol),
        )
        setLiquorCheckout(data.liquorCheckout ?? null)
        setStoreCheckout(data.storeCheckout ?? null)
        setStorePickupStores(Array.isArray(data.storePickupStores) ? data.storePickupStores : [])
      } catch {
        if (!cancelled) {
          setTotalsPreview(null)
          setPaymentPlanPreview(null)
          setLiquorCheckout(null)
          setStoreCheckout(null)
          setStorePickupStores([])
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

  const pickupStepComplete = useMemo(() => {
    if (isCheckoutStorePickup(delivery)) return storePickupStores.length > 0
    if (isCheckoutDepositBox(delivery)) return Boolean(locationId)
    return true
  }, [delivery, locationId, storePickupStores])

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

  const liquorHourRows = storeHoursStatus.liquorItems ?? []
  const liquorGatingOn = Boolean(storefront?.liquorGatingEnabled)
  const alcoholCartNeedsLiquorWindows =
    cartContainsAlcohol && liquorGatingOn && liquorHourRows.length > 0 && scheduleRequired

  const liquorPresets = useMemo(() => {
    if (alcoholCartNeedsLiquorWindows) {
      return buildLiquorSchedulePresetsFromLiquorHours(liquorHourRows)
    }
    if (liquorScheduleRequired && liquorHourRows.length > 0) {
      return buildLiquorSchedulePresetsFromLiquorHours(liquorHourRows)
    }
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
      if (slots?.length) {
        return buildLiquorSchedulePresetsFromAreaSlots(
          slots,
          cartContainsAlcohol && liquorGatingOn && liquorHourRows.length > 0 ? liquorHourRows : undefined,
        )
      }
      return []
    }
    if (liquorScheduleRequired && liquorHourRows.length > 0) {
      return buildLiquorSchedulePresetsFromLiquorHours(liquorHourRows)
    }
    return []
  }, [
    delivery,
    selectedDeliveryZone,
    storeScheduleRequired,
    liquorScheduleRequired,
    alcoholCartNeedsLiquorWindows,
    storeHoursStatus.items,
    liquorHourRows,
    cartContainsAlcohol,
    liquorGatingOn,
    scheduleRequired,
  ])

  const selectedLiquorPresetId = useMemo(() => {
    const a = homeWinStart.trim()
    const b = homeWinEnd.trim()
    if (!a || !b) return ''
    return (
      liquorPresets.find(
        (p) =>
          (p.startLocal === a && p.endLocal === b) ||
          (windhoekLocalInputToIso(p.startLocal) === windhoekLocalInputToIso(a) &&
            windhoekLocalInputToIso(p.endLocal) === windhoekLocalInputToIso(b)),
      )?.id ?? ''
    )
  }, [homeWinStart, homeWinEnd, liquorPresets])

  const applyLiquorPreset = useCallback(
    (p: LiquorTimePreset, labelFallback: string) => {
      setHomeWinStart(p.startLocal)
      setHomeWinEnd(p.endLocal)
      setHomeWinLabel((prev) => (prev.trim() ? prev : labelFallback))
    },
    [],
  )

  const alcoholScheduleOutsideHours = Boolean(
    liquorScheduleRequired && cartContainsAlcohol && liquorCheckout?.outsideLiquorSellingWindow,
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
        if (isCheckoutDepositBox(delivery) && !pickupStepComplete)
          return 'Choose a deposit locker in step 1 (How we deliver), then continue.'
        if (isCheckoutStorePickup(delivery) && !pickupStepComplete)
          return 'Your cart has no pickup stores yet. Add items or refresh the page.'
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
      if (ge.ok === false) {
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
      if (
        cartContainsAlcohol &&
        liquorGatingOn &&
        liquorHourRows.length > 0 &&
        !isWindowInsideLiquorHours(liquorHourRows, homeWinStart, homeWinEnd)
      ) {
        setMsg(
          'The selected time is outside permitted alcohol sale hours. On the Time window step, check Alcohol selling times and pick a suggested time from the list.',
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
          depositLocationId: isCheckoutDepositBox(delivery) ? locationId : null,
          shippingAddressId: isCheckoutHomeLike(delivery) && user?.sub ? resolvedShippingId || null : null,
          guestEmail: !user?.sub ? guestEmail.trim() || null : null,
          guestFirstName: guestParts.first || null,
          guestLastName: guestParts.last || null,
          guestPhone: guestPhone.trim() || null,
          paymentMethod: user?.sub ? paymentMethod : 'paytoday',
          ...(deliveryPreferences.trim() ? { deliveryPreferences: deliveryPreferences.trim() } : {}),
          ...(deliveryScheduledFor.trim() || (homeWinStart.trim() && homeWinEnd.trim())
            ? {
                ...(deliveryScheduledFor.trim()
                  ? { deliveryScheduledFor: windhoekLocalInputToIso(deliveryScheduledFor.trim()) }
                  : {}),
                ...(homeWinStart.trim() && homeWinEnd.trim()
                  ? {
                      homeDeliveryWindow: {
                        start: windhoekLocalInputToIso(homeWinStart.trim()),
                        end: windhoekLocalInputToIso(homeWinEnd.trim()),
                        label: homeWinLabel.trim() || null,
                      },
                    }
                  : {}),
              }
            : {}),
          ...(isCheckoutHomeLike(delivery) && homeDeliveryAreaId ? { homeDeliveryAreaId } : {}),
          ...(paymentMethod === 'demo_wallet' && splitBillId ? { splitBillId } : {}),
          ...(paymentMethod === 'demo_wallet' && applyRoundUp ? { applyRoundUp: true } : {}),
          ...(paymentMethod === 'payment_plan' ? { recurringTermMonths } : {}),
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
        paymentPlan?: boolean
        walletBalanceAfterCents?: number
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
      if (typeof data.walletBalanceAfterCents === 'number') {
        setWalletBalanceCents(data.walletBalanceAfterCents)
        window.dispatchEvent(new Event('pt-wallet-updated'))
      }
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl
        return
      }
      if (data.orderId && (data.paidWithDemoWallet || data.alreadyPaid || data.paymentPlan)) {
        const q = new URLSearchParams({ orderId: data.orderId })
        if (data.paymentPlan) q.set('paymentPlan', '1')
        navigate(`${pathPrefix}/checkout/success?${q.toString()}`)
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

  const showRecurringPlanPreview = Boolean(paymentPlanPreview?.eligible)

  useEffect(() => {
    if (!showRecurringPlanPreview && paymentMethod === 'payment_plan') {
      setPaymentMethod('paytoday')
    }
  }, [showRecurringPlanPreview, paymentMethod])

  const paymentPlanSchedule = useMemo(() => {
    if (!showRecurringPlanPreview || totalCents == null || totalCents < 1) return null
    const amounts = splitTotalIntoInstalmentAmounts(totalCents, recurringTermMonths)
    return {
      term: recurringTermMonths,
      amounts,
      perInst: amounts[0] ?? 0,
      allSame: amounts.every((a) => a === amounts[0]),
    }
  }, [showRecurringPlanPreview, totalCents, recurringTermMonths])

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
                <Stack spacing={1.25} sx={{ mt: 1.25, width: 1, minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
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
                  {isCheckoutStorePickup(delivery) ? (
                    <Box
                      sx={{
                        pt: 0.5,
                        ...(pickupStepComplete ? {} : { outline: 1, outlineColor: 'warning.main', borderRadius: 1.5, px: 0.5 }),
                      }}
                    >
                      <StorePickupStoresPanel stores={storePickupStores} variant="minimal" />
                    </Box>
                  ) : (
                    <TextField
                      select
                      label="Locker location"
                      value={locationId}
                      onChange={(e) => setLocationId(e.target.value)}
                      fullWidth
                      sx={fieldRadiusSx}
                      error={!pickupStepComplete}
                      helperText={!pickupStepComplete ? 'Select a deposit location to continue.' : ' '}
                    >
                      {locations.map((l) => (
                        <MenuItem key={l.id} value={l.id}>
                          {l.name}
                          {l.addressSummary ? ` — ${l.addressSummary}` : ''}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
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
    if (isCheckoutStorePickup(delivery)) {
      return (
        <Card variant="outlined" sx={cardSx}>
          <CardContent sx={{ py: 1.5, px: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} sx={{ mb: 1 }}>
              <Typography variant="body2" fontWeight={800}>
                Store pickup
                {storePickupStores.length > 1 ? ` · ${storePickupStores.length} locations` : ''}
              </Typography>
              <Button variant="text" size="small" onClick={() => setActiveStep(0)} sx={{ flexShrink: 0, fontWeight: 700, minWidth: 0 }}>
                Change
              </Button>
            </Stack>
            <StorePickupStoresPanel stores={storePickupStores} variant="minimal" />
          </CardContent>
        </Card>
      )
    }
    if (isCheckoutDepositBox(delivery)) {
      const picked = locations.find((l) => l.id === locationId)
      return (
        <Card variant="outlined" sx={cardSx}>
          <CardContent sx={{ py: 2.5, px: 2.5 }}>
            <Stack spacing={2}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="overline" color="text.secondary" fontWeight={700} sx={{ letterSpacing: 0.08 }}>
                    Collection locker
                  </Typography>
                  <Typography variant="h6" fontWeight={800} sx={{ mt: 0.5 }}>
                    {picked?.name ?? 'Choose a locker'}
                  </Typography>
                  {picked?.addressSummary ? (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {picked.addressSummary}
                    </Typography>
                  ) : null}
                  {!pickupStepComplete ? (
                    <Alert severity="info" sx={{ mt: 1.5, borderRadius: 2 }}>
                      Go back to delivery and select a locker location.
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

  const showLiquorSellingTimesContext =
    cartContainsAlcohol &&
    liquorGatingOn &&
    (liquorHourRows.length > 0 || storeHoursStatus.liquorConfigured)

  const showStoreSellingTimesContext =
    storeHoursStatus.configured &&
    storeHoursStatus.items.length > 0 &&
    (storeScheduleRequired || (showLiquorSellingTimesContext && storeHoursStatus.liquorConfigured))

  const sellingTimesBlock =
    showLiquorSellingTimesContext || showStoreSellingTimesContext ? (
      <CheckoutSellingTimesSection
        storeHours={storeHoursStatus}
        liquorRows={liquorHourRows}
        showLiquorContext={showLiquorSellingTimesContext}
        showStoreContext={showStoreSellingTimesContext}
      />
    ) : null

  const renderStep2 = () => {
    if (isCheckoutPickupLike(delivery)) {
      if (!scheduleRequired) {
        return (
          <Card variant="outlined" sx={cardSx}>
            <CardContent sx={{ py: 1.25, px: 2 }}>
              <Typography variant="body2" fontWeight={700}>
                No time slot needed
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.35 }}>
                Continue to pay, then collect at your pickup store{storePickupStores.length > 1 ? 's' : ''}.
              </Typography>
            </CardContent>
          </Card>
        )
      }
      return (
        <Stack spacing={2}>
          {sellingTimesBlock}
          <Card variant="outlined" sx={cardSx}>
            <CardContent sx={{ py: 1.5, px: 2 }}>
              <AvailableTimeWindowPicker
                mode="pickup"
                presets={liquorPresets}
                selectedPresetId={selectedLiquorPresetId}
                onSelectPreset={(p) => applyLiquorPreset(p, 'Preferred pickup window')}
                homeWinStart={homeWinStart}
                homeWinEnd={homeWinEnd}
                homeWinLabel={homeWinLabel}
                onHomeWinStartChange={setHomeWinStart}
                onHomeWinEndChange={setHomeWinEnd}
                onHomeWinLabelChange={setHomeWinLabel}
                showAlcoholOutsideHoursMessage={alcoholScheduleOutsideHours}
                storeClosedMessage={
                  storeScheduleRequired && !alcoholScheduleOutsideHours
                    ? 'The store is closed right now. Choose a pickup time from the suggested list below.'
                    : null
                }
                fieldRadiusSx={fieldRadiusSx}
              />
            </CardContent>
          </Card>
        </Stack>
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
          {sellingTimesBlock}
          <DeliveryTimeSlotGrid
            zone={selectedDeliveryZone}
            onScheduleChange={applyYangoDemoSchedule}
            cartContainsAlcohol={cartContainsAlcohol && Boolean(storefront?.liquorGatingEnabled)}
            outsideLiquorSellingWindow={Boolean(liquorCheckout?.outsideLiquorSellingWindow)}
            liquorHourRows={
              cartContainsAlcohol && liquorGatingOn && liquorHourRows.length > 0 ? liquorHourRows : undefined
            }
          />
        </Stack>
      )
    }
    if (scheduleRequired) {
      return (
        <Stack spacing={2}>
          {sellingTimesBlock}
          <Card variant="outlined" sx={cardSx}>
            <CardContent sx={{ py: 1.5, px: 2 }}>
              {!selectedDeliveryZone ? (
                <Alert severity="info" sx={{ borderRadius: 2, mb: 2 }}>
                  Place your delivery address and map pin inside a shaded delivery area (step 1) so we can show available delivery
                  times for your address.
                </Alert>
              ) : null}
              <AvailableTimeWindowPicker
                mode="delivery"
                presets={liquorPresets}
                selectedPresetId={selectedLiquorPresetId}
                onSelectPreset={(p) => applyLiquorPreset(p, 'Preferred delivery window')}
                homeWinStart={homeWinStart}
                homeWinEnd={homeWinEnd}
                homeWinLabel={homeWinLabel}
                onHomeWinStartChange={setHomeWinStart}
                onHomeWinEndChange={setHomeWinEnd}
                onHomeWinLabelChange={setHomeWinLabel}
                showAlcoholOutsideHoursMessage={alcoholScheduleOutsideHours}
                storeClosedMessage={
                  storeScheduleRequired && !alcoholScheduleOutsideHours
                    ? 'The store is closed right now. Choose a delivery time from the suggested list below.'
                    : null
                }
                zoneHint={
                  selectedDeliveryZone && liquorPresets.length > 0
                    ? `Suggested times match ${selectedDeliveryZone.name} delivery windows (${selectedDeliveryZone.serviceDaysLabel || 'see area on map'}).`
                    : selectedDeliveryZone
                      ? `Enter a delivery window for ${selectedDeliveryZone.name}, or move your pin to an area with scheduled slots.`
                      : null
                }
                presetSelectLabel={
                  selectedDeliveryZone ? 'Suggested times for your area' : 'Suggested times'
                }
                fieldRadiusSx={fieldRadiusSx}
              />
            </CardContent>
          </Card>
        </Stack>
      )
    }

    return (
      <Card variant="outlined" sx={cardSx}>
        <CardContent sx={{ py: 1.5, px: 2 }}>
          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={900}>
              Delivery scheduling (optional)
            </Typography>
            <Typography variant="caption" color="text.secondary">
              For scheduled home delivery, set a preferred time. Values use your device&apos;s local timezone.
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
                InputLabelProps={{ shrink: true }}
                sx={fieldRadiusSx}
              />
              <TextField
                label="Window end"
                type="datetime-local"
                value={homeWinEnd}
                onChange={(e) => setHomeWinEnd(e.target.value)}
                fullWidth
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
      {showRecurringPlanPreview ? (
        <RecurringPaymentCallout
          embeddedInCheckout={paymentMethod === 'payment_plan'}
          currency={totalsPreview?.currency}
          totalCents={totalCents}
          term={recurringTermMonths}
          onTermChange={setRecurringTermMonths}
        />
      ) : paymentPlanPreview?.reason ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          {paymentPlanPreview.reason}
        </Alert>
      ) : null}
      {signedIn ? (
        <Card variant="outlined" sx={cardSx}>
          <CardContent sx={{ py: 1.5, px: 2 }}>
            <FormControl>
              <FormLabel id="pay-method-label">Payment</FormLabel>
              <RadioGroup
                aria-labelledby="pay-method-label"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as CheckoutPaymentMethod)}
              >
                <FormControlLabel
                  value="paytoday"
                  control={<Radio />}
                  disabled={submitting}
                  label={
                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ py: 0.25 }}>
                      <Box component="img" src={avoTodayBrandLogoSrc} alt="" sx={checkoutPaymentMarkSx} />
                      <Stack spacing={0.25}>
                        <Typography component="span" fontWeight={700}>
                          {`${APP_DISPLAY_NAME} (hosted checkout)`}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" component="span">
                          Pay on the secure {APP_DISPLAY_NAME} payment page.
                        </Typography>
                      </Stack>
                    </Stack>
                  }
                />
                <FormControlLabel
                  value="instant_pay"
                  control={<Radio />}
                  disabled={submitting}
                  label={
                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ py: 0.25 }}>
                      <Box component="img" src={instantPayLogoSrc} alt="" sx={checkoutPaymentMarkSx} />
                      <Stack spacing={0.25}>
                        <Typography component="span" fontWeight={700}>
                          Instant pay
                        </Typography>
                        <Typography variant="caption" color="text.secondary" component="span">
                          Secure hosted checkout.
                        </Typography>
                      </Stack>
                    </Stack>
                  }
                />
                {showRecurringPlanPreview ? (
                  <FormControlLabel
                    value="payment_plan"
                    control={<Radio />}
                    disabled={submitting}
                    label={
                      <Stack spacing={0.25}>
                        <Typography component="span" fontWeight={700}>
                          Payment plan — {recurringTermMonths} months
                          {paymentPlanSchedule
                            ? ` · ${paymentPlanSchedule.allSame ? formatMoney(paymentPlanSchedule.perInst, totalsPreview?.currency ?? 'NAD') : `${recurringTermMonths} instalments`} / mo`
                            : ''}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" component="span">
                          Place order only — no payment today. Pay instalments from {APP_WALLET_DISPLAY_NAME} on your order
                          page.
                        </Typography>
                      </Stack>
                    }
                  />
                ) : null}
                <FormControlLabel
                  value="demo_wallet"
                  control={<Radio />}
                  disabled={submitting || !walletDemoAvailable}
                  label={
                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ py: 0.25 }}>
                      <Box component="img" src={avoTodayBrandLogoSrc} alt="" sx={checkoutPaymentMarkSx} />
                      <Stack spacing={0.25}>
                        <Typography component="span" fontWeight={700}>
                          {APP_WALLET_DISPLAY_NAME}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" component="span">
                          {walletDemoAvailable
                            ? walletBalanceCents != null
                              ? `Available: ${formatNad(walletBalanceCents)} — debited when the order is placed.`
                              : 'Loading wallet balance…'
                            : 'Wallet checkout is not available on this database.'}
                        </Typography>
                      </Stack>
                    </Stack>
                  }
                />
              </RadioGroup>
              {paymentMethod === 'demo_wallet' && walletDemoAvailable ? (
                <CheckoutWalletExtras
                  orderTotalCents={totalCents}
                  currency={totalsPreview?.currency ?? 'NAD'}
                  settings={walletSettings}
                  applyRoundUp={applyRoundUp}
                  onApplyRoundUpChange={setApplyRoundUp}
                  splitBillId={splitBillId}
                  onSplitBillIdChange={setSplitBillId}
                  payerShareCents={payerShareCents}
                  onPayerShareCentsChange={setPayerShareCents}
                />
              ) : null}
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
                          : paymentMethod === 'payment_plan' && signedIn
                            ? 'Place order'
                            : totalCents != null && totalsPreview
                              ? `Confirm payment ${formatMoney(totalCents, totalsPreview.currency)}`
                              : paymentMethod === 'demo_wallet' && signedIn
                                ? 'Place order & pay with wallet'
                                : paymentMethod === 'instant_pay' && signedIn
                                  ? 'Pay with Instant pay'
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
              <Stack spacing={1} sx={{ mb: 2 }}>
                {checkoutCartLines.map((line) => (
                  <Stack
                    key={line.lineId}
                    direction="row"
                    spacing={1}
                    alignItems="flex-start"
                    justifyContent="space-between"
                  >
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
                <Divider sx={{ my: 0.5 }} />
                <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                  <Typography variant="body1" fontWeight={900}>
                    Total
                  </Typography>
                  <Typography variant="body1" fontWeight={900} textAlign="right">
                    {totalCents != null ? formatMoney(totalCents, totalsPreview.currency) : '—'}
                  </Typography>
                </Stack>
                {paymentMethod === 'payment_plan' && paymentPlanSchedule && totalCents != null ? (
                  <>
                    <Divider sx={{ my: 0.5 }} />
                    <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                      <Typography variant="body2" fontWeight={800} color="success.main">
                        Due today
                      </Typography>
                      <Typography variant="body2" fontWeight={800} color="success.main" textAlign="right">
                        {formatMoney(0, totalsPreview.currency)}
                      </Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                      <Typography variant="body2" color="text.secondary">
                        {paymentPlanSchedule.term} instalments
                      </Typography>
                      <Typography variant="body2" color="text.secondary" textAlign="right">
                        {paymentPlanSchedule.allSame
                          ? `${paymentPlanSchedule.term} × ${formatMoney(paymentPlanSchedule.perInst, totalsPreview.currency)}`
                          : paymentPlanSchedule.amounts
                              .map((a, i) => `#${i + 1} ${formatMoney(a, totalsPreview.currency)}`)
                              .join(' · ')}
                      </Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>
                      Pay from {APP_WALLET_DISPLAY_NAME} on your order page after placing the order.
                    </Typography>
                  </>
                ) : null}
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
                : paymentMethod === 'payment_plan' && signedIn
                  ? 'Place order'
                  : paymentMethod === 'demo_wallet' && signedIn
                    ? 'Place order & pay with wallet'
                    : paymentMethod === 'instant_pay' && signedIn
                      ? 'Pay with Instant pay'
                      : `Pay with ${APP_DISPLAY_NAME}`}
            </Button>
          </Paper>
        </Grid>
      </Grid>
      </Box>
    </Box>
  )
}
