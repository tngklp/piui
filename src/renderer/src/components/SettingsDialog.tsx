import { useEffect, useState } from 'react'
import { APPROVAL_TOOLS, type ApprovalAction, type ApprovalConfig } from '@shared/ipc'
import { usePiUi } from '../store'
import { THEMES } from '../theme/themes'
import { Select, type SelectOption } from './Select'

const ACTION_OPTIONS: SelectOption<ApprovalAction>[] = [
  { value: 'allow', label: 'Allow' },
  { value: 'ask', label: 'Ask' },
  { value: 'deny', label: 'Deny' }
]

/** Theme picker and per-tool approval policy. */
export function SettingsDialog() {
  const open = usePiUi((state) => state.settingsOpen)
  const close = usePiUi((state) => state.closeSettings)
  const config = usePiUi((state) => state.approvalConfig)
  const save = usePiUi((state) => state.saveApprovalConfig)
  const themeId = usePiUi((state) => state.themeId)
  const setTheme = usePiUi((state) => state.setTheme)

  const [draft, setDraft] = useState<ApprovalConfig | null>(null)

  useEffect(() => {
    setDraft(config ? { defaultPolicy: config.defaultPolicy, tools: { ...config.tools } } : null)
  }, [config, open])

  if (!open) return null

  const themeOptions: SelectOption<string>[] = THEMES.map((theme) => ({
    value: theme.id,
    label: theme.name
  }))

  const tools: string[] = Array.from(
    new Set<string>([...APPROVAL_TOOLS, ...Object.keys(draft?.tools ?? {})])
  )

  const setTool = (tool: string, action: ApprovalAction): void => {
    if (!draft) return
    setDraft({ ...draft, tools: { ...draft.tools, [tool]: action } })
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__backdrop" onClick={close} />
      <div className="modal__panel wide">
        <h2 className="modal__title">Settings</h2>

        <section className="set-section">
          <h3>Theme</h3>
          <Select value={themeId} options={themeOptions} onChange={setTheme} block title="Theme" />
        </section>

        <section className="set-section">
          <h3>Tool approval</h3>
          <p className="modal__hint">PiUI pauses and asks before running a tool set to Ask.</p>
          <div className="rules">
            {tools.map((tool) => (
              <div className="rule-row" key={tool}>
                <span className="label mono">{tool}</span>
                <span className="sp" />
                <Select
                  value={draft?.tools[tool] ?? draft?.defaultPolicy ?? 'allow'}
                  options={ACTION_OPTIONS}
                  onChange={(action) => setTool(tool, action)}
                  title={`${tool} approval`}
                />
              </div>
            ))}
          </div>
        </section>

        <div className="modal__actions">
          <span className="sp" />
          <button className="b" onClick={close}>
            Close
          </button>
          {draft ? (
            <button
              className="b pri"
              onClick={() => {
                void save(draft)
                close()
              }}
            >
              Save
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
