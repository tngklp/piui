/**
 * Persisted interface preferences.
 *
 * These are all renderer-side and read synchronously on startup, so they use
 * `localStorage` rather than going through the main process.
 */

export interface UiPreferences {
  /** Editor font size in pixels. */
  editorFontSize: number
  /** Wrap long lines in the editor. */
  editorWrap: boolean
  /** Expand reasoning blocks in the transcript by default. */
  expandThinking: boolean
  /** Shell used by the Terminal panel; empty means "pick a sensible default". */
  terminalShell: string
}

const STORAGE_KEY = 'piui.prefs'

export const EDITOR_FONT_MIN = 10
export const EDITOR_FONT_MAX = 24

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  editorFontSize: 13,
  editorWrap: false,
  expandThinking: false,
  terminalShell: ''
}

function clampFontSize(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_UI_PREFERENCES.editorFontSize
  return Math.min(EDITOR_FONT_MAX, Math.max(EDITOR_FONT_MIN, Math.round(parsed)))
}

/** Coerce anything stored into a complete, valid preference set. */
function normalize(value: unknown): UiPreferences {
  const raw = value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    editorFontSize: clampFontSize(raw.editorFontSize),
    editorWrap: typeof raw.editorWrap === 'boolean' ? raw.editorWrap : false,
    expandThinking: typeof raw.expandThinking === 'boolean' ? raw.expandThinking : false,
    terminalShell: typeof raw.terminalShell === 'string' ? raw.terminalShell : ''
  }
}

export function loadUiPreferences(): UiPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === null ? { ...DEFAULT_UI_PREFERENCES } : normalize(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_UI_PREFERENCES }
  }
}

export function saveUiPreferences(preferences: UiPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // Storage may be unavailable; the preferences still apply for this session.
  }
}

export { clampFontSize }
