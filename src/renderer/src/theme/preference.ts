import { AUTO_THEME_ID, DEFAULT_THEME_ID, applyTheme, resolveTheme } from './themes'

const STORAGE_KEY = 'piui.theme'

/** Stored theme preference: a theme id, or `auto`. */
export function loadThemeId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID
  } catch {
    return DEFAULT_THEME_ID
  }
}

export function saveThemeId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Storage may be unavailable; the theme still applies for this session.
  }
}

export function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Re-resolve and apply the theme, e.g. after the OS preference changes. */
export function applyStoredTheme(themeId: string): void {
  applyTheme(resolveTheme(themeId, systemPrefersDark()))
}

/** Notify when the OS light/dark preference changes. Returns an unsubscribe. */
export function watchSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export { AUTO_THEME_ID }
