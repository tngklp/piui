import { usePiUi } from '../../store'
import { THEMES } from '../../theme/themes'
import { Select, type SelectOption } from '../Select'

/** Theme picker. Each option previews the palette it applies. */
export function CustomizationSettings() {
  const themeId = usePiUi((state) => state.themeId)
  const setTheme = usePiUi((state) => state.setTheme)

  const options: SelectOption<string>[] = THEMES.map((theme) => ({
    value: theme.id,
    label: theme.name,
    swatch: [theme.tokens.bg, theme.tokens.panel, theme.tokens.accent, theme.tokens.text]
  }))

  return (
    <section className="set-section">
      <h3>Theme</h3>
      <p className="modal__hint">
        Colours apply immediately and are remembered for your next launch.
      </p>
      <Select value={themeId} options={options} onChange={setTheme} block title="Theme" />
    </section>
  )
}
