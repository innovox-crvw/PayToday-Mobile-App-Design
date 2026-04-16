import { Box, Typography } from '@mui/material'
import { useMemo } from 'react'
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined'

function hueFromString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h % 360
}

export interface ProductImageProps {
  imageUrl: string | null
  alt: string
  /** CSS aspect-ratio value, e.g. `4 / 3` or `1` */
  ratio?: string
  /** Initial letter / short label when no image */
  label?: string
}

export function ProductImage({ imageUrl, alt, ratio = '4 / 3', label }: ProductImageProps) {
  const fallback = useMemo(() => {
    const h = hueFromString(alt)
    const h2 = (h + 48) % 360
    return `linear-gradient(145deg, hsl(${h}, 58%, 42%) 0%, hsl(${h2}, 62%, 32%) 100%)`
  }, [alt])

  const letter = (label ?? alt).trim().slice(0, 1).toUpperCase() || '?'

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        aspectRatio: ratio,
        bgcolor: 'grey.200',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {imageUrl ? (
        <Box
          component="img"
          src={imageUrl}
          alt={alt}
          sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background: fallback,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.5,
          }}
        >
          <ShoppingBagOutlinedIcon sx={{ fontSize: 40, color: 'rgba(255,255,255,0.92)' }} />
          <Typography
            sx={{
              fontSize: 28,
              fontWeight: 800,
              color: 'rgba(255,255,255,0.95)',
              lineHeight: 1,
            }}
          >
            {letter}
          </Typography>
        </Box>
      )}
    </Box>
  )
}
