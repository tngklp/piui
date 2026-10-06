import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { usePiUi } from '../store'
import { fileIconUrl } from '../lib/icon-packs'
import { baseName } from './editor/languages'

/** How many matches to render at once. */
const MAX_RESULTS = 60

interface Match {
  path: string
  name: string
  directory: string
  score: number
}

/**
 * Score a path against a query, VS Code style: characters must appear in order,
 * and runs that follow a separator or match case score higher.
 */
function scorePath(path: string, query: string): number | null {
  if (query.length === 0) return 0

  const lowerPath = path.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const nameStart = lowerPath.lastIndexOf('/') + 1

  let score = 0
  let pathIndex = 0
  let lastMatch = -1

  for (const character of lowerQuery) {
    const found = lowerPath.indexOf(character, pathIndex)
    if (found === -1) return null

    // Reward adjacency and matches inside the file name.
    if (found === lastMatch + 1) score += 4
    if (found >= nameStart) score += 6
    if (path[found] === query[pathIndex]) score += 1

    lastMatch = found
    pathIndex = found + 1
  }

  // Prefer shorter paths, and strongly prefer matching the file name itself.
  score -= Math.floor(path.length / 6)
  if (path.slice(nameStart).toLowerCase().startsWith(lowerQuery)) score += 20

  return score
}

/** Ctrl+P file picker over the workspace index. */
export function QuickOpen() {
  const open = usePiUi((state) => state.quickOpen)
  const close = usePiUi((state) => state.closeQuickOpen)
  const openFile = usePiUi((state) => state.openFile)
  const iconPack = usePiUi((state) => state.prefs.iconPack)

  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [files, setFiles] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setCursor(0)
    setError(null)
    inputRef.current?.focus()

    let cancelled = false
    window.piui
      .listWorkspaceFiles()
      .then((paths) => {
        if (!cancelled) setFiles(paths)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      })

    return () => {
      cancelled = true
    }
  }, [open])

  const matches = useMemo<Match[]>(() => {
    const scored: Match[] = []
    for (const path of files) {
      const score = scorePath(path, query)
      if (score === null) continue
      const cut = path.lastIndexOf('/')
      scored.push({
        path,
        name: cut === -1 ? path : path.slice(cut + 1),
        directory: cut === -1 ? '' : path.slice(0, cut),
        score
      })
    }
    scored.sort((a, b) => b.score - a.score || a.path.length - b.path.length)
    return scored.slice(0, MAX_RESULTS)
  }, [files, query])

  // Keep the highlighted row in view while arrowing through the list.
  useEffect(() => {
    listRef.current?.querySelector('.qo__row.on')?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (!open) return null

  const choose = (match: Match): void => {
    const workspace = usePiUi.getState().workspace?.cwd
    if (!workspace) return
    const separator = workspace.includes('\\') ? '\\' : '/'
    openFile(`${workspace}${separator}${match.path.split('/').join(separator)}`)
    close()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((current) => Math.min(current + 1, matches.length - 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((current) => Math.max(current - 1, 0))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const match = matches[cursor] ?? matches[0]
      if (match) choose(match)
    }
  }

  return (
    <div className="qo" role="dialog" aria-modal="true" aria-label="Quick open">
      <div className="qo__backdrop" onClick={close} />
      <div className="qo__panel">
        <input
          ref={inputRef}
          className="qo__input"
          value={query}
          placeholder="Search files by name"
          aria-label="Search files by name"
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value)
            setCursor(0)
          }}
          onKeyDown={onKeyDown}
        />

        {error ? <p className="hint bad">{error}</p> : null}

        <div className="qo__list" ref={listRef} role="listbox">
          {matches.map((match, index) => (
            <button
              key={match.path}
              role="option"
              aria-selected={index === cursor}
              className={`qo__row${index === cursor ? ' on' : ''}`}
              onMouseEnter={() => setCursor(index)}
              onClick={() => choose(match)}
            >
              <img
                className="ftab__icon"
                src={fileIconUrl(iconPack, baseName(match.name))}
                alt=""
              />
              <span className="qo__name">{match.name}</span>
              <span className="qo__dir">{match.directory}</span>
            </button>
          ))}

          {matches.length === 0 ? (
            <p className="hint">
              {files.length === 0 ? 'Indexing the workspace…' : 'No matching files.'}
            </p>
          ) : null}
        </div>

        <p className="qo__hint">
          <span>
            <b>{files.length}</b> files indexed
          </span>
          <span className="sp" />
          <span>Enter to open · Esc to dismiss</span>
        </p>
      </div>
    </div>
  )
}
