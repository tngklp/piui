import { usePiUi } from '../../store'
import { ICON_PACKS } from '../../lib/icon-packs'
import { THEMES, type ThemeVariant } from '../../theme/themes'
import { Select, type SelectOption } from '../Select'

/** Small caption under each family name in the theme grid. */
const VARIANT_LABELS: Record<ThemeVariant, string> = {
  normal: 'Normal',
  dark: 'Dark',
  light: 'Light'
}

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

/**
 * Appearance and interface behaviour.
 *
 * `THEMES` is ordered three variants per family, so the grid lays itself out
 * three to a row: a family's normal, dark, and light palettes side by side.
 */
export function CustomizationSettings() {
  const themeId = usePiUi((state) => state.themeId)
  const setTheme = usePiUi((state) => state.setTheme)
  const expandThinking = usePiUi((state) => state.prefs.expandThinking)
  const iconPack = usePiUi((state) => state.prefs.iconPack)
  const setPrefs = usePiUi((state) => state.setPrefs)

  const iconPackOptions: SelectOption<string>[] = ICON_PACKS.map((pack) => ({
    value: pack.id,
    label: pack.name
  }))

  return (
    <>
      <section className="set-section">
        <h3>Theme</h3>
        <p className="set-note">
          Every theme comes in three variants: the themed palette, the same accent on a neutral dark
          background, and a light version. The choice is remembered for your next launch.
        </p>

        <div className="themes" role="radiogroup" aria-label="Theme">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={theme.id === themeId}
              className={`theme${theme.id === themeId ? ' on' : ''}`}
              title={theme.name}
              onClick={() => setTheme(theme.id)}
            >
              <span className="theme__swatch" aria-hidden="true">
                <i style={{ background: theme.tokens.bg }} />
                <i style={{ background: theme.tokens.panel }} />
                <i style={{ background: theme.tokens.raise }} />
                <i style={{ background: theme.tokens.accent }} />
              </span>
              <span className="theme__text">
                <b>{theme.family}</b>
                <small>{VARIANT_LABELS[theme.variant]}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="set-section">
        <h3>Interface</h3>

        <div className="set-row">
          <span className="set-row__label">Icon pack</span>
          <Select
            value={iconPack}
            options={iconPackOptions}
            title="Icon pack"
            onChange={(pack) => setPrefs({ iconPack: pack })}
          />
          <small className="set-note">
            Icons used by the file explorer, the editor tabs, and quick open.
          </small>
        </div>

        <Toggle
          label="Expand reasoning by default"
          hint="Show the model's thinking blocks opened rather than collapsed"
          checked={expandThinking}
          onChange={(expandThinking) => setPrefs({ expandThinking })}
        />
      </section>
    </>
  )
}
