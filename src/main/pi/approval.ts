import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type {
  ExtensionAPI,
  ExtensionFactory,
  InlineExtension
} from '@earendil-works/pi-coding-agent'
import type { ApprovalAction, ApprovalConfig } from '@shared/ipc'

/** Default policy: mutating tools ask first, read-only tools run. */
export const DEFAULT_APPROVAL_CONFIG: ApprovalConfig = {
  defaultPolicy: 'allow',
  tools: {
    bash: 'ask',
    powershell: 'ask',
    edit: 'ask',
    write: 'ask'
  }
}

function isAction(value: unknown): value is ApprovalAction {
  return value === 'allow' || value === 'ask' || value === 'deny'
}

/**
 * Coerce a stored config into the current shape. Older files used an ordered
 * rule list with glob patterns; the first action seen per tool is kept.
 */
function normalizeConfig(value: unknown): ApprovalConfig {
  if (typeof value !== 'object' || value === null) {
    return { defaultPolicy: 'allow', tools: { ...DEFAULT_APPROVAL_CONFIG.tools } }
  }

  const raw = value as Partial<ApprovalConfig> & { rules?: unknown }
  const tools: Record<string, ApprovalAction> = {}

  if (Array.isArray(raw.rules)) {
    for (const entry of raw.rules) {
      const rule = entry as { tool?: unknown; action?: unknown }
      if (typeof rule.tool !== 'string' || rule.tool === '*') continue
      if (!isAction(rule.action)) continue
      if (!(rule.tool in tools)) tools[rule.tool] = rule.action
    }
  }

  if (raw.tools && typeof raw.tools === 'object') {
    for (const [tool, action] of Object.entries(raw.tools)) {
      if (isAction(action)) tools[tool] = action
    }
  }

  return {
    defaultPolicy: isAction(raw.defaultPolicy) ? raw.defaultPolicy : 'ask',
    tools
  }
}

/** What a tool call is acting on: a command for bash, otherwise a path. */
export function subjectFor(toolName: string, input: Record<string, unknown>): string {
  const candidates = ['command', 'path', 'file_path', 'pattern', 'query', 'url']
  for (const key of candidates) {
    const value = input[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return toolName
}

/** Resolve the configured action for a tool. */
export function evaluateApproval(config: ApprovalConfig, tool: string): ApprovalAction {
  return config.tools[tool] ?? config.tools['*'] ?? config.defaultPolicy
}

/** Truncate long subjects so a dialog stays readable. */
function clip(value: string, max = 600): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

/**
 * Owns the approval policy: the persisted per-tool actions, session-scoped
 * "allow" decisions, and the inline extension that enforces them.
 */
export class ApprovalManager {
  private config: ApprovalConfig = {
    defaultPolicy: 'allow',
    tools: { ...DEFAULT_APPROVAL_CONFIG.tools }
  }

  private readonly sessionAllow = new Set<string>()
  private readonly filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
  }

  async load(): Promise<void> {
    try {
      this.config = normalizeConfig(JSON.parse(await readFile(this.filePath, 'utf8')))
    } catch {
      // First run, or the file is unreadable: keep the defaults.
    }
  }

  getConfig(): ApprovalConfig {
    return { defaultPolicy: this.config.defaultPolicy, tools: { ...this.config.tools } }
  }

  async setConfig(config: ApprovalConfig): Promise<void> {
    this.config = normalizeConfig(config)
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, `${JSON.stringify(this.config, null, 2)}\n`, 'utf8')
  }

  /** Resolve the policy for a call, honouring session-scoped allowances. */
  decide(tool: string): ApprovalAction {
    if (this.sessionAllow.has(tool)) return 'allow'
    return evaluateApproval(this.config, tool)
  }

  /** The inline extension that asks the user before risky tool calls. */
  extension(): InlineExtension {
    const factory: ExtensionFactory = (pi: ExtensionAPI) => {
      pi.on('tool_call', async (event, ctx) => {
        const tool = event.toolName
        const action = this.decide(tool)

        if (action === 'allow') return undefined

        if (action === 'deny') {
          return { block: true, reason: `Blocked by a PiUI approval setting for "${tool}".` }
        }

        const input = (event.input ?? {}) as unknown as Record<string, unknown>
        const choice = await ctx.ui.select(
          `${tool} wants to run:\n\n${clip(subjectFor(tool, input))}`,
          ['Allow once', 'Allow for this session', 'Deny']
        )

        if (choice === 'Allow once') return undefined

        if (choice === 'Allow for this session') {
          this.sessionAllow.add(tool)
          return undefined
        }

        return { block: true, reason: 'Denied by the user in PiUI.' }
      })
    }

    return { name: 'piui-approval', factory }
  }
}
