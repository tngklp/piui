import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type {
  ExtensionAPI,
  ExtensionFactory,
  InlineExtension
} from '@earendil-works/pi-coding-agent'
import type { ApprovalAction, ApprovalConfig, ApprovalRule } from '@shared/ipc'

/**
 * PiUI's default policy mirrors the project plan: read-only tools run freely,
 * while every mutating tool asks first.
 */
export const DEFAULT_APPROVAL_CONFIG: ApprovalConfig = {
  defaultPolicy: 'allow',
  rules: [
    { id: 'ask-bash', tool: 'bash', pattern: '*', action: 'ask' },
    { id: 'ask-powershell', tool: 'powershell', pattern: '*', action: 'ask' },
    { id: 'ask-edit', tool: 'edit', pattern: '*', action: 'ask' },
    { id: 'ask-write', tool: 'write', pattern: '*', action: 'ask' }
  ]
}

function isAction(value: unknown): value is ApprovalAction {
  return value === 'allow' || value === 'ask' || value === 'deny'
}

function normalizeRule(value: unknown): ApprovalRule | null {
  if (typeof value !== 'object' || value === null) return null
  const rule = value as Partial<ApprovalRule>
  if (typeof rule.tool !== 'string' || typeof rule.pattern !== 'string') return null
  return {
    id:
      typeof rule.id === 'string' && rule.id.length > 0 ? rule.id : `${rule.tool}:${rule.pattern}`,
    tool: rule.tool,
    pattern: rule.pattern,
    action: isAction(rule.action) ? rule.action : 'ask'
  }
}

/** Translate a glob (`*`, `?`) into an anchored, case-insensitive regex. */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const body = escaped.replace(/\\\*/g, '.*').replace(/\\\?/g, '.')
  return new RegExp(`^${body}$`, 'i')
}

function matchesTool(ruleTool: string, tool: string): boolean {
  return ruleTool === '*' || ruleTool.toLowerCase() === tool.toLowerCase()
}

/** The value a rule pattern is matched against: a command for bash, else a path. */
export function subjectFor(toolName: string, input: Record<string, unknown>): string {
  const candidates = ['command', 'path', 'file_path', 'pattern', 'query', 'url']
  for (const key of candidates) {
    const value = input[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return toolName
}

/** First matching rule wins; otherwise the fallback policy applies. */
export function evaluateApproval(
  config: ApprovalConfig,
  tool: string,
  subject: string
): ApprovalAction {
  for (const rule of config.rules) {
    if (!matchesTool(rule.tool, tool)) continue
    if (!globToRegExp(rule.pattern).test(subject)) continue
    return rule.action
  }
  return config.defaultPolicy
}

function sessionKey(tool: string, subject: string): string {
  return `${tool}\u0000${subject}`
}

/** Truncate long subjects so a dialog stays readable. */
function clip(value: string, max = 600): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

/**
 * Owns the approval policy: persisted rules, session-scoped allow decisions,
 * and the inline extension that enforces them on every tool call.
 */
export class ApprovalManager {
  private config: ApprovalConfig = DEFAULT_APPROVAL_CONFIG
  private readonly sessionAllow = new Set<string>()
  private readonly filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<ApprovalConfig>
      if (parsed && Array.isArray(parsed.rules)) {
        this.config = {
          defaultPolicy: isAction(parsed.defaultPolicy) ? parsed.defaultPolicy : 'ask',
          rules: parsed.rules
            .map(normalizeRule)
            .filter((rule): rule is ApprovalRule => rule !== null)
        }
      }
    } catch {
      // First run, or the file is unreadable: keep the defaults.
    }
  }

  getConfig(): ApprovalConfig {
    return { defaultPolicy: this.config.defaultPolicy, rules: [...this.config.rules] }
  }

  async setConfig(config: ApprovalConfig): Promise<void> {
    this.config = {
      defaultPolicy: isAction(config.defaultPolicy) ? config.defaultPolicy : 'ask',
      rules: config.rules.map(normalizeRule).filter((rule): rule is ApprovalRule => rule !== null)
    }
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, `${JSON.stringify(this.config, null, 2)}\n`, 'utf8')
  }

  /** Resolve the policy for a call, honouring session-scoped allowances. */
  decide(tool: string, subject: string): ApprovalAction {
    if (this.sessionAllow.has(sessionKey(tool, subject))) return 'allow'
    return evaluateApproval(this.config, tool, subject)
  }

  allowForSession(tool: string, subject: string): void {
    this.sessionAllow.add(sessionKey(tool, subject))
  }

  /** The inline extension that asks the user before risky tool calls. */
  extension(): InlineExtension {
    const factory: ExtensionFactory = (pi: ExtensionAPI) => {
      pi.on('tool_call', async (event, ctx) => {
        const tool = event.toolName
        const input = (event.input ?? {}) as unknown as Record<string, unknown>
        const subject = subjectFor(tool, input)
        const action = this.decide(tool, subject)

        if (action === 'allow') return undefined

        if (action === 'deny') {
          return { block: true, reason: `Blocked by a PiUI approval rule for "${tool}".` }
        }

        const choice = await ctx.ui.select(`${tool} wants to run:\n\n${clip(subject)}`, [
          'Allow once',
          'Allow for this session',
          'Deny'
        ])

        if (choice === 'Allow once' || choice === 'Allow for this session') {
          if (choice === 'Allow for this session') this.allowForSession(tool, subject)
          return undefined
        }

        return { block: true, reason: 'Denied by the user in PiUI.' }
      })
    }

    return { name: 'piui-approval', factory }
  }
}
