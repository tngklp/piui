import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode
} from 'react'
import type { FsEntryDto, FsListingDto, FsResultDto } from '@shared/ipc'
import { fileIconUrl, folderIconUrl } from '../../lib/icon-packs'
import { usePiUi } from '../../store'

const REFRESH_MS = 3000

/**
 * Files the explorer has cut or copied, waiting for a paste. Kept at module scope
 * so collapsing the right panel does not throw it away.
 *
 * This is PiUI's own clipboard rather than the system one: Electron cannot put
 * file paths on the OS clipboard in the format Explorer and Finder paste from, so
 * a copy that appeared to work and then pasted nothing would be worse than one
 * that is plainly scoped to this window.
 */
let clipboard: { mode: 'copy' | 'cut'; paths: string[] } | null = null

/** The inline input row: renaming an entry, or naming a new one. */
type Editing =
  | { mode: 'rename'; path: string; value: string }
  | { mode: 'create'; parent: string; kind: 'file' | 'directory'; value: string }

/** Where the context menu opened, and what it opened on. */
interface MenuState {
  x: number
  y: number
  entry: FsEntryDto | null
}

/** One row of the context menu; `null` is a separator. */
type MenuItem = { label: string; run: () => void; disabled?: boolean } | null

/** The directory a path lives in. */
function parentOf(path: string): string {
  return path.slice(0, Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))) || path
}

/** Join a directory and a name, keeping the separator the path already uses. */
function joinPath(directory: string, name: string): string {
  const separator = directory.includes('\\') ? '\\' : '/'
  return `${directory.replace(/[\\/]+$/, '')}${separator}${name}`
}

/**
 * File explorer for the active workspace. Uses the icon pack chosen in
 * Settings and polls the directories it has opened so the tree tracks changes
 * on disk.
 */
