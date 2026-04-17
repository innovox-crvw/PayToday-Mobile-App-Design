import { useEffect } from 'react'
import { Link as RouterLink, useLocation, useSearchParams } from 'react-router-dom'
import { Button, Stack, Typography } from '@mui/material'
import { notifyCatalogInventoryMaybeChanged } from '../../lib/catalogEvents'
import { clearCheckoutIdempotencyKey } from '../../lib/checkoutIdempotency'

/** Local checkout without hosted PayToday redirect */
export function CheckoutCompletePage() {
  const [sp] = useSearchParams()
  const { pathname } = useLocation()
  const orderId = sp.get('orderId') ?? ''
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''

  useEffect(() => {
    clearCheckoutIdempotencyKey()
    window.dispatchEvent(new Event('pt-cart-updated'))
    notifyCatalogInventoryMaybeChanged()
  }, [])

  return (
    <Stack spacing={2} alignItems="center" sx={{ py: 4, textAlign: 'center', maxWidth: 480, mx: 'auto' }}>
      <Typography variant="h5" fontWeight={800}>
        Order created
      </Typography>
      <Typography color="text.secondary">
        No payment redirect configured. Order ID: {orderId || '—'}. Use webhook or return URL in staging to confirm payment.
      </Typography>
      <Button component={RouterLink} to={`${pathPrefix}/shop`} variant="contained">
        Back to shop
      </Button>
    </Stack>
  )
}
