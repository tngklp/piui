import { Fragment, useCallback, useEffect, useState, type ReactNode } from 'react'
import type { FsEntryDto, FsListingDto } from '@shared/ipc'
import { fileIconName, folderIconName, iconUrl } from '../../lib/fileIcon'
import { usePiUi } from '../../store'

/** File explorer backed by the real workspace directory, using Material Icon Theme. */
export function FilesPanel() {
  const workspace = usePiUi((state) => state.workspace)
  const selectedFile = usePiUi((state) => state.selectedFile)
  const selectFile = usePiUi((state) => state.selectFile)

  const [listings, setListings] = useState<Record<string, FsListingDto>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [openEditors, setOpenEditors] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const root = workspace?.cwd ?? ''

  const load = useCallback(async (path: string) => {
    setLoading(true)
    try {
      const listing = await window.piui.listDirectory(path)
      setListings((current) => ({ ...current, [path]: listing }))
      setError(listing.error)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setListings({})
    setExpanded(new Set())
    setOpenEditors([])
    if (root.length > 0) void load(root)
  }, [root, load])

  const openFile = (entry: FsEntryDto): void => {
    selectFile(entry.path)
    setOpenEditors((current) =>
      [entry.path, ...current.filter((path) => path !== entry.path)].slice(0, 5)
    )
  }

  const activate = (entry: FsEntryDto): void => {
    if (entry.kind === 'file') {
      openFile(entry)
      return
    }

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

  const renderEntries = (path: string, depth: number): ReactNode => {
    const listing = listings[path]
    if (!listing) return null

    return listing.entries.map((entry) => {
      const isOpen = expanded.has(entry.path)
      const guides = Array.from({ length: depth }, (_, index) => (
        <i className="g" style={{ left: 14 + index * 12 }} key={`g${index}`} />
      ))

      return (
        <Fragment key={entry.path}>
          <button
            className={`r${selectedFile === entry.path ? ' sel' : ''}`}
            style={{ paddingLeft: 6 + depth * 12 + (entry.kind === 'file' ? 17 : 0) }}
            title={entry.path}
            onClick={() => activate(entry)}
          >
            {guides}
            {entry.kind === 'directory' ? (
              <>
                <span className={`chev${isOpen ? ' o' : ''}`}>›</span>
                <img className="fd" src={iconUrl(folderIconName(entry.name, isOpen))} alt="" />
              </>
            ) : (
              <img className="fd" src={iconUrl(fileIconName(entry.name))} alt="" />
            )}
            <span className="nm">{entry.name}</span>
            {entry.status ? <span className={`gs ${entry.status}`}>{entry.status}</span> : null}
          </button>
          {entry.kind === 'directory' && isOpen ? renderEntries(entry.path, depth + 1) : null}
        </Fragment>
      )
    })
  }

  const rootName = workspace?.name ?? 'workspace'

  return (
    <div>
      <div className="xh">
        <span>Explorer</span>
        <span className="sp" />
        <button title="Refresh" aria-label="Refresh" onClick={() => root && void load(root)}>
          ↻
        </button>
        <button
          title="Collapse all"
          aria-label="Collapse all"
          onClick={() => setExpanded(new Set())}
        >
          ⊟
        </button>
      </div>

      {openEditors.length > 0 ? (
        <div className="xs" style={{ borderTop: 0 }}>
          <span className="chev o">›</span>Open editors
          <span className="n">{openEditors.length}</span>
        </div>
      ) : null}
      {openEditors.map((path) => {
        const name = path.split(/[\\/]/).pop() ?? path
        return (
          <button
            className={`r${selectedFile === path ? ' sel' : ''}`}
            key={path}
            style={{ paddingLeft: 22 }}
            title={path}
            onClick={() => selectFile(path)}
          >
            <img className="fd" src={iconUrl(fileIconName(name))} alt="" />
            <span className="nm">{name}</span>
          </button>
        )
      })}

      <div className="xs" style={{ borderTop: openEditors.length > 0 ? undefined : 0 }}>
        <span className="chev o">›</span>
        {rootName}
      </div>

      <div className="xt">
        {root.length === 0 ? (
          <p style={{ color: 'var(--dim)', fontSize: 12.5, padding: '8px 12px', margin: 0 }}>
            No workspace folder selected.
          </p>
        ) : null}
        {error ? (
          <p style={{ color: 'var(--del)', fontSize: 12.5, padding: '8px 12px', margin: 0 }}>
            {error}
          </p>
        ) : null}
        {loading && Object.keys(listings).length === 0 ? (
          <p style={{ color: 'var(--dim)', fontSize: 12.5, padding: '8px 12px', margin: 0 }}>
            Loading…
          </p>
        ) : null}
        {renderEntries(root, 0)}
      </div>
    </div>
  )
}
