import { create } from 'zustand'
import type {
  AgentEventDto,
  ApprovalConfig,
  ChatItemDto,
  ModelDto,
  NoticeDto,
  RuntimeInfoDto,
  SessionStatusDto,
  ThinkingLevelDto,
  UiRequestDto,
  UiResponseDto
} from '@shared/ipc'

/** Live assistant output accumulated from streaming deltas. */
export interface StreamingState {
  text: string
  thinking: string
  tools: { id: string; name: string; argsText: string }[]
}

/** A tool currently executing, shown as an activity row. */
export interface RunningTool {
  id: string
  name: string
}

/** Event payload shapes PiUI reads out of the opaque agent event stream. */
interface AssistantUpdate {
  type: string
  delta?: string
  content?: string
  id?: string
  toolName?: string
  toolCall?: { id?: string; name?: string; arguments?: unknown }
  reason?: string
}

interface PiUiState {
  initialized: boolean
  error: string | null
  runtime: RuntimeInfoDto | null
  status: SessionStatusDto | null
  models: ModelDto[]
  items: ChatItemDto[]
  streaming: StreamingState | null
  runningTools: RunningTool[]
  notices: (NoticeDto & { id: number })[]
  busy: boolean
  /** A dialog the agent or an extension is waiting on, if any. */
  dialog: UiRequestDto | null
  /** Current tool-approval policy. */
  approvalConfig: ApprovalConfig | null
  /** Whether the approval-rules panel is open. */
  settingsOpen: boolean
  initialize: () => Promise<void>
  refresh: () => Promise<void>
  ingest: (event: AgentEventDto) => void
  dismissNotice: (id: number) => void
  respondToDialog: (response: UiResponseDto) => Promise<void>
  openSettings: () => void
  closeSettings: () => void
  saveApprovalConfig: (config: ApprovalConfig) => Promise<void>
  send: (text: string, mode?: 'prompt' | 'steer' | 'followUp') => Promise<void>
  abort: () => Promise<void>
  newSession: () => Promise<void>
  compact: () => Promise<void>
  selectModel: (provider: string, id: string) => Promise<void>
  selectThinking: (level: ThinkingLevelDto) => Promise<void>
}

let noticeId = 0

function emptyStreaming(): StreamingState {
  return { text: '', thinking: '', tools: [] }
}

function describeError(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  return String(cause)
}

