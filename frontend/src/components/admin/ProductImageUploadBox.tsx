import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined'
import { Box, Button, LinearProgress, Stack, Typography } from '@mui/material'
import { useId, useRef, useState } from 'react'
import { apiFetch } from '../../api/client'
import { resolveAdminMediaUrl } from '../../lib/resolveMediaUrl'

type Props = {
  /** Current image URL (https, or `/api/uploads/...`). */
  value: string
  onChange: (url: string) => void
  disabled?: boolean
  /** Hint under the drop zone. */
  helperText?: string
  /**
   * When set, after a successful file upload the component POSTs the returned URL to
   * `POST /api/admin/products/:id/images` so `dbo.product_images` is updated immediately.
   */
  persistToProductId?: string
  /** Optional variant UUID for `variant_id` on that insert (same as manual “Add image”). */
  persistVariantId?: string
  /** Called after a row was inserted (e.g. parent `load()`). */
  onPersisted?: () => void
}

export function ProductImageUploadBox(props: Props) {
  const { value, onChange, disabled, helperText, persistToProductId, persistVariantId, onPersisted } = props
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [persisting, setPersisting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const busy = uploading || persisting

  async function uploadFile(file: File) {
    setLocalError(null)
    if (!file.type.startsWith('image/')) {
      setLocalError('Please choose an image file (PNG, JPEG, GIF, or WebP).')
      return
    }
    const max = 4 * 1024 * 1024
    if (file.size > max) {
      setLocalError('Image must be 4 MB or smaller.')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await apiFetch('/api/admin/products/upload-image', { method: 'POST', body: fd })
      if (!res.ok) {
        const t = await res.text()
        let msg = t.slice(0, 240)
        try {
          const j = JSON.parse(t) as { error?: string }
          if (typeof j.error === 'string' && j.error.trim()) msg = j.error.trim()
        } catch {
          /* use raw */
        }
        throw new Error(msg)
      }
      const data = (await res.json()) as { url?: string }
      if (!data.url?.trim()) throw new Error('Server did not return an image URL.')
      const url = data.url.trim()
      onChange(url)

      if (persistToProductId) {
        setPersisting(true)
        try {
          const vid = (persistVariantId ?? '').trim()
          const body: Record<string, unknown> = { url, sortOrder: 0 }
          if (vid) body.variantId = vid
          const ins = await apiFetch(`/api/admin/products/${persistToProductId}/images`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          if (!ins.ok) {
            const t = await ins.text()
            let msg = t.slice(0, 240)
            try {
              const j = JSON.parse(t) as { error?: string }
              if (typeof j.error === 'string' && j.error.trim()) msg = j.error.trim()
            } catch {
              /* use raw */
            }
            throw new Error(msg || 'Could not save image URL to the database.')
          }
          onChange('')
          onPersisted?.()
        } catch (e) {
          setLocalError(
            e instanceof Error
              ? `${e.message} The file is on the server; fix the issue or paste the URL and use “Add image to product”.`
              : 'Could not save image to the database.',
          )
        } finally {
          setPersisting(false)
        }
      }
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Stack spacing={1}>
      <Box
        role="button"
        tabIndex={0}
        aria-disabled={disabled || busy}
        onKeyDown={(e) => {
          if (disabled || busy) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault()
          if (!disabled && !busy) setDragOver(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled && !busy) setDragOver(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (disabled || busy) return
          const f = e.dataTransfer.files?.[0]
          if (f) void uploadFile(f)
        }}
        sx={{
          border: 2,
          borderStyle: 'dashed',
          borderColor: dragOver ? 'primary.main' : 'divider',
          borderRadius: 2,
          p: 2,
          textAlign: 'center',
          cursor: disabled || busy ? 'not-allowed' : 'pointer',
          bgcolor: dragOver ? 'action.selected' : 'action.hover',
          opacity: disabled ? 0.55 : 1,
          transition: 'border-color 0.15s ease, background-color 0.15s ease',
        }}
        onClick={() => {
          if (!disabled && !busy) inputRef.current?.click()
        }}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          hidden
          disabled={disabled || busy}
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void uploadFile(f)
          }}
        />
        <CloudUploadOutlinedIcon color="action" sx={{ fontSize: 36, mb: 0.5 }} />
        <Typography variant="body2" fontWeight={700}>
          Drop an image here, or click to browse
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
          PNG, JPEG, GIF, or WebP · max 4 MB
        </Typography>
        <Button
          type="button"
          size="small"
          variant="outlined"
          sx={{ mt: 1.5, pointerEvents: 'none' }}
          tabIndex={-1}
          startIcon={<CloudUploadOutlinedIcon />}
        >
          Choose file
        </Button>
      </Box>
      {busy ? <LinearProgress /> : null}
      {localError ? (
        <Typography variant="caption" color="error">
          {localError}
        </Typography>
      ) : null}
      {helperText ? (
        <Typography variant="caption" color="text.secondary">
          {helperText}
        </Typography>
      ) : null}
      {value.trim() ? (
        <Box
          component="img"
          src={resolveAdminMediaUrl(value)}
          alt="Preview"
          sx={{ maxWidth: 200, maxHeight: 120, objectFit: 'contain', borderRadius: 1, alignSelf: 'flex-start', border: 1, borderColor: 'divider' }}
        />
      ) : null}
    </Stack>
  )
}
