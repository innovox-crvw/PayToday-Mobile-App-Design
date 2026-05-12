import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Card,
  CardActionArea,
  CardContent,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import { buildCheckoutWindowFromSlot, nextLocalDates, type YangoDemoSlot, type YangoDemoZone } from '../../lib/yangoDeliveryDemo'
import type { YangoDemoSchedulePayload } from './checkoutScheduleTypes'

function shortDateLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1)
  return dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

function slotLiquorHeuristicDim(slot: YangoDemoSlot): boolean {
  const end = slot.endHour + (slot.endMinute ?? 0) / 60
  return end >= 18
}

type Props = {
  zone: YangoDemoZone | null
  onScheduleChange: (payload: YangoDemoSchedulePayload | null) => void
  /** When true, evening slots are visually de-emphasised (demo hint for liquor-aware scheduling). */
  cartContainsAlcohol?: boolean
  /** Server says cart has alcohol outside current selling window — emphasise choosing a slot. */
  outsideLiquorSellingWindow?: boolean
}

export function DeliveryTimeSlotGrid({
  zone,
  onScheduleChange,
  cartContainsAlcohol,
  outsideLiquorSellingWindow,
}: Props) {
  const scheduleCbRef = useRef(onScheduleChange)
  useEffect(() => {
    scheduleCbRef.current = onScheduleChange
  }, [onScheduleChange])

  const dates = useMemo(() => nextLocalDates(7), [])
  const [dateYmd, setDateYmd] = useState(dates[0] ?? '')
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

  const handlePickSlot = useCallback((id: string) => {
    setSlotId(id)
  }, [])

  if (!zone) {
    return (
      <Alert severity="info" sx={{ borderRadius: 3 }}>
        Choose a delivery area on the map (previous step) to see available time slots.
      </Alert>
    )
  }

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="subtitle1" fontWeight={900} component="h2">
            Delivery time
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Slots follow the selected area&apos;s schedule{zone.serviceDaysLabel ? ` (${zone.serviceDaysLabel})` : ''}.
          </Typography>
          {outsideLiquorSellingWindow ? (
            <Alert severity="warning" sx={{ borderRadius: 2 }}>
              You&apos;re outside liquor selling hours — select a slot inside the green permitted window for your area so the
              order can be fulfilled legally.
            </Alert>
          ) : null}
          {cartContainsAlcohol ? (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              Your cart may include alcohol — prefer earlier slots; legal liquor windows apply at fulfilment.
            </Alert>
          ) : null}

          <Typography variant="subtitle2" fontWeight={800}>
            Day
          </Typography>
          <ToggleButtonGroup
            exclusive
            value={dateYmd}
            onChange={(_, v) => {
              if (v != null) setDateYmd(v)
            }}
            aria-label="Delivery date"
            sx={{ flexWrap: 'wrap', gap: 0.5, '& .MuiToggleButton-root': { borderRadius: 2, fontWeight: 700 } }}
          >
            {dates.map((d) => (
              <ToggleButton key={d} value={d} size="small">
                {shortDateLabel(d)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <Typography variant="subtitle2" fontWeight={800}>
            Available slots
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
              gap: 1.5,
            }}
            role="radiogroup"
            aria-label="Delivery time slots"
          >
            {zone.slots.map((s) => {
              const selected = slotId === s.id
              const dim = cartContainsAlcohol && slotLiquorHeuristicDim(s)
              const card = (
                <Card
                  variant="outlined"
                  sx={{
                    borderRadius: 2,
                    borderWidth: 2,
                    borderColor: selected ? 'primary.main' : 'divider',
                    opacity: dim ? 0.55 : 1,
                    transition: 'border-color 0.15s, opacity 0.15s',
                  }}
                >
                  <CardActionArea
                    onClick={() => handlePickSlot(s.id)}
                    aria-pressed={selected}
                    aria-label={`${s.label}${dim ? ', may be outside typical liquor window' : ''}`}
                  >
                    <CardContent sx={{ py: 1.5 }}>
                      <Typography variant="body2" fontWeight={800}>
                        {s.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {zone.name}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              )
              return dim ? (
                <Tooltip key={s.id} title="Later slot — verify liquor delivery rules with the store." arrow>
                  <span>{card}</span>
                </Tooltip>
              ) : (
                <span key={s.id}>{card}</span>
              )
            })}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  )
}
