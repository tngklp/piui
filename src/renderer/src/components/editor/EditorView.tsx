import { useCallback, useEffect, useRef, useState, type WheelEvent } from 'react'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import {
  EditorView as CodeMirror,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection
} from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentLess,
  indentMore,
  indentWithTab
} from '@codemirror/commands'
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit
} from '@codemirror/language'
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap
} from '@codemirror/autocomplete'
import { gotoLine, highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { usePiUi } from '../../store'
import { DEFAULT_EDITOR_FONT, EDITOR_FONT_MAX, EDITOR_FONT_MIN } from '../../lib/ui-prefs'
import { fileIconUrl } from '../../lib/icon-packs'
import { fileUrl } from '../../lib/file-url'
import { Markdown } from '../Markdown'
import { baseName, extensionOf, languageFor, viewKind } from './languages'
import { indentGuides } from './indentGuides'
import { editorHighlight, editorTheme } from './theme'

/**
 * Contents and editor states live at module scope so unsaved edits and
 * per-file undo history survive switching to the Chat tab and back.
 */
const contents = new Map<string, string>()
const states = new Map<string, EditorState>()
const dirtyFiles = new Set<string>()
/** Scroll offset per file, for the same reason: the tab switch unmounts the view. */
const scrollTops = new Map<string, number>()
/** Markdown files remember whether they were shown rendered or as source. */
const previewByFile = new Map<string, boolean>()

const CONTENT_ATTRIBUTES = CodeMirror.contentAttributes.of({
  spellcheck: 'false',
  autocapitalize: 'off',
  autocorrect: 'off'
})

interface CursorInfo {
  line: number
  column: number
  selected: number
}

const EMPTY_CURSOR: CursorInfo = { line: 1, column: 1, selected: 0 }

/** Current document appearance. */
function appearance(): 'light' | 'dark' {
  return document.documentElement.dataset.appearance === 'light' ? 'light' : 'dark'
}

/** VS Code-style file tabs, breadcrumbs, editor, and status bar. */
export function EditorView() {
  const openFiles = usePiUi((state) => state.openFiles)
  const activeFile = usePiUi((state) => state.activeFile)
  const setActiveFile = usePiUi((state) => state.setActiveFile)
  const closeFile = usePiUi((state) => state.closeFile)
  const themeId = usePiUi((state) => state.themeId)

  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<CodeMirror | null>(null)
  const saveRef = useRef<() => void>(() => undefined)

  const themeCompartment = useRef(new Compartment()).current
  const layoutCompartment = useRef(new Compartment()).current
  const languageCompartment = useRef(new Compartment()).current

  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState<Record<string, boolean>>(() =>
    Object.fromEntries([...dirtyFiles].map((path) => [path, true]))
  )
  const [cursor, setCursor] = useState<CursorInfo>(EMPTY_CURSOR)
  /** Markdown only: show the rendered view rather than the source. */
  const [preview, setPreview] = useState(true)

  // What this file should be shown as, and whether the source editor is
  // mounted at all: images and PDFs have no text to edit.
  const kind = activeFile ? viewKind(activeFile) : 'text'
  const showSource = kind === 'text' || (kind === 'markdown' && !preview)

  const setPreviewFor = (next: boolean): void => {
    if (activeFile) previewByFile.set(activeFile, next)
    setPreview(next)
  }

  // Editor typography lives in the store so the settings dialog can drive it.
  const editorWrap = usePiUi((state) => state.prefs.editorWrap)
  const editorFontSize = usePiUi((state) => state.prefs.editorFontSize)
  const editorFontFamily = usePiUi((state) => state.prefs.editorFontFamily)
  const editorTabSize = usePiUi((state) => state.prefs.editorTabSize)
  const editorIndentGuides = usePiUi((state) => state.prefs.editorIndentGuides)
  const iconPack = usePiUi((state) => state.prefs.iconPack)
  const setPrefs = usePiUi((state) => state.setPrefs)

  const load = useCallback(async (path: string) => {
    const file = await window.piui.readFile(path)
    if (file.error) {
      setError(file.error)
      contents.set(path, '')
    } else {
      setError(null)
      contents.set(path, file.content)
    }
    setLoadedFor(path)
  }, [])

  // A buffer already in memory (including unsaved edits) is used as-is.
  useEffect(() => {
    if (!activeFile) return

    setPreview(previewByFile.get(activeFile) ?? true)

    // Images and PDFs are streamed through the file protocol, so reading them
    // as text would only produce garbage in the buffer.
    const fileKind = viewKind(activeFile)
    if (fileKind === 'image' || fileKind === 'pdf') {
      setError(null)
      setLoadedFor(activeFile)
      return
    }

    if (contents.has(activeFile)) {
      setLoadedFor(activeFile)
      return
    }
    void load(activeFile)
  }, [activeFile, load])

  const save = useCallback(async () => {
    const path = usePiUi.getState().activeFile
    if (!path) return
    const view = viewRef.current
    const cached = contents.get(path) ?? ''
    const text = view?.state.doc.toString() ?? cached

    // Format on save runs in the main process: Prettier is a runtime
    // dependency there, not something the renderer can import.
    let outgoing = text
    if (usePiUi.getState().prefs.editorFormatOnSave) {
      const result = await window.piui.formatFile(path, text)
      if (result.error) setError(`${path}: ${result.error}`)
      if (result.text !== null) outgoing = result.text

      // Put the formatted text back in the buffer, so what is on screen is
      // what was written. Guarded by a comparison because a no-op dispatch
      // would otherwise reset the selection.
      if (outgoing !== text && view) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: outgoing } })
      }
    }

    contents.set(path, outgoing)
    await window.piui.writeFile(path, outgoing)
    dirtyFiles.delete(path)
    setDirty((current) => ({ ...current, [path]: false }))
  }, [])

  saveRef.current = () => void save()

  /**
   * Auto save: wait for a pause in typing, then write. Re-armed on every
   * keystroke, so a long edit produces one write rather than one per character.
   */
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleAutoSave = (): void => {
    if (!usePiUi.getState().prefs.editorAutoSave) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      autoSaveTimer.current = null
      void saveRef.current()
    }, usePiUi.getState().prefs.editorAutoSaveDelayMs)
  }

  useEffect(
    () => () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    },
    []
  )

  const setWrapping = useCallback((next: boolean) => setPrefs({ editorWrap: next }), [setPrefs])

  const indentCommands = {
    'Mod-]': (view: CodeMirror): boolean =>
      indentMore({ state: view.state, dispatch: (tr) => view.dispatch(tr) }),
    'Mod-[': (view: CodeMirror): boolean =>
      indentLess({ state: view.state, dispatch: (tr) => view.dispatch(tr) })
  }

  const buildExtensions = useCallback(
    (path: string): Extension[] => {
      const language = languageFor(path)
      const indent = language.indent
      const settings = usePiUi.getState().prefs
      const tabSize = settings.editorTabSize > 0 ? settings.editorTabSize : indent
      const fontFamily = settings.editorFontFamily.trim() || DEFAULT_EDITOR_FONT

      return [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        rectangularSelection(),
        crosshairCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        highlightSelectionMatches(),
        search({ top: true }),
        CONTENT_ATTRIBUTES,
        themeCompartment.of([
          editorTheme(appearance(), settings.editorFontSize, fontFamily),
          editorHighlight(appearance())
        ]),
        languageCompartment.of(language.extension),
        layoutCompartment.of([
          settings.editorWrap ? CodeMirror.lineWrapping : [],
          indentUnit.of(' '.repeat(tabSize)),
          EditorState.tabSize.of(tabSize),
          settings.editorIndentGuides ? indentGuides(tabSize) : []
        ]),
        keymap.of([
          { key: 'Mod-s', preventDefault: true, run: () => (saveRef.current(), true) },
          { key: 'Mod-g', preventDefault: true, run: gotoLine },
          {
            key: 'Alt-z',
            preventDefault: true,
            run: () => {
              const store = usePiUi.getState()
              store.setPrefs({ editorWrap: !store.prefs.editorWrap })
              return true
            }
          },
          { key: 'Mod-]', run: indentCommands['Mod-]'] },
          { key: 'Mod-[', run: indentCommands['Mod-['] },
          ...closeBracketsKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          ...defaultKeymap,
          indentWithTab
        ]),
        CodeMirror.updateListener.of((update) => {
          const path = usePiUi.getState().activeFile
          if (path && update.docChanged) {
            contents.set(path, update.state.doc.toString())
            if (!dirtyFiles.has(path)) {
              dirtyFiles.add(path)
              setDirty((current) => ({ ...current, [path]: true }))
            }
            scheduleAutoSave()
          }
          if (update.docChanged || update.selectionSet) {
            const range = update.state.selection.main
            const line = update.state.doc.lineAt(range.head)
            const next: CursorInfo = {
              line: line.number,
              column: range.head - line.from + 1,
              selected: Math.abs(range.to - range.from)
            }
            setCursor((current) =>
              current.line === next.line &&
              current.column === next.column &&
              current.selected === next.selected
                ? current
                : next
            )
          }
        })
      ]
    },
    // The compartments are stable, and the commands only read refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [themeCompartment, languageCompartment, layoutCompartment]
  )

  // Build the editor, reusing the cached state so undo history survives.
  useEffect(() => {
    const host = hostRef.current
    if (!host || !activeFile || loadedFor !== activeFile) return

    let state = states.get(activeFile)
    if (!state) {
      state = EditorState.create({
        doc: contents.get(activeFile) ?? '',
        extensions: buildExtensions(activeFile)
      })
      states.set(activeFile, state)
    }

    const view = new CodeMirror({ state, parent: host })
    viewRef.current = view
    view.focus()

    // Put the view back where it was left, once CodeMirror has measured.
    const savedTop = scrollTops.get(activeFile)
    if (savedTop) {
      requestAnimationFrame(() => {
        if (viewRef.current === view) view.scrollDOM.scrollTop = savedTop
      })
    }

    return () => {
      states.set(activeFile, view.state)
      scrollTops.set(activeFile, view.scrollDOM.scrollTop)
      view.destroy()
      viewRef.current = null
    }
  }, [activeFile, loadedFor, showSource, buildExtensions])

  // Reconfigure the live editor when the theme or typography changes, rather
  // than rebuilding it and losing the cursor.
  useEffect(() => {
    const view = viewRef.current
    if (!view || !activeFile) return

    const indent = languageFor(activeFile).indent
    const tabSize = editorTabSize > 0 ? editorTabSize : indent
    const fontFamily = editorFontFamily.trim() || DEFAULT_EDITOR_FONT
    view.dispatch({
      effects: [
        themeCompartment.reconfigure([
          editorTheme(appearance(), editorFontSize, fontFamily),
          editorHighlight(appearance())
        ]),
        layoutCompartment.reconfigure([
          editorWrap ? CodeMirror.lineWrapping : [],
          indentUnit.of(' '.repeat(tabSize)),
          EditorState.tabSize.of(tabSize),
          editorIndentGuides ? indentGuides(tabSize) : []
        ])
      ]
    })
    states.set(activeFile, view.state)
  }, [
    themeId,
    editorWrap,
    editorFontSize,
    editorFontFamily,
    editorTabSize,
    editorIndentGuides,
    activeFile,
    themeCompartment,
    layoutCompartment
  ])

  /** Ctrl+scroll zooms the editor, matching VS Code. */
  const onWheel = (event: WheelEvent<HTMLDivElement>): void => {
    if (!event.ctrlKey) return
    event.preventDefault()
    const next = Math.min(
      EDITOR_FONT_MAX,
      Math.max(EDITOR_FONT_MIN, editorFontSize + (event.deltaY < 0 ? 1 : -1))
    )
    setPrefs({ editorFontSize: next })
  }

  const crumbs = (activeFile ?? '').split(/[\\/]/).filter(Boolean)
  const language = activeFile ? languageFor(activeFile) : null
  const kindLabel =
    kind === 'image'
      ? 'Image'
      : kind === 'pdf'
        ? 'PDF'
        : kind === 'markdown'
          ? 'Markdown'
          : (language?.label ?? 'Plain Text')

  return (
    <div className="editor">
      <div className="editor__tabs" role="tablist">
        {openFiles.map((path) => {
          const isDirty = dirty[path]
          return (
            <div className={`ftab${path === activeFile ? ' on' : ''}`} key={path}>
              <button
                className="ftab__name"
                role="tab"
                aria-selected={path === activeFile}
                title={path}
                onClick={() => setActiveFile(path)}
              >
                <img className="ftab__icon" src={fileIconUrl(iconPack, baseName(path))} alt="" />
                {baseName(path)}
                {isDirty ? <span className="ftab__modified" aria-hidden="true" /> : null}
              </button>
              <button
                className={`ftab__close${isDirty ? ' dirty' : ''}`}
                title="Close"
                aria-label={`Close ${baseName(path)}`}
                onClick={() => void closeFile(path)}
              >
                <span className="ftab__close-x">×</span>
              </button>
            </div>
          )
        })}

        <span className="sp" />

        <button
          className={`ibtn${editorWrap ? ' on' : ''}`}
          onClick={() => setWrapping(!editorWrap)}
          title="Toggle word wrap (Alt+Z)"
          aria-pressed={editorWrap}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <path d="M2 4h12M2 8h9a2.5 2.5 0 010 5H8M2 12h3" />
            <path d="M9.5 11l1.5 2-1.5 2" />
          </svg>
        </button>

        {kind === 'markdown' ? (
          <button
            className={`ibtn${preview ? ' on' : ''}`}
            onClick={() => setPreviewFor(!preview)}
            title={preview ? 'Show the markdown source' : 'Show the rendered markdown'}
            aria-pressed={preview}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path d="M1.5 8S4 4 8 4s6.5 4 6.5 4-2.5 4-6.5 4-6.5-4-6.5-4Z" />
              <circle cx="8" cy="8" r="1.8" />
            </svg>
          </button>
        ) : null}
      </div>

      {error ? <div className="banner bad">{error}</div> : null}

      {activeFile ? (
        <div className="crumbs" title={activeFile}>
          {crumbs.map((part, index) => (
            <span className="crumbs__part" key={`${part}-${index}`}>
              {index > 0 ? <span className="crumbs__sep">›</span> : null}
              <span className="crumbs__text">{part}</span>
            </span>
          ))}
        </div>
      ) : null}

      {kind === 'image' && activeFile ? (
        <div className="editor__media">
          <img src={fileUrl(activeFile)} alt={baseName(activeFile)} />
        </div>
      ) : kind === 'pdf' && activeFile ? (
        <div className="editor__media">
          <embed className="editor__pdf" type="application/pdf" src={fileUrl(activeFile)} />
        </div>
      ) : kind === 'markdown' && preview && activeFile ? (
        <div className="editor__preview">
          {/* The live buffer, so a rendered view reflects unsaved edits. */}
          <Markdown
            text={states.get(activeFile)?.doc.toString() ?? contents.get(activeFile) ?? ''}
          />
        </div>
      ) : (
        <div className="editor__host" ref={hostRef} onWheel={onWheel} />
      )}

      {!activeFile ? (
        <div className="editor__watermark">
          <p>Open a file from the Files panel to start editing.</p>
          <p className="hint">Ctrl+F searches inside the open file · Alt+Z toggles wrapping</p>
        </div>
      ) : null}

      <div className="editor__status">
        {activeFile ? (
          <>
            <span className="mono">{crumbs[crumbs.length - 1]}</span>
            <span className="sp" />
            {showSource ? (
              <>
                <span>
                  Ln {cursor.line}, Col {cursor.column}
                  {cursor.selected > 0 ? ` (${cursor.selected} selected)` : ''}
                </span>
                <span>Spaces: {language?.indent ?? 4}</span>
                <span>UTF-8</span>
                <span>LF</span>
              </>
            ) : null}
            <span>{kindLabel}</span>
            <span className="mono">{extensionOf(activeFile) || 'text'}</span>
          </>
        ) : null}
      </div>
    </div>
  )
}
