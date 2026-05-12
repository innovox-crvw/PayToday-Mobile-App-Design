import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material'
import { loadGoogleMapsOnce } from '../../lib/loadGoogleMapsOnce'
import { formatMoney } from '../../lib/money'
import {
  YANGO_DEMO_ZONES,
  defaultYangoDemoPin,
  findYangoDemoZoneForPin,
  zoneCenter,
  type YangoDemoZone,
} from '../../lib/yangoDeliveryDemo'
import { fetchHomeDeliveryZones } from '../../lib/yangoHomeDeliveryApi'

export type MapZoneMeta = {
  zone: YangoDemoZone | null
  pin: { lat: number; lng: number }
}

type LatLngLike = { lat(): number; lng(): number }

type Props = {
  mapsApiKey?: string
  /** When user picks a saved address with coordinates, centre the pin here. */
  focusLatLng?: { lat: number; lng: number } | null
  onZoneMetaChange: (meta: MapZoneMeta) => void
}

export function AddressMapPicker({ mapsApiKey, focusLatLng, onZoneMetaChange }: Props) {
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

  useEffect(() => {
    if (!focusLatLng) return
    setPin({ lat: focusLatLng.lat, lng: focusLatLng.lng })
  }, [focusLatLng?.lat, focusLatLng?.lng])

  const zone = useMemo(() => findYangoDemoZoneForPin(pin.lat, pin.lng, apiZones), [pin.lat, pin.lng, apiZones])

  const metaCbRef = useRef(onZoneMetaChange)
  useEffect(() => {
    metaCbRef.current = onZoneMetaChange
  }, [onZoneMetaChange])

  useEffect(() => {
    metaCbRef.current({ zone, pin: { ...pin } })
  }, [zone, pin])

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
          title: 'Drag pin to your delivery location',
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
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack spacing={0.5}>
            <Typography variant="subtitle1" fontWeight={900} component="h2">
              Map — choose delivery point
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Drag the pin or tap the map. Coloured areas show delivery bands by suburb; the courier estimate updates when you
              are inside a zone.
            </Typography>
          </Stack>

          {mapsApiKey?.trim() ? (
            mapLoadError ? (
              <Alert severity="warning">{mapLoadError}</Alert>
            ) : (
              <Box
                ref={mapHostRef}
                role="application"
                aria-label="Interactive map to select delivery location"
                sx={{
                  height: 280,
                  borderRadius: 2,
                  overflow: 'hidden',
                  bgcolor: 'action.hover',
                }}
              />
            )
          ) : (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              Add <Typography component="span" variant="body2" fontFamily="monospace">VITE_GOOGLE_MAPS_API_KEY</Typography>{' '}
              to your frontend env to enable the live map. You can still pick a zone with the buttons below.
            </Alert>
          )}

          <Typography variant="subtitle2" fontWeight={800}>
            Delivery areas
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={1} role="list" aria-label="Delivery area zones">
            {apiZones.map((z) => {
              const c = zoneCenter(z)
              const active = zone?.id === z.id
              return (
                <Button
                  key={z.id}
                  size="small"
                  variant={active ? 'contained' : 'outlined'}
                  onClick={() => applyPin(c.lat, c.lng)}
                  sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
                  aria-pressed={active}
                  aria-label={`${z.name}, courier from ${formatMoney(z.courierEstimateCents, 'NAD')}`}
                >
                  {z.name} · {formatMoney(z.courierEstimateCents, 'NAD')}
                </Button>
              )
            })}
          </Stack>

          {zone ? (
            <Stack direction="row" alignItems="center" flexWrap="wrap" gap={1}>
              <Chip
                label={`${zone.name} · ${formatMoney(zone.courierEstimateCents, 'NAD')}`}
                sx={{
                  fontWeight: 800,
                  bgcolor: `${zone.fillColor}22`,
                  border: `1px solid ${zone.fillColor}`,
                }}
                aria-live="polite"
              />
              <Typography variant="caption" color="text.secondary">
                {zone.description} · {zone.serviceDaysLabel}
              </Typography>
            </Stack>
          ) : (
            <Alert severity="warning" sx={{ borderRadius: 2 }}>
              Pin is outside demo zones — move the map pin or tap an area button to see the Yango courier estimate.
            </Alert>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}
