import { DEFAULT_THEME_ID, applyTheme, resolveTheme } from './themes'

const STORAGE_KEY = 'piui.theme'

/** Stored theme id, falling back to the default palette. */
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

/** Resolve and apply a stored preference. */
export function applyStoredTheme(themeId: string): void {
  applyTheme(resolveTheme(themeId))
}
