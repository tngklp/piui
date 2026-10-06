import { usePiUi } from '../../store'
import {
  AUTOSAVE_MAX_MS,
  AUTOSAVE_MIN_MS,
  EDITOR_FONT_MAX,
  EDITOR_FONT_MIN,
  TAB_SIZE_OPTIONS,
  clampAutoSaveDelay,
  clampFontSize
} from '../../lib/ui-prefs'
import { Select, type SelectOption } from '../Select'
import { NumberField, Row, SettingsHeader, Switch } from './rows'

/** `0` means "follow the language's own convention". */
const TAB_SIZE_CHOICES: SelectOption<string>[] = TAB_SIZE_OPTIONS.map((size) => ({
  value: String(size),
  label: size === 0 ? 'Auto' : String(size)
}))

/** Typography and save behaviour for the file editor. */
export function EditorSettings() {
  const prefs = usePiUi((state) => state.prefs)
  const setPrefs = usePiUi((state) => state.setPrefs)

  return (
    <section className="set-section">
      <SettingsHeader title="Editor" subtitle="How files are shown and saved." />

      <h3>Typography</h3>
      <div className="gcard">
        <Row title="Font size" hint="Also adjustable with Ctrl+scroll inside the editor.">
          <NumberField
            label="Editor font size in pixels"
            value={prefs.editorFontSize}
            min={EDITOR_FONT_MIN}
            max={EDITOR_FONT_MAX}
            suffix="px"
            onCommit={(value) => setPrefs({ editorFontSize: clampFontSize(value) })}
          />
        </Row>

        <Row
          title="Font family"
          hint="Leave blank to use the bundled JetBrains Mono. Falls back if the font is not installed."
        >
          <input
            className="inp mono"
            value={prefs.editorFontFamily}
            placeholder="JetBrains Mono"
            aria-label="Editor font family"
            spellCheck={false}
            onChange={(event) => setPrefs({ editorFontFamily: event.target.value })}
          />
        </Row>

        <Row title="Tab size" hint="Spaces per indent level. Auto uses each language's convention.">
          <Select
            value={String(prefs.editorTabSize)}
            options={TAB_SIZE_CHOICES}
            title="Tab size"
            onChange={(value) => setPrefs({ editorTabSize: Number(value) })}
          />
        </Row>

        <Row
          title="Word wrap"
          hint="Wrap long lines instead of scrolling sideways. Alt+Z toggles it too."
        >
          <Switch
            label="Word wrap"
            checked={prefs.editorWrap}
            onChange={(editorWrap) => setPrefs({ editorWrap })}
          />
        </Row>

        <Row
          title="Indent guides"
          hint="Draw a faint vertical line at every indent level of the current line."
        >
          <Switch
            label="Indent guides"
            checked={prefs.editorIndentGuides}
            onChange={(editorIndentGuides) => setPrefs({ editorIndentGuides })}
          />
        </Row>
      </div>

      <h3>Saving</h3>
      <div className="gcard">
        <Row
          title="Format on save"
          hint="Run Prettier over the buffer before writing. Files it cannot parse are saved unchanged."
        >
          <Switch
            label="Format on save"
            checked={prefs.editorFormatOnSave}
            onChange={(editorFormatOnSave) => setPrefs({ editorFormatOnSave })}
          />
        </Row>

        <Row
          title="Auto save"
          hint={
            prefs.editorAutoSave
              ? 'Writes shortly after you stop typing, so Ctrl+S is optional.'
              : 'Files are only written when you save them with Ctrl+S.'
          }
        >
          <Switch
            label="Auto save"
            checked={prefs.editorAutoSave}
            onChange={(editorAutoSave) => setPrefs({ editorAutoSave })}
          />
        </Row>

        <Row title="Auto save delay" hint="How long the pause has to last before the write.">
          <NumberField
            label="Auto save delay in milliseconds"
            value={prefs.editorAutoSaveDelayMs}
            min={AUTOSAVE_MIN_MS}
            max={AUTOSAVE_MAX_MS}
            step={100}
            suffix="ms"
            disabled={!prefs.editorAutoSave}
            onCommit={(value) => setPrefs({ editorAutoSaveDelayMs: clampAutoSaveDelay(value) })}
          />
        </Row>
      </div>
    </section>
  )
}
