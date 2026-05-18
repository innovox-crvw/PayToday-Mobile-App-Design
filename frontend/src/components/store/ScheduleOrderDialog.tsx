import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from '@mui/material'
import { buildStoreSchedulePresets, type CheckoutSchedulePreset, type StoreHoursStatus } from '../../lib/storeHours'

type Props = {
  open: boolean
  onClose: () => void
  status: StoreHoursStatus
  busy?: boolean
  onConfirm: (preset: CheckoutSchedulePreset) => void
}

export function ScheduleOrderDialog(props: Props) {
  const { open, onClose, status, busy, onConfirm } = props
  const presets = buildStoreSchedulePresets(status.items)

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 800 }}>Schedule your order</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.45 }}>
          The store is closed right now. Pick a window during opening hours — we&apos;ll ask you to confirm at checkout.
        </Typography>
        {status.hoursSummary ? (
          <Typography variant="caption" display="block" sx={{ mb: 1.5, fontWeight: 600 }}>
            Opening hours: {status.hoursSummary}
          </Typography>
        ) : null}
        {presets.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No upcoming slots found. Check back during store hours or update hours in admin.
          </Typography>
        ) : (
          <List dense disablePadding>
            {presets.map((p) => (
              <ListItemButton key={`${p.startLocal}|${p.endLocal}`} disabled={busy} onClick={() => onConfirm(p)}>
                <ListItemText primary={p.label} secondary="Tap to add to cart and continue" />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  )
}
