import type { ReactNode } from 'react'
import { IconButton, Typography, Box, Paper } from '@mui/material'
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew'
import { useNavigate } from 'react-router-dom'

export function WalletSubheader({ title, rightSlot }: { title: string; rightSlot?: ReactNode }) {
  const navigate = useNavigate()
  return (
    <Paper
      elevation={0}
      sx={{
        display: 'grid',
        gridTemplateColumns: '44px 1fr 44px',
        alignItems: 'center',
        gap: 0.5,
        py: 1.75,
        px: { xs: 0.5, sm: 0 },
        mb: 2.5,
        bgcolor: 'background.paper',
        borderRadius: 3,
        border: 1,
        borderColor: 'divider',
        boxShadow: '0 4px 20px rgba(15, 23, 42, 0.05)',
      }}
    >
      <IconButton onClick={() => navigate(-1)} aria-label="Back" size="medium" sx={{ justifySelf: 'start' }}>
        <ArrowBackIosNewIcon sx={{ fontSize: 18 }} />
      </IconButton>
      <Typography variant="h6" component="h1" fontWeight={800} textAlign="center" sx={{ letterSpacing: -0.2 }}>
        {title}
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', minHeight: 40, alignItems: 'center' }}>{rightSlot}</Box>
    </Paper>
  )
}
