import { Alert, Stack, Typography } from '@mui/material'

export function AdminPlaceholderPage({ title, notes }: { title: string; notes: string }) {
  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        {title}
      </Typography>
      <Alert severity="info">{notes}</Alert>
    </Stack>
  )
}
