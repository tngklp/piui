import { useState } from 'react'
import type { PiInstallResultDto } from '@shared/ipc'
import { usePiUi } from '../store'
import { Composer } from './Composer'
import { Transcript } from './Transcript'

/**
 * Offer to install the `pi` CLI when nothing on the machine looks like it.
 *
 * PiUI is a front end for the agent, so an install that cannot find `pi` has
 * nothing to show. Rather than pointing at a README, it runs the same installer
 * the README would, and says that a restart is needed because the SDK is resolved
 * once at startup.
 */
function PiInstallBanner() {
  const runtime = usePiUi((state) => state.runtime)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PiInstallResultDto | null>(null)

  if (!runtime || runtime.cliInstalled) return null

  const install = async (): Promise<void> => {
    setBusy(true)
    try {
      setResult(await window.piui.installPi())
    } catch (cause) {
      setResult({
        ok: false,
        output: '',
        error: cause instanceof Error ? cause.message : String(cause)
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`banner ${result && !result.ok ? 'bad' : 'warn'} install`} role="status">
      <div className="install__text">
        {result?.ok ? (
          <>
            <b>Pi is installed.</b> Restart PiUI to run on it. The CLI keeps itself up to date from
            then on, so this is a one-off.
          </>
        ) : (
          <>
            <b>Pi is not installed.</b> PiUI runs the Pi coding agent and shares its agent
            directory, so it needs the <code>pi</code> CLI. Installing adds <code>pi</code> to your
            PATH.
          </>
        )}

        {result && !result.ok && result.output ? (
          <pre className="install__out">{result.output}</pre>
        ) : null}
        {result && !result.ok && result.error ? (
          <div className="install__err">{result.error}</div>
        ) : null}
      </div>

      {busy ? (
        <span className="spinner" />
      ) : result?.ok ? (
        <button className="b pri" onClick={() => void window.piui.relaunchApp()}>
          Restart PiUI
        </button>
      ) : (
        <button className="b pri" onClick={() => void install()}>
          Install Pi
        </button>
      )}
    </div>
  )
}

/** Chat body: banners, notices, transcript, and composer. */
export function ChatView() {
  const runtime = usePiUi((state) => state.runtime)
  const error = usePiUi((state) => state.error)
  const notices = usePiUi((state) => state.notices)
  const dismissNotice = usePiUi((state) => state.dismissNotice)

  return (
    <>
      <PiInstallBanner />

      {runtime && !runtime.versionMatch ? (
        <div className="banner warn">
          Running on pi <b>{runtime.sdkVersion}</b>
          {runtime.cliVersion
            ? `, but the installed CLI is ${runtime.cliVersion}`
            : ', and no installed CLI was detected'}
          . PiUI loads the SDK from your pi installation when it can, so reinstall pi or update PiUI
          to align them — sessions and settings are only compatible within a version.
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
    </>
  )
}
