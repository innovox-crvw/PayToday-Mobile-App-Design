import type { ReactNode } from 'react'
import { Box } from '@mui/material'

export type PrepaidProviderLogoProps = {
  displayName: string
  id: string
  initials?: string | null
  /** Pixel size of the circular tile */
  size?: number
}

type BrandKey =
  | 'mtc'
  | 'tn'
  | 'rechargenow'
  | 'corporate'
  | 'tourist'
  | 'vodacom'
  | 'mtn'
  | 'cellc'
  | 'telkom'
  | 'generic'

function fallbackHue(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const hue = h % 360
  return `hsl(${hue}, 55%, 42%)`
}

function resolveBrand(displayName: string, id: string): BrandKey {
  const t = `${displayName} ${id}`.toLowerCase()
  if (/\bmtc\b/u.test(t) || t.includes('mtc prepaid')) return 'mtc'
  if (t.includes('tn mobile') || t.includes('tn prepaid') || (t.includes('tn') && t.includes('mobile'))) return 'tn'
  if (t.includes('rechargenow') || t.includes('recharge now')) return 'rechargenow'
  if (t.includes('corporate') && t.includes('airtime')) return 'corporate'
  if (t.includes('tourist') || t.includes('sim top')) return 'tourist'
  if (t.includes('vodacom')) return 'vodacom'
  if (/\bmtn\b/u.test(t)) return 'mtn'
  if (t.includes('cell c') || t.includes('cellc')) return 'cellc'
  if (t.includes('telkom')) return 'telkom'
  return 'generic'
}

function Mark({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden>
      {children}
    </svg>
  )
}

export function PrepaidProviderLogo(props: PrepaidProviderLogoProps) {
  const { displayName, id, initials, size = 52 } = props
  const key = resolveBrand(displayName, id)
  const letter = (initials?.trim().charAt(0) || displayName.trim().charAt(0) || '?').toUpperCase()

  let inner: ReactNode
  switch (key) {
    case 'mtc':
      inner = (
        <Mark>
          <circle cx="24" cy="24" r="24" fill="#FFCB05" />
          <text x="24" y="30" textAnchor="middle" fill="#111" fontSize="15" fontWeight="900" fontFamily="system-ui, sans-serif">
            MTC
          </text>
        </Mark>
      )
      break
    case 'tn':
      inner = (
        <Mark>
          <rect width="48" height="48" rx="24" fill="#005BBB" />
          <text x="24" y="31" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="900" fontFamily="system-ui, sans-serif">
            TN
          </text>
        </Mark>
      )
      break
    case 'rechargenow': {
      const gradId = `prepaid-rn-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`
      inner = (
        <Mark>
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0ea5e9" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
          </defs>
          <circle cx="24" cy="24" r="24" fill={`url(#${gradId})`} />
          <path
            d="M14 26c3-6 10-10 17-9 2 0 4 1 5 2M18 32c4-3 9-4 14-3"
            fill="none"
            stroke="#fff"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </Mark>
      )
      break
    }
    case 'corporate':
      inner = (
        <Mark>
          <rect width="48" height="48" rx="10" fill="#334155" />
          <rect x="12" y="14" width="24" height="18" rx="2" fill="#94a3b8" />
          <circle cx="18" cy="23" r="2" fill="#334155" />
          <circle cx="24" cy="23" r="2" fill="#334155" />
          <circle cx="30" cy="23" r="2" fill="#334155" />
        </Mark>
      )
      break
    case 'tourist':
      inner = (
        <Mark>
          <circle cx="24" cy="24" r="24" fill="#f59e0b" />
          <path d="M16 30 L24 14 L32 30 Z" fill="#fff" opacity="0.95" />
          <circle cx="24" cy="26" r="3" fill="#f59e0b" />
        </Mark>
      )
      break
    case 'vodacom':
      inner = (
        <Mark>
          <circle cx="24" cy="24" r="24" fill="#E60000" />
          <text x="24" y="31" textAnchor="middle" fill="#fff" fontSize="20" fontWeight="900" fontFamily="system-ui, sans-serif">
            V
          </text>
        </Mark>
      )
      break
    case 'mtn':
      inner = (
        <Mark>
          <circle cx="24" cy="24" r="24" fill="#FFCC00" />
          <text x="24" y="30" textAnchor="middle" fill="#000" fontSize="16" fontWeight="900" fontFamily="system-ui, sans-serif">
            MTN
          </text>
        </Mark>
      )
      break
    case 'cellc':
      inner = (
        <Mark>
          <circle cx="24" cy="24" r="24" fill="#000" />
          <text x="24" y="31" textAnchor="middle" fill="#78BE20" fontSize="22" fontWeight="900" fontFamily="system-ui, sans-serif">
            C
          </text>
        </Mark>
      )
      break
    case 'telkom':
      inner = (
        <Mark>
          <circle cx="24" cy="24" r="24" fill="#0088CC" />
          <text x="24" y="31" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="800" fontFamily="system-ui, sans-serif">
            Telkom
          </text>
        </Mark>
      )
      break
    default:
      inner = (
        <Mark>
          <circle cx="24" cy="24" r="24" fill={fallbackHue(displayName)} />
          <text x="24" y="31" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="900" fontFamily="system-ui, sans-serif">
            {letter}
          </text>
        </Mark>
      )
  }

  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
        boxShadow: '0 2px 10px rgba(15,23,42,0.12)',
        border: '1px solid rgba(15,23,42,0.12)',
        bgcolor: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{inner}</Box>
    </Box>
  )
}
