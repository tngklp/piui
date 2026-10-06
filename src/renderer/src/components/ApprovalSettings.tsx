import { useEffect, useState } from 'react'
import type { ApprovalAction, ApprovalConfig, ApprovalRule } from '@shared/ipc'
import { usePiUi } from '../store'

const ACTIONS: ApprovalAction[] = ['allow', 'ask', 'deny']

function newRule(): ApprovalRule {
  return {
    id: `rule-${Math.random().toString(36).slice(2, 9)}`,
    tool: 'bash',
    pattern: '*',
    action: 'ask'
  }
}

/** Editor for the ordered tool-approval rule list. */
export function ApprovalSettings() {
  const open = usePiUi((state) => state.settingsOpen)
  const config = usePiUi((state) => state.approvalConfig)
  const close = usePiUi((state) => state.closeSettings)
  const save = usePiUi((state) => state.saveApprovalConfig)
  const [draft, setDraft] = useState<ApprovalConfig | null>(null)

  useEffect(() => {
    setDraft(
      config
        ? { defaultPolicy: config.defaultPolicy, rules: config.rules.map((rule) => ({ ...rule })) }
        : null
    )
  }, [config, open])

  if (!open || !draft) return null

  const update = (index: number, patch: Partial<ApprovalRule>): void => {
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
      <div className="modal__panel modal__panel--wide">
        <h2 className="modal__title">Tool approval rules</h2>
        <p className="modal__hint">
          Rules are evaluated in order and the first match wins. <code>tool</code> is a tool name or{' '}
          <code>*</code>. <code>pattern</code> is a glob matched against the shell command for{' '}
          <code>bash</code> and the file path for <code>edit</code>, <code>write</code>, and{' '}
          <code>read</code>. Use <code>*</code> to match anything.
        </p>

        <div className="rule-row rule-row--default">
          <span className="rule-row__label">When no rule matches</span>
          <select
            className="control"
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
                className="modal__input rule-row__tool"
                value={rule.tool}
                placeholder="tool"
                onChange={(event) => update(index, { tool: event.target.value })}
              />
              <input
                className="modal__input rule-row__pattern"
                value={rule.pattern}
                placeholder="pattern"
                onChange={(event) => update(index, { pattern: event.target.value })}
              />
              <select
                className="control"
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
                className="button"
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
            <p className="modal__hint">No rules yet — the fallback policy above applies.</p>
          ) : null}
        </div>

        <div className="modal__actions">
          <button
            className="button"
            onClick={() => setDraft({ ...draft, rules: [...draft.rules, newRule()] })}
          >
            Add rule
          </button>
          <span className="modal__spacer" />
          <button className="button" onClick={close}>
            Cancel
          </button>
          <button
            className="button button--primary"
            onClick={() => {
              void save(draft)
              close()
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
