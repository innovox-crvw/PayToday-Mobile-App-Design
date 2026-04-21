import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { Box, Button, IconButton, Paper, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import type { ProductDto, ProductImageDto } from '../../types/catalogue'
import { apiFetch } from '../../api/client'
import { readApiError } from '../../lib/apiOrigin'
import { resolveAdminMediaUrl } from '../../lib/resolveMediaUrl'

type RowState = { url: string; variantId: string }

function sortImages(images: ProductImageDto[]): ProductImageDto[] {
  return [...images].sort((a, b) => a.sortOrder - b.sortOrder || a.url.localeCompare(b.url))
}

export function AdminProductGalleryEditor(props: { product: ProductDto; onReload: () => void }) {
  const { product: p, onReload } = props
  const sorted = useMemo(() => sortImages(p.images ?? []), [p.images, p.id])
  const serverSig = useMemo(
    () => sorted.map((x) => `${x.id ?? ''}:${x.url}:${x.variantId ?? ''}:${x.sortOrder}`).join('|'),
    [sorted],
  )

  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)

  useEffect(() => {
    const next: Record<string, RowState> = {}
    for (const im of sorted) {
      if (im.id) next[im.id] = { url: im.url, variantId: im.variantId ?? '' }
    }
    setRows(next)
  }, [p.id, serverSig])

  function getRow(imageId: string, im: ProductImageDto): RowState {
    return rows[imageId] ?? { url: im.url, variantId: im.variantId ?? '' }
  }

  function setRow(imageId: string, patch: Partial<RowState>) {
    setRows((m) => {
      const cur = m[imageId] ?? { url: '', variantId: '' }
      return { ...m, [imageId]: { ...cur, ...patch } }
    })
  }

  async function saveRow(imageId: string) {
    setRowError(null)
    const st = rows[imageId]
    if (!st) return
    const url = st.url.trim()
    if (!url) {
      setRowError('Image URL cannot be empty.')
      return
    }
    setSavingId(imageId)
    try {
      const vid = st.variantId.trim()
      const res = await apiFetch(`/api/admin/products/${p.id}/images/${imageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          variantId: vid ? vid : null,
        }),
      })
      if (!res.ok) throw new Error(await readApiError(res))
      onReload()
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSavingId(null)
    }
  }

  async function deleteRow(imageId: string) {
    if (!window.confirm('Remove this image from the product gallery?')) return
    setRowError(null)
    setDeletingId(imageId)
    try {
      const res = await apiFetch(`/api/admin/products/${p.id}/images/${imageId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await readApiError(res))
      onReload()
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  async function moveRow(fromIndex: number, direction: -1 | 1) {
    const ids = sorted.map((im) => im.id).filter((x): x is string => Boolean(x))
    if (ids.length < 2) return
    const toIndex = fromIndex + direction
    if (toIndex < 0 || toIndex >= ids.length) return
    const next = [...ids]
    const t = next[fromIndex]!
    next[fromIndex] = next[toIndex]!
    next[toIndex] = t
    setMoving(true)
    setRowError(null)
    try {
      const res = await apiFetch(`/api/admin/products/${p.id}/images/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageIds: next }),
      })
      if (!res.ok) throw new Error(await readApiError(res))
      onReload()
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Reorder failed')
    } finally {
      setMoving(false)
    }
  }

  if (sorted.length === 0) return null

  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" fontWeight={700}>
        Gallery images (order = storefront carousel)
      </Typography>
      {rowError ? (
        <Typography variant="body2" color="error">
          {rowError}
        </Typography>
      ) : null}
      {sorted.map((im, index) => {
        const imageId = im.id
        const st = imageId ? getRow(imageId, im) : { url: im.url, variantId: im.variantId ?? '' }
        const canManage = Boolean(imageId)
        return (
          <Paper key={imageId ?? `${im.url}-${index}`} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'flex-start' }}>
              <Box
                component="img"
                src={resolveAdminMediaUrl(st.url)}
                alt=""
                sx={{
                  width: 72,
                  height: 72,
                  objectFit: 'cover',
                  borderRadius: 1,
                  flexShrink: 0,
                  border: 1,
                  borderColor: 'divider',
                  bgcolor: 'action.hover',
                }}
              />
              <Stack spacing={1} sx={{ flex: 1, minWidth: 0, width: 1 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'flex-start' }}>
                  <TextField
                    size="small"
                    fullWidth
                    label="Image URL"
                    value={st.url}
                    onChange={(e) => imageId && setRow(imageId, { url: e.target.value })}
                    disabled={!canManage}
                    placeholder="https://… or /api/uploads/…"
                  />
                  <TextField
                    size="small"
                    label="Variant ID (optional)"
                    value={st.variantId}
                    onChange={(e) => imageId && setRow(imageId, { variantId: e.target.value })}
                    disabled={!canManage}
                    sx={{ width: { xs: 1, sm: 260 }, flexShrink: 0 }}
                    placeholder="UUID"
                  />
                </Stack>
                <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
                    Position {index + 1} of {sorted.length}
                  </Typography>
                  {canManage && imageId ? (
                    <>
                      <Tooltip title="Show earlier in gallery">
                        <span>
                          <IconButton
                            size="small"
                            aria-label="Move image up"
                            disabled={index === 0 || moving}
                            onClick={() => void moveRow(index, -1)}
                          >
                            <ArrowUpwardIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Show later in gallery">
                        <span>
                          <IconButton
                            size="small"
                            aria-label="Move image down"
                            disabled={index >= sorted.length - 1 || moving}
                            onClick={() => void moveRow(index, 1)}
                          >
                            <ArrowDownwardIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={savingId === imageId}
                        onClick={() => void saveRow(imageId)}
                      >
                        Save changes
                      </Button>
                      <Tooltip title="Remove from gallery">
                        <IconButton
                          size="small"
                          color="error"
                          aria-label="Delete image"
                          disabled={deletingId === imageId}
                          onClick={() => void deleteRow(imageId)}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </>
                  ) : (
                    <Typography variant="caption" color="warning.main">
                      This row has no image id — reload the admin page after deploying the latest API.
                    </Typography>
                  )}
                </Stack>
              </Stack>
            </Stack>
          </Paper>
        )
      })}
    </Stack>
  )
}
