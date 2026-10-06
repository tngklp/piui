/**
 * Language detection for the editor: which CodeMirror grammar to load, the
 * label shown in the status bar, and the indentation the file should use.
 */
import type { Extension } from '@codemirror/state'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'

export interface LanguageInfo {
  /** Human-readable name, as VS Code shows it in the status bar. */
  label: string
  /** Spaces per indent level. */
  indent: number
  extension: Extension[]
}

/** Extension of a path, lowercased and without the dot. */
export function extensionOf(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? ''
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase()
}

/** File name without its directory. */
export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/** Resolve the language for a path. Unknown extensions fall back to plain text. */
export function languageFor(path: string): LanguageInfo {
  const extension = extensionOf(path)

  switch (extension) {
    case 'ts':
    case 'mts':
    case 'cts':
      return { label: 'TypeScript', indent: 2, extension: [javascript({ typescript: true })] }
    case 'tsx':
      return {
        label: 'TypeScript JSX',
        indent: 2,
        extension: [javascript({ typescript: true, jsx: true })]
      }
    case 'js':
    case 'mjs':
    case 'cjs':
      return { label: 'JavaScript', indent: 2, extension: [javascript()] }
    case 'jsx':
      return { label: 'JavaScript JSX', indent: 2, extension: [javascript({ jsx: true })] }
    case 'json':
      return { label: 'JSON', indent: 2, extension: [json()] }
    case 'html':
    case 'htm':
      return { label: 'HTML', indent: 2, extension: [html()] }
    case 'css':
      return { label: 'CSS', indent: 2, extension: [css()] }
    case 'md':
    case 'markdown':
      return { label: 'Markdown', indent: 2, extension: [markdown()] }
    case 'py':
    case 'pyw':
      return { label: 'Python', indent: 4, extension: [python()] }
    default:
      return { label: 'Plain Text', indent: 4, extension: [] }
  }
}
