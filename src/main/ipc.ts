import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, dialog, ipcMain, type BrowserWindow } from 'electron'
import {
  IpcChannel,
  IpcEvent,
  type AppInfo,
  type ApprovalConfig,
  type PromptInput,
  type ThinkingLevelDto,
  type UiRequestDto,
  type UiResponseDto,
  type WorkspaceDto
} from '@shared/ipc'
import { AgentHost } from './pi/agent-host'
import { ApprovalManager } from './pi/approval'
import { getRuntimeInfo } from './pi/runtime-info'
import { workspaceName } from './pi/session-store'
import type { UiTransport } from './pi/ui-context'
import { WorkspaceStore } from './pi/workspace-store'
import { listDirectory, readFileText, writeFileText } from './fs-list'
import { readMonitor } from './monitor'

export interface IpcContext {
  /** Current main window, used to push agent events to the renderer. */
  getWindow: () => BrowserWindow | null
}

/**
 * Default working directory on first run. Pointing at the user's home keeps the
 * agent out of the app's own install directory; override with PIUI_CWD.
 */
function resolveCwd(): string {
  return process.env.PIUI_CWD ?? homedir()
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

  const workspaceStore = new WorkspaceStore(
    join(app.getPath('userData'), 'workspace.json'),
    resolveCwd()
  )
  let workspaceLoaded: Promise<string> | null = null
  const ensureWorkspaceLoaded = async (): Promise<string> => {
    workspaceLoaded ??= workspaceStore.load()
    return workspaceLoaded
  }

  let hostPromise: Promise<AgentHost> | null = null

  const host = (): Promise<AgentHost> => {
    hostPromise ??= (async () => {
      await ensureApprovalsLoaded()
      const cwd = await ensureWorkspaceLoaded()
      return AgentHost.create({
        cwd,
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

  ipcMain.handle(IpcChannel.SessionsList, async () => (await host()).listSessions())
  ipcMain.handle(IpcChannel.SessionsListAll, async () => (await host()).listAllSessions())
  ipcMain.handle(IpcChannel.SessionsSwitch, async (_event, sessionPath: string) => {
    await (await host()).switchSession(sessionPath)
  })
  ipcMain.handle(IpcChannel.SessionsRename, async (_event, name: string) => {
    ;(await host()).renameSession(name)
  })
  ipcMain.handle(IpcChannel.SessionsFork, async () => {
    await (await host()).forkSession()
  })

  ipcMain.handle(IpcChannel.WorkspaceGet, async (): Promise<WorkspaceDto> => {
    const cwd = await ensureWorkspaceLoaded()
    return { cwd, name: workspaceName(cwd) }
  })

  ipcMain.handle(IpcChannel.WorkspacePick, async (): Promise<string | null> => {
    const window = context.getWindow()
    const result = window
      ? await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0] ?? null
  })

  ipcMain.handle(IpcChannel.WorkspaceSet, async (_event, cwd: string): Promise<WorkspaceDto> => {
    await workspaceStore.set(cwd)
    return (await host()).setWorkspace(cwd)
  })

  ipcMain.handle(IpcChannel.FsList, async (_event, target: string) => {
    const root = (await host()).getWorkspace().cwd
    return listDirectory(target, root)
  })

  ipcMain.handle(IpcChannel.FsRead, async (_event, target: string) => readFileText(target))

  ipcMain.handle(IpcChannel.FsWrite, async (_event, target: string, content: string) => {
    await writeFileText(target, content)
  })

  ipcMain.handle(IpcChannel.SessionsDelete, async (_event, sessionPath: string) => {
    await (await host()).deleteSession(sessionPath)
  })

  ipcMain.handle(IpcChannel.MonitorGet, async () => {
    const agent = await host()
    return readMonitor({
      endpoint: () => agent.getModelEndpoint(),
      recentRequests: (limit) => agent.getRecentRequests(limit)
    })
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
