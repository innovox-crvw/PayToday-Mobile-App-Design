import { Box, Typography } from '@mui/material'

type Props = {
  title: string
  description?: string
}

export function AccountSectionHeader({ title, description }: Props) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h5" component="h2" fontWeight={800} sx={{ letterSpacing: -0.35, mb: description ? 1 : 0 }}>
        {title}
      </Typography>
      {description ? (
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6, maxWidth: 640 }}>
          {description}
        </Typography>
      ) : null}
    </Box>
  )
}
