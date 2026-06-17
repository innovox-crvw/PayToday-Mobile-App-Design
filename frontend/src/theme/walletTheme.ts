import type { SxProps, Theme } from '@mui/material/styles'
import {
  CHROME_SHADOW_DEEP,
  STORE_DESKTOP_CANVAS_GREY,
  SURFACE_BORDER,
  SURFACE_SHADOW,
  WALLET_BALANCE_GRADIENT,
} from './branding'

export { WALLET_BALANCE_GRADIENT }

export const WALLET_PAGE_BACKGROUND = STORE_DESKTOP_CANVAS_GREY
export const WALLET_RAIL_MAX_WIDTH = 720
export const WALLET_SECTION_GAP = 2

/** Stacked quick-action rows (mock-aligned blue-grey). */
export const WALLET_QUICK_ACTION_BG = '#6B7F9E'

export const WALLET_REWARDS_SIDEBAR_BG = '#6B7F9E'

/** Subtle grid on balance hero card. */
export const WALLET_HERO_GRID_OVERLAY =
  'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)'

export const walletCardSx: SxProps<Theme> = {
  borderRadius: 2.5,
  border: 1,
  borderColor: SURFACE_BORDER,
  boxShadow: SURFACE_SHADOW,
  bgcolor: 'background.paper',
  overflow: 'hidden',
}

export const walletHeroSx: SxProps<Theme> = {
  borderRadius: 3,
  background: WALLET_BALANCE_GRADIENT,
  color: '#fff',
  boxShadow: CHROME_SHADOW_DEEP,
  position: 'relative',
  overflow: 'hidden',
  '&::before': {
    content: '""',
    position: 'absolute',
    inset: 0,
    backgroundImage: WALLET_HERO_GRID_OVERLAY,
    backgroundSize: '28px 28px',
    opacity: 0.35,
    pointerEvents: 'none',
  },
  '&::after': {
    content: '""',
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(120% 80% at 100% 0%, rgba(255,255,255,0.12) 0%, transparent 55%)',
    pointerEvents: 'none',
  },
}
