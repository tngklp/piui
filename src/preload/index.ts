import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type AppInfo, type PiUiApi } from '@shared/ipc'

const api: PiUiApi = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IpcChannel.AppInfo)
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('piui', api)
} else {
  // contextIsolation is always enabled by PiUI; this is a defensive fallback.
  Object.assign(globalThis, { piui: api })
}
