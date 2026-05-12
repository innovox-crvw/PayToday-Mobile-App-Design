import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { loadGoogleMapsOnce } from '../../lib/loadGoogleMapsOnce'
import { formatMoney } from '../../lib/money'
import {
  YANGO_DEMO_ZONES,
  buildCheckoutWindowFromSlot,
  defaultYangoDemoPin,
  findYangoDemoZoneForPin,
  nextLocalDates,
  zoneCenter,
  type YangoDemoSlot,
  type YangoDemoZone,
} from '../../lib/yangoDeliveryDemo'
import { fetchHomeDeliveryZones } from '../../lib/yangoHomeDeliveryApi'
import type { YangoDemoSchedulePayload } from './checkoutScheduleTypes'

export type { YangoDemoSchedulePayload } from './checkoutScheduleTypes'

function shortDateLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1)
  return dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

type LatLngLike = { lat(): number; lng(): number }

type Props = {
  mapsApiKey?: string
  onScheduleChange: (payload: YangoDemoSchedulePayload | null) => void
}

export function YangoDeliveryDemoPanel({ mapsApiKey, onScheduleChange }: Props) {
  const scheduleCbRef = useRef(onScheduleChange)
  useEffect(() => {
    scheduleCbRef.current = onScheduleChange
  }, [onScheduleChange])

  const mapHostRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<{ setCenter: (p: { lat: number; lng: number }) => void } | null>(null)
  const markerRef = useRef<{ setPosition: (p: { lat: number; lng: number }) => void } | null>(null)
  const pinListenerRef = useRef<{ remove?: () => void } | null>(null)
  const mapClickListenerRef = useRef<{ remove?: () => void } | null>(null)
  const overlayCleanupRef = useRef<Array<() => void>>([])

  const [pin, setPin] = useState(defaultYangoDemoPin)
  const [mapLoadError, setMapLoadError] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [apiZones, setApiZones] = useState<YangoDemoZone[]>(YANGO_DEMO_ZONES)

  useEffect(() => {
    void fetchHomeDeliveryZones().then(setApiZones)
  }, [])

  const dates = useMemo(() => nextLocalDates(7), [])
  const [dateYmd, setDateYmd] = useState(dates[0] ?? '')

  const zone = useMemo(() => findYangoDemoZoneForPin(pin.lat, pin.lng, apiZones), [pin.lat, pin.lng, apiZones])

  const [slotId, setSlotId] = useState<string | null>(null)

  useEffect(() => {
    if (!zone) {
      setSlotId(null)
      return
    }
    setSlotId((prev) => {
      if (prev && zone.slots.some((s) => s.id === prev)) return prev
      return zone.slots[0]?.id ?? null
    })
  }, [zone])

  const slot: YangoDemoSlot | null = useMemo(() => {
    if (!zone || !slotId) return null
    return zone.slots.find((s) => s.id === slotId) ?? null
  }, [zone, slotId])

  useEffect(() => {
    if (!zone || !slot) {
      scheduleCbRef.current(null)
      return
    }
    const w = buildCheckoutWindowFromSlot(dateYmd, slot, zone.name)
    scheduleCbRef.current({
      deliveryScheduledFor: w.deliveryScheduledFor,
      homeWinStart: w.homeWinStart,
      homeWinEnd: w.homeWinEnd,
      homeWinLabel: w.homeWinLabel,
      demoCourierCents: zone.courierEstimateCents,
    })
  }, [zone, slot, dateYmd])

  const applyPin = useCallback((lat: number, lng: number) => {
    setPin({ lat, lng })
    markerRef.current?.setPosition({ lat, lng })
    mapRef.current?.setCenter({ lat, lng })
  }, [])

  useEffect(() => {
    if (!mapsApiKey?.trim()) {
      setMapReady(false)
      return
    }
    const el = mapHostRef.current
    if (!el) return

    let cancelled = false
    setMapLoadError(null)

    void (async () => {
      try {
        await loadGoogleMapsOnce(mapsApiKey.trim())
        if (cancelled) return
        const g = (window as unknown as { google?: { maps: Record<string, unknown> } }).google?.maps
        if (!g) {
          setMapLoadError('Google Maps did not become available.')
          return
        }

        const LatLng = g.LatLng as new (lat: number, lng: number) => LatLngLike
        const MapCtor = g.Map as new (
          host: HTMLElement,
          opts: Record<string, unknown>,
        ) => {
          setCenter: (p: LatLngLike) => void
          addListener: (ev: string, fn: (e: { latLng: LatLngLike }) => void) => { remove?: () => void }
        }
        const MarkerCtor = g.Marker as new (opts: Record<string, unknown>) => {
          setPosition: (p: LatLngLike | { lat: number; lng: number }) => void
          getPosition: () => LatLngLike | undefined
          addListener: (ev: string, fn: () => void) => { remove?: () => void }
        }
        const RectangleCtor = g.Rectangle as new (opts: Record<string, unknown>) => { setMap: (m: unknown) => void }

        const center = new LatLng(pin.lat, pin.lng)
        const map = new MapCtor(el, {
          center,
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        })
        mapRef.current = {
          setCenter(p) {
            map.setCenter(new LatLng(p.lat, p.lng))
          },
        }

        overlayCleanupRef.current = []
        for (const z of apiZones) {
          const rect = new RectangleCtor({
            bounds: z.bounds,
            strokeColor: z.fillColor,
            strokeOpacity: 0.9,
            strokeWeight: 2,
            fillColor: z.fillColor,
            fillOpacity: 0.12,
            map,
          }) as { setMap: (m: unknown) => void }
          overlayCleanupRef.current.push(() => rect.setMap(null))
        }

        const marker = new MarkerCtor({
          position: center,
          map,
          draggable: true,
          title: 'Drag to choose delivery area (demo)',
        }) as {
          setPosition: (p: LatLngLike) => void
          getPosition: () => LatLngLike | undefined
          addListener: (ev: string, fn: () => void) => { remove?: () => void }
          setMap: (m: unknown) => void
        }
        overlayCleanupRef.current.push(() => marker.setMap(null))

        markerRef.current = {
          setPosition(p) {
            marker.setPosition(new LatLng(p.lat, p.lng))
          },
        }

        pinListenerRef.current?.remove?.()
        pinListenerRef.current = marker.addListener('dragend', () => {
          const p = marker.getPosition()
          if (!p) return
          setPin({ lat: p.lat(), lng: p.lng() })
        })

        mapClickListenerRef.current?.remove?.()
        mapClickListenerRef.current = map.addListener('click', (e: { latLng: LatLngLike }) => {
          const p = e.latLng
          marker.setPosition(p)
          setPin({ lat: p.lat(), lng: p.lng() })
        })

        setMapReady(true)
      } catch (e) {
        if (!cancelled) {
          setMapLoadError(e instanceof Error ? e.message : 'Could not load Google Maps.')
        }
      }
    })()

    return () => {
      cancelled = true
      pinListenerRef.current?.remove?.()
      pinListenerRef.current = null
      mapClickListenerRef.current?.remove?.()
      mapClickListenerRef.current = null
      for (const fn of overlayCleanupRef.current) fn()
      overlayCleanupRef.current = []
      markerRef.current = null
      mapRef.current = null
      setMapReady(false)
    }
  }, [mapsApiKey, apiZones])

  useEffect(() => {
    if (!mapReady) return
    markerRef.current?.setPosition(pin)
    mapRef.current?.setCenter(pin)
  }, [pin, mapReady])

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Stack spacing={2}>
        <Stack spacing={0.5}>
          <Typography variant="subtitle1" fontWeight={900}>
            Yango delivery (demo)
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Pick a drop-off point on the map (or a demo area below). Courier fee shown is illustrative only — your cart
            still uses store shipping rules at checkout.
          </Typography>
        </Stack>

        {mapsApiKey?.trim() ? (
          <>
            {mapLoadError ? (
              <Alert severity="warning">{mapLoadError}</Alert>
            ) : (
              <Box
                ref={mapHostRef}
                sx={{
                  height: 280,
                  borderRadius: 2,
                  overflow: 'hidden',
                  bgcolor: 'action.hover',
                }}
              />
            )}
          </>
        ) : (
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            Add <Typography component="span" variant="body2" fontFamily="monospace">VITE_GOOGLE_MAPS_API_KEY</Typography>{' '}
            to enable the live map. Demo zones and scheduling still work below.
          </Alert>
        )}

        <Typography variant="subtitle2" fontWeight={800}>
          Demo delivery areas
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={1}>
          {apiZones.map((z: YangoDemoZone) => {
            const c = zoneCenter(z)
            const active = zone?.id === z.id
            return (
              <Button
                key={z.id}
                size="small"
                variant={active ? 'contained' : 'outlined'}
                onClick={() => applyPin(c.lat, c.lng)}
                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
              >
                {z.name} · {formatMoney(z.courierEstimateCents, 'NAD')}
              </Button>
            )
          })}
        </Stack>

        {zone ? (
          <Stack spacing={0.75}>
            <Typography variant="body2" fontWeight={800}>
              Selected: {zone.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {zone.description} · {zone.serviceDaysLabel}
            </Typography>
            <Typography variant="body2" color="primary.main" fontWeight={800}>
              Yango courier estimate (demo): {formatMoney(zone.courierEstimateCents, 'NAD')}
            </Typography>
          </Stack>
        ) : (
          <Alert severity="warning" sx={{ borderRadius: 2 }}>
            Drop pin is outside the demo zones — move the pin or choose an area above to see courier estimate and time
            slots.
          </Alert>
        )}

        <Typography variant="subtitle2" fontWeight={800} sx={{ pt: 0.5 }}>
          Schedule
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Available hours depend on the selected demo area. Pick a day, then a slot.
        </Typography>

        <ToggleButtonGroup
          exclusive
          value={dateYmd}
          onChange={(_, v) => {
            if (v != null) setDateYmd(v)
          }}
          sx={{ flexWrap: 'wrap', gap: 0.5, '& .MuiToggleButton-root': { borderRadius: 2, fontWeight: 700 } }}
        >
          {dates.map((d) => (
            <ToggleButton key={d} value={d} size="small">
              {shortDateLabel(d)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {zone ? (
          <ToggleButtonGroup
            exclusive
            value={slotId ?? ''}
            onChange={(_, v) => {
              if (v != null) setSlotId(v)
            }}
            orientation="vertical"
            fullWidth
            sx={{ '& .MuiToggleButton-root': { borderRadius: 2, justifyContent: 'flex-start', fontWeight: 700 } }}
          >
            {zone.slots.map((s) => (
              <ToggleButton key={s.id} value={s.id}>
                {s.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        ) : null}
      </Stack>
    </Paper>
  )
}
