import type { ReactNode } from 'react'
import { Box, Stack } from '@mui/material'
import type { StackProps } from '@mui/material/Stack'
import type { SxProps, Theme } from '@mui/material/styles'
import { SHOP_V2 } from '../../theme/storeV2'

export type ProfilePageShellProps = {
  children: ReactNode
  /** Inner column spacing (passed to `Stack`). */
  spacing?: StackProps['spacing']
  /** Max width of the inner column (px). */
  maxWidth?: number
  /**
   * Merged into the inner `Stack` `sx` (after defaults). Use to override `maxWidth`, e.g. hub:
   * `{ maxWidth: { xs: 'none', sm: 680, md: 720 } }`.
   */
  innerSx?: SxProps<Theme>
}

/**
 * Store-aligned page canvas for profile routes (matches Shop shell inside `StoreLayout` `Container`).
 */
export function ProfilePageShell({
  children,
  spacing = { xs: 2, md: 2.5 },
  maxWidth = 600,
  innerSx,
}: ProfilePageShellProps) {
  return (
    <Box
      sx={{
        bgcolor: SHOP_V2.pageBackground,
        mx: { xs: -2, sm: -3 },
        px: { xs: 2, sm: 3 },
        py: { xs: 0.5, sm: 1 },
        borderRadius: { md: SHOP_V2.radius },
      }}
    >
      <Stack spacing={spacing} sx={{ maxWidth, mx: 'auto', width: 1, minWidth: 0, pb: { xs: 2, md: 3 }, ...innerSx }}>
        {children}
      </Stack>
    </Box>
  )
}
