import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { FsEntryDto, FsListingDto } from '@shared/ipc'
import { fileIconUrl, folderIconUrl } from '../../lib/icon-packs'
import { usePiUi } from '../../store'

const REFRESH_MS = 3000

/**
 * File explorer for the active workspace. Uses the icon pack chosen in
 * Settings and polls the directories it has opened so the tree tracks changes
 * on disk.
 */
export function FilesPanel() {
  const workspace = usePiUi((state) => state.workspace)
  const selectedFile = usePiUi((state) => state.selectedFile)
  const openFile = usePiUi((state) => state.openFile)
  const iconPack = usePiUi((state) => state.prefs.iconPack)

  const [listings, setListings] = useState<Record<string, FsListingDto>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

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

  // Reset when the workspace changes.
  useEffect(() => {
    loadedPaths.current = new Set()
    setListings({})
    setExpanded(new Set())
    if (root.length > 0) void load(root)
  }, [root, load])

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
    })
  }

  return (
    <div>
      <div className="xh">
        <span>{workspace?.name ?? 'No folder'}</span>
      </div>

      <div className="xt">
        {root.length === 0 ? <p className="hint">No workspace folder selected.</p> : null}
        {error ? <p className="hint bad">{error}</p> : null}
        {renderEntries(root, 0)}
      </div>
    </div>
  )
}
