import { useMemo, useState } from 'react'
import type { SessionSummaryDto } from '@shared/ipc'
import { usePiUi } from '../store'

type Bucket = 'Today' | 'Yesterday' | 'Earlier'

function startOfToday(): number {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

function bucketOf(iso: string): Bucket {
  const then = new Date(iso).getTime()
  const today = startOfToday()
  if (then >= today) return 'Today'
  if (then >= today - 86_400_000) return 'Yesterday'
  return 'Earlier'
}

function relative(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  if (hours < 48) return 'Yesterday'
  return new Date(iso).toLocaleDateString()
}

function initials(name: string): string {
  const letters = name
    .split(/[\s\-_.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
  return letters.length > 0 ? letters : name.slice(0, 2)
}

/** Workspace switcher, session search/filter, and the grouped session list. */
export function Sidebar() {
  const workspace = usePiUi((state) => state.workspace)
  const sessions = usePiUi((state) => state.sessions)
  const status = usePiUi((state) => state.status)
  const busy = usePiUi((state) => state.busy)
  const starred = usePiUi((state) => state.starred)
  const query = usePiUi((state) => state.sessionQuery)
  const filter = usePiUi((state) => state.sessionFilter)
  const runtime = usePiUi((state) => state.runtime)
  const newSession = usePiUi((state) => state.newSession)
  const switchSession = usePiUi((state) => state.switchSession)
  const renameSession = usePiUi((state) => state.renameSession)
  const forkSession = usePiUi((state) => state.forkSession)
  const changeWorkspace = usePiUi((state) => state.changeWorkspace)
  const setQuery = usePiUi((state) => state.setSessionQuery)
  const setFilter = usePiUi((state) => state.setSessionFilter)
  const toggleStar = usePiUi((state) => state.toggleStar)
  const openSettings = usePiUi((state) => state.openSettings)

  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const activePath = status?.sessionFile ?? null
  const running = Boolean(status?.isStreaming)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return sessions.filter((session) => {
      if (filter === 'starred' && !starred.includes(session.path)) return false
      if (filter === 'running' && !(session.path === activePath && running)) return false
      if (needle.length === 0) return true
      const haystack = `${session.name ?? ''} ${session.firstMessage ?? ''}`.toLowerCase()
      return haystack.includes(needle)
    })
  }, [sessions, query, filter, starred, activePath, running])

  const pinned = visible.filter((session) => starred.includes(session.path))
  const rest = visible.filter((session) => !starred.includes(session.path))
  const groups: { label: string; items: SessionSummaryDto[] }[] = [
    { label: 'Today', items: rest.filter((session) => bucketOf(session.modified) === 'Today') },
    {
      label: 'Yesterday',
      items: rest.filter((session) => bucketOf(session.modified) === 'Yesterday')
    },
    { label: 'Earlier', items: rest.filter((session) => bucketOf(session.modified) === 'Earlier') }
  ].filter((group) => group.items.length > 0)

  const commitRename = async (): Promise<void> => {
    const name = draft.trim()
    setEditing(null)
    if (name.length > 0) await renameSession(name)
  }

  const renderSession = (session: SessionSummaryDto) => {
    const active = session.path === activePath
    const title = session.name ?? session.firstMessage ?? 'Untitled session'
    const isRunning = active && running
    const isStarred = starred.includes(session.path)
    const isFork = Boolean(session.parentSessionPath)

    return (
      <div
        className={`sess${active ? ' on' : ''}${isFork ? ' fork' : ''}`}
        key={session.path}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void switchSession(session.path)
        }}
        onClick={() => {
          if (editing === session.path) return
          void switchSession(session.path)
        }}
      >
        <span className={`st${isRunning ? ' run' : ''}`} />

        {editing === session.path ? (
          <span className="tx">
            <input
              className="rename"
              value={draft}
              autoFocus
              placeholder="Session name"
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => void commitRename()}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Enter') void commitRename()
                if (event.key === 'Escape') setEditing(null)
              }}
            />
          </span>
        ) : (
          <span className="tx">
            <b>{title}</b>
            <small>
              {isRunning ? 'Running · ' : isFork ? 'Fork · ' : ''}
              {relative(session.modified)} · {session.messageCount} messages
            </small>
          </span>
        )}

        {editing !== session.path ? (
          <span className="acts">
            <button
              title={isStarred ? 'Unstar' : 'Star'}
              aria-label={isStarred ? 'Unstar session' : 'Star session'}
              onClick={(event) => {
                event.stopPropagation()
                toggleStar(session.path)
              }}
            >
              {isStarred ? '★' : '☆'}
            </button>
            <button
              title="Rename session"
              aria-label="Rename session"
              onClick={(event) => {
                event.stopPropagation()
                setEditing(session.path)
                setDraft(session.name ?? '')
              }}
            >
              ✎
            </button>
            <button
              title="Duplicate session"
              aria-label="Duplicate session"
              onClick={(event) => {
                event.stopPropagation()
                void forkSession()
              }}
            >
              ⑂
            </button>
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <aside className="side">
      <button className="proj" onClick={() => void changeWorkspace()} title={workspace?.cwd ?? ''}>
        <span className="av">{initials(workspace?.name ?? 'pi')}</span>
        <span className="tx">
          <b>{workspace?.name ?? 'No workspace'}</b>
          <small>{sessions.length} saved sessions</small>
        </span>
        <span className="sp" />
        <span style={{ color: 'var(--dim)' }}>⌄</span>
      </button>

      <button className="newbtn" onClick={() => void newSession()} disabled={busy}>
        <span>＋</span>
        <span>New session</span>
        <kbd>Ctrl N</kbd>
      </button>

      <label className="sbox">
        <span aria-hidden="true">⌕</span>
        <input
          value={query}
          placeholder="Search sessions"
          aria-label="Search sessions"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <div className="filters">
        <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
          All
        </button>
        <button className={filter === 'running' ? 'on' : ''} onClick={() => setFilter('running')}>
          Running
        </button>
        <button className={filter === 'starred' ? 'on' : ''} onClick={() => setFilter('starred')}>
          Starred
        </button>
      </div>

      <div className="slist">
        {pinned.length > 0 ? (
          <details className="g" open>
            <summary>Pinned</summary>
            {pinned.map(renderSession)}
          </details>
        ) : null}

        {groups.map((group) => (
          <details className="g" open key={group.label}>
            <summary>{group.label}</summary>
            {group.items.map(renderSession)}
          </details>
        ))}

        {visible.length === 0 ? (
          <p className="empty" style={{ padding: '20px 10px', fontSize: 13 }}>
            {sessions.length === 0 ? 'No saved sessions yet.' : 'No sessions match.'}
          </p>
        ) : null}
      </div>

      <nav className="snav">
        <button onClick={openSettings}>Settings</button>
        <button onClick={openSettings} title="Approval rules">
          Rules
        </button>
        <span className="ver">
          <span className={runtime?.versionMatch ? 'dot' : 'dot off'} />
          {runtime ? `pi ${runtime.sdkVersion}` : 'offline'}
        </span>
      </nav>
    </aside>
  )
}
