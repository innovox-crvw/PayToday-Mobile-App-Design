import { Link as RouterLink, useLocation, useSearchParams } from 'react-router-dom'
import { Button, Stack, Typography } from '@mui/material'

export function CheckoutFailurePage() {
  const [sp] = useSearchParams()
  const { pathname } = useLocation()
  const orderId = sp.get('orderId') ?? ''
  const reason = sp.get('reason') ?? ''
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''

  return (
    <Stack spacing={2} alignItems="center" sx={{ py: 4, textAlign: 'center', maxWidth: 480, mx: 'auto' }}>
      <Typography variant="h5" fontWeight={800}>
        Payment not completed
      </Typography>
      <Typography color="text.secondary">
        {reason === 'capture_failed'
          ? 'We could not finalize stock for this payment. Contact support with your order reference.'
          : 'You cancelled or the payment failed. You can try again from your cart.'}
      </Typography>
      {orderId && (
        <Typography variant="body2" color="text.secondary">
          Order reference: {orderId.slice(0, 8)}…
        </Typography>
      )}
      <Button component={RouterLink} to={`${pathPrefix}/cart`} variant="contained">
        Back to cart
      </Button>
    </Stack>
  )
}
