import type { Theme } from '@mui/material/styles'

/** Fallback nav height before measurement (px). */
export const STORE_COMPACT_FALLBACK_BOTTOM_NAV_HEIGHT_PX = 128

export const STORE_COMPACT_BOTTOM_NAV_MEASUREMENT_FUDGE_PX = 28
export const STORE_COMPACT_BOTTOM_NAV_BAR_HEIGHT_CAP_PX = 200

/** Pre-measure bar (matches first `applyDocInsets` input before the nav is measured). */
export const STORE_COMPACT_SCROLL_BOTTOM_INITIAL_BAR_PX = Math.min(
  STORE_COMPACT_FALLBACK_BOTTOM_NAV_HEIGHT_PX + STORE_COMPACT_BOTTOM_NAV_MEASUREMENT_FUDGE_PX,
  STORE_COMPACT_BOTTOM_NAV_BAR_HEIGHT_CAP_PX,
)

/** CSS `var(--pt-store-scroll-bottom-inset, …)` when JS has not run yet — equals `ceil(initialBar)`. */
export const STORE_COMPACT_SCROLL_BOTTOM_INSET_FALLBACK_PX = Math.ceil(STORE_COMPACT_SCROLL_BOTTOM_INITIAL_BAR_PX)

/**
 * Tight document scroll inset from the measured/fudged bar (px), with a small floor so pre-measure isn’t tiny.
 */
export function storeCompactScrollBottomInsetPx(bar: number): number {
  return Math.ceil(Math.max(bar, 56))
}

/** MUI `theme.spacing` multiplier added after the inset on the store outlet container (small visual gap only). */
export const STORE_COMPACT_OUTLET_BOTTOM_TAIL_SPACING = 1

/** Bottom padding for the shared store `Container` (compact shell, non-onboarding). */
export function storeCompactOutletContainerPb(theme: Theme): string {
  const tail = theme.spacing(STORE_COMPACT_OUTLET_BOTTOM_TAIL_SPACING)
  return `calc(env(safe-area-inset-bottom, 0px) + var(--pt-store-scroll-bottom-inset, ${STORE_COMPACT_SCROLL_BOTTOM_INSET_FALLBACK_PX}px) + ${tail})`
}