export function FilesPanel() {
  const workspace = usePiUi((state) => state.workspace)
  const selectedFile = usePiUi((state) => state.selectedFile)
  const openFile = usePiUi((state) => state.openFile)
  const selectFile = usePiUi((state) => state.selectFile)
  const iconPack = usePiUi((state) => state.prefs.iconPack)

  const [listings, setListings] = useState<Record<string, FsListingDto>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  /** Result of the last file operation, shown until the next one. */
  const [notice, setNotice] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  /**
   * Mirror of the module-scope clipboard, so the tree re-renders when it changes.
   * The module variable is what survives unmounting; this is what renders.
   */
  const [clipboardState, setClipboardState] = useState(clipboard)

  const root = workspace?.cwd ?? ''
  const loadedPaths = useRef<Set<string>>(new Set())

  const load = useCallback(async (path: string) => {
    loadedPaths.current.add(path)
    try {
      const listing = await window.piui.listDirectory(path)
      setListings((current) => ({ ...current, [path]: listing }))
      setError(listing.error)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  /** Reload every directory that is open in the tree. */
  const refreshAll = useCallback(async () => {
    for (const path of [...loadedPaths.current]) await load(path)
  }, [load])

  // Reset when the workspace changes.
  useEffect(() => {
    loadedPaths.current = new Set()
    setListings({})
    setExpanded(new Set())
    setEditing(null)
    setNotice(null)
    if (root.length > 0) void load(root)
  }, [root, load])

  // The menu closes on anything that would leave it pointing at nothing.
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  // Poll every opened directory so new and deleted files appear.
  useEffect(() => {
    const timer = window.setInterval(() => {
      for (const path of loadedPaths.current) void load(path)
    }, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [load])

  const activate = (entry: FsEntryDto): void => {
    if (entry.kind === 'file') {
      openFile(entry.path)
      return
    }
    toggleDirectory(entry)
  }

  const toggleDirectory = (entry: FsEntryDto): void => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(entry.path)) {
        next.delete(entry.path)
      } else {
        next.add(entry.path)
        if (!listings[entry.path]) void load(entry.path)
      }
      return next
    })
  }

  /**
   * Close any editor tab for a path that just moved or went away. Leaving the tab
   * open would let a later save quietly recreate the file at the old path.
   */
  const closeTabsUnder = (path: string): void => {
    const store = usePiUi.getState()
    for (const open of [...store.openFiles]) {
      if (open === path || open.startsWith(`${path}\\`) || open.startsWith(`${path}/`)) {
        void store.closeFile(open)
      }
    }
  }

  /** Run an operation, report a refusal, and refresh what is on screen. */
  const perform = async (operation: Promise<FsResultDto>, after?: () => void): Promise<void> => {
    const result = await operation
    setNotice(result.ok ? null : result.error)
    if (!result.ok) return
    after?.()
    await refreshAll()
  }

  /** Workspace-relative form of a path, for the Copy Relative Path item. */
  const relativeTo = (path: string): string => {
    if (root.length === 0) return path
    const trimmed = path.startsWith(root) ? path.slice(root.length) : path
    return trimmed.replace(/^[\\/]+/, '').replace(/\\/g, '/')
  }

  const copyText = async (value: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value)
      setNotice(`Copied ${value}`)
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    }
  }

  /** Replace the clipboard, keeping the module copy and the rendered one in step. */
  const setClipboard = (next: { mode: 'copy' | 'cut'; paths: string[] } | null): void => {
    clipboard = next
    setClipboardState(next)
  }

  /** The entry the keyboard shortcuts act on, from the selected path. */
  const selectedEntry = Object.values(listings)
    .flatMap((listing) => listing.entries)
    .find((entry) => entry.path === selectedFile)

  /** The directory a drop or a paste should land in for the current selection. */
  const targetDirectory = selectedEntry
    ? selectedEntry.kind === 'directory'
      ? selectedEntry.path
      : parentOf(selectedEntry.path)
    : root

  const remember = (mode: 'copy' | 'cut', path: string, name: string): void => {
    setClipboard({ mode, paths: [path] })
    setNotice(`${mode === 'cut' ? 'Cut' : 'Copied'} ${name}`)
  }

  /** Take back the last file operation. */
  const runUndo = async (): Promise<void> => {
    const result = await window.piui.undoFileOperation()
    setNotice(result.ok ? (result.label ?? 'Undone') : result.error)
    if (result.ok) await refreshAll()
  }

  /**
   * Explorer shortcuts, the ones an editor trains into you. Bound on the panel
   * rather than the window, so Delete while typing a prompt is still Delete.
   */
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    // The inline rename box owns its own keys.
    if (event.target instanceof HTMLInputElement) return
    if (editing) return

    const modified = event.ctrlKey || event.metaKey

    if (modified && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      void runUndo()
      return
    }

    if (modified && event.key.toLowerCase() === 'c' && selectedEntry) {
      event.preventDefault()
      remember('copy', selectedEntry.path, selectedEntry.name)
      return
    }

    if (modified && event.key.toLowerCase() === 'x' && selectedEntry) {
      event.preventDefault()
      remember('cut', selectedEntry.path, selectedEntry.name)
      return
    }

    if (modified && event.key.toLowerCase() === 'v' && clipboard) {
      event.preventDefault()
      void pasteInto(targetDirectory)
      return
    }

    if (!selectedEntry) return

    if (event.key === 'Delete') {
      event.preventDefault()
      void beginDelete(selectedEntry)
      return
    }

    if (event.key === 'F2') {
      event.preventDefault()
      setEditing({ mode: 'rename', path: selectedEntry.path, value: selectedEntry.name })
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      activate(selectedEntry)
    }
  }

  const commitEdit = async (current: Editing, value: string): Promise<void> => {
    const name = value.trim()
    setEditing(null)
    if (name.length === 0) return

    if (current.mode === 'rename') {
      const target = joinPath(parentOf(current.path), name)
      if (target === current.path) return
      const from = current.path
      await perform(window.piui.renamePath(from, target), () => closeTabsUnder(from))
      return
    }

    const target = joinPath(current.parent, name)
    await perform(window.piui.createEntry(target, current.kind), () => {
      if (current.kind === 'file') openFile(target)
      else setExpanded((open) => new Set(open).add(current.parent))
    })
  }

  const beginDelete = async (entry: FsEntryDto): Promise<void> => {
    const what = entry.kind === 'directory' ? 'folder and everything in it' : 'file'
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete the ${what} "${entry.name}"?`)) return
    await perform(window.piui.deletePath(entry.path), () => closeTabsUnder(entry.path))
  }

  const pasteInto = async (directory: string): Promise<void> => {
    if (!clipboard) return
    const { mode, paths } = clipboard
    // A cut paste moves the file; a copy paste leaves the original in place.
    const transfer = mode === 'cut' ? 'move' : 'copy'
    await perform(window.piui.transferPaths([...paths], directory, transfer), () => {
      if (mode !== 'cut') return
      setClipboard(null)
    })
  }

  /** The menu, which acts on the entry that was clicked or on the workspace root. */
  const menuItems = (state: MenuState): MenuItem[] => {
    const entry = state.entry

    // An entry's menu is about that entry. Creating files is a thing you do to a
    // folder, so those items belong to the empty space and the directory rows.
    if (entry) {
      const directory = entry.kind === 'directory' ? entry.path : parentOf(entry.path)

      return [
        { label: 'Open', run: () => activate(entry) },
        null,
        { label: 'Cut', run: () => remember('cut', entry.path, entry.name) },
        { label: 'Copy', run: () => remember('copy', entry.path, entry.name) },
        {
          label: 'Paste',
          disabled: clipboardState === null,
          run: () => void pasteInto(directory)
        },
        null,
        {
          label: 'Rename',
          run: () => setEditing({ mode: 'rename', path: entry.path, value: entry.name })
        },
        { label: 'Delete', run: () => void beginDelete(entry) },
        null,
        { label: 'Copy Path', run: () => void copyText(entry.path) },
        { label: 'Copy Relative Path', run: () => void copyText(relativeTo(entry.path)) },
        null,
        { label: 'Show in File Explorer', run: () => void window.piui.revealPath(entry.path) }
      ]
    }

    return [
      {
        label: 'New File',
        disabled: root.length === 0,
        run: () => setEditing({ mode: 'create', parent: root, kind: 'file', value: '' })
      },
      {
        label: 'New Folder',
        disabled: root.length === 0,
        run: () => setEditing({ mode: 'create', parent: root, kind: 'directory', value: '' })
      },
      null,
      {
        label: 'Paste',
        disabled: clipboardState === null,
        run: () => void pasteInto(root)
      },
      { label: 'Undo', run: () => void runUndo() }
    ]
  }

  /** The input row, for a rename or for naming a new entry. */
  const editorRow = (value: string, depth: number): ReactNode => (
    <div className="fsedit" style={{ paddingLeft: 6 + depth * 12 }}>
      <input
        autoFocus
        value={value}
        spellCheck={false}
        onChange={(event) => {
          const next = event.target.value
          setEditing((current) => (current ? { ...current, value: next } : current))
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && editing) void commitEdit(editing, editing.value)
          if (event.key === 'Escape') setEditing(null)
        }}
        onBlur={() => setEditing(null)}
      />
    </div>
  )

  const renderEntries = (path: string, depth: number): ReactNode => {
    const listing = listings[path]
    if (!listing) return null

    const creating = editing?.mode === 'create' && editing.parent === path ? editing : null
    const renamedPath = editing?.mode === 'rename' ? editing.path : null
    const isCut = (entry: FsEntryDto): boolean =>
      clipboardState?.mode === 'cut' && clipboardState.paths.includes(entry.path)

    return (
      <>
        {creating ? editorRow(creating.value, depth) : null}

        {listing.entries.map((entry) => {
          const isOpen = expanded.has(entry.path)
          const guides = Array.from({ length: depth }, (_, index) => (
            <i className="g" style={{ left: 14 + index * 12 }} key={`g${index}`} />
          ))

          // Renaming replaces the row with an input in place.
          if (entry.path === renamedPath && editing) {
            return <Fragment key={entry.path}>{editorRow(editing.value, depth)}</Fragment>
          }

          return (
            <Fragment key={entry.path}>
              <button
                className={`r${selectedFile === entry.path ? ' sel' : ''}${
                  isCut(entry) ? ' cut' : ''
                }`}
                style={{ paddingLeft: 6 + depth * 12 + (entry.kind === 'file' ? 17 : 0) }}
                title={entry.path}
                onClick={() => activate(entry)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  selectFile(entry.path)
                  setMenu({ x: event.clientX, y: event.clientY, entry })
                }}
                // Files can be dragged onto the composer to reference them. The path
                // travels as plain text, since an in-app drag has no real File.
                draggable={entry.kind === 'file'}
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', entry.path)
                  event.dataTransfer.effectAllowed = 'copy'
                }}
              >
                {guides}
                {entry.kind === 'directory' ? (
                  <>
                    <span className={`chev${isOpen ? ' o' : ''}`}>›</span>
                    <img className="fd" src={folderIconUrl(iconPack, entry.name, isOpen)} alt="" />
                  </>
                ) : (
                  <img className="fd" src={fileIconUrl(iconPack, entry.name)} alt="" />
                )}
                <span className="nm">{entry.name}</span>
                {entry.status ? <span className={`gs ${entry.status}`}>{entry.status}</span> : null}
              </button>
              {entry.kind === 'directory' && isOpen ? renderEntries(entry.path, depth + 1) : null}
            </Fragment>
          )
        })}
      </>
    )
  }

  return (
    <div
      className="fpane"
      tabIndex={0}
      onKeyDown={onKeyDown}
      // Anywhere that is not a row is empty space. Rows stop the event themselves,
      // so this only fires for the gaps and the area below the tree.
      onContextMenu={(event) => {
        event.preventDefault()
        setMenu({ x: event.clientX, y: event.clientY, entry: null })
      }}
    >
      <div className="xh">
        <span className="xh__name">{workspace?.name ?? 'No folder'}</span>

        <span className="sp" />

        <button
          className="ibtn"
          title="New file"
          aria-label="New file"
          disabled={root.length === 0}
          onClick={() =>
            setEditing({ mode: 'create', parent: targetDirectory, kind: 'file', value: '' })
          }
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <path d="M9 1.5H4.5A1.5 1.5 0 003 3v10a1.5 1.5 0 001.5 1.5h7A1.5 1.5 0 0013 13V5.5L9 1.5Z" />
            <path d="M8 12V7.5M5.75 9.75h4.5" strokeLinecap="round" />
          </svg>
        </button>

        <button
          className="ibtn"
          title="New folder"
          aria-label="New folder"
          disabled={root.length === 0}
          onClick={() =>
            setEditing({ mode: 'create', parent: targetDirectory, kind: 'directory', value: '' })
          }
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <path d="M1.5 12.5v-9A1.5 1.5 0 013 2h3l1.5 2h5A1.5 1.5 0 0114 5.5v7a1.5 1.5 0 01-1.5 1.5h-9.5A1.5 1.5 0 011.5 12.5Z" />
            <path d="M8 11V7M5.75 9h4.5" strokeLinecap="round" />
          </svg>
        </button>

        <button
          className="ibtn"
          title="Refresh the tree"
          aria-label="Refresh"
          onClick={() => void refreshAll()}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <path
              d="M13 8a5 5 0 11-1.7-3.75M13 2v3h-3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <button
          className="ibtn"
          title="Collapse all folders"
          aria-label="Collapse all"
          onClick={() => setExpanded(new Set())}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <path d="M4 6.5 8 2.5l4 4M4 9.5l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="xt">
        {root.length === 0 ? <p className="hint">No workspace folder selected.</p> : null}
        {error ? <p className="hint bad">{error}</p> : null}
        {notice ? <p className="hint">{notice}</p> : null}
        {renderEntries(root, 0)}
      </div>

      {menu ? (
        // Stopping mousedown keeps the click that picks an item from also
        // reaching the window listener that closes the menu.
        <div
          className="ctx"
          style={{ left: Math.min(menu.x, window.innerWidth - 220), top: menu.y }}
          onMouseDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          {menuItems(menu).map((item, index) =>
            item === null ? (
              <hr key={`sep-${index}`} />
            ) : (
              <button
                key={item.label}
                disabled={item.disabled}
                onClick={() => {
                  setMenu(null)
                  item.run()
                }}
              >
                {item.label}
              </button>
            )
          )}
        </div>
      ) : null}
    </div>
  )
}
