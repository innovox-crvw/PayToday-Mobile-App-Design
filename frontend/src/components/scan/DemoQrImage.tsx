import { useEffect, useState } from 'react'
import { Box, CircularProgress } from '@mui/material'
import QRCode from 'qrcode'

type Props = {
  value: string
  size?: number
  /** Accessible label for the generated pattern */
  label: string
}

export function DemoQrImage({ value, size = 240, label }: Props) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void QRCode.toDataURL(value, {
      margin: 2,
      width: size,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then((url) => {
      if (!cancelled) setSrc(url)
    })
    return () => {
      cancelled = true
    }
  }, [value, size])

  if (!src) {
    return (
      <Box sx={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={36} />
      </Box>
    )
  }

  return (
    <Box
      component="img"
      src={src}
      alt={label}
      sx={{
        width: size,
        height: size,
        display: 'block',
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: '#fff',
        boxShadow: '0 8px 28px rgba(15, 23, 42, 0.08)',
      }}
    />
  )
}
