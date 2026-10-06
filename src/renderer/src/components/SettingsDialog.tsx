import { useEffect, useState } from 'react'
import type { ApprovalAction, ApprovalConfig, ApprovalRule } from '@shared/ipc'
import { usePiUi } from '../store'
import { AUTO_THEME_ID, THEMES } from '../theme/themes'

const ACTIONS: ApprovalAction[] = ['allow', 'ask', 'deny']

function newRule(): ApprovalRule {
  return {
    id: `rule-${Math.random().toString(36).slice(2, 9)}`,
    tool: 'bash',
    pattern: '*',
    action: 'ask'
  }
}

/** Appearance and tool-approval settings. */
export function SettingsDialog() {
  const open = usePiUi((state) => state.settingsOpen)
  const close = usePiUi((state) => state.closeSettings)
  const config = usePiUi((state) => state.approvalConfig)
  const save = usePiUi((state) => state.saveApprovalConfig)
  const themeId = usePiUi((state) => state.themeId)
  const setTheme = usePiUi((state) => state.setTheme)

  const [draft, setDraft] = useState<ApprovalConfig | null>(null)

  useEffect(() => {
    setDraft(
      config
        ? { defaultPolicy: config.defaultPolicy, rules: config.rules.map((rule) => ({ ...rule })) }
        : null
    )
  }, [config, open])

  if (!open) return null

  const light = THEMES.find((theme) => theme.appearance === 'light') ?? THEMES[0]
  const dark = THEMES.find((theme) => theme.appearance === 'dark') ?? THEMES[1] ?? THEMES[0]

  const update = (index: number, patch: Partial<ApprovalRule>): void => {
    if (!draft) return
    setDraft({
      ...draft,
      rules: draft.rules.map((rule, position) =>
        position === index ? { ...rule, ...patch } : rule
      )
    })
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__backdrop" onClick={close} />
      <div className="modal__panel wide">
        <h2 className="modal__title">Settings</h2>

        <section className="set-section">
          <h3>Appearance</h3>
          <div className="theme-grid">
            <button
              className={`theme-opt${themeId === AUTO_THEME_ID ? ' on' : ''}`}
              onClick={() => setTheme(AUTO_THEME_ID)}
            >
              <span className="nm">Match system</span>
              <span className="sw">
                {light ? (
                  <>
                    <i style={{ background: light.tokens.bg }} />
                    <i style={{ background: light.tokens.accent }} />
                    <i style={{ background: light.tokens.accentStrong }} />
                  </>
                ) : null}
                {dark ? (
                  <>
                    <i style={{ background: dark.tokens.bg }} />
                    <i style={{ background: dark.tokens.accent }} />
                    <i style={{ background: dark.tokens.accentStrong }} />
                  </>
                ) : null}
              </span>
            </button>

            {THEMES.map((theme) => (
              <button
                className={`theme-opt${themeId === theme.id ? ' on' : ''}`}
                key={theme.id}
                onClick={() => setTheme(theme.id)}
              >
                <span className="nm">{theme.name}</span>
                <span className="sw">
                  <i style={{ background: theme.tokens.bg }} />
                  <i style={{ background: theme.tokens.panel }} />
                  <i style={{ background: theme.tokens.accent }} />
                  <i style={{ background: theme.tokens.accentStrong }} />
                  <i style={{ background: theme.tokens.text }} />
                </span>
              </button>
            ))}
          </div>
          <p className="modal__hint">
            Adding a palette to <code>theme/themes.ts</code> makes it available here — no CSS
            changes needed.
          </p>
        </section>

        <section className="set-section">
          <h3>Tool approval</h3>

          {draft ? (
            <>
              <p className="modal__hint">
                Rules are evaluated in order and the first match wins. <code>tool</code> is a tool
                name or <code>*</code>; <code>pattern</code> is a glob matched against the shell
                command for <code>bash</code> and the file path for <code>edit</code>/
                <code>write</code>.
              </p>

              <div className="rule-row default">
                <span className="label">When no rule matches</span>
                <select
                  className="pick"
                  value={draft.defaultPolicy}
                  onChange={(event) =>
                    setDraft({ ...draft, defaultPolicy: event.target.value as ApprovalAction })
                  }
                >
                  {ACTIONS.map((action) => (
                    <option key={action} value={action}>
                      {action}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rules">
                {draft.rules.map((rule, index) => (
                  <div className="rule-row" key={rule.id}>
                    <input
                      className="modal__input mono tool"
                      value={rule.tool}
                      placeholder="tool"
                      onChange={(event) => update(index, { tool: event.target.value })}
                    />
                    <input
                      className="modal__input mono pattern"
                      value={rule.pattern}
                      placeholder="pattern"
                      onChange={(event) => update(index, { pattern: event.target.value })}
                    />
                    <select
                      className="pick"
                      value={rule.action}
                      onChange={(event) =>
                        update(index, { action: event.target.value as ApprovalAction })
                      }
                    >
                      {ACTIONS.map((action) => (
                        <option key={action} value={action}>
                          {action}
                        </option>
                      ))}
                    </select>
                    <button
                      className="b"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          rules: draft.rules.filter((_, position) => position !== index)
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {draft.rules.length === 0 ? (
                  <p className="modal__hint">No rules yet — the fallback policy applies.</p>
                ) : null}
              </div>
            </>
          ) : (
            <p className="modal__hint">The agent has not started yet, so rules are unavailable.</p>
          )}
        </section>

        <div className="modal__actions">
          {draft ? (
            <button
              className="b"
              onClick={() => setDraft({ ...draft, rules: [...draft.rules, newRule()] })}
            >
              Add rule
            </button>
          ) : null}
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
              Save rules
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
