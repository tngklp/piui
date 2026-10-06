import { useState } from 'react'
import { usePiUi } from '../store'

/** Version note shown under the heading, trimmed to something readable. */
function shortNotes(notes: string | null): string | null {
  if (!notes) return null
  const text = notes.replace(/[#*_`]/g, '').trim()
  if (text.length === 0) return null
  return text.length > 260 ? `${text.slice(0, 260).trimEnd()}…` : text
}

/**
 * Update prompt.
 *
 * Sits in the corner once the release feed reports a newer version, and carries
 * the whole flow: download, then restart to install. Portable and development
 * builds can never get past the "unsupported" state, so they show nothing.
 */
export function UpdateToast() {
  const update = usePiUi((state) => state.update)
  const download = usePiUi((state) => state.downloadUpdate)
  const install = usePiUi((state) => state.installUpdate)

  const [hidden, setHidden] = useState(false)

  if (!update || hidden) return null
  if (update.phase !== 'available' && update.phase !== 'downloading' && update.phase !== 'ready') {
    return null
  }

  const notes = update.phase === 'ready' ? null : shortNotes(update.notes)

  return (
    <aside className="upd" role="status" aria-live="polite">
      <div className="upd__hd">
        <b>
          {update.phase === 'ready' ? 'Update ready' : 'Update available'}
          {update.version ? <span className="upd__ver">v{update.version}</span> : null}
        </b>
        <button
          className="ibtn"
          title="Dismiss"
          aria-label="Dismiss"
          onClick={() => setHidden(true)}
        >
          ✕
        </button>
      </div>

      <p className="upd__body">
        {update.phase === 'downloading'
          ? `Downloading… ${update.percent ?? 0}%`
          : update.phase === 'ready'
            ? 'PiUI will close, install the new version, and reopen.'
            : `You are on v${update.currentVersion}.`}
      </p>

      {notes ? <p className="upd__notes">{notes}</p> : null}

      {update.phase === 'downloading' ? (
        <span className="upd__bar">
          <i style={{ width: `${Math.min(100, Math.max(0, update.percent ?? 0))}%` }} />
        </span>
      ) : null}

      <div className="upd__btns">
        {update.phase === 'available' ? (
          <button className="b pri sm" onClick={() => void download()}>
            Download update
          </button>
        ) : null}
        {update.phase === 'downloading' ? (
          <button className="b sm" disabled>
            Downloading…
          </button>
        ) : null}
        {update.phase === 'ready' ? (
          <button className="b pri sm" onClick={install}>
            Restart and install
          </button>
        ) : null}
      </div>
    </aside>
  )
}
