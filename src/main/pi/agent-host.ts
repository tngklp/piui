import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  type AgentSession,
  type InlineExtension,
  type PromptOptions
} from '@earendil-works/pi-coding-agent'
import type {
  ChatBlockDto,
  ChatItemDto,
  ModelDto,
  MonitorRequestDto,
  PromptInput,
  SessionStatsDto,
  SessionStatusDto,
  SessionSummaryDto,
  ThinkingLevelDto,
  WorkspaceDto
} from '@shared/ipc'
import { listAllSessions, listSessions, workspaceName } from './session-store'
import { createUiHost, type UiTransport } from './ui-context'

/** The model shape PiUI reads from the SDK. */
type SdkModel = NonNullable<AgentSession['model']>
/** A thinking level accepted by the SDK. */
type SdkThinkingLevel = Parameters<AgentSession['setThinkingLevel']>[0]
/** Image attachments accepted by the SDK prompt API. */
type SdkPromptImages = NonNullable<PromptOptions['images']>

/** Loose view of a persisted agent message, used only for rendering. */
interface SdkMessage {
  role: string
  content?: unknown
  toolCallId?: string
  toolName?: string
  isError?: boolean
  details?: unknown
  command?: string
  output?: string
  exitCode?: number
  stopReason?: string
  errorMessage?: string
}

interface SdkContentBlock {
  type: string
  text?: string
  thinking?: string
  id?: string
  name?: string
  arguments?: unknown
}

interface SdkContextUsage {
  tokens: number | null
  contextWindow: number
  percent?: number | null
}

export interface AgentHostOptions {
  cwd: string
  /** Called for every session event with a JSON-safe payload. */
  emitEvent: (event: unknown) => void
  transport: UiTransport
  /** Inline extension that enforces PiUI's approval rules. */
  approvalExtension: InlineExtension
}

function toModelDto(model: SdkModel | undefined): ModelDto | null {
  if (!model) return null
  const cost = model.cost as
    { input?: number; output?: number; cacheRead?: number; cacheWrite?: number } | undefined
  return {
    provider: model.provider,
    id: model.id,
    name: model.name ?? model.id,
    reasoning: model.reasoning ?? false,
    contextWindow: model.contextWindow ?? 0,
    input: [...(model.input ?? ['text'])],
    cost: {
      input: cost?.input ?? 0,
      output: cost?.output ?? 0,
      cacheRead: cost?.cacheRead ?? 0,
      cacheWrite: cost?.cacheWrite ?? 0
    }
  }
}

function blocksFromContent(content: unknown): ChatBlockDto[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  if (!Array.isArray(content)) return []

  const blocks: ChatBlockDto[] = []
  for (const raw of content) {
    const block = raw as SdkContentBlock
    if (block.type === 'text' && typeof block.text === 'string') {
      blocks.push({ type: 'text', text: block.text })
    } else if (block.type === 'thinking' && typeof block.thinking === 'string') {
      blocks.push({ type: 'thinking', text: block.thinking })
    } else if (
      block.type === 'toolCall' &&
      typeof block.id === 'string' &&
      typeof block.name === 'string'
    ) {
      blocks.push({ type: 'toolCall', id: block.id, name: block.name, arguments: block.arguments })
    }
  }
  return blocks
}

function textFromContent(content: unknown): string {
  return blocksFromContent(content)
    .filter((block): block is Extract<ChatBlockDto, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('')
}

function countImages(content: unknown): number {
  if (!Array.isArray(content)) return 0
  return content.filter((block) => (block as { type?: string }).type === 'image').length
}

/** Count `+`/`-` lines in a display diff for the badges shown in the UI. */
function countDiffLines(diff: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) added += 1
    else if (line.startsWith('-')) removed += 1
  }
  return { added, removed }
}

