import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/ipc'

export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.piui
      .getAppInfo()
      .then(setInfo)
      .catch((cause: unknown) => setError(String(cause)))
  }, [])

  return (
    <div className="shell">
      <header className="shell__header">
        <span className="shell__logo">π</span>
        <div>
          <h1 className="shell__title">PiUI</h1>
          <p className="shell__subtitle">Desktop GUI for the Pi coding agent</p>
        </div>
      </header>

      <main className="shell__main">
        {error ? <p className="shell__error">Failed to load app info: {error}</p> : null}
        {info ? (
          <dl className="facts">
            <div className="facts__row">
              <dt>Version</dt>
              <dd>{info.version}</dd>
            </div>
            <div className="facts__row">
              <dt>Platform</dt>
              <dd>{info.platform}</dd>
            </div>
            <div className="facts__row">
              <dt>Electron</dt>
              <dd>{info.versions.electron}</dd>
            </div>
            <div className="facts__row">
              <dt>Chromium</dt>
              <dd>{info.versions.chrome}</dd>
            </div>
            <div className="facts__row">
              <dt>Node</dt>
              <dd>{info.versions.node}</dd>
            </div>
          </dl>
        ) : null}
        {!info && !error ? <p className="shell__muted">Starting…</p> : null}
      </main>
    </div>
  )
}
