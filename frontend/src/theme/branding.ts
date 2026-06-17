/**
 * Shared visual constants — **same colors** as used across the app today.
 * Centralised so headers, wallet, and payments chrome stay aligned.
 */

/** Customer-facing product name (headers, titles, marketing copy). */
export const APP_DISPLAY_NAME = 'AvoToday'

/** Wordmark segments for the header logo (uppercase lockup). */
export const APP_LOGO_MARK_FIRST = 'AVO'
export const APP_LOGO_MARK_SECOND = 'TODAY'

/** Wallet hub row / checkout — customer-facing wallet product name. */
export const APP_WALLET_DISPLAY_NAME = 'PayToday Wallet'

export const HEADER_APP_GRADIENT = 'linear-gradient(165deg, #8E2DE2 0%, #5B21D6 50%, #4A00E0 100%)'

/** Nav labels on purple header chrome. */
export const HEADER_TEXT_MUTED = 'rgba(255,255,255,0.72)'
export const HEADER_TEXT_PRIMARY = '#ffffff'

/** Mobile / compact chrome (slightly warmer angle). */
export const HEADER_CHROME_GRADIENT = 'linear-gradient(135deg, #8E2DE2 0%, #5B21D6 45%, #4A00E0 100%)'

export const WALLET_BALANCE_GRADIENT = 'linear-gradient(135deg, #7C3AED 0%, #5B21D6 45%, #4C1D95 100%)'

export const SERVICES_CARD_GRADIENT = 'linear-gradient(145deg, #7C3AED 0%, #4F46E5 55%, #312E81 100%)'

/** Softer elevation to match storefront cards and bottom chrome. */
export const CHROME_SHADOW_SOFT = '0 12px 40px rgba(78, 0, 224, 0.16)'

export const CHROME_SHADOW_DEEP = '0 12px 48px rgba(91, 33, 214, 0.28)'

/** Minimal surface styles (bank-grade look). */
export const SURFACE_BORDER = 'rgba(15, 23, 42, 0.08)'
export const SURFACE_SHADOW = '0 10px 28px rgba(15, 23, 42, 0.06)'
export const SURFACE_SHADOW_HOVER = '0 14px 34px rgba(15, 23, 42, 0.09)'

/** Home promo strip — blue gradient (store hero banner). */
export const STORE_HERO_BANNER_GRADIENT = 'linear-gradient(125deg, #1D4ED8 0%, #2563EB 38%, #60A5FA 100%)'

/** Store homepage: centered content rail (bank-style dashboard width). */
export const STORE_HOME_RAIL_MAX_WIDTH = 1000

/** Vertical gap between major homepage sections (theme spacing units). */
export const STORE_HOME_SECTION_GAP = 3.25

/** Store home: neutral canvas behind elevated cards (mobile mock). */
export const STORE_HOME_PAGE_BACKGROUND = '#F0F2F5'

/** Store desktop web: full-page neutral (no white content rail behind pages). */
export const STORE_DESKTOP_CANVAS_GREY = '#f1f5f9'

/** Full-page purple wash under the home “sheet” (mobile mock). */
export const STORE_HOME_BASE_PURPLE = 'linear-gradient(180deg, #6D28D9 0%, #5B21D6 38%, #4C1D95 100%)'

/** Elevation for the main home content sheet sitting above the purple layer. */
export const STORE_HOME_SHEET_SHADOW = '0 -16px 48px rgba(15, 23, 42, 0.22)'

/** Large corner radius on home section cards / hero (px). */
export const STORE_HOME_SURFACE_RADIUS_PX = 24

/** Home mobile chrome: purple → blue (horizontal read, mock-aligned). */
export const STORE_HOME_HEADER_GRADIENT = 'linear-gradient(92deg, #7C3AED 0%, #5B21D6 40%, #2563EB 100%)'

/** Soft elevation on home white cards / hero shell. */
export const STORE_HOME_CARD_SHADOW = '0 10px 36px rgba(15, 23, 42, 0.07)'

/** Hero carousel bottom scrim — lighter than full cinema overlay. */
export const STORE_HOME_HERO_SCRIM =
  'linear-gradient(to top, rgba(15,23,42,0.78) 0%, rgba(15,23,42,0.28) 45%, rgba(15,23,42,0.06) 100%)'

/** Lighter scrim on hero slides when using the white elevated hero shell (mock). */
export const STORE_HOME_HERO_SLIDE_SCRIM =
  'linear-gradient(to top, rgba(15,23,42,0.5) 0%, rgba(15,23,42,0.16) 48%, rgba(15,23,42,0) 100%)'

/** Pagination: inactive dot (mock light gray). */
export const STORE_HOME_HERO_DOT_INACTIVE = '#E2E8F0'

/** Pagination: active dot blue (mock). */
export const STORE_HOME_HERO_DOT_ACTIVE = '#2563EB'

/** Light page backdrop behind centered cards (sign-in). */
export const SIGNIN_PAGE_BACKDROP = 'linear-gradient(165deg, #EEF2FF 0%, #F5F3FF 40%, #F8FAFC 100%)'
