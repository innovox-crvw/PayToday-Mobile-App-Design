import type { ReactNode } from 'react'
import { Box, Button, Card, CardContent, IconButton, Stack, Typography } from '@mui/material'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import CloseIcon from '@mui/icons-material/Close'
import { SHOP_V2 } from '../../theme/storeV2'
import { SURFACE_SHADOW } from '../../theme/branding'

type Props = {
  title: string
  value: string
  icon: ReactNode
  editing?: boolean
  onEdit?: () => void
  onCancel?: () => void
  editContent?: ReactNode
  onSave?: () => void
  saving?: boolean
  saveLabel?: string
  editLabel?: string
}

export function AccountInfoCard({
  title,
  value,
  icon,
  editing = false,
  onEdit,
  onCancel,
  editContent,
  onSave,
  saving = false,
  saveLabel = 'Save',
  editLabel = 'Edit',
}: Props) {
  const hasEditAction = Boolean(onEdit)
  const inlineEdit = Boolean(editContent)

  return (
    <Card
      elevation={0}
      sx={{
        height: 1,
        borderRadius: 2.5,
        border: 1,
        borderColor: editing ? SHOP_V2.accent : 'divider',
        boxShadow: SURFACE_SHADOW,
        bgcolor: 'background.paper',
      }}
    >
      <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
          <Typography variant="subtitle2" fontWeight={800} sx={{ lineHeight: 1.35 }}>
            {title}
          </Typography>
          {hasEditAction ? (
            <IconButton
              size="small"
              aria-label={editing && inlineEdit ? 'Cancel editing' : editLabel}
              onClick={editing && inlineEdit ? onCancel : onEdit}
              sx={{
                mt: -0.5,
                mr: -0.5,
                color: SHOP_V2.accent,
                border: 1.5,
                borderColor: SHOP_V2.accent,
                borderRadius: 1.5,
                width: 32,
                height: 32,
                '&:hover': { bgcolor: 'rgba(93, 45, 145, 0.08)' },
              }}
            >
              {editing && inlineEdit ? <CloseIcon sx={{ fontSize: 16 }} /> : <EditOutlinedIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          ) : (
            <Box
              sx={{
                mt: -0.25,
                color: SHOP_V2.accent,
                opacity: 0.85,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
              }}
            >
              {icon}
            </Box>
          )}
        </Stack>

        {editing && inlineEdit && editContent ? (
          <Stack spacing={1.5} sx={{ mt: 1.5 }}>
            {editContent}
            {onSave ? (
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ pt: 0.5 }}>
                <Button
                  variant="contained"
                  color="secondary"
                  size="small"
                  disabled={saving}
                  onClick={onSave}
                  sx={{ fontWeight: 700 }}
                >
                  {saving ? 'Saving…' : saveLabel}
                </Button>
                {onCancel ? (
                  <Button variant="text" size="small" disabled={saving} onClick={onCancel} sx={{ fontWeight: 600 }}>
                    Cancel
                  </Button>
                ) : null}
              </Stack>
            ) : null}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25, lineHeight: 1.5, wordBreak: 'break-word' }}>
            {value}
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}
