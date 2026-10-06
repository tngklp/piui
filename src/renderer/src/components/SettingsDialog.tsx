import { usePiUi, type SettingsTab } from '../store'
import { CustomizationSettings } from './settings/CustomizationSettings'
import { ModelsSettings } from './settings/ModelsSettings'
import { PackagesSettings } from './settings/PackagesSettings'
import { ToolsSettings } from './settings/ToolsSettings'

const TABS: { id: SettingsTab; label: string; hint: string }[] = [
  { id: 'models', label: 'Models', hint: 'Providers and models' },
  { id: 'customization', label: 'Customization', hint: 'Theme and appearance' },
  { id: 'packages', label: 'Packages', hint: 'Skills and extensions' },
  { id: 'tools', label: 'Tools', hint: 'Approval policy' }
]

/**
 * Tabbed settings dialog. Nothing here has a save button — every control writes
 * through to its store action as soon as it changes.
 */
export function SettingsDialog() {
  const open = usePiUi((state) => state.settingsOpen)
  const close = usePiUi((state) => state.closeSettings)
  const tab = usePiUi((state) => state.settingsTab)
  const setTab = usePiUi((state) => state.setSettingsTab)

  if (!open) return null

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="modal__backdrop" onClick={close} />
      <div className="modal__panel wide settings">
        <nav className="settings__nav" role="tablist" aria-orientation="vertical">
          <h2 className="settings__title">Settings</h2>
          {TABS.map((entry) => (
            <button
              key={entry.id}
              role="tab"
              aria-selected={tab === entry.id}
              className={`settings__tab${tab === entry.id ? ' on' : ''}`}
              onClick={() => setTab(entry.id)}
            >
              <b>{entry.label}</b>
              <small>{entry.hint}</small>
            </button>
          ))}
        </nav>

        <div className="settings__body">
          {tab === 'customization' ? <CustomizationSettings /> : null}
          {tab === 'models' ? <ModelsSettings /> : null}
          {tab === 'packages' ? <PackagesSettings /> : null}
          {tab === 'tools' ? <ToolsSettings /> : null}
        </div>
      </div>
    </div>
  )
}
