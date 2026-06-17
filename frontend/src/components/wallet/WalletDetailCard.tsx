import type { ReactNode } from 'react'
import { Card, CardContent, Stack } from '@mui/material'
import { walletCardSx } from '../../theme/walletTheme'

export function WalletDetailCard(props: { children: ReactNode }) {
  return (
    <Card elevation={0} sx={walletCardSx}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Stack spacing={2}>{props.children}</Stack>
      </CardContent>
    </Card>
  )
}
