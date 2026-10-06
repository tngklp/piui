import { usePiUi } from '../../store'
import { SCROLLBACK_MAX, SCROLLBACK_MIN, clampScrollback } from '../../lib/ui-prefs'
import { NumberField, Row, SettingsHeader, Switch } from './rows'

/** Default shell placeholder, for whichever platform is running. */
const SHELL_PLACEHOLDER = navigator.userAgent.includes('Windows') ? 'powershell.exe' : '/bin/zsh'

/** App and runtime defaults that are not tied to one panel. */
export function GeneralSettings() {
  const prefs = usePiUi((state) => state.prefs)
  const setPrefs = usePiUi((state) => state.setPrefs)

  return (
    <section className="set-section">
      <SettingsHeader title="General" subtitle="App and runtime defaults." />

      <h3>Agent</h3>
      <div className="gcard">
        <Row
          title="Expand reasoning by default"
          hint="Show the model's thinking blocks opened rather than collapsed."
        >
          <Switch
            label="Expand reasoning by default"
            checked={prefs.expandThinking}
            onChange={(expandThinking) => setPrefs({ expandThinking })}
          />
        </Row>

        <Row
          title="Expand tool output by default"
          hint="Open each tool card straight away, showing the command, diff, or output it produced."
        >
          <Switch
            label="Expand tool output by default"
            checked={prefs.expandToolOutput}
            onChange={(expandToolOutput) => setPrefs({ expandToolOutput })}
          />
        </Row>

        <Row
          title="Send with Enter"
          hint={
            prefs.sendOnEnter
              ? 'Enter sends the message. Shift+Enter starts a new line.'
              : 'Enter starts a new line. Ctrl+Enter sends the message.'
          }
        >
          <Switch
            label="Send with Enter"
            checked={prefs.sendOnEnter}
            onChange={(sendOnEnter) => setPrefs({ sendOnEnter })}
          />
        </Row>
      </div>

      <h3>Terminal</h3>
      <div className="gcard">
        <Row
          title="Shell"
          hint="The shell the integrated terminal starts. Leave blank to use your login shell."
        >
          <input
            className="inp mono"
            value={prefs.terminalShell}
            placeholder={SHELL_PLACEHOLDER}
            aria-label="Terminal shell"
            spellCheck={false}
            onChange={(event) => setPrefs({ terminalShell: event.target.value })}
          />
        </Row>

        <Row title="Scrollback" hint="Lines of terminal output kept above the visible screen.">
          <NumberField
            label="Terminal scrollback lines"
            value={prefs.terminalScrollback}
            min={SCROLLBACK_MIN}
            max={SCROLLBACK_MAX}
            step={100}
            suffix="lines"
            onCommit={(value) => setPrefs({ terminalScrollback: clampScrollback(value) })}
          />
        </Row>
      </div>
    </section>
  )
}