export const usePiUi = create<PiUiState>()((set, get) => ({
  initialized: false,
  error: null,
  runtime: null,
  status: null,
  models: [],
  items: [],
  streaming: null,
  runningTools: [],
  notices: [],
  busy: false,
  dialog: null,
  approvalConfig: null,
  settingsOpen: false,

  initialize: async () => {
    if (get().initialized) return
    window.piui.onAgentEvent((event) => get().ingest(event))
    window.piui.onNotice((notice) => {
      noticeId += 1
      set((state) => ({ notices: [...state.notices, { ...notice, id: noticeId }].slice(-4) }))
    })
    window.piui.onUiRequest((request) => set({ dialog: request }))
    set({ initialized: true })

    try {
      const [runtime, status, messages, models, approvalConfig] = await Promise.all([
        window.piui.getRuntimeInfo(),
        window.piui.getStatus(),
        window.piui.getMessages(),
        window.piui.getModels(),
        window.piui.getApprovalConfig()
      ])
      set({ runtime, status, items: messages, models, approvalConfig, error: null })
    } catch (cause) {
      set({ error: describeError(cause) })
    }
  },

  refresh: async () => {
    try {
      const [status, messages] = await Promise.all([
        window.piui.getStatus(),
        window.piui.getMessages()
      ])
      set({ status, items: messages })
    } catch (cause) {
      set({ error: describeError(cause) })
    }
  },

  ingest: (event) => {
    switch (event.type) {
      case 'message_start': {
        const message = event.message as { role?: string } | undefined
        if (message?.role === 'assistant') set({ streaming: emptyStreaming() })
        break
      }

      case 'message_update': {
        const update = event.assistantMessageEvent as AssistantUpdate | undefined
        if (!update) break
        set((state) => {
          const stream = state.streaming ?? emptyStreaming()
          switch (update.type) {
            case 'text_delta':
              return { streaming: { ...stream, text: stream.text + (update.delta ?? '') } }
            case 'text_end':
              return { streaming: { ...stream, text: update.content ?? stream.text } }
            case 'thinking_delta':
              return { streaming: { ...stream, thinking: stream.thinking + (update.delta ?? '') } }
            case 'thinking_end':
              return { streaming: { ...stream, thinking: update.content ?? stream.thinking } }
            case 'toolcall_start':
              return {
                streaming: {
                  ...stream,
                  tools: [
                    ...stream.tools,
                    { id: update.id ?? '', name: update.toolName ?? 'tool', argsText: '' }
                  ]
                }
              }
            case 'toolcall_delta': {
              const tools = stream.tools.map((tool, index) =>
                index === stream.tools.length - 1
                  ? { ...tool, argsText: tool.argsText + (update.delta ?? '') }
                  : tool
              )
              return { streaming: { ...stream, tools } }
            }
            case 'toolcall_end': {
              const tools = stream.tools.map((tool, index) =>
                index === stream.tools.length - 1
                  ? {
                      ...tool,
                      id: update.toolCall?.id ?? tool.id,
                      name: update.toolCall?.name ?? tool.name,
                      argsText: JSON.stringify(update.toolCall?.arguments ?? {})
                    }
                  : tool
              )
              return { streaming: { ...stream, tools } }
            }
            default:
              return {}
          }
        })
        if (update.type === 'error') {
          set({ error: update.reason ?? 'The model stream ended with an error.' })
        }
        break
      }

      case 'message_end':
        set({ streaming: null })
        void get().refresh()
        break

      case 'tool_execution_start': {
        const id = String(event.toolCallId ?? '')
        const name = String(event.toolName ?? 'tool')
        set((state) => ({
          runningTools: [...state.runningTools.filter((tool) => tool.id !== id), { id, name }]
        }))
        break
      }

      case 'tool_execution_end':
        set((state) => ({
          runningTools: state.runningTools.filter(
            (tool) => tool.id !== String(event.toolCallId ?? '')
          )
        }))
        void get().refresh()
        break

      case 'agent_settled':
        set({ streaming: null, runningTools: [], busy: false })
        void get().refresh()
        break

      case 'queue_update':
        set((state) => ({
          status: state.status
            ? {
                ...state.status,
                steering: [...((event.steering as string[]) ?? [])],
                followUp: [...((event.followUp as string[]) ?? [])],
                pendingMessageCount:
                  ((event.steering as string[]) ?? []).length +
                  ((event.followUp as string[]) ?? []).length
              }
            : state.status
        }))
        break

      case 'thinking_level_changed':
        void get().refresh()
        break

      case 'session_info_changed':
        void get().refresh()
        break

      case 'piui_bind_error':
        set({ error: `Failed to load extensions: ${String(event.message ?? '')}` })
        break

      default:
        break
    }
  },

  dismissNotice: (id) => set((state) => ({ notices: state.notices.filter((n) => n.id !== id) })),

  respondToDialog: async (response) => {
    set({ dialog: null })
    try {
      await window.piui.respondToUi(response)
    } catch {
      // The dialog may already have timed out in the main process.
    }
  },

  openSettings: () => set({ settingsOpen: true }),

  closeSettings: () => set({ settingsOpen: false }),

  saveApprovalConfig: async (config) => {
    try {
      await window.piui.setApprovalConfig(config)
      set({ approvalConfig: config })
    } catch (cause) {
      set({ error: describeError(cause) })
    }
  },

  send: async (text, mode = 'prompt') => {
    const trimmed = text.trim()
    if (trimmed.length === 0) return
    set({ busy: true, error: null })

    try {
      if (mode === 'steer') await window.piui.steer(trimmed)
      else if (mode === 'followUp') await window.piui.followUp(trimmed)
      else await window.piui.prompt({ text: trimmed })
      await get().refresh()
    } catch (cause) {
      set({ error: describeError(cause), busy: false })
    }
  },

  abort: async () => {
    try {
      await window.piui.abort()
    } catch (cause) {
      set({ error: describeError(cause) })
    } finally {
      set({ busy: false })
      await get().refresh()
    }
  },

  newSession: async () => {
    set({ busy: true, streaming: null, runningTools: [] })
    try {
      await window.piui.newSession()
      await get().refresh()
    } catch (cause) {
      set({ error: describeError(cause) })
    } finally {
      set({ busy: false })
    }
  },

  compact: async () => {
    set({ busy: true })
    try {
      await window.piui.compact()
      await get().refresh()
    } catch (cause) {
      set({ error: describeError(cause) })
    } finally {
      set({ busy: false })
    }
  },

  selectModel: async (provider, id) => {
    try {
      await window.piui.setModel(provider, id)
      await get().refresh()
    } catch (cause) {
      set({ error: describeError(cause) })
    }
  },

  selectThinking: async (level) => {
    try {
      await window.piui.setThinkingLevel(level)
      await get().refresh()
    } catch (cause) {
      set({ error: describeError(cause) })
    }
  }
}))
