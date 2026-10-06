import { create } from 'zustand'
import type {
  AgentEventDto,
  ApprovalConfig,
  ChatItemDto,
  CommandDto,
  ModelDto,
  ModelsConfigDto,
  MonitorSnapshotDto,
  NoticeDto,
  RuntimeInfoDto,
  SessionStatusDto,
  SessionSummaryDto,
  ThinkingLevelDto,
  UiRequestDto,
  UiResponseDto,
  WorkspaceDto
} from '@shared/ipc'
import { loadThemeId, saveThemeId } from './theme/preference'
import { applyTheme, resolveTheme } from './theme/themes'
import { loadUiPreferences, saveUiPreferences, type UiPreferences } from './lib/ui-prefs'

/** Right-hand panel views. */
export type RightTab = 'files' | 'term' | 'mon'
/** Main column views. */
export type MainTab = 'chat' | 'editor'
/** Settings sections. */
export type SettingsTab = 'customization' | 'models' | 'packages' | 'tools'
/** Sidebar session filters. */
export type SessionFilter = 'all' | 'running' | 'starred'

const STARRED_KEY = 'piui.starred'

function loadStarred(): string[] {
  try {
    const raw = localStorage.getItem(STARRED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : []
  } catch {
    return []
  }
}

function saveStarred(paths: string[]): void {
  try {
    localStorage.setItem(STARRED_KEY, JSON.stringify(paths))
  } catch {
    // Storage may be unavailable; stars still apply for this session.
  }
}

/** Live assistant output accumulated from streaming deltas. */
export interface StreamingState {
  text: string
  thinking: string
  /** True while thinking deltas are still arriving. */
  thinkingLive: boolean
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
  /** Slash commands discovered from skills and prompt templates. */
  commands: CommandDto[]
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
  /** Settings section currently showing. */
  settingsTab: SettingsTab
  /** Provider/model catalogue from `models.json`. */
  modelsConfig: ModelsConfigDto | null
  /** Why `models.json` could not be used, if it could not. */
  modelsError: string | null
  /** Increments whenever a global shortcut asks for the session search box. */
  searchFocusSeq: number
  /** Saved sessions for the current workspace, newest first. */
  sessions: SessionSummaryDto[]
  /** The working directory the agent is operating on. */
  workspace: WorkspaceDto | null
  /** Saved sessions across every workspace, for the recents list. */
  allSessions: SessionSummaryDto[]
  /** Session paths the user starred, persisted locally. */
  starred: string[]
  sessionQuery: string
  sessionFilter: SessionFilter
  /** Theme id from the theme registry. */
  themeId: string
  /** Persisted interface preferences. */
  prefs: UiPreferences
  rightOpen: boolean
  rightTab: RightTab
  rightWidth: number
  welcomeOpen: boolean
  /** Whether the Ctrl+P file picker is showing. */
  quickOpen: boolean
  /** File selected in the explorer. */
  selectedFile: string | null
  /** Which main column view is showing. */
  mainTab: MainTab
  /** Files open in the editor, in tab order. */
  openFiles: string[]
  /** File the editor is showing. */
  activeFile: string | null
  monitor: MonitorSnapshotDto | null
  initialize: () => Promise<void>
  refresh: () => Promise<void>
  ingest: (event: AgentEventDto) => void
  dismissNotice: (id: number) => void
  respondToDialog: (response: UiResponseDto) => Promise<void>
  openSettings: () => void
  closeSettings: () => void
  setSettingsTab: (tab: SettingsTab) => void
  focusSearch: () => void
  saveApprovalConfig: (config: ApprovalConfig) => Promise<void>
  loadModelsConfig: () => Promise<void>
  saveModelsConfig: (config: ModelsConfigDto) => Promise<void>
  loadSessions: () => Promise<void>
  loadCommands: () => Promise<void>
  switchSession: (path: string) => Promise<void>
  renameSession: (name: string) => Promise<void>
  forkSession: () => Promise<void>
  changeWorkspace: () => Promise<void>
  openWorkspace: (path: string) => Promise<void>
  setTheme: (id: string) => void
  /** Merge and persist interface preferences. */
  setPrefs: (patch: Partial<UiPreferences>) => void
  setRightTab: (tab: RightTab) => void
  toggleRight: () => void
  setRightWidth: (width: number) => void
  openWelcome: () => void
  closeWelcome: () => void
  openQuickOpen: () => void
  closeQuickOpen: () => void
  setSessionQuery: (query: string) => void
  setSessionFilter: (filter: SessionFilter) => void
  toggleStar: (path: string) => void
  loadAllSessions: () => Promise<void>
  selectFile: (path: string | null) => void
  setMonitor: (snapshot: MonitorSnapshotDto | null) => void
  setMainTab: (tab: MainTab) => void
  openFile: (path: string) => void
  closeFile: (path: string) => void
  setActiveFile: (path: string) => void
  deleteSession: (path: string) => Promise<void>
  send: (text: string, mode?: 'prompt' | 'steer' | 'followUp') => Promise<void>
  abort: () => Promise<void>
  newSession: () => Promise<void>
  compact: () => Promise<void>
  selectModel: (provider: string, id: string) => Promise<void>
  selectThinking: (level: ThinkingLevelDto) => Promise<void>
}

let noticeId = 0

function emptyStreaming(): StreamingState {
  return { text: '', thinking: '', thinkingLive: false, tools: [] }
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
  commands: [],
  items: [],
  streaming: null,
  runningTools: [],
  notices: [],
  busy: false,
  dialog: null,
  approvalConfig: null,
  settingsOpen: false,
  settingsTab: 'customization',
  modelsConfig: null,
  modelsError: null,
  searchFocusSeq: 0,
  sessions: [],
  workspace: null,
  allSessions: [],
  starred: loadStarred(),
  sessionQuery: '',
  sessionFilter: 'all',
  themeId: loadThemeId(),
  prefs: loadUiPreferences(),
  rightOpen: true,
  rightTab: 'files',
  rightWidth: 360,
  welcomeOpen: true,
  quickOpen: false,
  selectedFile: null,
  mainTab: 'chat',
  openFiles: [],
  activeFile: null,
  monitor: null,

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
      const [runtime, status, messages, models, approvalConfig, workspace, sessions, commands] =
        await Promise.all([
          window.piui.getRuntimeInfo(),
          window.piui.getStatus(),
          window.piui.getMessages(),
          window.piui.getModels(),
          window.piui.getApprovalConfig(),
          window.piui.getWorkspace(),
          window.piui.listSessions(),
          window.piui.getCommands()
        ])
      set({
        runtime,
        status,
        items: messages,
        models,
        approvalConfig,
        workspace,
        sessions,
        commands,
        error: null
      })
      void get().loadAllSessions()
      void get().loadModelsConfig()
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
              return {
                streaming: {
                  ...stream,
                  thinking: stream.thinking + (update.delta ?? ''),
                  thinkingLive: true
                }
              }
            case 'thinking_end':
              return {
                streaming: {
                  ...stream,
                  thinking: update.content ?? stream.thinking,
                  thinkingLive: false
                }
              }
            case 'toolcall_start':
              return {
                streaming: {
                  ...stream,
                  // Reaching a tool call means reasoning for this turn is done.
                  thinkingLive: false,
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
        void get().loadSessions()
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

  setSettingsTab: (tab) => set({ settingsTab: tab }),

  focusSearch: () => set((state) => ({ searchFocusSeq: state.searchFocusSeq + 1 })),

  loadModelsConfig: async () => {
    try {
      set({ modelsConfig: await window.piui.getModelsConfig() })
    } catch (cause) {
      set({ error: describeError(cause) })
    }
  },

  saveModelsConfig: async (config) => {
    // Show the edit immediately; the write is idempotent and cheap.
    set({ modelsConfig: config })
    try {
      const result = await window.piui.setModelsConfig(config)
      set({ modelsConfig: result.config, models: result.models, modelsError: result.error })
    } catch (cause) {
      set({ error: describeError(cause) })
    }
  },

  loadSessions: async () => {
    try {
      set({ sessions: await window.piui.listSessions() })
    } catch {
      // The session list is advisory; ignore failures.
    }
  },

  loadCommands: async () => {
    try {
      set({ commands: await window.piui.getCommands() })
    } catch {
      // Command discovery is advisory; the built-ins still work.
    }
  },

  switchSession: async (path) => {
    if (get().status?.sessionFile === path) return
    set({ busy: true, streaming: null, runningTools: [], items: [] })
    try {
      await window.piui.switchSession(path)
      await get().refresh()
      await get().loadSessions()
    } catch (cause) {
      set({ error: describeError(cause) })
    } finally {
      set({ busy: false })
    }
  },

  renameSession: async (name) => {
    try {
      await window.piui.renameSession(name)
      await get().refresh()
      await get().loadSessions()
    } catch (cause) {
      set({ error: describeError(cause) })
    }
  },

  forkSession: async () => {
    set({ busy: true, streaming: null, runningTools: [], items: [] })
    try {
      await window.piui.forkSession()
      await get().refresh()
      await get().loadSessions()
    } catch (cause) {
      set({ error: describeError(cause) })
    } finally {
      set({ busy: false })
    }
  },

  changeWorkspace: async () => {
    const picked = await window.piui.pickWorkspace()
    if (!picked) return
    await get().openWorkspace(picked)
  },

  openWorkspace: async (path) => {
    try {
      set({ busy: true, streaming: null, runningTools: [], items: [], selectedFile: null })
      const workspace = await window.piui.setWorkspace(path)
      set({ workspace, welcomeOpen: false })
      await get().refresh()
      await get().loadSessions()
      await get().loadAllSessions()
      await get().loadCommands()
    } catch (cause) {
      set({ error: describeError(cause) })
    } finally {
      set({ busy: false })
    }
  },

  setTheme: (id) => {
    saveThemeId(id)
    applyTheme(resolveTheme(id))
    set({ themeId: id })
  },

  setPrefs: (patch) => {
    const prefs = { ...get().prefs, ...patch }
    saveUiPreferences(prefs)
    set({ prefs })
  },

  setRightTab: (tab) => set({ rightTab: tab, rightOpen: true }),

  toggleRight: () => set((state) => ({ rightOpen: !state.rightOpen })),

  setRightWidth: (width) => set({ rightWidth: width }),

  openWelcome: () => set({ welcomeOpen: true }),

  closeWelcome: () => set({ welcomeOpen: false }),

  openQuickOpen: () => set({ quickOpen: true }),

  closeQuickOpen: () => set({ quickOpen: false }),

  setSessionQuery: (query) => set({ sessionQuery: query }),

  setSessionFilter: (filter) => set({ sessionFilter: filter }),

  toggleStar: (path) => {
    const starred = get().starred.includes(path)
      ? get().starred.filter((item) => item !== path)
      : [...get().starred, path]
    saveStarred(starred)
    set({ starred })
  },

  loadAllSessions: async () => {
    try {
      set({ allSessions: await window.piui.listAllSessions() })
    } catch {
      // Recents are advisory; ignore failures.
    }
  },

  selectFile: (path) => set({ selectedFile: path }),

  setMonitor: (snapshot) => set({ monitor: snapshot }),

  setMainTab: (tab) => set({ mainTab: tab }),

  openFile: (path) =>
    set((state) => ({
      openFiles: state.openFiles.includes(path) ? state.openFiles : [...state.openFiles, path],
      activeFile: path,
      selectedFile: path,
      mainTab: 'editor'
    })),

  closeFile: (path) =>
    set((state) => {
      const openFiles = state.openFiles.filter((file) => file !== path)
      return {
        openFiles,
        activeFile:
          state.activeFile === path ? (openFiles[openFiles.length - 1] ?? null) : state.activeFile,
        mainTab: openFiles.length === 0 ? 'chat' : state.mainTab
      }
    }),

  setActiveFile: (path) => set({ activeFile: path, selectedFile: path }),

  deleteSession: async (path) => {
    set({ busy: true })
    try {
      await window.piui.deleteSession(path)
      await get().refresh()
      await get().loadSessions()
      await get().loadAllSessions()
    } catch (cause) {
      set({ error: describeError(cause) })
    } finally {
      set({ busy: false })
    }
  },

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
    set({ busy: true, streaming: null, runningTools: [], items: [] })
    try {
      await window.piui.newSession()
      await get().refresh()
      await get().loadSessions()
      await get().loadCommands()
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
