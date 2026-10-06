import { useEffect } from 'react'
import type { ThinkingLevelDto } from '@shared/ipc'
import { ApprovalSettings } from './components/ApprovalSettings'
import { Composer } from './components/Composer'
import { DialogHost } from './components/DialogHost'
import { StatusBar } from './components/StatusBar'
import { Transcript } from './components/Transcript'
import { usePiUi } from './store'

export default function App() {
  const initialize = usePiUi((state) => state.initialize)
  const error = usePiUi((state) => state.error)
  const runtime = usePiUi((state) => state.runtime)
  const status = usePiUi((state) => state.status)
  const models = usePiUi((state) => state.models)
  const notices = usePiUi((state) => state.notices)
  const dismissNotice = usePiUi((state) => state.dismissNotice)
  const selectModel = usePiUi((state) => state.selectModel)
  const selectThinking = usePiUi((state) => state.selectThinking)
  const newSession = usePiUi((state) => state.newSession)
  const compact = usePiUi((state) => state.compact)
  const openSettings = usePiUi((state) => state.openSettings)

  useEffect(() => {
    void initialize()
  }, [initialize])

  const currentModelKey = status?.model ? `${status.model.provider}/${status.model.id}` : ''

  const onModelChange = (value: string): void => {
    const separator = value.indexOf('/')
    if (separator <= 0) return
    void selectModel(value.slice(0, separator), value.slice(separator + 1))
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__logo">π</span>
          <span className="topbar__name">PiUI</span>
        </div>

        <div className="topbar__controls">
          <select
            className="control"
            value={currentModelKey}
            onChange={(event) => onModelChange(event.target.value)}
            disabled={models.length === 0}
            title="Model"
          >
            {currentModelKey === '' ? <option value="">No model selected</option> : null}
            {models.map((model) => (
              <option key={`${model.provider}/${model.id}`} value={`${model.provider}/${model.id}`}>
                {model.name}
              </option>
            ))}
          </select>

          <select
            className="control"
            value={status?.thinkingLevel ?? 'off'}
            onChange={(event) => void selectThinking(event.target.value as ThinkingLevelDto)}
            disabled={!status?.supportsThinking}
            title="Thinking level"
          >
            {(status?.availableThinkingLevels ?? ['off']).map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>

          <button className="button" onClick={() => void newSession()}>
            New
          </button>
          <button className="button" onClick={() => void compact()} disabled={status?.isStreaming}>
            Compact
          </button>
          <button className="button" onClick={openSettings}>
            Rules
          </button>
        </div>
      </header>

      {runtime && !runtime.versionMatch ? (
        <div className="banner banner--warning">
          PiUI embeds pi <strong>{runtime.sdkVersion}</strong>
          {runtime.cliVersion
            ? `, but the installed CLI is ${runtime.cliVersion}`
            : ' and no installed CLI was detected'}
          . Keep both on the same version so sessions and settings stay compatible.
        </div>
      ) : null}

      {error ? (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      ) : null}

      {notices.length > 0 ? (
        <div className="notices">
          {notices.map((notice) => (
            <button
              key={notice.id}
              className={`notice notice--${notice.level}`}
              onClick={() => dismissNotice(notice.id)}
              title="Dismiss"
            >
              {notice.message}
            </button>
          ))}
        </div>
      ) : null}

      <main className="main">
        <Transcript />
      </main>

      <StatusBar />
      <Composer />
      <DialogHost />
      <ApprovalSettings />
    </div>
  )
}
