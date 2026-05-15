import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Box, Typography } from '@mui/material'
import type { YangoDemoZone } from '../../lib/yangoDeliveryDemo'

function unionBounds(zones: YangoDemoZone[]): { south: number; west: number; north: number; east: number } {
  if (!zones.length) {
    return { south: -22.62, west: 16.98, north: -22.48, east: 17.14 }
  }
  let south = Infinity
  let west = Infinity
  let north = -Infinity
  let east = -Infinity
  for (const z of zones) {
    south = Math.min(south, z.bounds.south)
    west = Math.min(west, z.bounds.west)
    north = Math.max(north, z.bounds.north)
    east = Math.max(east, z.bounds.east)
  }
  const padLat = Math.max(0.002, (north - south) * 0.08)
  const padLng = Math.max(0.002, (east - west) * 0.08)
  return { south: south - padLat, west: west - padLng, north: north + padLat, east: east + padLng }
}

type Props = {
  zones: YangoDemoZone[]
  pin: { lat: number; lng: number }
  onPinChange: (lat: number, lng: number) => void
  /** Shown in corner — e.g. "Preview (no API key)" */
  caption?: string
}

/**
 * Non-Google map: proportional lat/lng → CSS layout so delivery rectangles + pin match real zone bounds.
 */
export function DeliveryMapDemoCanvas({ zones, pin, onPinChange, caption }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const dragging = useRef(false)

  const u = useMemo(() => unionBounds(zones), [zones])

  const toPct = useCallback(
    (lat: number, lng: number) => {
      const latSpan = u.north - u.south
      const lngSpan = u.east - u.west
      const x = lngSpan > 0 ? ((lng - u.west) / lngSpan) * 100 : 50
      const y = latSpan > 0 ? ((u.north - lat) / latSpan) * 100 : 50
      return { leftPct: Math.min(100, Math.max(0, x)), topPct: Math.min(100, Math.max(0, y)) }
    },
    [u],
  )

  const pinPct = useMemo(() => toPct(pin.lat, pin.lng), [pin.lat, pin.lng, toPct])

  const latLngFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const el = wrapRef.current
      if (!el) return null
      const r = el.getBoundingClientRect()
      const x = (clientX - r.left) / Math.max(1, r.width)
      const y = (clientY - r.top) / Math.max(1, r.height)
      const latSpan = u.north - u.south
      const lngSpan = u.east - u.west
      const lat = u.north - y * latSpan
      const lng = u.west + x * lngSpan
      return { lat, lng }
    },
    [u],
  )

  useEffect(() => {
    const onMove = (ev: MouseEvent | TouchEvent) => {
      if (!dragging.current) return
      const clientX = 'touches' in ev ? ev.touches[0]?.clientX : ev.clientX
      const clientY = 'touches' in ev ? ev.touches[0]?.clientY : ev.clientY
      if (clientX == null || clientY == null) return
      const p = latLngFromClient(clientX, clientY)
      if (p) onPinChange(p.lat, p.lng)
    }
    const onUp = () => {
      dragging.current = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [latLngFromClient, onPinChange])

  const onMapPointer = (clientX: number, clientY: number) => {
    const p = latLngFromClient(clientX, clientY)
    if (p) onPinChange(p.lat, p.lng)
  }

  return (
    <Box
      ref={wrapRef}
      role="application"
      aria-label="Delivery map preview (demo — not Google Maps)"
      sx={{
        position: 'relative',
        height: 280,
        borderRadius: 2,
        overflow: 'hidden',
        bgcolor: '#e8eef2',
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
        border: (t) => `1px solid ${t.palette.divider}`,
        cursor: 'crosshair',
        touchAction: 'none',
      }}
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).dataset.pin === '1') {
          dragging.current = true
          return
        }
        onMapPointer(e.clientX, e.clientY)
      }}
      onTouchStart={(e) => {
        const t = e.touches[0]
        if (!t) return
        if ((e.target as HTMLElement).dataset.pin === '1') dragging.current = true
        else onMapPointer(t.clientX, t.clientY)
      }}
    >
      {zones.map((z) => {
        const a = toPct(z.bounds.north, z.bounds.west)
        const b = toPct(z.bounds.south, z.bounds.east)
        const left = Math.min(a.leftPct, b.leftPct)
        const top = Math.min(a.topPct, b.topPct)
        const width = Math.abs(b.leftPct - a.leftPct)
        const height = Math.abs(b.topPct - a.topPct)
        return (
          <Box
            key={z.id}
            title={z.name}
            sx={{
              position: 'absolute',
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
              height: `${height}%`,
              bgcolor: `${z.fillColor}22`,
              border: `2px solid ${z.fillColor}`,
              borderRadius: 1,
              pointerEvents: 'none',
              boxSizing: 'border-box',
            }}
          />
        )
      })}
      <Box
        data-pin="1"
        sx={{
          position: 'absolute',
          left: `${pinPct.leftPct}%`,
          top: `${pinPct.topPct}%`,
          width: 28,
          height: 28,
          marginLeft: '-14px',
          marginTop: '-28px',
          borderRadius: '50% 50% 50% 0',
          transform: 'rotate(-45deg)',
          bgcolor: 'error.main',
          border: '2px solid #fff',
          boxShadow: 2,
          cursor: 'grab',
          zIndex: 2,
          '&:active': { cursor: 'grabbing' },
        }}
      />
      {caption ? (
        <Typography
          variant="caption"
          sx={{
            position: 'absolute',
            left: 8,
            bottom: 6,
            bgcolor: 'rgba(0,0,0,0.55)',
            color: 'common.white',
            px: 1,
            py: 0.25,
            borderRadius: 1,
            fontWeight: 700,
            maxWidth: 'calc(100% - 16px)',
            zIndex: 3,
          }}
        >
          {caption}
        </Typography>
      ) : null}
    </Box>
  )
}
