import { useEffect, useState } from 'react'
import { shortenPath } from '../lib/format'
import { usePiUi } from '../store'

/** Compact relative time for session rows. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const minutes = Math.floor((Date.now() - then) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

/** Workspace switcher plus the saved-session list for the current workspace. */
export function Sidebar() {
  const workspace = usePiUi((state) => state.workspace)
  const sessions = usePiUi((state) => state.sessions)
  const status = usePiUi((state) => state.status)
  const busy = usePiUi((state) => state.busy)
  const newSession = usePiUi((state) => state.newSession)
  const switchSession = usePiUi((state) => state.switchSession)
  const renameSession = usePiUi((state) => state.renameSession)
  const forkSession = usePiUi((state) => state.forkSession)
  const changeWorkspace = usePiUi((state) => state.changeWorkspace)

  const [editingPath, setEditingPath] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')

  const activePath = status?.sessionFile ?? null

  useEffect(() => {
    setEditingPath(null)
  }, [activePath])

  const commitRename = async (): Promise<void> => {
    const name = draftName.trim()
    setEditingPath(null)
    if (name.length > 0) await renameSession(name)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__workspace">
        <div className="sidebar__label">Workspace</div>
        <div className="sidebar__path" title={workspace?.cwd ?? ''}>
          {workspace?.name ?? '—'}
        </div>
        {workspace ? (
          <div className="sidebar__subpath" title={workspace.cwd}>
            {shortenPath(workspace.cwd, 34)}
          </div>
        ) : null}
        <button className="button sidebar__button" onClick={() => void changeWorkspace()}>
          Change folder…
        </button>
      </div>

      <div className="sidebar__actions">
        <button
          className="button button--primary sidebar__button"
          onClick={() => void newSession()}
          disabled={busy}
        >
          New
        </button>
        <button
          className="button sidebar__button"
          onClick={() => void forkSession()}
          disabled={busy}
        >
          Duplicate
        </button>
      </div>

      <div className="sidebar__label sidebar__label--list">Sessions</div>

      <div className="sidebar__list">
        {sessions.length === 0 ? <p className="sidebar__empty">No saved sessions yet.</p> : null}
        {sessions.map((session) => {
          const active = session.path === activePath
          const title = session.name ?? session.firstMessage ?? 'Untitled session'

          return (
            <div className={`session${active ? ' session--active' : ''}`} key={session.path}>
              {editingPath === session.path ? (
                <input
                  className="session__input"
                  value={draftName}
                  autoFocus
                  onChange={(event) => setDraftName(event.target.value)}
                  onBlur={() => void commitRename()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void commitRename()
                    if (event.key === 'Escape') setEditingPath(null)
                  }}
                />
              ) : (
                <button
                  className="session__open"
                  onClick={() => void switchSession(session.path)}
                  title={session.path}
                >
                  <span className="session__title">{title}</span>
                  <span className="session__meta">
                    {relativeTime(session.modified)} · {session.messageCount} msg
                  </span>
                </button>
              )}
              {active && editingPath !== session.path ? (
                <button
                  className="session__rename"
                  title="Rename session"
                  onClick={() => {
                    setEditingPath(session.path)
                    setDraftName(session.name ?? '')
                  }}
                >
                  ✎
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
