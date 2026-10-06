/**
 * Persisted interface preferences.
 *
 * These are all renderer-side and read synchronously on startup, so they use
 * `localStorage` rather than going through the main process.
 */
import { DEFAULT_ICON_PACK, findIconPack } from './icon-packs'

export interface UiPreferences {
  /** Editor font size in pixels. */
  editorFontSize: number
  /** Wrap long lines in the editor. */
  editorWrap: boolean
  /** Expand reasoning blocks in the transcript by default. */
  expandThinking: boolean
  /** Show what a tool ran with, instead of keeping it collapsed. */
  expandToolOutput: boolean
  /** Enter sends the prompt; Ctrl+Enter (or Shift+Enter) is a newline. */
  sendOnEnter: boolean
  /** Icon pack id used by the file explorer and editor tabs. */
  iconPack: string
  /** Shell the integrated terminal runs; empty picks a sensible default. */
  terminalShell: string
  /** Lines of scrollback the terminal keeps. */
  terminalScrollback: number
}

const STORAGE_KEY = 'piui.prefs'

export const EDITOR_FONT_MIN = 10
export const EDITOR_FONT_MAX = 24

export const SCROLLBACK_MIN = 100
export const SCROLLBACK_MAX = 100000

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  editorFontSize: 13,
  editorWrap: false,
  expandThinking: false,
  expandToolOutput: false,
  sendOnEnter: true,
  iconPack: DEFAULT_ICON_PACK,
  terminalShell: '',
  terminalScrollback: 2000
}

function clampFontSize(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_UI_PREFERENCES.editorFontSize
  return Math.min(EDITOR_FONT_MAX, Math.max(EDITOR_FONT_MIN, Math.round(parsed)))
}

/** Keep the scrollback inside what xterm can hold comfortably. */
export function clampScrollback(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_UI_PREFERENCES.terminalScrollback
  return Math.min(SCROLLBACK_MAX, Math.max(SCROLLBACK_MIN, Math.round(parsed)))
}

/** Coerce anything stored into a complete, valid preference set. */
function normalize(value: unknown): UiPreferences {
  const raw = value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    editorFontSize: clampFontSize(raw.editorFontSize),
    editorWrap: typeof raw.editorWrap === 'boolean' ? raw.editorWrap : false,
    expandThinking: typeof raw.expandThinking === 'boolean' ? raw.expandThinking : false,
    expandToolOutput:
      typeof raw.expandToolOutput === 'boolean'
        ? raw.expandToolOutput
        : DEFAULT_UI_PREFERENCES.expandToolOutput,
    sendOnEnter: typeof raw.sendOnEnter === 'boolean' ? raw.sendOnEnter : true,
    iconPack: findIconPack(typeof raw.iconPack === 'string' ? raw.iconPack : '').id,
    terminalShell: typeof raw.terminalShell === 'string' ? raw.terminalShell : '',
    terminalScrollback: clampScrollback(raw.terminalScrollback)
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
