import { usePiUi } from '../store'

/** Application chrome: brand, workspace chip, settings, and panel toggle. */
export function TitleBar() {
  const runtime = usePiUi((state) => state.runtime)
  const rightOpen = usePiUi((state) => state.rightOpen)
  const toggleRight = usePiUi((state) => state.toggleRight)
  const openSettings = usePiUi((state) => state.openSettings)
  const openWelcome = usePiUi((state) => state.openWelcome)

  return (
    <header className="title">
      <button
        className="logo"
        onClick={openWelcome}
        title="Welcome screen"
        aria-label="Welcome screen"
      >
        π
      </button>
      <strong>PiUI</strong>
      {runtime ? (
        <span className="chip" title={`Embedded pi SDK ${runtime.sdkVersion}`}>
          pi {runtime.sdkVersion}
        </span>
      ) : null}
      <div className="sp" />
      <button className="ibtn" onClick={openSettings} title="Settings" aria-label="Settings">
        ⚙
      </button>
      <button
        className="ibtn"
        onClick={toggleRight}
        title={rightOpen ? 'Hide right panel' : 'Show right panel'}
        aria-label="Toggle right panel"
        aria-pressed={rightOpen}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
          <path d="M10 2.5v11" />
        </svg>
      </button>
    </header>
  )
}
