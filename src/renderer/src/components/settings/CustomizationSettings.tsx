import { usePiUi } from '../../store'
import { THEMES } from '../../theme/themes'
import { EDITOR_FONT_MAX, EDITOR_FONT_MIN, clampFontSize } from '../../lib/ui-prefs'
import { Select, type SelectOption } from '../Select'

/** A labelled checkbox row. */
function Toggle({
  label,
  hint,
  checked,
  onChange
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="set-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="tx">
        <b>{label}</b>
        <small>{hint}</small>
      </span>
    </label>
  )
}

/** Appearance, editor typography, and interface behaviour. */
export function CustomizationSettings() {
  const themeId = usePiUi((state) => state.themeId)
  const setTheme = usePiUi((state) => state.setTheme)
  const prefs = usePiUi((state) => state.prefs)
  const setPrefs = usePiUi((state) => state.setPrefs)

  const options: SelectOption<string>[] = THEMES.map((theme) => ({
    value: theme.id,
    label: theme.name,
    swatch: [theme.tokens.bg, theme.tokens.panel, theme.tokens.accent, theme.tokens.text]
  }))

  return (
    <>
      <section className="set-section">
        <h3>Theme</h3>
        <Select value={themeId} options={options} onChange={setTheme} title="Theme" hideCaret />
      </section>

      <section className="set-section">
        <h3>Editor</h3>

        <div className="set-field">
          <span>Font size</span>
          <div className="set-inline">
            <input
              className="inp num"
              type="number"
              min={EDITOR_FONT_MIN}
              max={EDITOR_FONT_MAX}
              value={prefs.editorFontSize}
              aria-label="Editor font size in pixels"
              onChange={(event) => setPrefs({ editorFontSize: clampFontSize(event.target.value) })}
            />
            <span className="set-unit">px</span>
            <span className="sp" />
            <span className="set-note">Ctrl+scroll in the editor does the same</span>
          </div>
        </div>

        <Toggle
          label="Word wrap"
          hint="Wrap long lines instead of scrolling sideways (Alt+Z)"
          checked={prefs.editorWrap}
          onChange={(editorWrap) => setPrefs({ editorWrap })}
        />
      </section>

      <section className="set-section">
        <h3>Interface</h3>

        <Toggle
          label="Expand reasoning by default"
          hint="Show the model's thinking blocks opened rather than collapsed"
          checked={prefs.expandThinking}
          onChange={(expandThinking) => setPrefs({ expandThinking })}
        />

        <div className="set-field">
          <span>Terminal shell</span>
          <input
            className="inp mono"
            value={prefs.terminalShell}
            placeholder="Let PiUI choose"
            aria-label="Terminal shell"
            onChange={(event) => setPrefs({ terminalShell: event.target.value })}
          />
          <small className="set-note">
            Full path to the shell the Terminal panel runs. Leave empty to use the system default —
            PowerShell on Windows, $SHELL elsewhere.
          </small>
        </div>
      </section>
    </>
  )
}
