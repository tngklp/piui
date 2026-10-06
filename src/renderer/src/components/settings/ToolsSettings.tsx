import { APPROVAL_TOOLS, type ApprovalAction } from '@shared/ipc'
import { usePiUi } from '../../store'
import { Select, type SelectOption } from '../Select'
import { Row, SettingsHeader } from './rows'

const ACTION_OPTIONS: SelectOption<ApprovalAction>[] = [
  { value: 'allow', label: 'Allow' },
  { value: 'ask', label: 'Ask' },
  { value: 'deny', label: 'Deny' }
]

/** One-line explanation of each policy, shown under the tool name. */
const ACTION_HINTS: Record<ApprovalAction, string> = {
  allow: 'Runs immediately, without asking.',
  ask: 'Pauses the agent and shows an approval card in the transcript.',
  deny: 'Blocked outright; the agent is told it is not allowed.'
}

/** Per-tool approval policy. Every change is saved immediately. */
export function ToolsSettings() {
  const config = usePiUi((state) => state.approvalConfig)
  const save = usePiUi((state) => state.saveApprovalConfig)

  const tools = Array.from(
    new Set<string>([...APPROVAL_TOOLS, ...Object.keys(config?.tools ?? {})])
  ).sort()
  const policyOf = (tool: string): ApprovalAction =>
    config?.tools[tool] ?? config?.defaultPolicy ?? 'allow'

  const setTool = (tool: string, action: ApprovalAction): void => {
    if (!config) return
    void save({ ...config, tools: { ...config.tools, [tool]: action } })
  }

  const setDefault = (action: ApprovalAction): void => {
    if (config) void save({ ...config, defaultPolicy: action })
  }

  const defaultPolicy = config?.defaultPolicy ?? 'allow'

  return (
    <section className="set-section">
      <SettingsHeader
        title="Tools"
        subtitle="Decide what PiUI does before the agent runs a tool."
      />

      <h3>Everything else</h3>
      <div className="gcard">
        <Row
          title="Default policy"
          hint={`Applied to any tool without its own rule below. ${ACTION_HINTS[defaultPolicy]}`}
        >
          <Select
            value={defaultPolicy}
            options={ACTION_OPTIONS}
            title="Default approval for unlisted tools"
            onChange={setDefault}
          />
        </Row>
      </div>

      <h3>Per tool</h3>
      <div className="gcard">
        {tools.map((tool) => {
          const policy = policyOf(tool)
          return (
            <Row key={tool} title={tool} hint={ACTION_HINTS[policy]}>
              <Select
                value={policy}
                options={ACTION_OPTIONS}
                title={`${tool} approval`}
                onChange={(action) => setTool(tool, action)}
              />
            </Row>
          )
        })}
      </div>

      <p className="set-note">
        Read-only tools are safe to allow. Leave the ones that run commands or change files on{' '}
        <b>Ask</b> so you can review them first.
      </p>
    </section>
  )
}
