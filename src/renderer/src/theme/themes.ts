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

const LILAC_DARK: ThemeTokens = {
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

const LILAC_LIGHT: ThemeTokens = {
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

const GRAPHITE_DARK: ThemeTokens = {
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

const GRAPHITE_LIGHT: ThemeTokens = {
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

const OCEAN_DARK: ThemeTokens = {
  bg: '#0D1420',
  panel: '#121B2A',
  raise: '#1B2738',
  line: '#24344A',
  text: '#E4ECF7',
  dim: '#93A4BD',
  accent: '#4F9CF0',
  accentStrong: '#7DB6F7',
  accentSoft: 'rgba(79,156,240,.16)',
  onAccent: '#06172B',
  term: '#080E18',
  add: '#5FD0A0',
  addBg: '#102A22',
  del: '#F0829B',
  delBg: '#2F1A24',
  mod: '#E3C07E'
}

const OCEAN_LIGHT: ThemeTokens = {
  bg: '#EFF4FB',
  panel: '#FFFFFF',
  raise: '#E1EBF8',
  line: '#D2E0F1',
  text: '#14243B',
  dim: '#5C7089',
  accent: '#3F86D8',
  accentStrong: '#1F63B5',
  accentSoft: '#DFEAF9',
  onAccent: '#FFFFFF',
  term: '#0B1420',
  add: '#1C7F57',
  addBg: '#E0F2E9',
  del: '#B93A58',
  delBg: '#FAE4EA',
  mod: '#A9721B'
}

const EMBER_DARK: ThemeTokens = {
  bg: '#16110D',
  panel: '#1D1611',
  raise: '#2A2019',
  line: '#3A2C22',
  text: '#F2E9E1',
  dim: '#A89A8C',
  accent: '#F08A3C',
  accentStrong: '#FFA257',
  accentSoft: 'rgba(240,138,60,.16)',
  onAccent: '#2A1508',
  term: '#100C09',
  add: '#7ED09A',
  addBg: '#16281F',
  del: '#F0788F',
  delBg: '#33191F',
  mod: '#E8C07A'
}

const EMBER_LIGHT: ThemeTokens = {
  bg: '#FDF6F0',
  panel: '#FFFFFF',
  raise: '#F8ECE1',
  line: '#ECDCCD',
  text: '#33231A',
  dim: '#7D6754',
  accent: '#E07A2C',
  accentStrong: '#B85C14',
  accentSoft: '#FBE6D3',
  onAccent: '#FFFFFF',
  term: '#140F0B',
  add: '#1F8A5B',
  addBg: '#E1F4EA',
  del: '#C23A5A',
  delBg: '#FBE4EA',
  mod: '#B7791F'
}

const ROSE_DARK: ThemeTokens = {
  bg: '#160F14',
  panel: '#1E151B',
  raise: '#2A1E26',
  line: '#3A2A34',
  text: '#F2E7EE',
  dim: '#AB95A4',
  accent: '#F072A8',
  accentStrong: '#FF92BD',
  accentSoft: 'rgba(240,114,168,.16)',
  onAccent: '#2C0D1C',
  term: '#100A0E',
  add: '#6FD6A2',
  addBg: '#16281F',
  del: '#F0788F',
  delBg: '#33191F',
  mod: '#E2C08D'
}

const ROSE_LIGHT: ThemeTokens = {
  bg: '#FDF2F6',
  panel: '#FFFFFF',
  raise: '#F8E6EE',
  line: '#EED3E0',
  text: '#331C28',
  dim: '#7D5F6D',
  accent: '#DD5C93',
  accentStrong: '#B13A72',
  accentSoft: '#FADFEA',
  onAccent: '#FFFFFF',
  term: '#140D11',
  add: '#1F8A5B',
  addBg: '#E1F4EA',
  del: '#C23A5A',
  delBg: '#FBE4EA',
  mod: '#B7791F'
}

/** Palettes, in the order they appear in Settings. */
export const THEMES: Theme[] = [
  { id: 'lilac-dark', name: 'Lilac (dark)', appearance: 'dark', tokens: LILAC_DARK },
  { id: 'lilac-light', name: 'Lilac (light)', appearance: 'light', tokens: LILAC_LIGHT },
  { id: 'graphite-dark', name: 'Graphite (dark)', appearance: 'dark', tokens: GRAPHITE_DARK },
  { id: 'graphite-light', name: 'Graphite (light)', appearance: 'light', tokens: GRAPHITE_LIGHT },
  { id: 'ocean-dark', name: 'Ocean (dark)', appearance: 'dark', tokens: OCEAN_DARK },
  { id: 'ocean-light', name: 'Ocean (light)', appearance: 'light', tokens: OCEAN_LIGHT },
  { id: 'ember-dark', name: 'Ember (dark)', appearance: 'dark', tokens: EMBER_DARK },
  { id: 'ember-light', name: 'Ember (light)', appearance: 'light', tokens: EMBER_LIGHT },
  { id: 'rose-dark', name: 'Rose (dark)', appearance: 'dark', tokens: ROSE_DARK },
  { id: 'rose-light', name: 'Rose (light)', appearance: 'light', tokens: ROSE_LIGHT }
]

/** Palette used on first run. */
export const DEFAULT_THEME_ID = 'lilac-dark'

const FALLBACK_THEME = THEMES[0] as Theme

export function findTheme(id: string): Theme {
  return THEMES.find((theme) => theme.id === id) ?? FALLBACK_THEME
}

/** Resolve a stored preference to a concrete theme. */
export function resolveTheme(themeId: string): Theme {
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
