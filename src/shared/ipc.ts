/**
 * Shared IPC contract between the PiUI main process and the renderer.
 *
 * Keep this module dependency-free — it is imported by both the Node-side
 * main process and the browser-side renderer, so it must not reference
 * Electron, Node built-ins, or DOM globals.
 */

export const IpcChannel = {
  /** Returns static application/runtime information. */
  AppInfo: 'piui:app:info',
  /** Describes the embedded SDK and the installed CLI. */
  RuntimeInfo: 'piui:runtime:info',
  AgentGetStatus: 'piui:agent:get-status',
  AgentGetMessages: 'piui:agent:get-messages',
  AgentGetModels: 'piui:agent:get-models',
  AgentGetStats: 'piui:agent:get-stats',
  AgentPrompt: 'piui:agent:prompt',
  AgentSteer: 'piui:agent:steer',
  AgentFollowUp: 'piui:agent:follow-up',
  AgentAbort: 'piui:agent:abort',
  AgentClearQueue: 'piui:agent:clear-queue',
  AgentNewSession: 'piui:agent:new-session',
  AgentCompact: 'piui:agent:compact',
  AgentSetModel: 'piui:agent:set-model',
  AgentCycleModel: 'piui:agent:cycle-model',
  AgentSetThinking: 'piui:agent:set-thinking'
} as const

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel]

/** Push channels sent from the main process to the renderer. */
export const IpcEvent = {
  AgentEvent: 'piui:agent:event',
  Notice: 'piui:notice'
} as const

export type IpcEvent = (typeof IpcEvent)[keyof typeof IpcEvent]

/** Static information about the running PiUI application. */
export interface AppInfo {
  /** Application name, e.g. `PiUI`. */
  name: string
  /** Application version from package.json. */
  version: string
  /** Host platform, e.g. `win32`, `linux`. */
  platform: string
  /** Underlying runtime versions. */
  versions: {
    electron: string
    chrome: string
    node: string
    v8: string
  }
}

/** Reasoning effort supported by a model. */
export type ThinkingLevelDto = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** A model PiUI can select, flattened for the renderer. */
export interface ModelDto {
  provider: string
  id: string
  name: string
  reasoning: boolean
  contextWindow: number
  input: string[]
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number }
}

/** Token usage against the active model's context window. */
export interface ContextUsageDto {
  /** Estimated context tokens, or null right after compaction. */
  tokens: number | null
  contextWindow: number
  percent: number | null
}

/** Full session snapshot used to drive the header, footer, and status UI. */
export interface SessionStatusDto {
  cwd: string
  model: ModelDto | null
  thinkingLevel: ThinkingLevelDto
  availableThinkingLevels: ThinkingLevelDto[]
  supportsThinking: boolean
  isStreaming: boolean
  isCompacting: boolean
  isRetrying: boolean
  sessionId: string
  sessionFile: string | null
  sessionName: string | null
  messageCount: number
  pendingMessageCount: number
  steering: string[]
  followUp: string[]
  contextUsage: ContextUsageDto | null
  cost: number
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number }
}

/** Cumulative usage statistics for the session. */
export interface SessionStatsDto {
  sessionFile: string | null
  sessionId: string
  userMessages: number
  assistantMessages: number
  toolCalls: number
  toolResults: number
  totalMessages: number
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number }
  cost: number
}

/** Version information for the embedded SDK and the installed CLI. */
export interface RuntimeInfoDto {
  sdkVersion: string
  cliVersion: string | null
  cliPath: string | null
  versionMatch: boolean
  agentDir: string
  node: string
}

/** A renderable block inside an assistant turn. */
export type ChatBlockDto =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'toolCall'; id: string; name: string; arguments: unknown }

/** A renderable transcript entry. */
export type ChatItemDto =
  | { kind: 'user'; id: string; text: string; imageCount: number }
  | {
      kind: 'assistant'
      id: string
      blocks: ChatBlockDto[]
      error?: string
      stopped?: boolean
    }
  | {
      kind: 'toolResult'
      id: string
      toolCallId: string
      toolName: string
      text: string
      isError: boolean
    }
  | { kind: 'bash'; id: string; command: string; output: string; exitCode: number | null }

/** A session event forwarded from the main process, already JSON-safe. */
export type AgentEventDto = { type: string } & Record<string, unknown>

/** A transient message to show in the UI. */
export interface NoticeDto {
  level: 'info' | 'warning' | 'error'
  message: string
}

/** Input for sending a prompt to the agent. */
export interface PromptInput {
  text: string
  images?: { type: 'image'; data: string; mimeType: string }[]
  /** Required when the agent is already streaming. */
  streamingBehavior?: 'steer' | 'followUp'
}

/**
 * The API surface PiUI exposes to the renderer as `window.piui`.
 * Every method is implemented in the preload script and backed by IPC.
 */
export interface PiUiApi {
  getAppInfo(): Promise<AppInfo>
  getRuntimeInfo(): Promise<RuntimeInfoDto>
  getStatus(): Promise<SessionStatusDto>
  getMessages(): Promise<ChatItemDto[]>
  getModels(): Promise<ModelDto[]>
  getStats(): Promise<SessionStatsDto>
  prompt(input: PromptInput): Promise<void>
  steer(text: string): Promise<void>
  followUp(text: string): Promise<void>
  abort(): Promise<void>
  clearQueue(): Promise<{ steering: string[]; followUp: string[] }>
  newSession(): Promise<void>
  compact(customInstructions?: string): Promise<void>
  setModel(provider: string, id: string): Promise<void>
  cycleModel(): Promise<void>
  setThinkingLevel(level: ThinkingLevelDto): Promise<void>
  /** Subscribe to session events. Returns an unsubscribe function. */
  onAgentEvent(listener: (event: AgentEventDto) => void): () => void
  /** Subscribe to transient notices. Returns an unsubscribe function. */
  onNotice(listener: (notice: NoticeDto) => void): () => void
}
