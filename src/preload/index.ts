import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IpcChannel,
  IpcEvent,
  type AgentEventDto,
  type ApprovalConfig,
  type ModelsConfigDto,
  type NoticeDto,
  type PiUiApi,
  type PromptInput,
  type TerminalCreateInput,
  type TerminalDataDto,
  type TerminalExitDto,
  type ThinkingLevelDto,
  type UiRequestDto,
  type UiResponseDto
} from '@shared/ipc'

/** Bridge an ipcRenderer event channel to a listener, returning an unsubscribe function. */
function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => {
    ipcRenderer.removeListener(channel, wrapped)
  }
}

const api: PiUiApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannel.AppInfo),
  getRuntimeInfo: () => ipcRenderer.invoke(IpcChannel.RuntimeInfo),
  getStatus: () => ipcRenderer.invoke(IpcChannel.AgentGetStatus),
  getMessages: () => ipcRenderer.invoke(IpcChannel.AgentGetMessages),
  getModels: () => ipcRenderer.invoke(IpcChannel.AgentGetModels),
  getStats: () => ipcRenderer.invoke(IpcChannel.AgentGetStats),
  prompt: (input: PromptInput) => ipcRenderer.invoke(IpcChannel.AgentPrompt, input),
  steer: (text: string) => ipcRenderer.invoke(IpcChannel.AgentSteer, text),
  followUp: (text: string) => ipcRenderer.invoke(IpcChannel.AgentFollowUp, text),
  abort: () => ipcRenderer.invoke(IpcChannel.AgentAbort),
  clearQueue: () => ipcRenderer.invoke(IpcChannel.AgentClearQueue),
  newSession: () => ipcRenderer.invoke(IpcChannel.AgentNewSession),
  compact: (customInstructions?: string) =>
    ipcRenderer.invoke(IpcChannel.AgentCompact, customInstructions),
  setModel: (provider: string, id: string) =>
    ipcRenderer.invoke(IpcChannel.AgentSetModel, provider, id),
  cycleModel: () => ipcRenderer.invoke(IpcChannel.AgentCycleModel),
  setThinkingLevel: (level: ThinkingLevelDto) =>
    ipcRenderer.invoke(IpcChannel.AgentSetThinking, level),
  onAgentEvent: (listener) => subscribe<AgentEventDto>(IpcEvent.AgentEvent, listener),
  onNotice: (listener) => subscribe<NoticeDto>(IpcEvent.Notice, listener),
  onUiRequest: (listener) => subscribe<UiRequestDto>(IpcEvent.UiRequest, listener),
  respondToUi: (response: UiResponseDto) => ipcRenderer.invoke(IpcChannel.UiRespond, response),
  getApprovalConfig: () => ipcRenderer.invoke(IpcChannel.ApprovalGetConfig),
  setApprovalConfig: (config: ApprovalConfig) =>
    ipcRenderer.invoke(IpcChannel.ApprovalSetConfig, config),
  listSessions: () => ipcRenderer.invoke(IpcChannel.SessionsList),
  listAllSessions: () => ipcRenderer.invoke(IpcChannel.SessionsListAll),
  switchSession: (path: string) => ipcRenderer.invoke(IpcChannel.SessionsSwitch, path),
  renameSession: (name: string) => ipcRenderer.invoke(IpcChannel.SessionsRename, name),
  forkSession: () => ipcRenderer.invoke(IpcChannel.SessionsFork),
  getWorkspace: () => ipcRenderer.invoke(IpcChannel.WorkspaceGet),
  pickWorkspace: () => ipcRenderer.invoke(IpcChannel.WorkspacePick),
  setWorkspace: (path: string) => ipcRenderer.invoke(IpcChannel.WorkspaceSet, path),
  listDirectory: (path: string) => ipcRenderer.invoke(IpcChannel.FsList, path),
  readFile: (path: string) => ipcRenderer.invoke(IpcChannel.FsRead, path),
  writeFile: (path: string, content: string) =>
    ipcRenderer.invoke(IpcChannel.FsWrite, path, content),
  deleteSession: (path: string) => ipcRenderer.invoke(IpcChannel.SessionsDelete, path),
  getMonitor: () => ipcRenderer.invoke(IpcChannel.MonitorGet),
  getModelsConfig: () => ipcRenderer.invoke(IpcChannel.ModelsGet),
  setModelsConfig: (config: ModelsConfigDto) => ipcRenderer.invoke(IpcChannel.ModelsSet, config),
  terminalCreate: (input: TerminalCreateInput) =>
    ipcRenderer.invoke(IpcChannel.TerminalCreate, input),
  terminalWrite: (id: string, data: string) =>
    ipcRenderer.invoke(IpcChannel.TerminalWrite, id, data),
  terminalResize: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke(IpcChannel.TerminalResize, id, cols, rows),
  terminalDispose: (id: string) => ipcRenderer.invoke(IpcChannel.TerminalDispose, id),
  onTerminalData: (listener) => subscribe<TerminalDataDto>(IpcEvent.TerminalData, listener),
  onTerminalExit: (listener) => subscribe<TerminalExitDto>(IpcEvent.TerminalExit, listener)
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('piui', api)
} else {
  // contextIsolation is always enabled by PiUI; this is a defensive fallback.
  Object.assign(globalThis, { piui: api })
}
