import { useEffect } from 'react'
import { Link as RouterLink, useLocation, useSearchParams } from 'react-router-dom'
import { Button, Stack, Typography } from '@mui/material'
import { notifyCatalogInventoryMaybeChanged } from '../../lib/catalogEvents'

export function CheckoutSuccessPage() {
  const [sp] = useSearchParams()
  const { pathname } = useLocation()
  const orderId = sp.get('orderId') ?? ''
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''

  useEffect(() => {
    notifyCatalogInventoryMaybeChanged()
  }, [])

  return (
    <Stack spacing={2} alignItems="center" sx={{ py: 4, textAlign: 'center', maxWidth: 480, mx: 'auto' }}>
      <Typography variant="h5" fontWeight={800}>
        Payment successful
      </Typography>
      <Typography color="text.secondary">
        Thank you. Your order {orderId ? `#${orderId.slice(0, 8)}…` : ''} is confirmed when payment clears (return URL or webhook).
      </Typography>
      {orderId && (
        <Button component={RouterLink} to={`${pathPrefix}/orders/${orderId}`} variant="contained">
          View order
        </Button>
      )}
      <Button component={RouterLink} to={`${pathPrefix}/shop`} variant="text">
        Continue shopping
      </Button>
    </Stack>
  )
}
