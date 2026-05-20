import {
  Alert,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import type { LiquorTimePreset } from '../../lib/checkoutLiquorTimePresets'
import { alcoholOutsideHoursMessage, availableTimeTitle } from '../../lib/checkoutScheduleCopy'

type Props = {
  mode: 'pickup' | 'delivery'
  presets: LiquorTimePreset[]
  selectedPresetId: string
  onSelectPreset: (preset: LiquorTimePreset) => void
  homeWinStart: string
  homeWinEnd: string
  homeWinLabel: string
  onHomeWinStartChange: (v: string) => void
  onHomeWinEndChange: (v: string) => void
  onHomeWinLabelChange: (v: string) => void
  /** Show alcohol / outside-hours warning with full guidance text. */
  showAlcoholOutsideHoursMessage?: boolean
  /** Store closed (non-liquor) — shorter info when no alcohol message. */
  storeClosedMessage?: string | null
  fieldRadiusSx?: Record<string, unknown>
  zoneHint?: string | null
  /** Dropdown label when a delivery zone is selected. */
  presetSelectLabel?: string
}

export function AvailableTimeWindowPicker(props: Props) {
  const {
    mode,
    presets,
    selectedPresetId,
    onSelectPreset,
    homeWinStart,
    homeWinEnd,
    homeWinLabel,
    onHomeWinStartChange,
    onHomeWinEndChange,
    onHomeWinLabelChange,
    showAlcoholOutsideHoursMessage,
    storeClosedMessage,
    fieldRadiusSx = {},
    zoneHint,
    presetSelectLabel,
  } = props

  const startLabel = mode === 'pickup' ? 'Pickup window start' : 'Delivery window start'
  const endLabel = mode === 'pickup' ? 'Pickup window end' : 'Delivery window end'
  const noteLabel = mode === 'pickup' ? 'Note for the store (optional)' : 'Delivery note (optional)'
  const selectLabel = presetSelectLabel ?? (mode === 'pickup' ? 'Suggested times' : 'Suggested times')
  const selectId = mode === 'pickup' ? 'pickup-time-preset' : 'delivery-time-preset'

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle1" fontWeight={900} component="h2">
        {availableTimeTitle(mode)}
      </Typography>

      {showAlcoholOutsideHoursMessage ? (
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          {alcoholOutsideHoursMessage(mode)}
        </Alert>
      ) : storeClosedMessage ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          {storeClosedMessage}
        </Alert>
      ) : null}

      {zoneHint ? (
        <Typography variant="body2" color="text.secondary">
          {zoneHint}
        </Typography>
      ) : null}

      {presets.length === 0 ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          No quick-pick windows match permitted alcohol sale hours right now. Enter a window using the fields below, or
          check store liquor hours in admin.
        </Alert>
      ) : (
        <FormControl fullWidth size="small" sx={fieldRadiusSx}>
          <InputLabel id={selectId}>{selectLabel}</InputLabel>
          <Select
            labelId={selectId}
            label={selectLabel}
            value={selectedPresetId}
            onChange={(e) => {
              const p = presets.find((x) => x.id === String(e.target.value))
              if (p) onSelectPreset(p)
            }}
          >
            <MenuItem value="">
              <em>Choose a suggested window…</em>
            </MenuItem>
            {presets.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      <Typography variant="caption" color="text.secondary">
        Or set the start and end yourself (your device&apos;s local time). The server checks that the window falls within
        permitted hours for the store.
      </Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField
          label={startLabel}
          type="datetime-local"
          value={homeWinStart}
          onChange={(e) => onHomeWinStartChange(e.target.value)}
          fullWidth
          required
          error={!homeWinStart.trim()}
          helperText={!homeWinStart.trim() ? 'Required when ordering outside store hours.' : ' '}
          InputLabelProps={{ shrink: true }}
          sx={fieldRadiusSx}
        />
        <TextField
          label={endLabel}
          type="datetime-local"
          value={homeWinEnd}
          onChange={(e) => onHomeWinEndChange(e.target.value)}
          fullWidth
          required
          error={!homeWinEnd.trim()}
          helperText={!homeWinEnd.trim() ? 'Required when ordering outside store hours.' : ' '}
          InputLabelProps={{ shrink: true }}
          sx={fieldRadiusSx}
        />
      </Stack>

      <TextField
        label={noteLabel}
        value={homeWinLabel}
        onChange={(e) => onHomeWinLabelChange(e.target.value)}
        fullWidth
        placeholder={mode === 'pickup' ? 'e.g. After work' : 'e.g. After 5pm'}
        sx={fieldRadiusSx}
      />
    </Stack>
  )
}
