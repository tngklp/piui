import { usePiUi } from '../store'
import { Composer } from './Composer'
import { Transcript } from './Transcript'

/** Session header, banners, transcript, and composer. */
export function ChatView() {
  const status = usePiUi((state) => state.status)
  const runtime = usePiUi((state) => state.runtime)
  const error = usePiUi((state) => state.error)
  const notices = usePiUi((state) => state.notices)
  const dismissNotice = usePiUi((state) => state.dismissNotice)

  const title =
    status?.sessionName ?? (status?.sessionId ? status.sessionId.slice(0, 8) : 'New session')
  const running = Boolean(status?.isStreaming)

  return (
    <main className="main">
      <div className="head">
        <h1>{title}</h1>
        <span className="sp" />
        <span className="chip lil">{running ? 'Running' : 'Idle'}</span>
      </div>

      {runtime && !runtime.versionMatch ? (
        <div className="banner warn">
          PiUI embeds pi <b>{runtime.sdkVersion}</b>
          {runtime.cliVersion
            ? `, but the installed CLI is ${runtime.cliVersion}`
            : ' and no installed CLI was detected'}
          . Keep both on the same version so sessions and settings stay compatible.
        </div>
      ) : null}

      {error ? (
        <div className="banner bad" role="alert">
          {error}
        </div>
      ) : null}

      {notices.length > 0 ? (
        <div className="notices">
          {notices.map((notice) => (
            <button
              className={`notice ${notice.level}`}
              key={notice.id}
              onClick={() => dismissNotice(notice.id)}
              title="Dismiss"
            >
              {notice.message}
            </button>
          ))}
        </div>
      ) : null}

      <div className="scroll">
        <Transcript />
      </div>

      <Composer />
    </main>
  )
}
