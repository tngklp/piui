import { usePiUi } from '../../store'
import { ICON_PACKS, fileIconUrl, folderIconUrl } from '../../lib/icon-packs'
import { THEMES, type ThemeVariant } from '../../theme/themes'
import { SettingsHeader } from './rows'

/** Small caption under each family name in the theme grid. */
const VARIANT_LABELS: Record<ThemeVariant, string> = {
  normal: 'Normal',
  dark: 'Dark',
  light: 'Light'
}

/** Files previewed in each icon-pack button: the ones every project has. */
const SAMPLES = ['index.ts', 'main.py', 'package.json', 'README.md']

/**
 * Appearance: the theme grid and the icon-pack grid.
 *
 * `THEMES` is ordered three variants per family, so the grid lays itself out
 * three to a row: a family's normal, dark, and light palettes side by side. The
 * icon packs follow the same idea, each button previewing the icons a project
 * actually shows in the explorer.
 */
export function CustomizationSettings() {
  const themeId = usePiUi((state) => state.themeId)
  const setTheme = usePiUi((state) => state.setTheme)
  const iconPack = usePiUi((state) => state.prefs.iconPack)
  const setPrefs = usePiUi((state) => state.setPrefs)

  return (
    <>
      <section className="set-section">
        <SettingsHeader title="Customization" subtitle="Theme and iconography." />

        <h3>Theme</h3>

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
        <h3>Icon pack</h3>

        <div className="packs" role="radiogroup" aria-label="Icon pack">
          {ICON_PACKS.map((pack) => (
            <button
              key={pack.id}
              type="button"
              role="radio"
              aria-checked={pack.id === iconPack}
              className={`pack${pack.id === iconPack ? ' on' : ''}`}
              title={pack.name}
              onClick={() => setPrefs({ iconPack: pack.id })}
            >
              <span className="pack__row">
                <img src={folderIconUrl(pack.id, 'src', false)} alt="" />
                <img src={folderIconUrl(pack.id, 'src', true)} alt="" />
                {SAMPLES.map((file) => (
                  <img key={file} src={fileIconUrl(pack.id, file)} alt="" />
                ))}
              </span>
              <span className="pack__name">{pack.name}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  )
}
