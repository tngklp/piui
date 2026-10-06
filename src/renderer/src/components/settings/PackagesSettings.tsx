import { useCallback, useEffect, useRef, useState } from 'react'
import type { CatalogPackageDto, InstalledPackageDto, PackageProgressDto } from '@shared/ipc'
import { usePiUi } from '../../store'
import { Select, type SelectOption } from '../Select'
import { SettingsHeader } from './rows'

/** Catalogue type filters. */
type TypeFilter = '' | 'skill' | 'extension' | 'prompt' | 'theme'

const TYPE_OPTIONS: SelectOption<TypeFilter>[] = [
  { value: '', label: 'All types' },
  { value: 'skill', label: 'Skills' },
  { value: 'extension', label: 'Extensions' },
  { value: 'prompt', label: 'Prompts' },
  { value: 'theme', label: 'Themes' }
]

/** How long to wait after typing before hitting the catalogue. */
const SEARCH_DEBOUNCE_MS = 350

/** Lines kept in the install log. */
const MAX_LOG_LINES = 150

interface LogLine extends PackageProgressDto {
  id: number
}

let logId = 0

/** One line of install output. */
function logText(line: LogLine): string {
  const prefix = `${line.action}: `
  const body = line.message.trim()
  if (body.length === 0) return `${prefix}${line.phase} (${line.source})`
  return `${prefix}${body}`
}

function formatDownloads(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M/mo`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K/mo`
  return `${value}/mo`
}

function relative(iso: string): string {
  if (!iso) return ''
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

/** Compare install specs that may differ in scope prefix. */
function samePackage(a: string, b: string): boolean {
  const normalize = (value: string): string => value.replace(/^npm:/, '').trim()
  return normalize(a) === normalize(b)
}

/**
 * pi.dev catalogue browser. Searches skills, extensions, prompts, and themes,
 * and installs them with the SDK's package manager.
 */
export function PackagesSettings() {
  const [query, setQuery] = useState('')
  const [type, setType] = useState<TypeFilter>('')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<CatalogPackageDto[]>([])
  const [total, setTotal] = useState(0)
  const [installed, setInstalled] = useState<InstalledPackageDto[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState<LogLine[]>([])

  const requestRef = useRef(0)
  const logRef = useRef<HTMLDivElement | null>(null)

  const refreshInstalled = useCallback(async () => {
    try {
      setInstalled(await window.piui.listInstalledPackages())
    } catch {
      // The installed list is advisory.
    }
  }, [])

  useEffect(() => {
    void refreshInstalled()
    const off = window.piui.onPackageProgress((payload) => {
      logId += 1
      setLog((current) => [...current, { ...payload, id: logId }].slice(-MAX_LOG_LINES))
      setStatus(
        `${payload.source} · ${payload.action}${payload.message ? `: ${payload.message}` : ''}`
      )
    })
    return off
  }, [refreshInstalled])

  // Keep the newest log line visible.
  useEffect(() => {
    const host = logRef.current
    if (host) host.scrollTop = host.scrollHeight
  }, [log])

  // Debounced catalogue search.
  useEffect(() => {
    const ticket = requestRef.current + 1
    requestRef.current = ticket

    const timer = setTimeout(
      () => {
        setStatus('Searching the catalogue…')
        window.piui
          .searchPackages(query, type, page)
          .then((result) => {
            if (requestRef.current !== ticket) return
            setItems(result.items)
            setTotal(result.total)
            setError(null)
            setStatus(null)
          })
          .catch((cause: unknown) => {
            if (requestRef.current !== ticket) return
            setItems([])
            setError(cause instanceof Error ? cause.message : String(cause))
            setStatus(null)
          })
      },
      query.length === 0 ? 0 : SEARCH_DEBOUNCE_MS
    )

    return () => clearTimeout(timer)
  }, [query, type, page])

  const install = async (source: string): Promise<void> => {
    setBusy(source)
    setError(null)
    setLog([])
    setStatus(`Installing ${source}…`)
    try {
      setInstalled(await window.piui.installPackage(source))
      setStatus(`${source} installed.`)
      // The agent session was rebuilt; resync the transcript and commands.
      await usePiUi.getState().refresh()
      await usePiUi.getState().loadCommands()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setStatus(null)
    } finally {
      setBusy(null)
    }
  }

  const uninstall = async (source: string): Promise<void> => {
    setBusy(source)
    setError(null)
    setLog([])
    setStatus(`Removing ${source}…`)
    try {
      setInstalled(await window.piui.removePackage(source))
      setStatus(`${source} removed.`)
      await usePiUi.getState().refresh()
      await usePiUi.getState().loadCommands()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }

  const pages = Math.max(1, Math.ceil(total / 50))
  const installedSources = installed.map((entry) => entry.source)

  return (
    <section className="set-section">
      <SettingsHeader
        title="Packages"
        subtitle="Skills, extensions, prompts and themes published to npm."
      />

      {installed.length > 0 ? (
        <div className="pkg-installed">
          <h4>Installed ({installed.length})</h4>
          {installed.map((entry) => (
            <div className="pkg-row" key={`${entry.scope}:${entry.source}`}>
              <span className="mono pkg-row__name">{entry.source}</span>
              <span className="pkg-chip">{entry.scope}</span>
              <span className="sp" />
              <button
                className="b sm"
                disabled={busy !== null}
                onClick={() => void uninstall(entry.source)}
              >
                {busy === entry.source ? 'Removing…' : 'Uninstall'}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="pkg-search">
        <label className="sbox pkg-search__box">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            placeholder="Search packages by name, description, or author"
            aria-label="Search the pi package catalogue"
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
          />
        </label>
        <Select
          value={type}
          options={TYPE_OPTIONS}
          title="Filter by package type"
          onChange={(next) => {
            setType(next)
            setPage(1)
          }}
        />
      </div>

      {error ? <p className="hint bad">{error}</p> : null}
      {!error && status ? <p className="hint">{status}</p> : null}

      {log.length > 0 ? (
        <div className="pkg-log" ref={logRef}>
          {log.map((line) => (
            <div className={`pkg-log__line ${line.phase}`} key={line.id}>
              {logText(line)}
            </div>
          ))}
        </div>
      ) : null}

      <div className="pkg-list">
        {items.map((item) => {
          const has = installedSources.some((source) => samePackage(source, item.source))
          return (
            <article className="pkg" key={item.source}>
              <div className="pkg__hd">
                <b className="mono pkg__name">{item.name}</b>
                {item.types.map((entry) => (
                  <span className="pkg-chip" key={entry}>
                    {entry}
                  </span>
                ))}
                <span className="sp" />
                {item.downloads > 0 ? (
                  <span className="pkg__meta">{formatDownloads(item.downloads)}</span>
                ) : null}
                {item.updatedAt ? (
                  <span className="pkg__meta">{relative(item.updatedAt)}</span>
                ) : null}
                <button
                  className={`b sm${has ? '' : ' pri'}`}
                  disabled={busy !== null || has}
                  onClick={() => void install(item.source)}
                >
                  {has ? 'Installed' : busy === item.source ? 'Installing…' : 'Install'}
                </button>
              </div>
              {item.description ? <p className="pkg__desc">{item.description}</p> : null}
            </article>
          )
        })}

        {items.length === 0 && !status && !error ? (
          <p className="hint">No packages matched.</p>
        ) : null}
      </div>

      {total > 50 ? (
        <div className="pkg-pager">
          <button className="b sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ‹ Prev
          </button>
          <span className="pkg__meta">
            Page {page} of {pages}
          </span>
          <button className="b sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next ›
          </button>
        </div>
      ) : null}
    </section>
  )
}
