import { useCallback, useEffect, useRef, useState } from 'react'
import { basicSetup } from 'codemirror'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView as CodeMirror, keymap } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { usePiUi } from '../store'

/** Parser extensions for the file's language. */
function languageFor(path: string): Extension[] {
  const extension = path.split('.').pop()?.toLowerCase() ?? ''

  switch (extension) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return [
        javascript({
          typescript: extension.startsWith('ts'),
          jsx: extension === 'tsx' || extension === 'jsx'
        })
      ]
    case 'json':
      return [json()]
    case 'html':
    case 'htm':
      return [html()]
    case 'css':
      return [css()]
    case 'md':
    case 'markdown':
      return [markdown()]
    case 'py':
      return [python()]
    default:
      return []
  }
}

/** Chrome that follows the active theme tokens. */
function chrome(appearance: 'light' | 'dark'): Extension {
  return CodeMirror.theme(
    {
      '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--text)' },
      '.cm-scroller': {
        fontFamily: 'var(--mono)',
        fontSize: '12.5px',
        lineHeight: '1.6'
      },
      '.cm-content': { padding: '10px 0', caretColor: 'var(--lilac-strong)' },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        color: 'var(--dim)',
        border: 'none',
        borderRight: '1px solid var(--line)'
      },
      '.cm-activeLine': { backgroundColor: 'var(--raise)' },
      '.cm-activeLineGutter': { backgroundColor: 'var(--raise)', color: 'var(--text)' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--lilac-strong)' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
        backgroundColor: 'var(--lilac-soft)'
      },
      '.cm-selectionMatch': { backgroundColor: 'var(--lilac-soft)' },
      '.cm-panels': { backgroundColor: 'var(--panel)', color: 'var(--text)' },
      '.cm-tooltip': {
        backgroundColor: 'var(--panel)',
        border: '1px solid var(--line)',
        color: 'var(--text)'
      }
    },
    { dark: appearance === 'dark' }
  )
}

/** Syntax colours tuned for each appearance. */
function highlight(appearance: 'light' | 'dark'): Extension {
  const dark = appearance === 'dark'
  return syntaxHighlighting(
    HighlightStyle.define([
      { tag: t.comment, color: dark ? '#6f6f7a' : '#8a8a95', fontStyle: 'italic' },
      { tag: t.keyword, color: dark ? '#c9b2f5' : '#7c55cc' },
      { tag: [t.string, t.special(t.string)], color: dark ? '#6fd6a2' : '#1f8a5b' },
      { tag: [t.number, t.bool, t.null], color: dark ? '#e2c08d' : '#b7791f' },
      { tag: [t.typeName, t.className, t.namespace], color: dark ? '#8fd3ff' : '#0b6fa4' },
      {
        tag: [t.function(t.variableName), t.function(t.propertyName)],
        color: dark ? '#b7a6ff' : '#5b3fa8'
      },
      { tag: [t.propertyName, t.attributeName], color: dark ? '#9fd0ff' : '#2f6f9f' },
      { tag: [t.variableName, t.name], color: dark ? '#e9e9ec' : '#26203a' },
      { tag: t.operator, color: dark ? '#c9b2f5' : '#7c55cc' },
      { tag: t.invalid, color: dark ? '#f08aa3' : '#c23a5a' }
    ])
  )
}

/** File tabs plus a CodeMirror editor for the selected file. */
export function EditorView() {
  const openFiles = usePiUi((state) => state.openFiles)
  const activeFile = usePiUi((state) => state.activeFile)
  const setActiveFile = usePiUi((state) => state.setActiveFile)
  const closeFile = usePiUi((state) => state.closeFile)
  const themeId = usePiUi((state) => state.themeId)

  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<CodeMirror | null>(null)
  const contentsRef = useRef<Record<string, string>>({})
  const saveRef = useRef<() => void>(() => undefined)

  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (path: string) => {
    const file = await window.piui.readFile(path)
    if (file.error) {
      setError(file.error)
      contentsRef.current[path] = ''
    } else {
      setError(null)
      contentsRef.current[path] = file.content
    }
    setLoadedFor(path)
  }, [])

  useEffect(() => {
    if (!activeFile || contentsRef.current[activeFile] !== undefined) return
    void load(activeFile)
  }, [activeFile, load])

  const save = useCallback(async () => {
    const path = usePiUi.getState().activeFile
    if (!path) return
    const text = viewRef.current?.state.doc.toString() ?? contentsRef.current[path] ?? ''
    contentsRef.current[path] = text
    await window.piui.writeFile(path, text)
    setDirty((current) => ({ ...current, [path]: false }))
  }, [])

  saveRef.current = () => void save()

  // Rebuild the editor when the file or theme changes.
  useEffect(() => {
    const host = hostRef.current
    if (!host || !activeFile || loadedFor !== activeFile) return

    const appearance = document.documentElement.dataset.appearance === 'light' ? 'light' : 'dark'

    const state = EditorState.create({
      doc: contentsRef.current[activeFile] ?? '',
      extensions: [
        basicSetup,
        keymap.of([
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => {
              saveRef.current()
              return true
            }
          }
        ]),
        ...languageFor(activeFile),
        chrome(appearance),
        highlight(appearance),
        CodeMirror.updateListener.of((update) => {
          if (!update.docChanged) return
          contentsRef.current[activeFile] = update.state.doc.toString()
          setDirty((current) =>
            current[activeFile] ? current : { ...current, [activeFile]: true }
          )
        })
      ]
    })

    const view = new CodeMirror({ state, parent: host })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [activeFile, themeId, loadedFor])

  const nameOf = (path: string): string => path.split(/[\\/]/).pop() ?? path

  return (
    <div className="editor">
      <div className="editor__tabs">
        {openFiles.map((path) => (
          <div className={`ftab${path === activeFile ? ' on' : ''}`} key={path}>
            <button className="ftab__name" title={path} onClick={() => setActiveFile(path)}>
              {dirty[path] ? <span className="ftab__dot" /> : null}
              {nameOf(path)}
            </button>
            <button
              className="ftab__close"
              title="Close"
              aria-label={`Close ${nameOf(path)}`}
              onClick={() => void closeFile(path)}
            >
              ×
            </button>
          </div>
        ))}

        <span className="sp" />

        <button
          className="b"
          onClick={() => void save()}
          disabled={!activeFile || !dirty[activeFile]}
        >
          Save
        </button>
      </div>

      {error ? <div className="banner bad">{error}</div> : null}

      <div className="editor__host" ref={hostRef} />

      {!activeFile ? (
        <p className="empty" style={{ padding: 20 }}>
          Open a file from the Files tab to edit it.
        </p>
      ) : null}
    </div>
  )
}
