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
  AgentSetThinking: 'piui:agent:set-thinking',
  /** Resolve a pending extension-UI dialog opened by the main process. */
  UiRespond: 'piui:ui:respond',
  /** Read or replace the tool-approval rules. */
  ApprovalGetConfig: 'piui:approval:get-config',
  ApprovalSetConfig: 'piui:approval:set-config',
  SessionsList: 'piui:sessions:list',
  SessionsListAll: 'piui:sessions:list-all',
  SessionsSwitch: 'piui:sessions:switch',
  SessionsRename: 'piui:sessions:rename',
  SessionsFork: 'piui:sessions:fork',
  WorkspaceGet: 'piui:workspace:get',
  WorkspacePick: 'piui:workspace:pick',
  WorkspaceSet: 'piui:workspace:set',
  FsList: 'piui:fs:list',
  MonitorGet: 'piui:monitor:get'
} as const

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel]

/** Push channels sent from the main process to the renderer. */
export const IpcEvent = {
  AgentEvent: 'piui:agent:event',
  Notice: 'piui:notice',
  /** A dialog an extension (or PiUI itself) is waiting on. */
  UiRequest: 'piui:ui:request'
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
      /** Display diff produced by the edit tool. */
      diff?: string
      /** Unified patch produced by the edit tool. */
      patch?: string
      /** Absolute or relative path the tool acted on, when known. */
      filePath?: string
      /** Line counts for diff badges. */
      addedLines?: number
      removedLines?: number
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

/** A dialog the agent or an extension is waiting on the user to answer. */
export type UiRequestDto =
  | { id: string; method: 'select'; title: string; options: string[] }
  | { id: string; method: 'confirm'; title: string; message: string; danger?: boolean }
  | { id: string; method: 'input'; title: string; placeholder?: string }
  | { id: string; method: 'editor'; title: string; prefill?: string }

/** The renderer's answer to a {@link UiRequestDto}. */
export type UiResponseDto =
  | { id: string; cancelled: true }
  | { id: string; value: string }
  | { id: string; confirmed: boolean }

/** What PiUI does when a tool call matches a rule. */
export type ApprovalAction = 'allow' | 'ask' | 'deny'

/**
 * One approval rule. Rules are evaluated in order and the first match wins.
 * `tool` is a tool name or `*`; `pattern` is a glob matched against the tool's
 * subject (a shell command for `bash`, a file path for `edit`/`write`/`read`).
 */
export interface ApprovalRule {
  id: string
  tool: string
  pattern: string
  action: ApprovalAction
}

/** The complete approval policy: ordered rules plus a fallback. */
export interface ApprovalConfig {
  defaultPolicy: ApprovalAction
  rules: ApprovalRule[]
}

/** One saved session, flattened for the session browser. */
export interface SessionSummaryDto {
  path: string
  id: string
  cwd: string
  name: string | null
  /** ISO 8601 timestamp. */
  created: string
  /** ISO 8601 timestamp. */
  modified: string
  messageCount: number
  /** First user message, used as a fallback title. */
  firstMessage: string
  parentSessionPath: string | null
}

/** The working directory the agent is currently operating on. */
export interface WorkspaceDto {
  cwd: string
  /** Leaf folder name, for display. */
  name: string
}

/** One entry in the file explorer. */
export interface FsEntryDto {
  name: string
  path: string
  kind: 'file' | 'directory'
  /** Working-tree status when the folder is in a git repository. */
  status?: 'M' | 'U'
}

/** A directory listing for the explorer. */
export interface FsListingDto {
  path: string
  entries: FsEntryDto[]
  /** Set when the path is outside the workspace or unreadable. */
  error: string | null
}

/** One GPU as reported by nvidia-smi. */
export interface MonitorGpuDto {
  name: string
  /** Percent, 0-100. */
  utilization: number
  /** MiB. */
  memoryUsed: number
  /** MiB. */
  memoryTotal: number
  powerWatts: number | null
}

/** One finished model request, derived from the session transcript. */
export interface MonitorRequestDto {
  at: string
  model: string
  promptTokens: number
  answerTokens: number
}

/** Everything the Monitor tab renders. */
export interface MonitorSnapshotDto {
  /** ISO 8601 timestamp of the snapshot. */
  at: string
  engine: {
    /** Whether the inference endpoint answered a metrics request. */
    available: boolean
    model: string | null
    endpoint: string | null
    contextWindow: number | null
    error: string | null
  }
  speed: {
    answerTokensPerSecond: number | null
    promptTokensPerSecond: number | null
    /** Answer speed history, oldest first, for the sparkline. */
    history: number[]
  }
  kvCache: {
    usageRatio: number | null
    tokens: number | null
  }
  requests: {
    processing: number
    deferred: number
  }
  gpus: MonitorGpuDto[]
  recent: MonitorRequestDto[]
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
  /** Subscribe to extension-UI dialogs. Returns an unsubscribe function. */
  onUiRequest(listener: (request: UiRequestDto) => void): () => void
  /** Answer a pending extension-UI dialog. */
  respondToUi(response: UiResponseDto): Promise<void>
  /** Read the current tool-approval rules. */
  getApprovalConfig(): Promise<ApprovalConfig>
  /** Replace the tool-approval rules. */
  setApprovalConfig(config: ApprovalConfig): Promise<void>
  /** List saved sessions for the current workspace, newest first. */
  listSessions(): Promise<SessionSummaryDto[]>
  /** List saved sessions across every workspace, newest first. */
  listAllSessions(): Promise<SessionSummaryDto[]>
  /** Open an existing session file. */
  switchSession(path: string): Promise<void>
  /** Set the display name of the current session. */
  renameSession(name: string): Promise<void>
  /** Duplicate the current session into a new one. */
  forkSession(): Promise<void>
  /** Read the current workspace. */
  getWorkspace(): Promise<WorkspaceDto>
  /** Show a folder picker; resolves to null when the user cancels. */
  pickWorkspace(): Promise<string | null>
  /** Switch the agent to a different working directory. */
  setWorkspace(path: string): Promise<WorkspaceDto>
  /** List a directory for the file explorer. */
  listDirectory(path: string): Promise<FsListingDto>
  /** Read the current monitor snapshot. */
  getMonitor(): Promise<MonitorSnapshotDto>
}
