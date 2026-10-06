import { APPROVAL_TOOLS, type ApprovalAction } from '@shared/ipc'
import { usePiUi } from '../../store'
import { Select, type SelectOption } from '../Select'

const ACTION_OPTIONS: SelectOption<ApprovalAction>[] = [
  { value: 'allow', label: 'Allow' },
  { value: 'ask', label: 'Ask' },
  { value: 'deny', label: 'Deny' }
]

/** Per-tool approval policy. Every change is saved immediately. */
export function ToolsSettings() {
  const config = usePiUi((state) => state.approvalConfig)
  const save = usePiUi((state) => state.saveApprovalConfig)

  const tools = Array.from(
    new Set<string>([...APPROVAL_TOOLS, ...Object.keys(config?.tools ?? {})])
  )
  const policyOf = (tool: string): ApprovalAction =>
    config?.tools[tool] ?? config?.defaultPolicy ?? 'allow'

  const setTool = (tool: string, action: ApprovalAction): void => {
    if (!config) return
    void save({ ...config, tools: { ...config.tools, [tool]: action } })
  }

  return (
    <section className="set-section">
      <h3>Tool approval</h3>
      <p className="modal__hint">
        PiUI pauses and asks before running a tool set to <b>Ask</b>.
      </p>

      <div className="rules">
        <div className="rule-row">
          <span className="label">Everything else</span>
          <span className="sp" />
          <Select
            value={config?.defaultPolicy ?? 'allow'}
            options={ACTION_OPTIONS}
            title="Default approval for unlisted tools"
            onChange={(action) => {
              if (config) void save({ ...config, defaultPolicy: action })
            }}
          />
        </div>

        {tools.map((tool) => (
          <div className="rule-row" key={tool}>
            <span className="label mono">{tool}</span>
            <span className="sp" />
            <Select
              value={policyOf(tool)}
              options={ACTION_OPTIONS}
              title={`${tool} approval`}
              onChange={(action) => setTool(tool, action)}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
