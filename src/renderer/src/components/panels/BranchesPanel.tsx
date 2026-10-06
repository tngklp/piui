import { Fragment } from 'react'
import { usePiUi } from '../../store'

/**
 * Session lineage for the current workspace. PiUI records forks through the
 * session's `parentSessionPath`, so the tree shows lineage rather than
 * in-session message branches.
 */
export function BranchesPanel() {
  const sessions = usePiUi((state) => state.sessions)
  const status = usePiUi((state) => state.status)
  const switchSession = usePiUi((state) => state.switchSession)

  const activePath = status?.sessionFile ?? null
  const roots = sessions.filter((session) => !session.parentSessionPath)

  if (roots.length === 0) {
    return (
      <div className="pad">
        <p style={{ color: 'var(--dim)', fontSize: 13, margin: 0 }}>
          No session history for this workspace yet.
        </p>
      </div>
    )
  }

  return (
    <div className="pad">
      {roots.map((root) => {
        const forks = sessions.filter((session) => session.parentSessionPath === root.path)

        return (
          <Fragment key={root.path}>
            <button
              className={`bn${root.path === activePath ? ' cur' : ''}`}
              onClick={() => void switchSession(root.path)}
            >
              <b>{root.name ?? root.firstMessage ?? 'Untitled session'}</b>
              <small>
                {root.messageCount} messages
                {root.path === activePath ? ' · you are here' : ''}
              </small>
            </button>

            {forks.map((fork) => (
              <button
                className={`bn br${fork.path === activePath ? ' cur' : ''}`}
                key={fork.path}
                onClick={() => void switchSession(fork.path)}
              >
                <b>{fork.name ?? fork.firstMessage ?? 'Fork'}</b>
                <small>
                  Fork · {fork.messageCount} messages
                  {fork.path === activePath ? ' · you are here' : ''}
                </small>
              </button>
            ))}
          </Fragment>
        )
      })}
    </div>
  )
}
