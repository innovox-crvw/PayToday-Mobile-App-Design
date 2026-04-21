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
  /**
   * Width as a fraction of the parent (0–1], centered when below 1.
   * Default 1 = full width of parent (shop cards, thumbnails, etc.).
   */
  widthFraction?: number
  /**
   * `plain`: no grey fill; subtle border + radius (e.g. product hero on tinted page).
   * `default`: neutral backing for grids and thumbnails.
   */
  frame?: 'default' | 'plain'
  /**
   * `tile`: centred image inset (~70% frame) — shop cards and compact grids.
   * `hero`: full-bleed cover inside the aspect box — PDP gallery / thumbnails in a fixed frame.
   */
  imageLayout?: 'tile' | 'hero'
}

export function ProductImage({
  imageUrl,
  alt,
  ratio = '4 / 3',
  label,
  widthFraction = 1,
  frame = 'default',
  imageLayout = 'tile',
}: ProductImageProps) {
  const fallback = useMemo(() => {
    const h = hueFromString(alt)
    const h2 = (h + 48) % 360
    return `linear-gradient(145deg, hsl(${h}, 58%, 42%) 0%, hsl(${h2}, 62%, 32%) 100%)`
  }, [alt])

  const letter = (label ?? alt).trim().slice(0, 1).toUpperCase() || '?'

  const wf = Number.isFinite(widthFraction) ? Math.min(1, Math.max(0.05, widthFraction)) : 1
  const isFullWidth = wf >= 1 - 1e-6
  const isPlain = frame === 'plain'
  const isHero = imageLayout === 'hero'
  const maxW = isHero ? '100%' : '70%'
  const mx = isHero ? 0 : isFullWidth ? 0 : 'auto'
  const showPlainChrome = isPlain && !isHero

  return (
    <Box
      sx={{
        position: 'relative',
        /** Hero always stretches to the parent so shop tiles and PDP wrappers fill predictably. */
        width: isHero ? '100%' : undefined,
        maxWidth: maxW,
        mx,
        aspectRatio: ratio,
        bgcolor: isHero ? 'grey.100' : isPlain ? 'transparent' : 'grey.200',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        ...(showPlainChrome
          ? {
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
            }
          : {}),
      }}
    >
      {imageUrl ? (
        <Box
          component="img"
          src={imageUrl}
          alt={alt}
          sx={
            isHero
              ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }
              : { width: '70%', height: '70%', objectFit: 'cover', display: 'block' }
          }
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