/** Convert persisted agent messages into renderer-friendly items. */
export function toChatItems(messages: readonly unknown[]): ChatItemDto[] {
  const items: ChatItemDto[] = []

  // First pass: index tool-call arguments so results can show paths and diffs.
  const toolCalls = new Map<string, Record<string, unknown>>()
  for (const raw of messages) {
    const message = raw as SdkMessage
    if (message.role !== 'assistant' || !Array.isArray(message.content)) continue
    for (const block of message.content as SdkContentBlock[]) {
      if (block.type === 'toolCall' && typeof block.id === 'string') {
        toolCalls.set(block.id, (block.arguments as Record<string, unknown>) ?? {})
      }
    }
  }

  messages.forEach((raw, index) => {
    const message = raw as SdkMessage
    const id = `m${index}`

    switch (message.role) {
      case 'user':
        items.push({
          kind: 'user',
          id,
          text: textFromContent(message.content),
          imageCount: countImages(message.content)
        })
        break

      case 'assistant': {
        const item: Extract<ChatItemDto, { kind: 'assistant' }> = {
          kind: 'assistant',
          id,
          blocks: blocksFromContent(message.content)
        }
        if (message.stopReason === 'aborted') item.stopped = true
        if (message.stopReason === 'error' || message.errorMessage) {
          item.error = message.errorMessage ?? 'The model request failed.'
        }
        items.push(item)
        break
      }

      case 'toolResult': {
        const args = toolCalls.get(message.toolCallId ?? '')
        const details = message.details as { diff?: string; patch?: string } | undefined
        const item: Extract<ChatItemDto, { kind: 'toolResult' }> = {
          kind: 'toolResult',
          id,
          toolCallId: message.toolCallId ?? '',
          toolName: message.toolName ?? 'tool',
          text: textFromContent(message.content),
          isError: message.isError ?? false
        }

        const filePath = args?.path ?? args?.file_path
        if (typeof filePath === 'string') item.filePath = filePath
        if (typeof details?.patch === 'string') item.patch = details.patch
        if (typeof details?.diff === 'string') {
          item.diff = details.diff
          const counts = countDiffLines(details.diff)
          item.addedLines = counts.added
          item.removedLines = counts.removed
        }

        items.push(item)
        break
      }

      case 'bashExecution':
        items.push({
          kind: 'bash',
          id,
          command: message.command ?? '',
          output: message.output ?? '',
          exitCode: message.exitCode ?? null
        })
        break

      default:
        // System, custom, and summary messages are not rendered as chat items yet.
        break
    }
  })

  return items
}

/** JSON-safe copy so events survive structured clone across IPC. */
function sanitize(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value)) as unknown
  } catch {
    return { type: 'unserializable_event' }
  }
}

/**
 * Owns the Pi agent session for the GUI.
 *
 * One AgentSession is live at a time. Its events are forwarded to the renderer,
 * and every mutation the UI can request is exposed as an explicit method so the
 * IPC layer stays a thin pass-through.
 */
export class AgentHost {
  private session!: AgentSession
  private unsubscribe: (() => void) | undefined
  private cwd: string
  private readonly options: AgentHostOptions
  private readonly uiHost: ReturnType<typeof createUiHost>

  private constructor(options: AgentHostOptions) {
    this.cwd = options.cwd
    this.options = options
    this.uiHost = createUiHost(options.transport)
  }

  static async create(options: AgentHostOptions): Promise<AgentHost> {
    const host = new AgentHost(options)
    host.applySession(await host.openSession())
    return host
  }

  /** Build a session for the current cwd, optionally restoring a session store. */
  private async openSession(sessionManager?: SessionManager): Promise<AgentSession> {
    const agentDir = getAgentDir()
    const resourceLoader = new DefaultResourceLoader({
      cwd: this.cwd,
      agentDir,
      extensionFactories: [this.options.approvalExtension]
    })
    await resourceLoader.reload()

    const { session } = await createAgentSession({
      cwd: this.cwd,
      agentDir,
      resourceLoader,
      ...(sessionManager ? { sessionManager } : {})
    })
    return session
  }

  private applySession(session: AgentSession): void {
    this.session = session
    this.attach(session)
  }

  /** Tear the current session down and start a new one. */
  private async replaceSession(sessionManager?: SessionManager): Promise<void> {
    const previous = this.session
    this.unsubscribe?.()
    this.unsubscribe = undefined

    const session = await this.openSession(sessionManager)
    this.applySession(session)

    // Dispose after the replacement so a creation failure leaves the UI usable.
    try {
      previous.dispose()
    } catch {
      // The previous session may already be torn down.
    }
  }

  /** Subscribe to session events and bind extensions to the GUI host. */
  private attach(session: AgentSession): void {
    this.unsubscribe = session.subscribe((event) => {
      this.options.emitEvent(sanitize(event))
    })

    void session.bindExtensions({ uiContext: this.uiHost, mode: 'rpc' }).catch((error: unknown) => {
      this.options.emitEvent({ type: 'piui_bind_error', message: String(error) })
    })
  }

  async getStatus(): Promise<SessionStatusDto> {
    const session = this.session
    const stats = session.getSessionStats()
    const usage = session.getContextUsage() as SdkContextUsage | undefined

    return {
      cwd: this.cwd,
      model: toModelDto(session.model),
      thinkingLevel: session.thinkingLevel as ThinkingLevelDto,
      availableThinkingLevels: session.getAvailableThinkingLevels() as ThinkingLevelDto[],
      supportsThinking: session.supportsThinking(),
      isStreaming: session.isStreaming,
      isCompacting: session.isCompacting,
      isRetrying: session.isRetrying,
      sessionId: session.sessionId,
      sessionFile: session.sessionFile ?? null,
      sessionName: session.sessionName ?? null,
      messageCount: session.messages.length,
      pendingMessageCount: session.pendingMessageCount,
      steering: [...session.getSteeringMessages()],
      followUp: [...session.getFollowUpMessages()],
      contextUsage: usage
        ? {
            tokens: usage.tokens,
            contextWindow: usage.contextWindow,
            percent: typeof usage.percent === 'number' ? usage.percent : null
          }
        : null,
      cost: stats.cost,
      tokens: { ...stats.tokens }
    }
  }

