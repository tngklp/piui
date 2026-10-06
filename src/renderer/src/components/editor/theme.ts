/**
 * CodeMirror presentation for the editor pane.
 *
 * Chrome (backgrounds, gutters, selection) follows the active PiUI theme so the
 * editor matches the rest of the app, while the token colours come from the VS
 * Code Dark+ / Light+ palettes that most people recognise.
 */
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { tags as t } from '@lezer/highlight'

/** VS Code Dark+ token colours. */
const DARK_TOKENS = {
  comment: '#6A9955',
  keyword: '#569CD6',
  control: '#C586C0',
  string: '#CE9178',
  number: '#B5CEA8',
  type: '#4EC9B0',
  function: '#DCDCAA',
  variable: '#9CDCFE',
  constant: '#4FC1FF',
  operator: '#D4D4D4',
  tag: '#569CD6',
  attribute: '#9CDCFE',
  invalid: '#F44747',
  punctuation: '#D4D4D4',
  regexp: '#D16969'
}

/** VS Code Light+ token colours. */
const LIGHT_TOKENS = {
  comment: '#008000',
  keyword: '#0000FF',
  control: '#AF00DB',
  string: '#A31515',
  number: '#098658',
  type: '#267F99',
  function: '#795E26',
  variable: '#001080',
  constant: '#0070C1',
  operator: '#000000',
  tag: '#800000',
  attribute: '#E50000',
  invalid: '#CD3131',
  punctuation: '#000000',
  regexp: '#811F3F'
}

/**
 * Selection wash. Mixed from the accent rather than reusing `--lilac-soft`,
 * which is only ~15% opaque and all but invisible over the editor background.
 */
const SELECTION = 'color-mix(in srgb, var(--lilac) 38%, transparent)'

/** Active-line tint, kept translucent so it cannot cover the selection layer. */
const ACTIVE_LINE = 'color-mix(in srgb, var(--raise) 55%, transparent)'

