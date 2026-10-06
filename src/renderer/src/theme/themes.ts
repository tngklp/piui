/**
 * PiUI theme system.
 *
 * A theme is a named palette. Adding one is a single entry in `THEMES` — the
 * stylesheet only reads CSS custom properties, so no CSS changes are needed.
 */

/** Every colour a theme must define. */
export interface ThemeTokens {
  /** Window background. */
  bg: string
  /** Raised surfaces: sidebar, cards, composer. */
  panel: string
  /** Hover and inset surfaces. */
  raise: string
  /** Borders and dividers. */
  line: string
  /** Primary text. */
  text: string
  /** Secondary text. */
  dim: string
  /** Accent fill for buttons and bubbles. */
  accent: string
  /** Accent for text, icons, and active indicators. */
  accentStrong: string
  /** Tinted accent background. */
  accentSoft: string
  /** Text drawn on `accent`. */
  onAccent: string
  /** Integrated terminal background. */
  term: string
  add: string
  addBg: string
  del: string
  delBg: string
  mod: string
}

export interface Theme {
  id: string
  /** Shown in the settings picker. */
  name: string
  /** Drives `color-scheme` and scrollbar rendering. */
  appearance: 'light' | 'dark'
  tokens: ThemeTokens
}

/** Token -> CSS custom property used by the stylesheet. */
const CSS_VARIABLES: Record<keyof ThemeTokens, string> = {
  bg: '--bg',
  panel: '--panel',
  raise: '--raise',
  line: '--line',
  text: '--text',
  dim: '--dim',
  accent: '--lilac',
  accentStrong: '--lilac-strong',
  accentSoft: '--lilac-soft',
  onAccent: '--on-lilac',
  term: '--term',
  add: '--add',
  addBg: '--add-bg',
  del: '--del',
  delBg: '--del-bg',
  mod: '--mod'
}

export const THEMES: Theme[] = [
  {
    id: 'lilac-light',
    name: 'Lilac (light)',
    appearance: 'light',
    tokens: {
      bg: '#F6F3FB',
      panel: '#FFFFFF',
      raise: '#EEE9F8',
      line: '#E0D9EF',
      text: '#26203A',
      dim: '#6F6788',
      accent: '#C3A9F3',
      accentStrong: '#7C55CC',
      accentSoft: '#E9DFFB',
      onAccent: '#2B1A52',
      term: '#120F1A',
      add: '#1F8A5B',
      addBg: '#E1F4EA',
      del: '#C23A5A',
      delBg: '#FBE4EA',
      mod: '#B7791F'
    }
  },
  {
    id: 'lilac-dark',
    name: 'Lilac (dark)',
    appearance: 'dark',
    tokens: {
      bg: '#131315',
      panel: '#19191c',
      raise: '#242428',
      line: '#2d2d32',
      text: '#e9e9ec',
      dim: '#9b9ba4',
      accent: '#BEA4F0',
      accentStrong: '#C9B2F5',
      accentSoft: 'rgba(190,164,240,.15)',
      onAccent: '#24153F',
      term: '#0e0e10',
      add: '#6FD6A2',
      addBg: '#16281f',
      del: '#F08AA3',
      delBg: '#34202a',
      mod: '#E2C08D'
    }
  },
  {
    id: 'graphite-light',
    name: 'Graphite (light)',
    appearance: 'light',
    tokens: {
      bg: '#F6F6F7',
      panel: '#FFFFFF',
      raise: '#EDEDEF',
      line: '#E0E0E3',
      text: '#232327',
      dim: '#6B6B74',
      accent: '#9AA0AE',
      accentStrong: '#4C5361',
      accentSoft: '#E8EAEF',
      onAccent: '#FFFFFF',
      term: '#101114',
      add: '#1C7D54',
      addBg: '#E2F2E9',
      del: '#BB3757',
      delBg: '#FAE5EA',
      mod: '#A9721B'
    }
  },
  {
    id: 'graphite-dark',
    name: 'Graphite (dark)',
    appearance: 'dark',
    tokens: {
      bg: '#141416',
      panel: '#1A1A1D',
      raise: '#252529',
      line: '#2E2E33',
      text: '#E9E9EC',
      dim: '#9A9AA3',
      accent: '#A9B1C0',
      accentStrong: '#C3CBDA',
      accentSoft: 'rgba(169,177,192,.15)',
      onAccent: '#1B1F27',
      term: '#0E0F11',
      add: '#6ED3A0',
      addBg: '#16281F',
      del: '#EF8AA2',
      delBg: '#34202A',
      mod: '#E0C089'
    }
  }
]

/** Follow the OS light/dark preference. */
export const AUTO_THEME_ID = 'auto'
/** Theme used when `auto` resolves to light. */
export const SYSTEM_LIGHT_THEME_ID = 'lilac-light'
/** Theme used when `auto` resolves to dark. */
export const SYSTEM_DARK_THEME_ID = 'lilac-dark'
export const DEFAULT_THEME_ID = AUTO_THEME_ID

const FALLBACK_THEME = THEMES[0] as Theme

export function findTheme(id: string): Theme {
  return THEMES.find((theme) => theme.id === id) ?? FALLBACK_THEME
}

/** Turn a stored preference (which may be `auto`) into a concrete theme. */
export function resolveTheme(themeId: string, prefersDark: boolean): Theme {
  if (themeId === AUTO_THEME_ID) {
    return findTheme(prefersDark ? SYSTEM_DARK_THEME_ID : SYSTEM_LIGHT_THEME_ID)
  }
  return findTheme(themeId)
}

/** Write the theme's tokens onto the document root. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  root.dataset.theme = theme.id
  root.dataset.appearance = theme.appearance
  root.style.colorScheme = theme.appearance

  for (const [token, variable] of Object.entries(CSS_VARIABLES)) {
    root.style.setProperty(variable, theme.tokens[token as keyof ThemeTokens])
  }
}
