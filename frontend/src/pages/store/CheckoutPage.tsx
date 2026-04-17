import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Alert,
  Button,
  FormControl,
  FormControlLabel,
  FormLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { formatNad } from '../../data/walletMock'
import {
  CHECKOUT_IDEMPOTENCY_STORAGE_KEY,
  clearCheckoutIdempotencyKey,
} from '../../lib/checkoutIdempotency'
import { notifyCatalogInventoryMaybeChanged } from '../../lib/catalogEvents'
import { apiUrl } from '../../lib/apiOrigin'
import { formatMoney } from '../../lib/money'
import type { StorefrontConfig } from '../../types/storefront'

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
  is_default?: boolean
}

function isValidEmail(value: string): boolean {
  const t = value.trim()
  if (t.length < 5) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)
}

export function CheckoutPage() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const [delivery, setDelivery] = useState<'home' | 'deposit_box'>('home')
  const [locations, setLocations] = useState<DepositLocation[]>([])
  const [locationId, setLocationId] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestFirstName, setGuestFirstName] = useState('')
  const [guestLastName, setGuestLastName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [authResolved, setAuthResolved] = useState(false)
  const [user, setUser] = useState<{ sub?: string; email?: string } | null>(null)
  const [addresses, setAddresses] = useState<AddressRow[]>([])
  const [shippingAddressId, setShippingAddressId] = useState('')
  const [addressMode, setAddressMode] = useState<'saved' | 'new'>('saved')
  const [newLabel, setNewLabel] = useState('')
  const [newLine1, setNewLine1] = useState('')
  const [newLine2, setNewLine2] = useState('')
  const [newCity, setNewCity] = useState('')
  const [newRegion, setNewRegion] = useState('')
  const [newPostalCode, setNewPostalCode] = useState('')
  const [newCountry, setNewCountry] = useState('NA')
  const [storefront, setStorefront] = useState<StorefrontConfig | null>(null)
  const [storefrontConfigReady, setStorefrontConfigReady] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'paytoday' | 'demo_wallet'>('paytoday')
  const [walletBalanceCents, setWalletBalanceCents] = useState<number | null>(null)
  const [walletDemoAvailable, setWalletDemoAvailable] = useState(true)

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
          const data = (await me.json()) as { user?: { sub: string; email?: string } }
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
    if (addresses.length === 0) setAddressMode('new')
  }, [addresses.length])

  useEffect(() => {
    if (!user?.sub) {
      setPaymentMethod('paytoday')
      setWalletBalanceCents(null)
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

  async function submit() {
    setMsg(null)
    if (storefront?.checkoutRequireSignIn && !user?.sub) {
      setMsg('This store requires a signed-in account to check out. Open Account and sign in, then return here.')
      return
    }
    if (delivery === 'home' && !user?.sub) {
      setMsg('Sign in to use home delivery, or switch to pickup.')
      return
    }
    if (!user?.sub && !isValidEmail(guestEmail)) {
      setMsg('Enter a valid email address for checkout (required when you are not signed in).')
      return
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
        if (!line1 || !city) {
          setMsg('Enter street address and city for home delivery.')
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
    setSubmitting(true)
    try {
      await fetchCsrfToken()
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
          guestFirstName: guestFirstName.trim() || null,
          guestLastName: guestLastName.trim() || null,
          guestPhone: guestPhone.trim() || null,
          paymentMethod: user?.sub ? paymentMethod : 'paytoday',
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

  const signedIn = Boolean(user?.sub)
  const homeBlocked = delivery === 'home' && !signedIn
  const checkoutAccountRequired = Boolean(storefront?.checkoutRequireSignIn)
  const payDisabled =
    !storefrontConfigReady || homeBlocked || submitting || (checkoutAccountRequired && !signedIn)
  const onboardingSignIn = `${pathPrefix}/onboarding/login?returnTo=${encodeURIComponent(`${pathPrefix}/checkout`)}`
  const onboardingRegister = `${pathPrefix}/onboarding/login?mode=register&returnTo=${encodeURIComponent(`${pathPrefix}/checkout`)}`

  return (
    <Stack spacing={2} maxWidth={480}>
      <Typography variant="h5" component="h1" fontWeight={800}>
        Checkout
      </Typography>
      {storefrontConfigReady && checkoutAccountRequired && (
        <Alert severity="info">
          Guest checkout is turned off for this deployment.{' '}
          <RouterLink to={onboardingSignIn}>Sign in</RouterLink> (or{' '}
          <RouterLink to={onboardingRegister}>register</RouterLink>) before paying.
        </Alert>
      )}
      {authResolved && (
        <Alert severity={signedIn ? 'success' : 'warning'}>
          {signedIn ? (
            <>
              Signed in{user?.email ? ` as ${user.email}` : ''}. Home delivery uses your account address (saved or
              entered below).
            </>
          ) : (
            <>
              You are not signed in. Home delivery requires an account —{' '}
              <RouterLink to={onboardingSignIn}>sign in</RouterLink> or{' '}
              <RouterLink to={onboardingRegister}>register</RouterLink>
              , or choose pickup.
            </>
          )}
        </Alert>
      )}
      <Alert severity="info">
        Home delivery is for signed-in customers; you can pick a saved address or type a new one at checkout.{' '}
        {storefront?.shippingFreeSubtotalCents ? (
          <>
            Free home delivery applies from {formatMoney(storefront.shippingFreeSubtotalCents, 'NAD')} subtotal
            {storefront.shippingFlatCents > 0
              ? `; below that, delivery is ${formatMoney(storefront.shippingFlatCents, 'NAD')}.`
              : '.'}{' '}
          </>
        ) : storefront && storefront.shippingFlatCents > 0 ? (
          <>Home delivery includes {formatMoney(storefront.shippingFlatCents, 'NAD')} shipping. </>
        ) : null}
        {storefront && storefront.vatRateBps > 0 ? (
          <>VAT is included on the subtotal ({(storefront.vatRateBps / 100).toFixed(2)}%). </>
        ) : null}
        Pickup uses partner pickup points (no delivery fee). Payment return hits the API first, then redirects here.
      </Alert>
      <FormControl>
        <FormLabel id="delivery-label">Delivery</FormLabel>
        <RadioGroup
          aria-labelledby="delivery-label"
          value={delivery}
          onChange={(e) => setDelivery(e.target.value as 'home' | 'deposit_box')}
        >
          <FormControlLabel value="home" control={<Radio />} label="Home delivery" />
          <FormControlLabel value="deposit_box" control={<Radio />} label="Pickup point (collect)" />
        </RadioGroup>
      </FormControl>
      {delivery === 'home' && signedIn && (
        <>
          <FormControl>
            <FormLabel id="addr-mode-label">Delivery address</FormLabel>
            <RadioGroup
              aria-labelledby="addr-mode-label"
              value={addressMode}
              onChange={(e) => setAddressMode(e.target.value as 'saved' | 'new')}
            >
              <FormControlLabel
                value="saved"
                control={<Radio />}
                label="Use a saved address"
                disabled={addresses.length === 0}
              />
              <FormControlLabel value="new" control={<Radio />} label="Type a new address" />
            </RadioGroup>
          </FormControl>
          {addressMode === 'saved' && addresses.length > 0 && (
            <TextField
              select
              label="Saved address"
              value={shippingAddressId}
              onChange={(e) => setShippingAddressId(e.target.value)}
              fullWidth
              helperText={
                <span>
                  Manage addresses anytime from{' '}
                  <RouterLink to={`${pathPrefix}/account`}>account</RouterLink>.
                </span>
              }
            >
              {addresses.map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.label ?? 'Address'} — {a.line1}, {a.city}
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
              />
              <TextField
                label="Street address"
                value={newLine1}
                onChange={(e) => setNewLine1(e.target.value)}
                fullWidth
                required
                autoComplete="street-address"
              />
              <TextField
                label="Apartment, suite, etc. (optional)"
                value={newLine2}
                onChange={(e) => setNewLine2(e.target.value)}
                fullWidth
                autoComplete="address-line2"
              />
              <TextField
                label="City"
                value={newCity}
                onChange={(e) => setNewCity(e.target.value)}
                fullWidth
                required
                autoComplete="address-level2"
              />
              <TextField
                label="Region / state (optional)"
                value={newRegion}
                onChange={(e) => setNewRegion(e.target.value)}
                fullWidth
                autoComplete="address-level1"
              />
              <TextField
                label="Postal code (optional)"
                value={newPostalCode}
                onChange={(e) => setNewPostalCode(e.target.value)}
                fullWidth
                autoComplete="postal-code"
              />
              <TextField
                label="Country code"
                value={newCountry}
                onChange={(e) => setNewCountry(e.target.value)}
                fullWidth
                helperText="Use ISO-style code (e.g. NA for Namibia)."
              />
            </Stack>
          )}
        </>
      )}
      {delivery === 'deposit_box' && (
        <TextField select label="Pickup location" value={locationId} onChange={(e) => setLocationId(e.target.value)} fullWidth>
          {locations.map((l) => (
            <MenuItem key={l.id} value={l.id}>
              {l.name}
              {l.addressSummary ? ` — ${l.addressSummary}` : ''}
            </MenuItem>
          ))}
        </TextField>
      )}
      {!signedIn && (
        <TextField
          label="Contact email (required)"
          type="email"
          value={guestEmail}
          onChange={(e) => setGuestEmail(e.target.value)}
          fullWidth
          required
          autoComplete="email"
          helperText="Used for receipts and PayToday payment (hosted checkout)."
          disabled={submitting}
        />
      )}
      <Typography variant="subtitle2" color="text.secondary">
        Optional contact fields for the hosted PayToday step. If you are signed in, your account name is used when these are left
        blank.
      </Typography>
      <TextField
        label="First name (optional)"
        value={guestFirstName}
        onChange={(e) => setGuestFirstName(e.target.value)}
        fullWidth
        autoComplete="given-name"
        disabled={submitting}
      />
      <TextField
        label="Last name (optional)"
        value={guestLastName}
        onChange={(e) => setGuestLastName(e.target.value)}
        fullWidth
        autoComplete="family-name"
        disabled={submitting}
      />
      <TextField
        label="Phone (optional)"
        type="tel"
        value={guestPhone}
        onChange={(e) => setGuestPhone(e.target.value)}
        fullWidth
        autoComplete="tel"
        disabled={submitting}
      />
      {signedIn ? (
        <FormControl>
          <FormLabel id="pay-method-label">Payment</FormLabel>
          <RadioGroup
            aria-labelledby="pay-method-label"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as 'paytoday' | 'demo_wallet')}
          >
            <FormControlLabel
              value="paytoday"
              control={<Radio />}
              label="PayToday (hosted checkout)"
              disabled={submitting}
            />
            <FormControlLabel
              value="demo_wallet"
              control={<Radio />}
              disabled={submitting || !walletDemoAvailable}
              label={
                <Stack spacing={0.25}>
                  <Typography fontWeight={700}>PayToday Wallet</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {walletDemoAvailable
                      ? walletBalanceCents != null
                        ? `Available: ${formatNad(walletBalanceCents)} — debited when the order is placed.`
                        : 'Loading wallet balance…'
                      : 'Wallet checkout is not available on this database. Contact your administrator.'}
                  </Typography>
                </Stack>
              }
            />
          </RadioGroup>
        </FormControl>
      ) : null}
      <Button variant="contained" onClick={() => void submit()} disabled={payDisabled}>
        {submitting ? 'Processing…' : paymentMethod === 'demo_wallet' && signedIn ? 'Place order & pay with wallet' : 'Pay with PayToday'}
      </Button>
      {msg && (
        <Alert
          severity={msg.includes('Order') ? 'success' : 'error'}
          sx={msg.includes('Order') ? undefined : { whiteSpace: 'pre-wrap' }}
        >
          {msg}
        </Alert>
      )}
      <Button component={RouterLink} to={`${pathPrefix}/cart`} variant="text">
        Back to cart
      </Button>
      <Button component={RouterLink} to={`${pathPrefix}/orders/track`} variant="text" size="small">
        Track an order
      </Button>
    </Stack>
  )
}