  getMessages(): ChatItemDto[] {
    return toChatItems(this.session.messages)
  }

  async getStats(): Promise<SessionStatsDto> {
    const stats = this.session.getSessionStats()
    return {
      sessionFile: stats.sessionFile ?? null,
      sessionId: stats.sessionId,
      userMessages: stats.userMessages,
      assistantMessages: stats.assistantMessages,
      toolCalls: stats.toolCalls,
      toolResults: stats.toolResults,
      totalMessages: stats.totalMessages,
      tokens: { ...stats.tokens },
      cost: stats.cost
    }
  }

  async getModels(): Promise<ModelDto[]> {
    const models = await this.session.modelRuntime.getAvailable()
    return models
      .map((model) => toModelDto(model))
      .filter((model): model is ModelDto => model !== null)
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async prompt(input: PromptInput): Promise<void> {
    const options: PromptOptions = {}
    if (input.images && input.images.length > 0) {
      options.images = input.images as SdkPromptImages
    }
    if (input.streamingBehavior) {
      options.streamingBehavior = input.streamingBehavior
    }
    await this.session.prompt(input.text, options)
  }

  async steer(text: string): Promise<void> {
    await this.session.steer(text)
  }

  async followUp(text: string): Promise<void> {
    await this.session.followUp(text)
  }

  async abort(): Promise<void> {
    await this.session.abort()
  }

  clearQueue(): { steering: string[]; followUp: string[] } {
    return this.session.clearQueue()
  }

  async setModel(provider: string, id: string): Promise<void> {
    const model = this.session.modelRuntime.getModel(provider, id)
    if (!model) throw new Error(`Unknown model: ${provider}/${id}`)
    await this.session.setModel(model)
  }

  async cycleModel(): Promise<void> {
    await this.session.cycleModel()
  }

  setThinkingLevel(level: ThinkingLevelDto): void {
    this.session.setThinkingLevel(level as SdkThinkingLevel)
  }

  async compact(customInstructions?: string): Promise<void> {
    await this.session.compact(customInstructions)
  }

  /** Replace the current session with a brand new one. */
  async newSession(): Promise<void> {
    await this.replaceSession(SessionManager.create(this.cwd))
  }

  /** Open a saved session file. */
  async switchSession(sessionPath: string): Promise<void> {
    await this.replaceSession(SessionManager.open(sessionPath))
  }

  /** Duplicate the active branch into a new session. */
  async forkSession(): Promise<void> {
    const source = this.session.sessionFile
    if (!source) {
      await this.newSession()
      return
    }
    const fork = SessionManager.forkFrom(source, this.cwd)
    await this.replaceSession(fork)
  }

  /** Set the display name of the current session. */
  renameSession(name: string): void {
    this.session.setSessionName(name)
  }

  /** Sessions recorded for the current workspace. */
  async listSessions(): Promise<SessionSummaryDto[]> {
    return listSessions(this.cwd)
  }

  /** Sessions recorded across every workspace. */
  async listAllSessions(): Promise<SessionSummaryDto[]> {
    return listAllSessions()
  }

  getWorkspace(): WorkspaceDto {
    return { cwd: this.cwd, name: workspaceName(this.cwd) }
  }

  /** Point the agent at a different working directory and start a fresh session. */
  async setWorkspace(cwd: string): Promise<WorkspaceDto> {
    this.cwd = cwd
    await this.replaceSession(SessionManager.create(cwd))
    return this.getWorkspace()
  }

  /** Inference endpoint details for the active model. */
  getModelEndpoint(): {
    baseUrl: string | null
    model: string | null
    contextWindow: number | null
  } {
    const model = this.session.model as (SdkModel & { baseUrl?: string }) | undefined
    return {
      baseUrl: typeof model?.baseUrl === 'string' ? model.baseUrl : null,
      model: model ? `${model.provider}/${model.id}` : null,
      contextWindow: model?.contextWindow ?? null
    }
  }

  /** Recently completed turns, newest first, for the monitor's request table. */
  getRecentRequests(limit: number): MonitorRequestDto[] {
    const requests: MonitorRequestDto[] = []

    for (const raw of this.session.messages) {
      const message = raw as {
        role?: string
        model?: string
        timestamp?: number
        usage?: { input?: number; output?: number }
      }
      if (message.role !== 'assistant' || !message.usage) continue

      requests.push({
        at: new Date(message.timestamp ?? Date.now()).toISOString(),
        model: message.model ?? '',
        promptTokens: message.usage.input ?? 0,
        answerTokens: message.usage.output ?? 0
      })
    }

    return requests.slice(-limit).reverse()
  }

  dispose(): void {
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.session.dispose()
  }
}
