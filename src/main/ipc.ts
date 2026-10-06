import { app, ipcMain, type BrowserWindow } from 'electron'
import {
  IpcChannel,
  IpcEvent,
  type AppInfo,
  type PromptInput,
  type ThinkingLevelDto
} from '@shared/ipc'
import { AgentHost } from './pi/agent-host'
import { getRuntimeInfo } from './pi/runtime-info'
import type { UiTransport } from './pi/ui-context'

export interface IpcContext {
  /** Current main window, used to push agent events to the renderer. */
  getWindow: () => BrowserWindow | null
}

/** Working directory the agent operates in. Overridable for development. */
function resolveCwd(): string {
  return process.env.PIUI_CWD ?? process.cwd()
}

export function registerIpcHandlers(context: IpcContext): void {
  const send = (channel: string, payload: unknown): void => {
    const window = context.getWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }

  const transport: UiTransport = {
    notify: (notice) => send(IpcEvent.Notice, notice),
    setStatus: (key, text) => send(IpcEvent.AgentEvent, { type: 'piui_status', key, text }),
    setWidget: (key, lines, placement) =>
      send(IpcEvent.AgentEvent, { type: 'piui_widget', key, lines, placement }),
    setTitle: (title) => send(IpcEvent.AgentEvent, { type: 'piui_title', title }),
    setEditorText: (text) => send(IpcEvent.AgentEvent, { type: 'piui_editor_text', text }),
    log: (message) => send(IpcEvent.Notice, { level: 'info', message })
  }

  let hostPromise: Promise<AgentHost> | null = null

  const host = (): Promise<AgentHost> => {
    hostPromise ??= AgentHost.create({
      cwd: resolveCwd(),
      emitEvent: (event) => send(IpcEvent.AgentEvent, event),
      transport
    })
    return hostPromise
  }

  ipcMain.handle(IpcChannel.AppInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    versions: {
      electron: process.versions.electron ?? '',
      chrome: process.versions.chrome ?? '',
      node: process.versions.node ?? '',
      v8: process.versions.v8 ?? ''
    }
  }))

  ipcMain.handle(IpcChannel.RuntimeInfo, () => getRuntimeInfo())

  ipcMain.handle(IpcChannel.AgentGetStatus, async () => (await host()).getStatus())
  ipcMain.handle(IpcChannel.AgentGetMessages, async () => (await host()).getMessages())
  ipcMain.handle(IpcChannel.AgentGetModels, async () => (await host()).getModels())
  ipcMain.handle(IpcChannel.AgentGetStats, async () => (await host()).getStats())

  ipcMain.handle(IpcChannel.AgentPrompt, async (_event, input: PromptInput) => {
    await (await host()).prompt(input)
  })
  ipcMain.handle(IpcChannel.AgentSteer, async (_event, text: string) => {
    await (await host()).steer(text)
  })
  ipcMain.handle(IpcChannel.AgentFollowUp, async (_event, text: string) => {
    await (await host()).followUp(text)
  })
  ipcMain.handle(IpcChannel.AgentAbort, async () => {
    await (await host()).abort()
  })
  ipcMain.handle(IpcChannel.AgentClearQueue, async () => (await host()).clearQueue())
  ipcMain.handle(IpcChannel.AgentNewSession, async () => {
    await (await host()).newSession()
  })
  ipcMain.handle(IpcChannel.AgentCompact, async (_event, instructions?: string) => {
    await (await host()).compact(instructions)
  })
  ipcMain.handle(IpcChannel.AgentSetModel, async (_event, provider: string, id: string) => {
    await (await host()).setModel(provider, id)
  })
  ipcMain.handle(IpcChannel.AgentCycleModel, async () => {
    await (await host()).cycleModel()
  })
  ipcMain.handle(IpcChannel.AgentSetThinking, async (_event, level: ThinkingLevelDto) => {
    ;(await host()).setThinkingLevel(level)
  })
}
