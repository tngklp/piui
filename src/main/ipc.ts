import { join } from 'node:path'
import { app, ipcMain, type BrowserWindow } from 'electron'
import {
  IpcChannel,
  IpcEvent,
  type AppInfo,
  type ApprovalConfig,
  type PromptInput,
  type ThinkingLevelDto,
  type UiRequestDto,
  type UiResponseDto
} from '@shared/ipc'
import { AgentHost } from './pi/agent-host'
import { ApprovalManager } from './pi/approval'
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

  const pendingDialogs = new Map<string, (response: UiResponseDto) => void>()
  /** Extensions block on dialogs; give up only after a long idle period. */
  const DIALOG_TIMEOUT_MS = 10 * 60 * 1000

  const transport: UiTransport = {
    ask: (request: UiRequestDto) =>
      new Promise<UiResponseDto>((resolve) => {
        pendingDialogs.set(request.id, resolve)
        send(IpcEvent.UiRequest, request)
        setTimeout(() => {
          if (pendingDialogs.delete(request.id)) resolve({ id: request.id, cancelled: true })
        }, DIALOG_TIMEOUT_MS)
      }),
    notify: (notice) => send(IpcEvent.Notice, notice),
    setStatus: (key, text) => send(IpcEvent.AgentEvent, { type: 'piui_status', key, text }),
    setWidget: (key, lines, placement) =>
      send(IpcEvent.AgentEvent, { type: 'piui_widget', key, lines, placement }),
    setTitle: (title) => send(IpcEvent.AgentEvent, { type: 'piui_title', title }),
    setEditorText: (text) => send(IpcEvent.AgentEvent, { type: 'piui_editor_text', text }),
    log: (message) => send(IpcEvent.Notice, { level: 'info', message })
  }

  const approvals = new ApprovalManager(join(app.getPath('userData'), 'approval-rules.json'))
  let approvalsLoaded: Promise<void> | null = null
  const ensureApprovalsLoaded = async (): Promise<void> => {
    approvalsLoaded ??= approvals.load()
    await approvalsLoaded
  }

  let hostPromise: Promise<AgentHost> | null = null

  const host = (): Promise<AgentHost> => {
    hostPromise ??= (async () => {
      await ensureApprovalsLoaded()
      return AgentHost.create({
        cwd: resolveCwd(),
        emitEvent: (event) => send(IpcEvent.AgentEvent, event),
        transport,
        approvalExtension: approvals.extension()
      })
    })()
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

  ipcMain.handle(IpcChannel.ApprovalGetConfig, async () => {
    await ensureApprovalsLoaded()
    return approvals.getConfig()
  })

  ipcMain.handle(IpcChannel.ApprovalSetConfig, async (_event, config: ApprovalConfig) => {
    await approvals.setConfig(config)
  })

  ipcMain.handle(IpcChannel.UiRespond, (_event, response: UiResponseDto) => {
    const resolve = pendingDialogs.get(response.id)
    if (resolve) {
      pendingDialogs.delete(response.id)
      resolve(response)
    }
  })
}