/** Editor chrome: everything that should track the app theme. */
export function editorTheme(
  appearance: 'light' | 'dark',
  fontSize: number,
  fontFamily: string
): Extension {
  const dark = appearance === 'dark'

  return [
    EditorView.theme(
      {
        '&': {
          height: '100%',
          // The editor is a document surface, not a widget: it shares the app's
          // background so the pane reads as part of the window.
          backgroundColor: 'var(--bg)',
          color: 'var(--text)',
          fontSize: `${fontSize}px`
        },
        '.cm-scroller': {
          fontFamily,
          lineHeight: '1.55'
        },
        '.cm-content': {
          caretColor: 'var(--lilac-strong)',
          padding: '8px 0 8px 8px'
        },
        // No left padding here: indentation guides are painted from the line's
        // own left edge, which has to be where the text begins.
        '.cm-line': { padding: '0 12px 0 0' },
        '.cm-cursor, .cm-dropCursor': {
          borderLeft: '2px solid var(--lilac-strong)'
        },
        // CodeMirror's base theme sets the drawn selection with a selector of
        // `&dark.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground`,
        // which is more specific than a plain `.cm-selectionBackground`. A theme
        // that only targets the short selector therefore loses, and the
        // selection is painted in the base theme's near-black `#222` — invisible
        // on any of our backgrounds. Match the full path, and give the same
        // colour to the native selection used when the editor is unfocused.
        '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
          backgroundColor: SELECTION
        },
        '.cm-selectionLayer .cm-selectionBackground': {
          backgroundColor: SELECTION
        },
        '.cm-content ::selection': {
          backgroundColor: SELECTION
        },
        '.cm-selectionMatch': {
          backgroundColor: SELECTION,
          outline: '1px solid var(--lilac-strong)'
        },
        '.cm-gutters': {
          backgroundColor: 'var(--bg)',
          color: 'var(--dim)',
          border: 'none',
          borderRight: '1px solid var(--line)',
          fontSize: `${Math.max(9, fontSize - 1)}px`
        },
        '.cm-gutterElement': { padding: '0 8px 0 12px' },
        '.cm-lineNumbers .cm-gutterElement': { minWidth: '34px' },
        '.cm-activeLineGutter': {
          backgroundColor: 'transparent',
          color: 'var(--text)'
        },
        // Translucent: the selection layer is drawn behind the line content, so
        // an opaque active-line background would hide the selection on it.
        '.cm-activeLine': { backgroundColor: ACTIVE_LINE },
        '.cm-foldGutter .cm-gutterElement': { padding: '0 4px', cursor: 'pointer' },
        '.cm-foldPlaceholder': {
          backgroundColor: 'var(--raise)',
          border: '1px solid var(--line)',
          color: 'var(--dim)',
          padding: '0 6px',
          borderRadius: '4px'
        },
        '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
          backgroundColor: SELECTION,
          outline: '1px solid var(--lilac-strong)'
        },
        '.cm-nonmatchingBracket': { color: 'var(--del)' },
        '.cm-tooltip': {
          backgroundColor: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: '8px',
          color: 'var(--text)',
          boxShadow: '0 10px 26px rgba(0, 0, 0, 0.3)'
        },
        '.cm-tooltip-autocomplete ul li[aria-selected]': {
          backgroundColor: 'var(--lilac-soft)',
          color: 'var(--text)'
        },
        '.cm-tooltip-autocomplete ul li': { padding: '3px 8px' },
        '.cm-completionIcon': { opacity: 0.75 },
        '.cm-completionMatchedText': {
          color: 'var(--lilac-strong)',
          textDecoration: 'none',
          fontWeight: '600'
        },
        '.cm-panels': {
          backgroundColor: 'var(--panel)',
          color: 'var(--text)',
          borderTop: '1px solid var(--line)'
        },
        '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--line)' },
        '.cm-panel.cm-search': { padding: '6px 10px', fontSize: '12.5px' },
        '.cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label': {
          fontFamily: 'inherit',
          fontSize: '12.5px'
        },
        '.cm-panel.cm-search input[type=text]': {
          backgroundColor: 'var(--bg)',
          color: 'var(--text)',
          border: '1px solid var(--line)',
          borderRadius: '7px',
          padding: '4px 8px',
          outline: 'none'
        },
        '.cm-panel.cm-search button': {
          backgroundColor: 'var(--raise)',
          color: 'var(--text)',
          border: '1px solid var(--line)',
          borderRadius: '7px',
          padding: '3px 9px',
          cursor: 'pointer'
        },
        '.cm-panel.cm-search button:hover': { borderColor: 'var(--lilac-strong)' },
        '.cm-searchMatch': {
          backgroundColor: SELECTION,
          outline: '1px solid var(--lilac-strong)'
        },
        '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--lilac)' }
      },
      { dark }
    )
  ]
}

/** Token colours for the editor. */
export function editorHighlight(appearance: 'light' | 'dark'): Extension {
  const c = appearance === 'dark' ? DARK_TOKENS : LIGHT_TOKENS

  return syntaxHighlighting(
    HighlightStyle.define([
      { tag: t.comment, color: c.comment, fontStyle: 'italic' },
      { tag: [t.keyword, t.moduleKeyword, t.definitionKeyword], color: c.keyword },
      { tag: [t.controlKeyword, t.operatorKeyword], color: c.control },
      { tag: [t.string, t.special(t.string), t.character], color: c.string },
      { tag: [t.number, t.bool, t.null, t.atom], color: c.number },
      { tag: [t.typeName, t.className, t.namespace, t.self], color: c.type },
      { tag: [t.function(t.variableName), t.function(t.propertyName)], color: c.function },
      { tag: [t.definition(t.variableName), t.definition(t.propertyName)], color: c.variable },
      { tag: [t.propertyName, t.attributeName], color: c.variable },
      { tag: [t.variableName, t.local(t.variableName)], color: c.variable },
      { tag: [t.constant(t.variableName), t.standard(t.variableName)], color: c.constant },
      { tag: t.operator, color: c.operator },
      { tag: [t.punctuation, t.bracket, t.separator], color: c.punctuation },
      { tag: [t.tagName, t.typeName], color: c.tag },
      { tag: [t.attributeValue, t.string], color: c.string },
      { tag: t.regexp, color: c.regexp },
      { tag: [t.heading, t.strong], fontWeight: '600' },
      { tag: t.emphasis, fontStyle: 'italic' },
      { tag: t.link, color: c.constant, textDecoration: 'underline' },
      { tag: t.invalid, color: c.invalid }
    ])
  )
}
