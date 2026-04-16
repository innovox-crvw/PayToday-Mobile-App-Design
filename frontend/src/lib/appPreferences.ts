/** Browser UI preferences (no server). */

export const PT_UI_LANGUAGE = 'pt-ui-language'
export const PT_REDUCED_MOTION = 'pt-reduced-motion'

export function readUiLanguage(): string {
  try {
    return localStorage.getItem(PT_UI_LANGUAGE) ?? ''
  } catch {
    return ''
  }
}

export function writeUiLanguage(code: string): void {
  try {
    const trimmed = code.trim()
    if (!trimmed || trimmed === 'en') {
      localStorage.removeItem(PT_UI_LANGUAGE)
      document.documentElement.lang = 'en'
      return
    }
    localStorage.setItem(PT_UI_LANGUAGE, trimmed)
    document.documentElement.lang = trimmed
  } catch {
    /* private mode */
  }
}

export function readReducedMotion(): boolean {
  try {
    return localStorage.getItem(PT_REDUCED_MOTION) === '1'
  } catch {
    return false
  }
}

export function writeReducedMotion(on: boolean): void {
  try {
    if (on) {
      localStorage.setItem(PT_REDUCED_MOTION, '1')
      document.documentElement.classList.add('pt-reduced-motion')
    } else {
      localStorage.removeItem(PT_REDUCED_MOTION)
      document.documentElement.classList.remove('pt-reduced-motion')
    }
  } catch {
    /* private mode */
  }
}

/** Call once at app boot (e.g. main.tsx). */
export function applyStoredAppPreferences(): void {
  const lang = readUiLanguage()
  if (lang) {
    try {
      document.documentElement.lang = lang
    } catch {
      /* ignore */
    }
  }
  if (readReducedMotion()) {
    try {
      document.documentElement.classList.add('pt-reduced-motion')
    } catch {
      /* ignore */
    }
  }
}
